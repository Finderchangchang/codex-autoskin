import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = { source: null, destination: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.source = path.resolve(argv[++index]);
    else if (arg === "--destination") options.destination = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.source || !options.destination) {
    throw new Error("Usage: node sync-macos-runtime.mjs --source <repo> --destination <runtime-dir>");
  }
  return options;
}

const REQUIRED_ENTRIES = ["scripts", "assets", "styles", "themes"];
const OPTIONAL_ENTRIES = ["themes-private"];
const options = parseArgs(process.argv.slice(2));

if (options.source === options.destination) {
  console.log(options.destination);
  process.exit(0);
}

for (const entry of REQUIRED_ENTRIES) {
  const stat = await fs.stat(path.join(options.source, entry)).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Runtime source is missing ${entry}/: ${options.source}`);
}

const parent = path.dirname(options.destination);
const next = `${options.destination}.next-${process.pid}`;
const previous = `${options.destination}.previous-${process.pid}`;
await fs.mkdir(parent, { recursive: true });
await fs.rm(next, { recursive: true, force: true });
await fs.rm(previous, { recursive: true, force: true });
await fs.mkdir(next, { recursive: true });

try {
  for (const entry of REQUIRED_ENTRIES) {
    await fs.cp(path.join(options.source, entry), path.join(next, entry), {
      recursive: true,
      preserveTimestamps: true,
    });
  }
  for (const entry of OPTIONAL_ENTRIES) {
    const source = path.join(options.source, entry);
    if (await fs.stat(source).catch(() => null)) {
      await fs.cp(source, path.join(next, entry), { recursive: true, preserveTimestamps: true });
    }
  }
  await fs.writeFile(path.join(next, ".runtime.json"), JSON.stringify({
    installedAt: new Date().toISOString(),
    sourceRoot: options.source,
  }, null, 2) + "\n");

  const existing = await fs.stat(options.destination).catch(() => null);
  if (existing) await fs.rename(options.destination, previous);
  try {
    await fs.rename(next, options.destination);
  } catch (error) {
    if (existing) await fs.rename(previous, options.destination).catch(() => {});
    throw error;
  }
  await fs.rm(previous, { recursive: true, force: true });
} catch (error) {
  await fs.rm(next, { recursive: true, force: true });
  throw error;
}

console.log(options.destination);
