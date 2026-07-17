import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const options = { port: 9335, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--output") options.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }
  if (!options.output) throw new Error("Usage: node macos-capture.mjs --port <port> --output <path.png>");
  return options;
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

async function fetchMainTarget(port) {
  let lastError;
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const response = await fetch(`http://${host}:${port}/json/list`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const target = (await response.json()).find(isMainRendererTarget);
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`No main Codex renderer on port ${port}: ${lastError?.message ?? "not found"}`);
}

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP socket error")), { once: true });
  });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP evaluate timed out")), 5000);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) reject(new Error(message.error.message));
        else if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
        else resolve(message.result?.result?.value);
      });
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true },
      }));
    });
  } finally {
    socket.close();
  }
}

const options = parseArgs(process.argv.slice(2));
if (process.platform !== "darwin") throw new Error("macos-capture.mjs only supports macOS");
const target = await fetchMainTarget(options.port);
const bounds = await evaluate(target, "({ x: screenX, y: screenY, width: outerWidth, height: outerHeight })");
for (const key of ["x", "y", "width", "height"]) {
  if (!Number.isFinite(bounds?.[key])) throw new Error(`Invalid window ${key}: ${bounds?.[key]}`);
}
if (bounds.width < 1 || bounds.height < 1) throw new Error("Codex window has no capturable area");

const processes = spawnSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" });
if (processes.status !== 0) throw new Error("Could not inspect the Codex process list");
const portFlag = `--remote-debugging-port=${options.port}`;
const processLine = processes.stdout.split("\n").find((line) =>
  line.includes(portFlag) && line.includes(".app/Contents/MacOS/") && !line.includes(" --type="));
const pid = Number(/^\s*(\d+)/.exec(processLine ?? "")?.[1]);
if (!Number.isInteger(pid)) throw new Error(`Could not find the main Codex process for port ${options.port}`);

const jxa = `
ObjC.import("CoreGraphics");
ObjC.bindFunction("CGWindowListCopyWindowInfo", ["id", ["uint32", "uint32"]]);
function run(argv) {
  const pid = Number(argv[0]);
  const expected = JSON.parse(argv[1]);
  const windows = ObjC.deepUnwrap($.CGWindowListCopyWindowInfo(1, 0));
  const candidates = windows.filter((window) =>
    window.kCGWindowOwnerPID === pid && window.kCGWindowLayer === 0 &&
    window.kCGWindowBounds?.Width > 0 && window.kCGWindowBounds?.Height > 0);
  candidates.sort((left, right) => {
    const distance = (window) => Math.abs(window.kCGWindowBounds.X - expected.x) +
      Math.abs(window.kCGWindowBounds.Y - expected.y) +
      Math.abs(window.kCGWindowBounds.Width - expected.width) +
      Math.abs(window.kCGWindowBounds.Height - expected.height);
    return distance(left) - distance(right);
  });
  if (!candidates.length) throw new Error("No on-screen Codex window found");
  return String(candidates[0].kCGWindowNumber);
}`;
const windowLookup = spawnSync("/usr/bin/osascript", [
  "-l", "JavaScript", "-e", jxa, String(pid), JSON.stringify(bounds),
], { encoding: "utf8" });
if (windowLookup.status !== 0) {
  throw new Error(`Could not resolve the Codex window ID: ${windowLookup.stderr.trim()}`);
}
const windowId = windowLookup.stdout.trim();
if (!/^\d+$/.test(windowId)) throw new Error(`Invalid Codex window ID: ${windowId}`);

await fs.mkdir(path.dirname(options.output), { recursive: true });
const capture = spawnSync("/usr/sbin/screencapture", ["-x", "-o", "-l" + windowId, options.output], {
  encoding: "utf8",
});
if (capture.status !== 0) {
  throw new Error(`macOS screenshot failed${capture.stderr ? `: ${capture.stderr.trim()}` : " (grant Screen Recording permission to your terminal)"}`);
}
console.log(options.output);
