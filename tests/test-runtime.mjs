import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const payloadPath = process.argv[2];
const runtimeSourcePath = process.argv[3];
if (!payloadPath) throw new Error("Usage: node tests/test-runtime.mjs <payload.js> [assets/renderer-inject.js]");
const payload = await fs.readFile(payloadPath, "utf8");

async function setHttpContent(page, body) {
  await page.route("http://autoskin.test/**", (route) => route.fulfill({ status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body }));
  await page.goto("http://autoskin.test/");
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await setHttpContent(page, `<!doctype html><html style="--codex-base-surface:#fff4fa;--codex-base-ink:#4a235f;--codex-base-accent:#b65cff;--color-background-panel:#fff6fb;--color-background-control:#fff6fb;--color-background-editor-opaque:#fff5fb;--color-text-foreground:#4a235f;--color-border:rgba(74,35,95,.11)"><head><style>
    .host-toolbar { position: fixed; z-index: 30; inset: 0 0 auto 260px; height: 46px; display: flex; justify-content: flex-end; align-items: center; gap: 8px; pointer-events: none; }
    #toolbar-fixture button { width: 44px; height: 32px; pointer-events: auto; }
    #thread-hit-surface { position: absolute; inset: 0; }
  </style></head><body style="margin:0;display:flex;height:100vh">
    <aside class="app-shell-left-panel" style="width:260px;display:flex;flex-direction:column">
      <nav>
        <button>新建任务</button>
        <div class="group/nav-section-title"><button class="group/section-toggle">项目</button></div>
        <button aria-current="page">任务</button>
      </nav>
      <div style="margin-top:auto"><button aria-label="打开个人资料菜单">Profile</button></div>
    </aside>
    <main class="main-surface" style="position:relative;flex:1">
      <header id="toolbar-fixture" class="app-header-tint host-toolbar">
        <button data-toolbar-control aria-label="Open in">Open in</button>
        <button data-toolbar-control aria-label="Toggle pinned summary"></button>
        <button data-toolbar-control aria-label="Toggle bottom panel"></button>
        <button data-toolbar-control aria-label="Toggle side panel"></button>
      </header>
      <div role="main"><span data-testid="home-icon"></span>
        <div><div><div><div><div data-feature="game-source">Title</div></div><div class="group/home-suggestions"><button>One</button><button>Two</button></div></div></div></div>
        <div class="composer-surface-chrome"><div class="ProseMirror"><p data-placeholder="Type"></p></div></div>
      </div>
      <section id="host-right-panel" style="position:absolute;right:0;top:60px;width:260px;height:220px;background:var(--color-background-panel);color:var(--color-text-foreground);border:1px solid var(--color-border)">Host panel</section>
      <section id="host-bottom-panel" style="position:absolute;left:0;right:0;bottom:0;height:100px;background:var(--color-background-editor-opaque);color:var(--color-text-foreground);border-top:1px solid var(--color-border)">Host editor</section>
      <div id="thread-hit-surface" aria-hidden="true"></div>
    </main>
  </body></html>`);
  const installed = await page.evaluate(payload);
  assert.equal(installed.version, "3.0.0");
  assert.equal("template" in installed, false);

  const initial = await page.evaluate(() => {
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    return {
      theme: state.theme,
      layout: state.layout,
      rootClasses: [...document.documentElement.classList],
      entryCount: document.querySelectorAll("#codex-autoskin-entry-button").length,
      panelCount: document.querySelectorAll("#codex-autoskin-panel").length,
      modal: document.querySelector("#codex-autoskin-panel")?.getAttribute("aria-modal"),
      suggestionsVisible: getComputedStyle(document.querySelector(".group\\/home-suggestions")).display !== "none",
    };
  });
  assert.equal(initial.theme, "aurora-veil");
  assert(initial.rootClasses.includes("codex-dream-skin"));
  assert(!initial.rootClasses.some((name) => name.startsWith("dream-template-")));
  assert.equal(initial.entryCount, 1);
  assert.equal(initial.panelCount, 1);
  assert.equal(initial.modal, "false");
  assert.equal(initial.suggestionsVisible, false, "suggestion cards must default to hidden");
  const dreamVisuals = await page.evaluate(() => ({
    bodyFont: getComputedStyle(document.body).fontFamily,
    mainRadius: getComputedStyle(document.querySelector("main.main-surface")).borderRadius,
    cardBackgroundImage: getComputedStyle(document.querySelector(".group\\/home-suggestions button")).backgroundImage,
  }));
  assert.match(dreamVisuals.bodyFont, /Microsoft YaHei|system-ui/i);
  assert.match(dreamVisuals.mainRadius, /20px/);
  assert.match(dreamVisuals.cardBackgroundImage, /gradient/);
  const toolbarHitTargets = await page.locator("[data-toolbar-control]").evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { label: button.getAttribute("aria-label"), hit: button.contains(hit) };
  }));
  assert(toolbarHitTargets.every(({ hit }) => hit),
    `native toolbar controls must remain clickable under the skin: ${JSON.stringify(toolbarHitTargets)}`);
  await page.waitForTimeout(450);
  const idleMutations = await page.evaluate(() => new Promise((resolve) => {
    let count = 0;
    const observer = new MutationObserver((records) => { count += records.length; });
    observer.observe(document.getElementById("codex-autoskin-panel"), { childList: true, subtree: true, attributes: true, characterData: true });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 500);
  }));
  assert.equal(idleMutations, 0, "switcher must not trigger its own redraw loop");

  await page.click("#codex-autoskin-entry-button");
  assert.equal(await page.getAttribute("#codex-autoskin-panel", "data-open"), "true");
  assert.equal(await page.textContent("#codex-autoskin-entry-button span"), "Themes");
  assert.equal(await page.textContent("#autoskin-panel-title"), "Themes");
  assert.equal(await page.getAttribute('#codex-autoskin-panel [data-action="toggle-suggestions"]', "role"), "switch");
  assert.equal(await page.getAttribute('#codex-autoskin-panel [data-action="toggle-suggestions"]', "aria-checked"), "false");
  assert.equal(await page.locator("#codex-autoskin-panel [data-group=template]").count(), 0);
  assert.equal(await page.locator("#codex-autoskin-panel [data-group=layout]").count(), 0);
  assert.equal(await page.locator("#codex-autoskin-panel .autoskin-search").count(), 0);
  const primaryCards = await page.locator("#codex-autoskin-panel .autoskin-theme-card").evaluateAll((cards) => cards.map((card) => card.dataset.theme));
  assert(primaryCards.includes("aurora-veil") && primaryCards.includes("ember-bloom"), JSON.stringify(primaryCards));
  assert(!primaryCards.some((name) => name.startsWith("terminal-")), "Terminal templates must not exist in the theme picker");

  await page.click('#codex-autoskin-panel [data-action="toggle-suggestions"]');
  assert.deepEqual(await page.evaluate(() => ({
    visible: getComputedStyle(document.querySelector(".group\\/home-suggestions")).display !== "none",
    stored: localStorage.getItem("codex-dream-skin.suggestions"),
    checked: document.querySelector('[data-action="toggle-suggestions"]')?.getAttribute("aria-checked"),
    state: window.__CODEX_DREAM_SKIN_STATE__.suggestionsVisible,
  })), { visible: true, stored: "visible", checked: "true", state: true });

  // Codex copies the active palette onto every mounted terminal and xterm then
  // caches those colors in its own renderer. Theme changes must update
  // both layers atomically, while cleanup must restore the original host theme.
  await page.evaluate(() => {
    const terminalPanel = document.createElement("div");
    terminalPanel.id = "runtime-terminal-fixture";
    terminalPanel.dataset.codexTerminal = "true";
    terminalPanel.dataset.codexXterm = "true";
    terminalPanel.style.setProperty("--codex-base-surface", "#fff4fa");
    terminalPanel.style.setProperty("--codex-base-ink", "#4a235f");
    terminalPanel.style.setProperty("--color-accent-blue", "#b65cff");
    const xterm = {
      options: { theme: {
        background: "rgb(255, 244, 250)",
        foreground: "rgb(74, 35, 95)",
        cursor: "rgb(74, 35, 95)",
        blue: "rgb(182, 92, 255)",
      } },
      refresh() {},
      open() {},
    };
    terminalPanel["__reactFiber$autoskinTest"] = {
      return: { memoizedState: { memoizedState: { current: xterm }, next: null } },
    };
    window.__runtimeTerminalFixture = xterm;
    document.body.appendChild(terminalPanel);
    window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ theme: "ember-bloom", layout: "fullscreen" });
  });
  const switched = await page.evaluate(() => ({
    theme: window.__CODEX_DREAM_SKIN_STATE__.theme,
    stored: localStorage.getItem("codex-dream-skin.theme"),
    classes: [...document.documentElement.classList],
  }));
  assert.equal(switched.theme, "ember-bloom");
  assert.equal(switched.stored, "ember-bloom");
  assert(!switched.classes.some((name) => name.startsWith("dream-template-")));
  assert.deepEqual(await page.evaluate(() => ({
    panelSurface: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-surface"),
    panelInk: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-ink"),
    xtermBackground: window.__runtimeTerminalFixture.options.theme.background,
    xtermForeground: window.__runtimeTerminalFixture.options.theme.foreground,
    xtermCursor: window.__runtimeTerminalFixture.options.theme.cursor,
    xtermBlue: window.__runtimeTerminalFixture.options.theme.blue,
  })), {
    panelSurface: "#fffdf9",
    panelInk: "#6b3a2a",
    xtermBackground: "#fffdf9",
    xtermForeground: "#6b3a2a",
    xtermCursor: "#c26744",
    xtermBlue: "#c26744",
  });

  // The picker only chooses themes and always returns the daily-use UI to the
  // immersive default; advanced layout compatibility remains programmatic.
  await page.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ theme: "aurora-veil", layout: "banner" }));
  await page.click('#codex-autoskin-panel .autoskin-theme-card[data-theme="ember-bloom"]');
  await page.waitForFunction(() => window.__CODEX_DREAM_SKIN_STATE__.theme === "ember-bloom");
  assert.deepEqual(await page.evaluate(() => ({
    theme: window.__CODEX_DREAM_SKIN_STATE__.theme,
    layout: window.__CODEX_DREAM_SKIN_STATE__.layout,
    checked: document.querySelector(".autoskin-theme-card[aria-checked=true]")?.dataset.theme,
  })), { theme: "ember-bloom", layout: "fullscreen", checked: "ember-bloom" });

  const completeThemeSwap = await page.evaluate(() => {
    const state = window.__CODEX_DREAM_SKIN_STATE__;
    const main = document.querySelector("main.main-surface");
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    const currentItem = sidebar.querySelector('[aria-current="page"]');
    const sidebarButton = currentItem;
    const sectionTitle = sidebar.querySelector('[class~="group/nav-section-title"]');
    const root = document.documentElement;
    const header = document.querySelector("header.app-header-tint");
    const composer = document.querySelector(".composer-surface-chrome");
    const suggestion = document.querySelector(".group\\/home-suggestions button");
    const hostRightPanel = document.getElementById("host-right-panel");
    const hostBottomPanel = document.getElementById("host-bottom-panel");
    const sidebarVisuals = () => ({
      background: getComputedStyle(sidebar).backgroundImage,
      border: getComputedStyle(sidebar).borderRightColor,
      text: getComputedStyle(sidebarButton).color,
      current: getComputedStyle(currentItem).backgroundImage,
      divider: getComputedStyle(sectionTitle).borderTopColor,
    });
    const wholeAppVisuals = () => {
      const rootStyle = getComputedStyle(root);
      return {
        hostTokens: {
          surface: rootStyle.getPropertyValue("--codex-base-surface").trim(),
          ink: rootStyle.getPropertyValue("--codex-base-ink").trim(),
          accent: rootStyle.getPropertyValue("--codex-base-accent").trim(),
          panel: rootStyle.getPropertyValue("--color-background-panel").trim(),
          control: rootStyle.getPropertyValue("--color-background-control").trim(),
          editor: rootStyle.getPropertyValue("--color-background-editor-opaque").trim(),
          text: rootStyle.getPropertyValue("--color-text-foreground").trim(),
          border: rootStyle.getPropertyValue("--color-border").trim(),
        },
        header: { background: getComputedStyle(header).backgroundImage, border: getComputedStyle(header).borderBottomColor },
        composer: { background: getComputedStyle(composer).backgroundImage, border: getComputedStyle(composer).borderColor },
        suggestion: { background: getComputedStyle(suggestion).backgroundImage, color: getComputedStyle(suggestion).color },
        mainBorder: getComputedStyle(main).borderLeftColor,
        hostPanel: { background: getComputedStyle(hostRightPanel).backgroundColor, color: getComputedStyle(hostRightPanel).color, border: getComputedStyle(hostRightPanel).borderColor },
        hostEditor: { background: getComputedStyle(hostBottomPanel).backgroundColor, color: getComputedStyle(hostBottomPanel).color, border: getComputedStyle(hostBottomPanel).borderTopColor },
      };
    };
    const ember = {
      art: document.documentElement.style.getPropertyValue("--dream-chat-art"),
      background: getComputedStyle(main).backgroundImage,
      terminalBackground: window.__runtimeTerminalFixture.options.theme.background,
      terminalAccent: window.__runtimeTerminalFixture.options.theme.cursor,
      sidebar: sidebarVisuals(),
      wholeApp: wholeAppVisuals(),
    };
    state.setAppearance({ theme: "aurora-veil", layout: "fullscreen" });
    const aurora = {
      art: document.documentElement.style.getPropertyValue("--dream-chat-art"),
      background: getComputedStyle(main).backgroundImage,
      terminalBackground: window.__runtimeTerminalFixture.options.theme.background,
      terminalAccent: window.__runtimeTerminalFixture.options.theme.cursor,
      sidebar: sidebarVisuals(),
      wholeApp: wholeAppVisuals(),
    };
    const futureTokens = {
      "--dream-page-bg-0": "#effaf5",
      "--dream-page-bg-1": "#d9f1e5",
      "--dream-ink": "#173c2b",
      "--dream-purple": "#176b49",
      "--dream-violet": "#3d9470",
      "--dream-pink": "#72c69d",
    };
    for (const [name, value] of Object.entries(futureTokens)) root.style.setProperty(name, value);
    const future = wholeAppVisuals();
    for (const name of Object.keys(futureTokens)) root.style.removeProperty(name);
    return { ember, aurora, future };
  });
  assert.notEqual(completeThemeSwap.ember.art, completeThemeSwap.aurora.art);
  assert.notEqual(completeThemeSwap.ember.background, completeThemeSwap.aurora.background);
  assert.notEqual(completeThemeSwap.ember.sidebar.background, completeThemeSwap.aurora.sidebar.background,
    "sidebar background must follow the selected theme");
  assert.notEqual(completeThemeSwap.ember.sidebar.border, completeThemeSwap.aurora.sidebar.border,
    "sidebar border must follow the selected theme");
  assert.notEqual(completeThemeSwap.ember.sidebar.text, completeThemeSwap.aurora.sidebar.text,
    "sidebar text must follow the selected theme");
  assert.notEqual(completeThemeSwap.ember.sidebar.current, completeThemeSwap.aurora.sidebar.current,
    "selected history row must follow the selected theme");
  assert.notEqual(completeThemeSwap.ember.sidebar.divider, completeThemeSwap.aurora.sidebar.divider,
    "sidebar dividers must follow the selected theme");
  for (const token of Object.keys(completeThemeSwap.ember.wholeApp.hostTokens)) {
    assert.notEqual(completeThemeSwap.ember.wholeApp.hostTokens[token], completeThemeSwap.aurora.wholeApp.hostTokens[token],
      `Codex host token ${token} must follow the selected theme`);
  }
  for (const region of ["header", "composer", "suggestion", "hostPanel", "hostEditor"]) {
    assert.notDeepEqual(completeThemeSwap.ember.wholeApp[region], completeThemeSwap.aurora.wholeApp[region],
      `${region} must use the selected theme rather than a fixed Dream palette`);
  }
  assert.notEqual(completeThemeSwap.ember.wholeApp.mainBorder, completeThemeSwap.aurora.wholeApp.mainBorder,
    "main surface border must follow the selected theme");
  assert.equal(completeThemeSwap.future.hostTokens.surface, "#effaf5");
  assert.equal(completeThemeSwap.future.hostTokens.ink, "#173c2b");
  assert.equal(completeThemeSwap.future.hostTokens.accent, "#176b49");
  assert.notDeepEqual(completeThemeSwap.future.header, completeThemeSwap.aurora.wholeApp.header,
    "an arbitrary future theme must recolor the header without theme-specific CSS");
  assert.notDeepEqual(completeThemeSwap.future.composer, completeThemeSwap.aurora.wholeApp.composer,
    "an arbitrary future theme must recolor the composer without theme-specific CSS");
  assert.notDeepEqual(completeThemeSwap.future.hostPanel, completeThemeSwap.aurora.wholeApp.hostPanel,
    "an arbitrary future theme must recolor Codex host panels through semantic tokens");
  assert.deepEqual({ background: completeThemeSwap.ember.terminalBackground, accent: completeThemeSwap.ember.terminalAccent }, { background: "#fffdf9", accent: "#c26744" });
  assert.deepEqual({ background: completeThemeSwap.aurora.terminalBackground, accent: completeThemeSwap.aurora.terminalAccent }, { background: "#fafbff", accent: "#5b52c7" });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#codex-autoskin-transition").count(), 0);
  if (process.env.AUTOSKIN_SCREENSHOT) {
    await page.screenshot({ path: process.env.AUTOSKIN_SCREENSHOT, fullPage: true });
  }

  await page.evaluate(() => {
    document.querySelector('[data-testid="home-icon"]')?.remove();
    window.__CODEX_DREAM_SKIN_STATE__.ensure();
  });
  assert.equal(await page.evaluate(() => document.querySelector("main.main-surface")?.classList.contains("dream-home-shell")), true,
    "new Codex home DOM without home-icon must still be detected by game-source");
  await page.evaluate(() => {
    document.querySelector('[data-feature="game-source"]')?.remove();
    window.__CODEX_DREAM_SKIN_STATE__.ensure();
  });
  await page.waitForFunction(() => !document.querySelector("main.main-surface")?.classList.contains("dream-home-shell"));
  const fullscreenChatHeight = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("main.main-surface"), "::before").height));
  await page.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ theme: "aurora-veil", layout: "banner" }));
  assert.equal(await page.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.layout), "banner");
  const bannerChat = await page.evaluate(() => {
    const main = document.querySelector("main.main-surface");
    const style = getComputedStyle(main, "::before");
    const wash = getComputedStyle(main, "::after");
    return { height: parseFloat(style.height), mask: style.maskImage || style.webkitMaskImage, wash: wash.backgroundImage };
  });
  assert(bannerChat.height < fullscreenChatHeight * 0.6, JSON.stringify({ bannerChat, fullscreenChatHeight }));
  assert.notEqual(bannerChat.mask, "none");
  assert.notEqual(bannerChat.wash, "none");
  assert.equal(await page.locator('#codex-autoskin-panel [data-action="undo"]').isVisible(), true);
  await page.click('#codex-autoskin-panel [data-action="undo"]');
  assert.deepEqual(await page.evaluate(() => ({
    theme: window.__CODEX_DREAM_SKIN_STATE__.theme,
    layout: window.__CODEX_DREAM_SKIN_STATE__.layout,
  })), { theme: "aurora-veil", layout: "fullscreen" });

  await page.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ theme: "ember-bloom", layout: "fullscreen" }));
  await page.click('#codex-autoskin-panel [data-action="default"]');
  assert.deepEqual(await page.evaluate(() => ({
    theme: window.__CODEX_DREAM_SKIN_STATE__.theme,
    layout: window.__CODEX_DREAM_SKIN_STATE__.layout,
    suggestionsVisible: window.__CODEX_DREAM_SKIN_STATE__.suggestionsVisible,
  })), { theme: "aurora-veil", layout: "fullscreen", suggestionsVisible: false });

  await page.click('#codex-autoskin-panel [data-action="native"]');
  assert.deepEqual(await page.evaluate(() => ({
    nativeMode: window.__CODEX_DREAM_SKIN_STATE__.nativeMode,
    storedMode: localStorage.getItem("codex-dream-skin.mode"),
    rootSkin: document.documentElement.classList.contains("codex-dream-skin"),
    style: Boolean(document.getElementById("codex-dream-skin-style")),
    chrome: Boolean(document.getElementById("codex-dream-skin-chrome")),
    entry: Boolean(document.getElementById("codex-autoskin-entry-button")),
    panel: Boolean(document.getElementById("codex-autoskin-panel")),
    checkedThemes: document.querySelectorAll(".autoskin-theme-card[aria-checked=true]").length,
    nativeSurface: document.documentElement.style.getPropertyValue("--codex-base-surface"),
    nativeSuggestionsVisible: getComputedStyle(document.querySelector(".group\\/home-suggestions")).display !== "none",
  })), {
    nativeMode: true,
    storedMode: "native",
    rootSkin: false,
    style: true,
    chrome: false,
    entry: true,
    panel: true,
    checkedThemes: 0,
    nativeSurface: "#ffffff",
    nativeSuggestionsVisible: true,
  });
  assert.deepEqual(await page.evaluate(() => ({
    panelSurface: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-surface"),
    panelInk: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-ink"),
    xtermBackground: window.__runtimeTerminalFixture.options.theme.background,
    xtermForeground: window.__runtimeTerminalFixture.options.theme.foreground,
    xtermCursor: window.__runtimeTerminalFixture.options.theme.cursor,
    xtermBlue: window.__runtimeTerminalFixture.options.theme.blue,
  })), {
    panelSurface: "#ffffff",
    panelInk: "#1a1c1f",
    xtermBackground: "#ffffff",
    xtermForeground: "#1a1c1f",
    xtermCursor: "#1a1c1f",
    xtermBlue: "#339cff",
  });

  // The watcher can inject again after a renderer reload; persisted native mode
  // must survive that reinjection instead of silently restoring a skin.
  const nativeReinjected = await page.evaluate(payload);
  assert.equal(nativeReinjected.nativeMode, true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("codex-dream-skin")), false);
  await page.click("#codex-autoskin-entry-button");
  await page.click('#codex-autoskin-panel .autoskin-theme-card[data-theme="aurora-veil"]');
  await page.waitForFunction(() => !window.__CODEX_DREAM_SKIN_STATE__.nativeMode && document.documentElement.classList.contains("codex-dream-skin") && document.getElementById("codex-dream-skin-chrome"));
  assert.equal(await page.evaluate(() => localStorage.getItem("codex-dream-skin.mode")), "skin");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--codex-base-surface").trim()), "#fafbff");
  const hiddenAfterNative = await page.evaluate(() => ({
    visible: getComputedStyle(document.querySelector(".group\\/home-suggestions")).display !== "none",
    classes: [...document.documentElement.classList],
    state: window.__CODEX_DREAM_SKIN_STATE__.suggestionsVisible,
    stored: localStorage.getItem("codex-dream-skin.suggestions"),
  }));
  assert.equal(hiddenAfterNative.visible, false, JSON.stringify(hiddenAfterNative));
  assert.deepEqual(await page.evaluate(() => ({
    panelSurface: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-surface"),
    panelInk: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-ink"),
    xtermBackground: window.__runtimeTerminalFixture.options.theme.background,
    xtermForeground: window.__runtimeTerminalFixture.options.theme.foreground,
    xtermCursor: window.__runtimeTerminalFixture.options.theme.cursor,
    xtermBlue: window.__runtimeTerminalFixture.options.theme.blue,
  })), {
    panelSurface: "#fafbff",
    panelInk: "#2f2b52",
    xtermBackground: "#fafbff",
    xtermForeground: "#2f2b52",
    xtermCursor: "#5b52c7",
    xtermBlue: "#5b52c7",
  });

  await page.focus("#codex-autoskin-panel [data-action=close]");
  await page.keyboard.press("Escape");
  assert.equal(await page.getAttribute("#codex-autoskin-panel", "data-open"), "false");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "codex-autoskin-entry-button");

  await page.click("#codex-autoskin-entry-button");
  await page.evaluate(() => {
    const modal = document.createElement("div");
    modal.id = "host-modal";
    modal.setAttribute("aria-modal", "true");
    modal.textContent = "Host modal";
    document.body.appendChild(modal);
  });
  await page.waitForFunction(() => document.querySelector("#codex-autoskin-panel")?.dataset.open === "false");

  await page.evaluate(() => document.getElementById("codex-autoskin-entry")?.remove());
  await page.waitForFunction(() => document.querySelectorAll("#codex-autoskin-entry-button").length === 1);
  assert.equal(await page.locator("#codex-autoskin-panel").count(), 1);

  const cleaned = await page.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.cleanup());
  assert.equal(cleaned, true);
  assert.deepEqual(await page.evaluate(() => ({
    state: Boolean(window.__CODEX_DREAM_SKIN_STATE__),
    style: Boolean(document.getElementById("codex-dream-skin-style")),
    chrome: Boolean(document.getElementById("codex-dream-skin-chrome")),
    entry: Boolean(document.getElementById("codex-autoskin-entry")),
    panel: Boolean(document.getElementById("codex-autoskin-panel")),
    root: [...document.documentElement.classList].filter((name) => name.startsWith("dream-") || name.startsWith("autoskin-") || name === "codex-dream-skin"),
    rootSurface: document.documentElement.style.getPropertyValue("--codex-base-surface"),
    rootInk: document.documentElement.style.getPropertyValue("--codex-base-ink"),
    terminalSurface: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-surface"),
    terminalInk: document.getElementById("runtime-terminal-fixture").style.getPropertyValue("--codex-base-ink"),
  })), { state: false, style: false, chrome: false, entry: false, panel: false, root: [], rootSurface: "#fff4fa", rootInk: "#4a235f", terminalSurface: "#fff4fa", terminalInk: "#4a235f" });

  const reduced = await browser.newPage({ viewport: { width: 720, height: 760 }, reducedMotion: "reduce", colorScheme: "light" });
  await setHttpContent(reduced, `<!doctype html><html><body><aside class="app-shell-left-panel"><nav><button>New task</button></nav><button aria-label="Open profile menu">Profile</button></aside><main class="main-surface"><div role="main"><span data-testid="home-icon"></span><div class="composer-surface-chrome"></div></div></main></body></html>`);
  await reduced.evaluate(payload);
  await reduced.click("#codex-autoskin-entry-button");
  assert.equal(await reduced.getAttribute("#codex-autoskin-panel", "data-compact"), "true");
  const compactBox = await reduced.locator("#codex-autoskin-panel").boundingBox();
  assert(compactBox.width <= 696 && compactBox.width >= 680, `unexpected compact width: ${compactBox.width}`);
  await reduced.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ theme: "ember-bloom", layout: "fullscreen" }));
  assert.equal(await reduced.locator("#codex-autoskin-transition").count(), 0);
  await reduced.close();

  const darkNative = await browser.newPage({ viewport: { width: 1000, height: 700 }, colorScheme: "dark" });
  await setHttpContent(darkNative, `<!doctype html><html class="electron-dark"><body>
    <aside class="app-shell-left-panel"><nav><button>New task</button></nav><button aria-label="Open profile menu">Profile</button></aside>
    <main class="main-surface"><div role="main"><span data-testid="home-icon"></span><div class="composer-surface-chrome"></div></div></main>
    <div id="dark-terminal" data-codex-terminal="true" data-codex-xterm="true" style="--codex-base-surface:#07100c;--codex-base-ink:#e7fff1"></div>
  </body></html>`);
  await darkNative.evaluate(() => {
    const panel = document.getElementById("dark-terminal");
    const xterm = { options: { theme: { background: "#07100c", foreground: "#e7fff1", cursor: "#25e58a", blue: "#25e58a" } }, refresh() {}, open() {} };
    panel["__reactFiber$autoskinDarkTest"] = { return: { memoizedState: { memoizedState: { current: xterm }, next: null } } };
    window.__darkTerminalFixture = xterm;
  });
  await darkNative.evaluate(payload);
  await darkNative.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setNativeMode(true, false));
  assert.deepEqual(await darkNative.evaluate(() => ({
    surface: document.getElementById("dark-terminal").style.getPropertyValue("--codex-base-surface"),
    ink: document.getElementById("dark-terminal").style.getPropertyValue("--codex-base-ink"),
    background: window.__darkTerminalFixture.options.theme.background,
    foreground: window.__darkTerminalFixture.options.theme.foreground,
  })), { surface: "#181818", ink: "#ffffff", background: "#181818", foreground: "#ffffff" });
  await darkNative.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.cleanup());
  await darkNative.close();

  // Codex 2026 home DOM: a two-row grid, no home-icon, and the three native
  // suggestions wrapped in two neutral divs instead of a nested `.grid`.
  // Keep this fixture close to the live macOS renderer so Windows alignment
  // cannot regress when host markup changes again.
  const modern = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  await setHttpContent(modern, `<!doctype html><html><body style="margin:0;display:flex;height:100vh">
    <aside class="app-shell-left-panel" style="width:260px"><nav><button>New task</button></nav><button aria-label="Open profile menu">Profile</button></aside>
    <main class="main-surface" style="position:relative;flex:1;min-width:0">
      <div role="main" style="height:100%" class="[container-type:size] relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div class="min-h-full w-full pt-6 grid grid-rows-2" style="display:grid!important;height:100%;grid-template-rows:repeat(2,minmax(0,1fr))">
          <div><div><div><div data-feature="game-source">What should we work on?</div></div></div></div>
          <div class="flex min-w-0 shrink-0 grow basis-0 flex-col -mt-16 min-h-0 justify-start">
            <div class="relative z-20 pt-1.5 pb-4">
              <div class="mx-auto w-full flex flex-col gap-2">
                <div class="composer-surface-chrome" style="height:110px"></div>
                <div class="order-last">
                  <section class="group/home-suggestions relative flex min-w-0 flex-col select-none">
                    <div class="min-w-0"><div class="flex min-h-32 flex-col justify-end py-2 pl-6">
                      <div><button>One</button></div><div><button>Two</button></div><div><button>Three</button></div>
                    </div></div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </body></html>`);
  await modern.evaluate(payload);
  await modern.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setSuggestionsVisible(true, false));
  await modern.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ theme: "aurora-veil", layout: "banner" }));
  const modernBanner = await modern.evaluate(() => {
    const box = (element) => element.getBoundingClientRect();
    const home = document.querySelector(".dream-home");
    const hero = document.querySelector(".dream-home > div:first-child > div:first-child > div:first-child");
    const suggestions = document.querySelector(".group\\/home-suggestions");
    const cards = [...suggestions.querySelectorAll("button")].map(box);
    const composer = box(document.querySelector(".composer-surface-chrome"));
    return { home: box(home), hero: box(hero), suggestions: box(suggestions), cards, composer };
  });
  assert(modernBanner.hero.width > modernBanner.home.width * 0.9, JSON.stringify(modernBanner));
  assert(modernBanner.hero.height < modernBanner.home.height * 0.45, JSON.stringify(modernBanner));
  assert(modernBanner.cards.every((card) => Math.abs(card.y - modernBanner.cards[0].y) < 2), JSON.stringify(modernBanner));
  assert(modernBanner.cards[0].x < modernBanner.cards[1].x && modernBanner.cards[1].x < modernBanner.cards[2].x, JSON.stringify(modernBanner));
  assert(modernBanner.suggestions.y < modernBanner.composer.y, JSON.stringify(modernBanner));

  await modern.evaluate(() => window.__CODEX_DREAM_SKIN_STATE__.setAppearance({ layout: "fullscreen" }));
  const modernFullscreen = await modern.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    return {
      home: box(".dream-home"),
      hero: box(".dream-home > div:first-child > div:first-child > div:first-child"),
      suggestions: box(".group\\/home-suggestions"),
      composer: box(".composer-surface-chrome"),
    };
  });
  assert(modernFullscreen.hero.height > modernFullscreen.home.height * 0.9, JSON.stringify(modernFullscreen));
  assert(modernFullscreen.suggestions.y < modernFullscreen.composer.y, JSON.stringify(modernFullscreen));
  assert(modernFullscreen.composer.bottom > modernFullscreen.home.bottom - 100, JSON.stringify(modernFullscreen));
  await modern.close();

  if (runtimeSourcePath) {
    const source = await fs.readFile(runtimeSourcePath, "utf8");
    const names = Array.from({ length: 9 }, (_, index) => `search-theme-${index + 1}`);
    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const searchPayload = source
      .replace("__DREAM_CSS_JSON__", JSON.stringify(""))
      .replace("__DREAM_ART_ASSETS_JSON__", JSON.stringify(Object.fromEntries(names.map((name) => [name, { home: pixel, chat: pixel, preview: pixel }]))))
      .replace("__DREAM_MANIFEST_JSON__", JSON.stringify({
        order: names,
        meta: Object.fromEntries(names.map((name, index) => [name, { button: String(index + 1), displayName: `Search Theme ${index + 1}`, brand: `Search Theme ${index + 1}`, edition: "Test", signature: "Test" }])),
        stickers: {},
        defaultTheme: names[0],
        defaultLayout: "fullscreen",
      }));
    const searchPage = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    await setHttpContent(searchPage, `<!doctype html><html><body><aside class="app-shell-left-panel"><nav><button>New task</button></nav><button aria-label="Open profile menu">Profile</button></aside><main class="main-surface"><div role="main"><span data-testid="home-icon"></span><div class="composer-surface-chrome"></div></div></main></body></html>`);
    await searchPage.evaluate(searchPayload);
    await searchPage.click("#codex-autoskin-entry-button");
    assert.equal(await searchPage.locator(".autoskin-search").count(), 1);
    await searchPage.fill(".autoskin-search", "Theme 9");
    assert.deepEqual(await searchPage.locator(".autoskin-theme-card").evaluateAll((cards) => cards.map((card) => card.dataset.theme)), ["search-theme-9"]);
    await searchPage.close();
  }

  console.log("Runtime interaction tests passed.");
} finally {
  await browser.close();
}
