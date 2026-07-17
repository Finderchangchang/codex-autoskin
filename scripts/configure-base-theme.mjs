import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = { mode: "apply", config: null, backup: null, platform: process.platform };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") options.config = path.resolve(argv[++index]);
    else if (arg === "--backup") options.backup = path.resolve(argv[++index]);
    else if (arg === "--platform") options.platform = argv[++index];
    else if (arg === "--restore") options.mode = "restore";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.config || !options.backup) {
    throw new Error("Usage: node configure-base-theme.mjs --config <path> --backup <path> [--platform darwin] [--restore]");
  }
  return options;
}

const KEYS = ["appearanceTheme", "appearanceLightCodeThemeId", "appearanceLightChromeTheme"];

function settingPattern(key) {
  return new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*(?:\\r?\\n|$)`, "m");
}

function findDesktop(content) {
  const match = /^\[desktop\][^\S\r\n]*\r?\n(?<body>.*?)(?=^\[|(?![\s\S]))/ms.exec(content);
  if (!match) return null;
  const bodyOffset = match.index + match[0].indexOf(match.groups.body);
  return { body: match.groups.body, start: bodyOffset, end: bodyOffset + match.groups.body.length };
}

function ensureDesktop(content) {
  const existing = findDesktop(content);
  if (existing) return { content, desktop: existing };
  const suffix = content.length && !content.endsWith("\n") ? "\n\n" : "\n";
  const updated = `${content}${suffix}[desktop]\n`;
  return { content: updated, desktop: findDesktop(updated) };
}

function replaceDesktopBody(content, desktop, body) {
  return content.slice(0, desktop.start) + body + content.slice(desktop.end);
}

function applySettings(content, platform) {
  const fonts = platform === "darwin"
    ? '{ code = "SFMono-Regular", ui = "SF Pro Text" }'
    : '{ code = "Cascadia Code", ui = "Microsoft YaHei UI" }';
  const settings = new Map([
    ["appearanceTheme", 'appearanceTheme = "light"'],
    ["appearanceLightCodeThemeId", 'appearanceLightCodeThemeId = "codex"'],
    ["appearanceLightChromeTheme", `appearanceLightChromeTheme = { accent = "#B65CFF", contrast = 64, fonts = ${fonts}, ink = "#4A235F", opaqueWindows = true, semanticColors = { diffAdded = "#BCE8CF", diffRemoved = "#F7B8CE", skill = "#C47BFF" }, surface = "#FFF4FA" }`],
  ]);

  let prepared = ensureDesktop(content);
  let body = prepared.desktop.body;
  for (const [key, line] of settings) {
    const pattern = settingPattern(key);
    if (pattern.test(body)) body = body.replace(pattern, `${line}\n`);
    else body = `${body}${body.length && !body.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  return replaceDesktopBody(prepared.content, prepared.desktop, body);
}

function restoreSettings(current, backup) {
  let prepared = ensureDesktop(current);
  let body = prepared.desktop.body;
  const savedDesktop = findDesktop(backup);
  const savedBody = savedDesktop?.body ?? "";

  for (const key of KEYS) {
    const pattern = settingPattern(key);
    const saved = savedBody.match(pattern)?.[0]?.replace(/\r?\n$/, "") ?? null;
    if (pattern.test(body)) body = body.replace(pattern, saved ? `${saved}\n` : "");
    else if (saved) body = `${body}${body.length && !body.endsWith("\n") ? "\n" : ""}${saved}\n`;
  }
  return replaceDesktopBody(prepared.content, prepared.desktop, body);
}

const options = parseArgs(process.argv.slice(2));
const config = await fs.readFile(options.config, "utf8");
if (options.mode === "apply") {
  await fs.mkdir(path.dirname(options.backup), { recursive: true });
  try {
    await fs.copyFile(options.config, options.backup, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await fs.writeFile(options.config, applySettings(config, options.platform), "utf8");
  console.log(`Dream Skin base colors applied to ${options.config}`);
} else {
  const backup = await fs.readFile(options.backup, "utf8");
  await fs.writeFile(options.config, restoreSettings(config, backup), "utf8");
  console.log(`Pre-install base colors restored in ${options.config}`);
}
