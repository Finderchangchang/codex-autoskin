// Programmatic theme/layout switcher for the running Codex Dream Skin.
// The skin intentionally has no on-screen switch UI; agents (or users through
// their agent) change themes with:
//
//   node scripts/set-theme.mjs <theme> [banner|fullscreen] [--port 9335]
//   node scripts/set-theme.mjs --list
//
// The change goes through window.__CODEX_DREAM_SKIN_STATE__.setTheme()/setLayout()
// inside the main renderer and persists via localStorage, so it survives reloads
// and restarts recovered by the watcher.

const LAYOUTS = new Set(["banner", "fullscreen"]);

function parseArgs(argv) {
  const options = { port: 9335, theme: null, layout: null, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") options.port = Number(argv[++i]);
    else if (arg === "--list") options.list = true;
    else if (LAYOUTS.has(arg)) options.layout = arg;
    else if (!arg.startsWith("-") && !options.theme) options.theme = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!options.list && !options.theme && !options.layout) {
    throw new Error("Usage: node scripts/set-theme.mjs <theme> [banner|fullscreen] [--port 9335] | --list");
  }
  return options;
}

// Chromium may bind DevTools to either loopback stack; probe both (see runtime-notes.md).
async function fetchTargets(port) {
  let lastError;
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`CDP unreachable on 127.0.0.1/[::1]:${port}: ${lastError?.message ?? "no response"}`);
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

async function evaluateOnce(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
  });
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP evaluate timed out")), 10000);
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true },
      }));
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result?.value;
  } finally {
    ws.close();
  }
}

const options = parseArgs(process.argv.slice(2));
const targets = await fetchTargets(options.port);
const main = targets.find(isMainRendererTarget);
if (!main) {
  console.error(JSON.stringify({ ok: false, error: `no main Codex renderer on port ${options.port}` }));
  process.exit(1);
}

const expression = `(() => {
  const state = window.__CODEX_DREAM_SKIN_STATE__;
  if (!state) return { ok: false, error: "dream skin is not active (run the platform start-dream-skin script first)" };
  const request = ${JSON.stringify({ theme: options.theme, layout: options.layout, list: options.list })};
  const themes = state.themes ?? [];
  if (request.list) {
    return { ok: true, theme: state.theme, layout: state.layout, themes, defaultTheme: state.defaultTheme, defaultLayout: state.defaultLayout };
  }
  if (request.theme && !themes.includes(request.theme)) {
    return { ok: false, error: "unknown theme: " + request.theme, themes };
  }
  if (request.theme) state.setTheme(request.theme);
  if (request.layout) state.setLayout(request.layout);
  state.ensure();
  return {
    ok: true,
    theme: state.theme,
    layout: state.layout,
    themes,
    persisted: {
      theme: localStorage.getItem("codex-dream-skin.theme"),
      layout: localStorage.getItem("codex-dream-skin.layout"),
    },
  };
})()`;

const outcome = await evaluateOnce(main, expression);
console.log(JSON.stringify(outcome, null, 2));
if (!outcome?.ok) process.exit(2);
