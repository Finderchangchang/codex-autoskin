import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

let fatalReported = false;
function reportFatal(error) {
  if (fatalReported) return;
  fatalReported = true;
  console.error(`quick-theme: ${error?.message ?? error}`);
  process.exitCode = 1;
}
process.on("uncaughtException", reportFatal);
process.on("unhandledRejection", reportFatal);

function parseArgs(argv) {
  const options = { image: null, name: null, themesRoot: null, reservedRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--image") options.image = argv[++index];
    else if (arg === "--name") options.name = argv[++index];
    else if (arg === "--themes-root") options.themesRoot = argv[++index];
    else if (arg === "--reserved-root") options.reservedRoot = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.image || !options.themesRoot) {
    throw new Error("Usage: node generate-quick-theme-macos.mjs --image <png-or-jpg> [--name my-theme] --themes-root <dir> [--reserved-root <dir>]");
  }
  return options;
}

function runSips(args) {
  const result = spawnSync("/usr/bin/sips", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sips failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max - min < 1e-9) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  let hue;
  if (max === r) hue = (g - b) / delta;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const normalized = ((hue % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs(normalized % 2 - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  switch (Math.floor(normalized)) {
    case 0: red = c; green = x; break;
    case 1: red = x; green = c; break;
    case 2: green = c; blue = x; break;
    case 3: green = x; blue = c; break;
    case 4: red = x; blue = c; break;
    default: red = c; blue = x;
  }
  const m = lightness - c / 2;
  return [red, green, blue].map((value) => Math.round(255 * (value + m)));
}

function hexOfRgb(rgb) {
  return `#${rgb.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexOfHsl(hue, saturation, lightness) {
  return hexOfRgb(hslToRgb(hue, saturation, lightness));
}

function rgbaOf(rgb, alpha) {
  return `rgba(${rgb.map(Math.round).join(", ")}, ${alpha})`;
}

function mixWhite(rgb, amount) {
  return rgb.map((value) => Math.round(255 + (value - 255) * amount));
}

function hueDistance(left, right) {
  const distance = Math.abs(left - right) % 360;
  return distance > 180 ? 360 - distance : distance;
}

function readBmpPixels(buffer) {
  if (buffer.toString("ascii", 0, 2) !== "BM") throw new Error("sips produced an invalid BMP sample");
  const pixelOffset = buffer.readUInt32LE(10);
  const width = buffer.readInt32LE(18);
  const signedHeight = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (width <= 0 || signedHeight === 0 || ![24, 32].includes(bitsPerPixel) || compression !== 0) {
    throw new Error(`unsupported BMP sample (${width}x${signedHeight}, ${bitsPerPixel}bpp, compression ${compression})`);
  }
  const height = Math.abs(signedHeight);
  const bytesPerPixel = bitsPerPixel / 8;
  const rowStride = Math.floor((width * bitsPerPixel + 31) / 32) * 4;
  const pixels = [];
  for (let y = 0; y < height; y += 1) {
    const row = pixelOffset + y * rowStride;
    for (let x = 0; x < width; x += 1) {
      const offset = row + x * bytesPerPixel;
      const alpha = bytesPerPixel === 4 ? buffer[offset + 3] : 255;
      pixels.push({ r: buffer[offset + 2], g: buffer[offset + 1], b: buffer[offset], a: alpha });
    }
  }
  return pixels;
}

function analyzePixels(pixels) {
  const buckets = new Map();
  let luminanceSum = 0;
  let pixelCount = 0;
  for (const pixel of pixels) {
    if (pixel.a < 96) continue;
    luminanceSum += 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
    pixelCount += 1;
    const key = (pixel.r >> 5) << 6 | (pixel.g >> 5) << 3 | pixel.b >> 5;
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += pixel.r;
    bucket.g += pixel.g;
    bucket.b += pixel.b;
    buckets.set(key, bucket);
  }
  if (!pixelCount) throw new Error("图片几乎全透明，无法取色");
  const clusters = [...buckets.values()].map((bucket) => {
    const r = bucket.r / bucket.n;
    const g = bucket.g / bucket.n;
    const b = bucket.b / bucket.n;
    return { n: bucket.n, r, g, b, ...rgbToHsl(r, g, b) };
  });
  const minCount = Math.max(8, pixelCount * 0.01);
  let mainCandidates = clusters.filter((item) => item.n >= minCount && item.s >= 0.18 && item.l >= 0.15 && item.l <= 0.85);
  if (!mainCandidates.length) mainCandidates = clusters.filter((item) => item.n >= minCount && item.s >= 0.08);
  if (!mainCandidates.length) mainCandidates = clusters;
  const main = mainCandidates.sort((a, b) => b.n * (0.5 + b.s) - a.n * (0.5 + a.s))[0];
  const accentCandidates = clusters.filter((item) =>
    item.n >= Math.max(5, pixelCount * 0.008) && item.s >= 0.22 && item.l >= 0.22 && item.l <= 0.9 &&
    hueDistance(item.h, main.h) >= 40);
  const accent = accentCandidates.sort((a, b) => b.n * (0.5 + b.s) - a.n * (0.5 + a.s))[0];
  const accentHue = accent?.h ?? (main.h + 36) % 360;
  const accentSaturation = clamp(accent?.s ?? main.s, 0.3, accent ? 0.8 : 0.7);
  const darkest = clusters.filter((item) => item.n >= minCount).sort((a, b) => a.l - b.l)[0] ?? main;
  return {
    averageLuminance: luminanceSum / pixelCount / 255,
    main,
    accentHue,
    accentSaturation,
    inkHue: darkest.s >= 0.08 ? darkest.h : main.h,
    derivedSaturation: main.s < 0.12 ? main.s : clamp(main.s, 0.25, 0.75),
  };
}

function buildTokens(analysis, title) {
  const { main, accentHue, accentSaturation, inkHue, derivedSaturation: saturation } = analysis;
  const tintBase = hslToRgb(main.h, saturation, 0.55);
  const tokens = {
    "--dream-ink": hexOfHsl(inkHue, Math.min(saturation, 0.5), 0.2),
    "--dream-purple": hexOfHsl(main.h, saturation, 0.4),
    "--dream-violet": hexOfHsl(main.h, saturation * 0.9, 0.55),
    "--dream-pink": hexOfHsl(accentHue, accentSaturation, 0.66),
    "--dream-page-bg-0": hexOfRgb(mixWhite(tintBase, 0.035)),
    "--dream-page-bg-1": hexOfRgb(mixWhite(tintBase, 0.09)),
    "--dream-page-glow-a": rgbaOf(hslToRgb(main.h, saturation, 0.62), ".30"),
    "--dream-page-glow-b": rgbaOf(hslToRgb(accentHue, accentSaturation, 0.68), ".26"),
    "--dream-hero-art-size": "cover",
    "--dream-hero-art-position": "65% 30%",
    "--dream-fullscreen-art-size": "cover",
    "--dream-fullscreen-art-position": "65% 30%",
    "--dream-polaroid-art-size": "cover",
    "--dream-polaroid-art-position": "65% 35%",
  };
  const light = analysis.averageLuminance >= 0.52;
  if (light) {
    const pale1 = mixWhite(tintBase, 0.05);
    const pale2 = mixWhite(tintBase, 0.1);
    const pale3 = mixWhite(tintBase, 0.16);
    const titleRgb = hslToRgb(main.h, Math.min(saturation + 0.05, 0.7), 0.26);
    Object.assign(tokens, {
      "--dream-hero-overlay": `linear-gradient(90deg, ${rgbaOf(pale1, ".96")} 0%, ${rgbaOf(pale2, ".88")} 54%, ${rgbaOf(pale3, ".50")} 78%, transparent 100%)`,
      "--dream-fullscreen-overlay": `linear-gradient(90deg, ${rgbaOf(pale1, ".95")} 0%, ${rgbaOf(pale2, ".84")} 47%, ${rgbaOf(pale3, ".44")} 72%, transparent 100%)`,
      "--dream-fullscreen-wash": rgbaOf(mixWhite(tintBase, 0.03), ".06"),
      "--dream-hero-title-color": hexOfRgb(titleRgb),
      "--dream-hero-subtitle-color": rgbaOf(titleRgb, ".82"),
      "--dream-hero-title-shadow": "0 1px 0 rgba(255, 255, 255, .92)",
      "--dream-hero-chip-color": hexOfHsl(main.h, saturation, 0.38),
      "--dream-hero-chip-bg": "rgba(255, 255, 255, .58)",
      "--dream-hero-chip-line": rgbaOf(hslToRgb(main.h, saturation, 0.45), ".36"),
      "--dream-chat-wash": rgbaOf(mixWhite(tintBase, 0.02), ".72"),
      "--dream-chat-art-opacity": ".12",
    });
  } else {
    const deepSaturation = Math.min(saturation + 0.1, 0.8);
    const deep1 = hslToRgb(main.h, deepSaturation, 0.13);
    const deep2 = hslToRgb(main.h, deepSaturation, 0.18);
    const deep3 = hslToRgb(main.h, saturation, 0.24);
    Object.assign(tokens, {
      "--dream-hero-overlay": `linear-gradient(90deg, ${rgbaOf(deep1, ".92")} 0%, ${rgbaOf(deep2, ".82")} 54%, ${rgbaOf(deep3, ".46")} 78%, transparent 100%)`,
      "--dream-fullscreen-overlay": `linear-gradient(90deg, ${rgbaOf(deep1, ".88")} 0%, ${rgbaOf(deep2, ".72")} 47%, ${rgbaOf(deep3, ".38")} 72%, transparent 100%)`,
      "--dream-fullscreen-wash": rgbaOf(mixWhite(tintBase, 0.12), ".08"),
      "--dream-hero-title-color": "#fff",
      "--dream-hero-subtitle-color": rgbaOf(mixWhite(tintBase, 0.07), ".94"),
      "--dream-hero-title-shadow": `0 2px 12px ${rgbaOf(hslToRgb(main.h, saturation, 0.08), ".50")}, 0 1px 0 rgba(255, 255, 255, .18)`,
      "--dream-hero-chip-color": hexOfHsl(accentHue, 0.55, 0.84),
      "--dream-hero-chip-bg": rgbaOf(hslToRgb(accentHue, 0.6, 0.7), ".18"),
      "--dream-hero-chip-line": rgbaOf(hslToRgb(accentHue, 0.6, 0.75), ".55"),
      "--dream-chat-wash": rgbaOf(mixWhite(tintBase, 0.03), ".78"),
      "--dream-chat-art-opacity": ".10",
    });
  }
  Object.assign(tokens, {
    "--dream-hero-subtitle": `"与 ${title} 一起，把灵感写进每一天"`,
    "--dream-chat-art-size": "cover",
    "--dream-chat-art-position": "65% 30%",
  });
  return { tokens, route: light ? "light" : "dark" };
}

function titleFromName(name) {
  return name.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

async function deriveName(image, requested) {
  if (requested) return requested;
  const stem = path.basename(image, path.extname(image)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (slug) return slug;
  const digest = crypto.createHash("sha256").update(await fs.readFile(image)).digest("hex").slice(0, 6);
  return `my-theme-${digest}`;
}

async function isQuickTheme(directory) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(directory, "theme.json"), "utf8"));
    return manifest.notes?.generator === "quick-theme";
  } catch {
    return false;
  }
}

async function installTheme({ image, name, themesRoot, reservedRoot, manifest, artFile }) {
  const themeDirectory = path.join(themesRoot, name);
  if (reservedRoot && await fs.stat(path.join(reservedRoot, name)).catch(() => null)) {
    throw new Error(`主题 '${name}' 与内置主题重名，请换一个 --name`);
  }
  const existing = await fs.lstat(themeDirectory).catch(() => null);
  if (existing && (!existing.isDirectory() || !await isQuickTheme(themeDirectory))) {
    throw new Error(`主题 '${name}' 已存在且不是 quick-theme 生成的，不会覆盖；请换一个 --name`);
  }
  await fs.mkdir(themesRoot, { recursive: true });
  const next = path.join(themesRoot, `.${name}.next-${process.pid}`);
  const previous = path.join(themesRoot, `.${name}.previous-${process.pid}`);
  await fs.rm(next, { recursive: true, force: true });
  await fs.rm(previous, { recursive: true, force: true });
  await fs.mkdir(next);
  try {
    await fs.copyFile(image, path.join(next, artFile));
    await fs.writeFile(path.join(next, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    if (existing) await fs.rename(themeDirectory, previous);
    try {
      await fs.rename(next, themeDirectory);
    } catch (error) {
      if (existing) await fs.rename(previous, themeDirectory).catch(() => {});
      throw error;
    }
    await fs.rm(previous, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(next, { recursive: true, force: true });
    throw error;
  }
  return themeDirectory;
}

const options = parseArgs(process.argv.slice(2));
const image = await fs.realpath(path.resolve(options.image));
const extension = path.extname(image).toLowerCase();
if (![".png", ".jpg", ".jpeg"].includes(extension)) {
  throw new Error(`只支持 PNG / JPG 图片（拿到的是 '${extension || "无扩展名"}'）`);
}
const name = await deriveName(image, options.name);
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  throw new Error(`主题名 '${name}' 不可用；请使用小写 kebab-case，例如 sunset-hills`);
}

const info = runSips(["-g", "pixelWidth", "-g", "pixelHeight", image]);
const width = Number(/pixelWidth:\s*(\d+)/.exec(info)?.[1]);
const height = Number(/pixelHeight:\s*(\d+)/.exec(info)?.[1]);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "codex-autoskin-theme-"));
let analysis;
try {
  const sample = path.join(temporary, "sample.bmp");
  runSips(["-z", "64", "64", "-s", "format", "bmp", image, "--out", sample]);
  analysis = analyzePixels(readBmpPixels(await fs.readFile(sample)));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

const title = titleFromName(name);
const { tokens, route } = buildTokens(analysis, title);
const artFile = extension === ".png" ? "art.png" : "art.jpg";
const button = name.split("-")[0].slice(0, 6);
const manifest = {
  name,
  notes: {
    generator: "quick-theme",
    platform: "macos",
    route,
    source: path.basename(image),
    zh: "macOS quick-theme 自动生成：背景替换 + 基础配色，裁剪使用通用安全默认值。想精修裁剪、文案或装饰，请参照 THEME-SPEC.md。",
  },
  meta: {
    button,
    brand: title,
    edition: `${title} · AutoSkin`,
    signature: `${title} ✦`,
  },
  art: { home: artFile, chat: artFile },
  tokens,
};
const themeDirectory = await installTheme({
  image,
  name,
  themesRoot: path.resolve(options.themesRoot),
  reservedRoot: options.reservedRoot ? path.resolve(options.reservedRoot) : null,
  manifest,
  artFile,
});
console.log(JSON.stringify({
  ok: true,
  name,
  route,
  width,
  height,
  averageLuminance: analysis.averageLuminance,
  mainHue: analysis.main.h,
  mainSaturation: analysis.main.s,
  accentHue: analysis.accentHue,
  themeDirectory,
}));
