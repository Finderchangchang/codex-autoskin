import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--output", "--watcher", "--node", "--app", "--port", "--stdout", "--stderr"].includes(arg)) {
      options[arg.slice(2)] = argv[++index];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const key of ["output", "watcher", "node", "app", "port", "stdout", "stderr"]) {
    if (!options[key]) throw new Error(`Missing --${key}`);
  }
  return options;
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const options = parseArgs(process.argv.slice(2));
const argumentsXml = [
  options.watcher,
  "--port", options.port,
  "--node", options.node,
  "--app", options.app,
  "--ignore-existing-app",
].map((value) => `      <string>${xml(value)}</string>`).join("\n");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.codex-autoskin.watcher</string>
    <key>ProgramArguments</key>
    <array>
${argumentsXml}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${xml(options.stdout)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(options.stderr)}</string>
  </dict>
</plist>
`;

await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
await fs.writeFile(options.output, plist, { encoding: "utf8", mode: 0o644 });
console.log(options.output);
