import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRuntimeResult } from "./runtime-verification.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function parseArgs(argv) {
  const options = { port: 9335, mode: "watch", timeoutMs: 30000, screenshot: null, reload: false, payloadFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--once") options.mode = "once";
    else if (arg === "--watch") options.mode = "watch";
    else if (arg === "--verify") options.mode = "verify";
    else if (arg === "--remove") options.mode = "remove";
    else if (arg === "--themes") options.mode = "themes";
    else if (arg === "--payload-file") { options.mode = "payload"; options.payloadFile = path.resolve(argv[++i]); }
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++i]);
    else if (arg === "--screenshot") options.screenshot = path.resolve(argv[++i]);
    else if (arg === "--reload") options.reload = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  return options;
}

class CdpSession {
  constructor(target) {
    this.target = target;
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
    this.ws.addEventListener("close", () => {
      this.closed = true;
      for (const waiter of this.pending.values()) waiter.reject(new Error("CDP socket closed"));
      this.pending.clear();
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    return this;
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("CDP session is closed"));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Renderer evaluation failed: ${detail}`);
    }
    return result.result?.value;
  }

  close() {
    if (!this.closed) this.ws.close();
    this.closed = true;
  }
}

function isMainRendererTarget(target) {
  try {
    const url = new URL(target.url);
    return target.type === "page" && url.protocol === "app:" && url.hostname === "-" &&
      url.pathname === "/index.html" && !url.searchParams.has("initialRoute");
  } catch {
    return false;
  }
}

// Chromium binds the DevTools server to a single loopback address, and which
// stack it picks can change between boots (observed: 127.0.0.1 before a reboot,
// [::1] after). Probe both and stick with whichever answers.
const HOST_CANDIDATES = ["127.0.0.1", "[::1]"];
let preferredHost = null;

async function fetchTargets(port) {
  const hosts = preferredHost
    ? [preferredHost, ...HOST_CANDIDATES.filter((host) => host !== preferredHost)]
    : [...HOST_CANDIDATES];
  let lastError;
  for (const host of hosts) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const targets = await response.json();
      preferredHost = host;
      return targets;
    } catch (error) {
      lastError = error;
    }
  }
  preferredHost = null;
  throw lastError ?? new Error("no loopback endpoint responded");
}

async function waitForTargets(port, timeoutMs, { includeAuxiliary = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchTargets(port);
      const pages = targets.filter((item) => item.type === "page" && item.url.startsWith("app://"));
      const selected = includeAuxiliary ? pages : pages.filter(isMainRendererTarget);
      if (selected.length) return selected;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  const kind = includeAuxiliary ? "Codex renderer" : "main Codex renderer";
  throw new Error(`No ${kind} target on 127.0.0.1/[::1]:${port}: ${lastError?.message ?? "timed out"}`);
}

// ---------------------------------------------------------------------------
// Theme manifest engine
//
// Themes are data, not code. The injector scans `themes/` (public) and
// `themes-private/` (git-ignored, local only) for folders that contain a
// theme.json, then generates:
//   - one `:root.codex-dream-skin.dream-theme-<name> { ...tokens }` block per theme
//   - the concatenated, scope-validated per-theme extra.css
//   - the art asset table (data URLs) and the runtime manifest (order/meta/defaults)
// See THEME-SPEC.md for the authoring contract.
// ---------------------------------------------------------------------------

const THEME_DIRS = ["themes", "themes-private"];
const DEFAULT_LAYOUT = "fullscreen";
const THEME_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TOKEN_KEY_PATTERN = /^--dream-[a-z0-9-]+$/;
const ART_FILE_PATTERN = /^[\w.-]+\.(png|jpe?g|webp)$/i;
const REQUIRED_TOKENS = [
  "--dream-ink", "--dream-purple", "--dream-violet", "--dream-pink",
  "--dream-page-bg-0", "--dream-page-bg-1", "--dream-page-glow-a", "--dream-page-glow-b",
  "--dream-hero-art-size", "--dream-hero-art-position",
  "--dream-fullscreen-art-size", "--dream-fullscreen-art-position",
  "--dream-polaroid-art-size", "--dream-polaroid-art-position",
  "--dream-hero-overlay", "--dream-fullscreen-overlay", "--dream-fullscreen-wash",
  "--dream-hero-title-color", "--dream-hero-subtitle-color", "--dream-hero-title-shadow",
  "--dream-hero-chip-color", "--dream-hero-chip-bg", "--dream-hero-chip-line",
  "--dream-hero-subtitle",
  "--dream-chat-art-size", "--dream-chat-art-position", "--dream-chat-art-opacity",
  "--dream-chat-wash",
];
const REQUIRED_META = ["button", "brand", "edition", "signature"];
// v1.1 optional decor fields (cards / stickers / composer). They are pure sugar:
// a theme.json without them must behave exactly like v1.0, and an invalid value
// only drops that field with a warning — it never rejects the theme.
const CARD_SUBTITLE_MAX = 4;
const DECOR_TEXT_LIMIT = 120;
// v1.2: built-in badge icon names for cards.icons. Each entry maps a suggestion
// card position to a masked SVG drawn by the structure CSS (--dream-icon-<name>);
// null keeps the native glyph for that position.
const BUILT_IN_CARD_ICONS = new Set(["code", "wand", "scales", "wrench"]);

function warn(message) {
  console.error(`[dream-skin] ${message}`);
}

function cleanDecorText(value) {
  // eslint-disable-next-line no-control-regex
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
}

function cssStringToken(text) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Derive per-theme CSS variables from the optional `cards` / `composer` fields.
// Hand-written tokens with the same names win (they are spread after these).
function deriveDecorTokens(name, config) {
  const derived = {};
  const cards = config.cards;
  if (cards !== undefined) {
    if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
      warn(`theme "${name}": "cards" must be an object; field ignored`);
    } else {
      if (cards.subtitles !== undefined) {
        if (!Array.isArray(cards.subtitles) || cards.subtitles.length > CARD_SUBTITLE_MAX) {
          warn(`theme "${name}": cards.subtitles must be an array of at most ${CARD_SUBTITLE_MAX} strings; field ignored`);
        } else {
          cards.subtitles.forEach((subtitle, index) => {
            const text = cleanDecorText(subtitle);
            if (!text || text.length > DECOR_TEXT_LIMIT || /[{};]|<\//.test(text)) {
              warn(`theme "${name}": cards.subtitles[${index}] must be a short plain string; entry ignored`);
              return;
            }
            derived[`--dream-card-sub-${index + 1}`] = cssStringToken(text);
          });
        }
      }
      if (cards.icons !== undefined) {
        if (!Array.isArray(cards.icons) || cards.icons.length > CARD_SUBTITLE_MAX) {
          warn(`theme "${name}": cards.icons must be an array of at most ${CARD_SUBTITLE_MAX} entries; field ignored`);
        } else {
          cards.icons.forEach((icon, index) => {
            if (icon === null) return; // null = keep the native icon at this position
            if (typeof icon !== "string" || !BUILT_IN_CARD_ICONS.has(icon)) {
              warn(`theme "${name}": cards.icons[${index}] must be null or one of ${[...BUILT_IN_CARD_ICONS].join("/")}; entry ignored`);
              return;
            }
            derived[`--dream-card-icon-${index + 1}`] = `var(--dream-icon-${icon})`;
            derived[`--dream-card-native-icon-${index + 1}`] = "hidden";
          });
        }
      }
      if (cards.opacity !== undefined) {
        const alpha = Number(cards.opacity);
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
          warn(`theme "${name}": cards.opacity must be a number between 0 and 1; field ignored`);
        } else {
          derived["--dream-card-alpha"] = String(alpha);
        }
      }
    }
  }
  const composer = config.composer;
  if (composer !== undefined) {
    if (!composer || typeof composer !== "object" || Array.isArray(composer)) {
      warn(`theme "${name}": "composer" must be an object; field ignored`);
    } else if (composer.placeholder !== undefined) {
      const text = cleanDecorText(composer.placeholder);
      if (!text || text.length > DECOR_TEXT_LIMIT || /[{};]|<\//.test(text)) {
        warn(`theme "${name}": composer.placeholder must be a short plain string; field ignored`);
      } else {
        derived["--dream-composer-placeholder"] = cssStringToken(text);
      }
    }
  }
  return derived;
}

// Stickers are opt-in decorations rendered by the runtime inside the
// pointer-events:none chrome layer (fullscreen home only). Everything stays
// off unless the theme.json explicitly asks for it. Text reaches the DOM via
// textContent only, so it can never carry markup.
function normalizeStickers(name, config) {
  if (config === undefined) return null;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    warn(`theme "${name}": "stickers" must be an object; field ignored`);
    return null;
  }
  const result = {};
  if (config.bubble !== undefined) {
    const text = cleanDecorText(
      config.bubble && typeof config.bubble === "object" ? config.bubble.text : config.bubble
    );
    if (!text || text.length > DECOR_TEXT_LIMIT) {
      warn(`theme "${name}": stickers.bubble.text must be a short non-empty string; bubble ignored`);
    } else {
      result.bubble = { text };
    }
  }
  if (config.board !== undefined) {
    const lines = Array.isArray(config.board?.lines)
      ? config.board.lines.map(cleanDecorText).filter(Boolean)
      : null;
    if (!lines || !lines.length || lines.length > 3 || lines.some((line) => line.length > DECOR_TEXT_LIMIT)) {
      warn(`theme "${name}": stickers.board.lines must be 1-3 non-empty strings; board ignored`);
    } else {
      result.board = { lines };
    }
  }
  if (config.corner !== undefined) {
    if (config.corner === true) result.corner = true;
    else if (config.corner !== false) warn(`theme "${name}": stickers.corner must be true or false; corner ignored`);
  }
  return Object.keys(result).length ? result : null;
}

const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
// Split a CSS block body into top-level rules ({prelude, body}) without parsing
// the full grammar. Comments must already be stripped.
function extractTopLevelRules(css) {
  const rules = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = -1;
  for (let i = 0; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") {
      if (depth === 0) bodyStart = i + 1;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push({
          prelude: css.slice(preludeStart, bodyStart - 1).trim(),
          body: css.slice(bodyStart, i),
        });
        preludeStart = i + 1;
      }
      if (depth < 0) throw new Error("unbalanced braces");
    }
  }
  if (depth !== 0) throw new Error("unbalanced braces");
  const trailer = css.slice(preludeStart).trim();
  if (trailer) throw new Error(`content outside of any rule: "${trailer.slice(0, 60)}"`);
  return rules;
}

// Every selector in a theme's extra.css must scope itself to that theme:
// the first compound of each selector must be html/:root carrying the
// .dream-theme-<name> class. @media / @supports may wrap such rules.
function validateExtraCssScope(css, themeName) {
  const errors = [];
  const scopeClass = `.dream-theme-${themeName}`;
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const checkRules = (blockCss) => {
    for (const rule of extractTopLevelRules(blockCss)) {
      if (rule.prelude.startsWith("@")) {
        if (/^@(media|supports)\b/.test(rule.prelude)) checkRules(rule.body);
        else errors.push(`at-rule not allowed in theme extra.css: "${rule.prelude.slice(0, 60)}"`);
        continue;
      }
      for (const selector of rule.prelude.split(",").map((part) => part.trim()).filter(Boolean)) {
        const firstCompound = selector.split(/[\s>+~]/, 1)[0];
        const anchored = firstCompound.startsWith("html.") || firstCompound.startsWith(":root.");
        if (!anchored || !firstCompound.includes(scopeClass)) {
          errors.push(`selector not scoped to ${scopeClass}: "${selector.slice(0, 80)}"`);
        }
      }
    }
  };
  try {
    checkRules(stripped);
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

function validateTokenMap(owner, tokens, { required = [] } = {}) {
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    return { errors: [`${owner}: tokens must be an object`] };
  }
  const errors = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (!TOKEN_KEY_PATTERN.test(key)) errors.push(`${owner}: invalid token name "${key}"`);
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${owner}: token "${key}" must be a non-empty string`);
    } else if (/[{};]/.test(value) || /<\//.test(value)) {
      errors.push(`${owner}: token "${key}" contains forbidden characters`);
    }
  }
  for (const key of required) {
    if (!(key in tokens)) errors.push(`${owner}: missing required token "${key}"`);
  }
  return { errors };
}

async function loadThemeDir(baseName, dirName) {
  const dir = path.join(root, baseName, dirName);
  const manifestPath = path.join(dir, "theme.json");
  let raw;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    return null; // not a theme folder
  }
  const name = dirName;
  if (!THEME_NAME_PATTERN.test(name)) {
    warn(`theme folder "${baseName}/${dirName}" skipped: folder name must be kebab-case ([a-z0-9-])`);
    return null;
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    warn(`theme "${name}" skipped: theme.json is not valid JSON (${error.message})`);
    return null;
  }
  if (config.name && config.name !== name) {
    warn(`theme "${name}" skipped: theme.json "name" (${config.name}) must match the folder name`);
    return null;
  }
  const meta = config.meta ?? {};
  const metaErrors = REQUIRED_META.filter((key) => typeof meta[key] !== "string" || !meta[key].trim());
  if (metaErrors.length) {
    warn(`theme "${name}" skipped: meta.${metaErrors.join(", meta.")} missing or empty`);
    return null;
  }
  const mergedTokens = { ...deriveDecorTokens(name, config), ...(config.tokens ?? {}) };
  const { errors: tokenErrors } = validateTokenMap(`theme "${name}"`, mergedTokens, {
    required: REQUIRED_TOKENS,
  });
  if (tokenErrors.length) {
    for (const error of tokenErrors) warn(error);
    warn(`theme "${name}" skipped because of invalid tokens`);
    return null;
  }
  const art = config.art ?? {};
  const homeFile = art.home ?? "art.png";
  const chatFile = art.chat ?? homeFile;
  const previewFile = art.preview ?? homeFile;
  const artUrls = {};
  for (const [role, file] of Object.entries({ home: homeFile, chat: chatFile, preview: previewFile })) {
    if (typeof file !== "string" || !ART_FILE_PATTERN.test(file)) {
      warn(`theme "${name}" skipped: art.${role} ("${file}") must be a plain png/jpg/webp filename inside the theme folder`);
      return null;
    }
    if (file === homeFile && artUrls.home) {
      artUrls[role] = artUrls.home;
      continue;
    }
    try {
      const buffer = await fs.readFile(path.join(dir, file));
      const mime = MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "image/png";
      artUrls[role] = `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      warn(`theme "${name}" skipped: art file not found: ${path.join(baseName, dirName, file)}`);
      return null;
    }
  }
  let extraCss = null;
  try {
    extraCss = await fs.readFile(path.join(dir, "extra.css"), "utf8");
  } catch {}
  if (extraCss !== null) {
    const scopeErrors = validateExtraCssScope(extraCss, name);
    if (scopeErrors.length) {
      for (const error of scopeErrors) warn(`theme "${name}" extra.css: ${error}`);
      warn(`theme "${name}": extra.css REJECTED (kept out of the payload); fix the scoping and re-run`);
      extraCss = null;
    }
  }
  return {
    name,
    source: baseName,
    order: Number.isFinite(config.order) ? config.order : 100,
    isDefault: config.default === true,
    meta: {
      button: meta.button,
      brand: meta.brand,
      edition: meta.edition,
      signature: meta.signature,
      displayName: typeof meta.displayName === "string" && meta.displayName.trim() ? meta.displayName.trim() : meta.brand,
    },
    // Derived decor tokens first so hand-written tokens of the same name win.
    tokens: mergedTokens,
    stickers: normalizeStickers(name, config.stickers),
    extraCss,
    artUrls,
  };
}

async function loadThemes() {
  const themes = [];
  for (const baseName of THEME_DIRS) {
    let entries = [];
    try {
      entries = await fs.readdir(path.join(root, baseName), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const theme = await loadThemeDir(baseName, entry.name);
      if (!theme) continue;
      if (themes.some((existing) => existing.name === theme.name)) {
        warn(`theme "${theme.name}" in ${baseName}/ skipped: a theme with the same name was already loaded`);
        continue;
      }
      themes.push(theme);
    }
  }
  if (!themes.length) {
    throw new Error("No valid themes found under themes/ or themes-private/. See THEME-SPEC.md.");
  }
  themes.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, "en"));
  const defaultTheme = (themes.find((theme) => theme.isDefault) ?? themes[0]).name;
  return { themes, defaultTheme };
}

function buildThemeCss(themes) {
  const blocks = [];
  for (const theme of themes) {
    const lines = Object.entries(theme.tokens).map(([key, value]) => `  ${key}: ${value};`);
    blocks.push(`:root.codex-dream-skin.dream-theme-${theme.name} {\n${lines.join("\n")}\n}`);
  }
  for (const theme of themes) {
    if (theme.extraCss) {
      blocks.push(`/* theme "${theme.name}" extra.css */\n${theme.extraCss.trim()}`);
    }
  }
  return blocks.join("\n\n");
}

async function loadPayload() {
  const [structureCss, switcherCss, runtime, { themes, defaultTheme }] = await Promise.all([
    fs.readFile(path.join(root, "styles", "dream", "style.css"), "utf8"),
    fs.readFile(path.join(root, "styles", "common.css"), "utf8"),
    fs.readFile(path.join(root, "assets", "renderer-inject.js"), "utf8"),
    loadThemes(),
  ]);
  const css = `${structureCss}\n\n/* --- theme switcher --- */\n\n${switcherCss}\n\n/* --- generated theme token blocks --- */\n\n${buildThemeCss(themes)}\n`;
  const artAssets = Object.fromEntries(themes.map((theme) => [theme.name, theme.artUrls]));
  const manifest = {
    order: themes.map((theme) => theme.name),
    meta: Object.fromEntries(themes.map((theme) => [theme.name, theme.meta])),
    stickers: Object.fromEntries(themes.map((theme) => [theme.name, theme.stickers])),
    defaultTheme,
    defaultLayout: DEFAULT_LAYOUT,
  };
  return runtime
    .replace("__DREAM_CSS_JSON__", () => JSON.stringify(css))
    .replace("__DREAM_ART_ASSETS_JSON__", () => JSON.stringify(artAssets))
    .replace("__DREAM_MANIFEST_JSON__", () => JSON.stringify(manifest));
}

async function connectTarget(target) {
  return new CdpSession(target).open();
}

async function applyToSession(session, payload) {
  return session.evaluate(payload);
}

async function runtimeAttached(session) {
  return session.evaluate(`Boolean(
    window.__CODEX_DREAM_SKIN_STATE__ &&
    document.getElementById('codex-dream-skin-style') &&
    document.getElementById('codex-autoskin-entry-button') &&
    document.getElementById('codex-autoskin-panel')
  )`);
}

async function removeFromSession(session) {
  return session.evaluate(`(() => {
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    if (state?.cleanup) return state.cleanup();
    const rootElement = document.documentElement;
    if (rootElement) {
      rootElement.style.removeProperty('--dream-art');
      rootElement.style.removeProperty('--dream-home-art');
      rootElement.style.removeProperty('--dream-chat-art');
      for (const cls of [...rootElement.classList]) {
        if (cls === 'codex-dream-skin' || cls.startsWith('dream-theme-') || cls.startsWith('dream-layout-') || cls.startsWith('dream-template-')) {
          rootElement.classList.remove(cls);
        }
      }
    }
    document.querySelectorAll('.dream-home').forEach((node) => node.classList.remove('dream-home'));
    document.querySelectorAll('.dream-home-shell').forEach((node) => node.classList.remove('dream-home-shell'));
    document.querySelectorAll('.dream-new-task').forEach((node) => node.classList.remove('dream-new-task'));
    document.getElementById('codex-dream-skin-style')?.remove();
    document.getElementById('codex-dream-skin-chrome')?.remove();
    document.getElementById('codex-dream-skin-controls')?.remove();
    document.getElementById('codex-autoskin-entry')?.remove();
    document.getElementById('codex-autoskin-panel')?.remove();
    document.getElementById('codex-autoskin-transition')?.remove();
    return true;
  })()`);
}

async function verifyAuxiliarySession(session) {
  return session.evaluate(`(() => {
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      statePresent: Boolean(window.__CODEX_DREAM_SKIN_STATE__),
      bodyBackgroundImage: getComputedStyle(document.body).backgroundImage,
      viewport: { width: innerWidth, height: innerHeight },
    };
    result.pass = !result.installed && !result.stylePresent && !result.chromePresent && !result.statePresent;
    return result;
  })()`);
}

async function inspectAuxiliaryTarget(target, { remove = false } = {}) {
  const session = await connectTarget(target);
  try {
    if (remove) await removeFromSession(session);
    return await verifyAuxiliarySession(session);
  } finally {
    session.close();
  }
}

async function verifySession(session) {
  const result = await session.evaluate(`(() => {
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const home = document.querySelector('.dream-home');
    const suggestions = home?.querySelector('.group\\\\/home-suggestions') ?? null;
    const cards = suggestions ? [...suggestions.querySelectorAll('button')].map(box) : [];
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    const result = {
      installed: document.documentElement.classList.contains('codex-dream-skin'),
      nativeMode: state?.nativeMode === true,
      version: state?.version ?? null,
      theme: state?.theme ?? null,
      layout: state?.layout ?? null,
      themes: state?.themes ?? null,
      stylePresent: Boolean(document.getElementById('codex-dream-skin-style')),
      chromePresent: Boolean(document.getElementById('codex-dream-skin-chrome')),
      legacyControlsPresent: Boolean(document.getElementById('codex-dream-skin-controls')),
      switcherEntryPresent: Boolean(document.getElementById('codex-autoskin-entry-button')),
      switcherPanelPresent: Boolean(document.getElementById('codex-autoskin-panel')),
      chromePointerEvents: getComputedStyle(document.getElementById('codex-dream-skin-chrome') || document.body).pointerEvents,
      homePresent: Boolean(home),
      suggestionsPresent: Boolean(suggestions),
      hero: box(home?.firstElementChild?.firstElementChild?.firstElementChild),
      cards,
      composer: box(document.querySelector('.composer-surface-chrome')),
      sidebar: box(document.querySelector('aside.app-shell-left-panel')),
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: {
        x: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      },
    };
    return result;
  })()`);
  result.pass = verifyRuntimeResult(result);
  return result;
}

async function waitForVerifiedSession(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult;
  while (Date.now() < deadline) {
    lastResult = await verifySession(session);
    if (lastResult.pass) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult;
}

async function capture(session, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const viewport = await session.evaluate("({ width: innerWidth, height: innerHeight })");
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(viewport.width * 0.64),
    y: Math.round(viewport.height * 0.62),
    button: "none",
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function runOneShot(options) {
  const allTargets = await waitForTargets(options.port, options.timeoutMs, { includeAuxiliary: true });
  let mainTargets = allTargets.filter(isMainRendererTarget);
  if (options.mode !== "remove" && !mainTargets.length) {
    mainTargets = await waitForTargets(options.port, options.timeoutMs);
  }
  const targets = options.mode === "remove" ? allTargets : mainTargets;
  const auxiliaryTargets = allTargets.filter((target) => !isMainRendererTarget(target));
  const payload = (options.mode === "once" || options.reload) ? await loadPayload() : null;
  const results = [];
  const auxiliaryResults = [];
  if (options.mode !== "remove") {
    for (const target of auxiliaryTargets) {
      const result = await inspectAuxiliaryTarget(target, {
        remove: options.mode === "once" || options.reload,
      });
      auxiliaryResults.push({ targetId: target.id, title: target.title, url: target.url, result });
    }
  }
  for (const target of targets) {
    const session = await connectTarget(target);
    try {
      if (options.mode === "remove") await removeFromSession(session);
      else if (options.mode === "once") await applyToSession(session, payload);
      if (options.mode === "once") {
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      if (options.reload) {
        await session.send("Page.reload", { ignoreCache: true });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        if (options.mode !== "remove") await applyToSession(session, payload);
      }
      const verified = options.mode === "remove"
        ? await session.evaluate("!document.documentElement.classList.contains('codex-dream-skin')")
        : (options.reload || options.mode === "once")
          ? await waitForVerifiedSession(session, options.timeoutMs)
          : await verifySession(session);
      results.push({ targetId: target.id, title: target.title, url: target.url, result: verified });
      if (options.screenshot) await capture(session, options.screenshot);
    } finally {
      session.close();
    }
  }
  console.log(JSON.stringify({
    mode: options.mode,
    port: options.port,
    targets: results,
    auxiliaryTargets: auxiliaryResults,
  }, null, 2));
  if (options.mode === "verify" && (
    results.some((item) => !item.result.pass) || auxiliaryResults.some((item) => !item.result.pass)
  )) process.exitCode = 2;
}

async function runThemesReport() {
  const { themes, defaultTheme } = await loadThemes();
  console.log(JSON.stringify({
    defaultTheme,
    defaultLayout: DEFAULT_LAYOUT,
    themes: themes.map((theme) => ({
      name: theme.name,
      source: theme.source,
      order: theme.order,
      default: theme.isDefault,
      button: theme.meta.button,
      displayName: theme.meta.displayName,
      preview: Boolean(theme.artUrls.preview),
      extraCss: theme.extraCss !== null,
      stickers: theme.stickers ? Object.keys(theme.stickers) : [],
    })),
  }, null, 2));
}

async function runPayloadFile(options) {
  if (!options.payloadFile) throw new Error("--payload-file requires an output path");
  const payload = await loadPayload();
  await fs.mkdir(path.dirname(options.payloadFile), { recursive: true });
  await fs.writeFile(options.payloadFile, payload);
  console.log(JSON.stringify({ ok: true, output: options.payloadFile, bytes: Buffer.byteLength(payload) }, null, 2));
}

async function runWatch(options) {
  const payload = await loadPayload();
  const sessions = new Map();
  const cleanedAuxiliary = new Set();
  let stopping = false;
  let lastRuntimeHealthCheck = 0;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    let allTargets = [];
    try {
      allTargets = await waitForTargets(options.port, 2000, { includeAuxiliary: true });
    } catch (error) {
      console.error(`[dream-skin] ${new Date().toISOString()} ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const targets = allTargets.filter(isMainRendererTarget);
    const activeAllIds = new Set(allTargets.map((target) => target.id));
    for (const id of cleanedAuxiliary) {
      if (!activeAllIds.has(id)) cleanedAuxiliary.delete(id);
    }
    for (const target of allTargets.filter((item) => !isMainRendererTarget(item))) {
      if (cleanedAuxiliary.has(target.id)) continue;
      try {
        const result = await inspectAuxiliaryTarget(target, { remove: true });
        if (!result.pass) throw new Error("auxiliary renderer still contains Dream Skin state");
        cleanedAuxiliary.add(target.id);
        console.log(`[dream-skin] kept auxiliary target transparent ${target.id} (${target.url})`);
      } catch (error) {
        console.error(`[dream-skin] auxiliary cleanup failed for ${target.id}: ${error.message}`);
      }
    }

    const activeIds = new Set(targets.map((target) => target.id));
    for (const [id, session] of sessions) {
      if (!activeIds.has(id) || session.closed) {
        session.close();
        sessions.delete(id);
      }
    }

    const checkRuntimeHealth = Date.now() - lastRuntimeHealthCheck >= 5000;
    for (const target of targets) {
      if (sessions.has(target.id)) {
        if (checkRuntimeHealth) {
          const session = sessions.get(target.id);
          try {
            if (!await runtimeAttached(session)) {
              await applyToSession(session, payload);
              console.log(`[dream-skin] repaired missing runtime on target ${target.id} (${target.title || target.url})`);
            }
          } catch (error) {
            console.error(`[dream-skin] runtime health check failed for ${target.id}: ${error.message}`);
            session.close();
            sessions.delete(target.id);
          }
        }
        continue;
      }
      try {
        const session = await connectTarget(target);
        session.on("Page.loadEventFired", () => {
          setTimeout(() => applyToSession(session, payload).catch((error) => {
            console.error(`[dream-skin] reinject failed: ${error.message}`);
          }), 250);
        });
        await applyToSession(session, payload);
        sessions.set(target.id, session);
        console.log(`[dream-skin] injected target ${target.id} (${target.title || target.url})`);
      } catch (error) {
        console.error(`[dream-skin] inject failed for ${target.id}: ${error.message}`);
      }
    }
    if (checkRuntimeHealth) lastRuntimeHealthCheck = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  for (const session of sessions.values()) session.close();
}

const options = parseArgs(process.argv.slice(2));
if (options.mode === "watch") await runWatch(options);
else if (options.mode === "themes") await runThemesReport();
else if (options.mode === "payload") await runPayloadFile(options);
else await runOneShot(options);
