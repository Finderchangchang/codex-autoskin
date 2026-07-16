#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codex-autoskin-test.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  echo "macOS test failed: $*" >&2
  exit 1
}

echo "Checking shell and JavaScript syntax..."
while IFS= read -r script; do
  /bin/bash -n "$script"
done < <(find "$ROOT/scripts" -type f -name '*.sh' -print | sort)
while IFS= read -r command_file; do
  /bin/bash -n "$command_file"
done < <(find "$ROOT" -maxdepth 1 -type f -name '*.command' -print | sort)
while IFS= read -r module; do
  "$NODE_BIN" --check "$module"
done < <(find "$ROOT/scripts" -type f -name '*.mjs' -print | sort)

echo "Checking theme discovery..."
THEME_REPORT="$TMP_ROOT/themes.json"
"$NODE_BIN" "$ROOT/scripts/injector.mjs" --themes >"$THEME_REPORT"
"$NODE_BIN" -e '
  const report = require(process.argv[1]);
  if (report.defaultTheme !== "aurora-veil") throw new Error("unexpected default theme");
  for (const name of ["aurora-veil", "ember-bloom"]) {
    if (!report.themes.some((theme) => theme.name === name)) throw new Error(`missing ${name}`);
  }
' "$THEME_REPORT"

echo "Checking base-color apply/restore idempotence..."
CONFIG_PATH="$TMP_ROOT/config.toml"
BACKUP_PATH="$TMP_ROOT/config.backup.toml"
ORIGINAL_PATH="$TMP_ROOT/config.original.toml"
printf '%s\n' \
  'model = "gpt-5"' \
  '' \
  '[desktop]' \
  'appearanceTheme = "dark"' \
  'appearanceLightCodeThemeId = "solarized"' \
  'appearanceLightChromeTheme = { accent = "#123456" }' \
  'notifications = true' >"$CONFIG_PATH"
cp "$CONFIG_PATH" "$ORIGINAL_PATH"
"$NODE_BIN" "$ROOT/scripts/configure-base-theme.mjs" \
  --config "$CONFIG_PATH" --backup "$BACKUP_PATH" --platform darwin >/dev/null
cp "$CONFIG_PATH" "$TMP_ROOT/config.once.toml"
"$NODE_BIN" "$ROOT/scripts/configure-base-theme.mjs" \
  --config "$CONFIG_PATH" --backup "$BACKUP_PATH" --platform darwin >/dev/null
cmp "$CONFIG_PATH" "$TMP_ROOT/config.once.toml" || fail "base-color apply is not idempotent"
"$NODE_BIN" "$ROOT/scripts/configure-base-theme.mjs" \
  --config "$CONFIG_PATH" --backup "$BACKUP_PATH" --restore >/dev/null
cmp "$CONFIG_PATH" "$ORIGINAL_PATH" || fail "base colors were not restored exactly"

echo "Checking stable runtime synchronization..."
RUNTIME_ROOT="$TMP_ROOT/runtime"
"$NODE_BIN" "$ROOT/scripts/sync-macos-runtime.mjs" \
  --source "$ROOT" --destination "$RUNTIME_ROOT" >/dev/null
for entry in scripts assets styles themes .runtime.json; do
  [ -e "$RUNTIME_ROOT/$entry" ] || fail "runtime is missing $entry"
done
[ -x "$RUNTIME_ROOT/scripts/autoskin-macos.sh" ] || fail "runtime scripts lost executable permissions"
"$NODE_BIN" "$ROOT/scripts/sync-macos-runtime.mjs" \
  --source "$ROOT" --destination "$RUNTIME_ROOT" >/dev/null
"$NODE_BIN" "$RUNTIME_ROOT/scripts/injector.mjs" --themes >/dev/null

echo "Checking LaunchAgent generation..."
PLIST_PATH="$TMP_ROOT/com.codex-autoskin.watcher.plist"
"$NODE_BIN" "$ROOT/scripts/macos-launch-agent.mjs" \
  --output "$PLIST_PATH" \
  --watcher "$RUNTIME_ROOT/scripts/watch-dream-skin.sh" \
  --node "$NODE_BIN" \
  --app "$TMP_ROOT/Fake Codex.app" \
  --port 19335 \
  --stdout "$TMP_ROOT/watcher.log" \
  --stderr "$TMP_ROOT/watcher-error.log" >/dev/null
/usr/bin/plutil -lint "$PLIST_PATH" >/dev/null
/usr/bin/plutil -p "$PLIST_PATH" | grep -q -- '--ignore-existing-app' || fail "LaunchAgent safety flag is missing"

echo "Checking remembered port and app discovery..."
TEST_HOME="$TMP_ROOT/home"
FAKE_APP="$TMP_ROOT/Fake Codex.app"
mkdir -p "$TEST_HOME/Library/Application Support/CodexDreamSkin" "$FAKE_APP/Contents/MacOS"
/usr/bin/plutil -create xml1 "$FAKE_APP/Contents/Info.plist"
/usr/bin/plutil -insert CFBundleIdentifier -string com.openai.codex "$FAKE_APP/Contents/Info.plist"
/usr/bin/plutil -insert CFBundleExecutable -string FakeCodex "$FAKE_APP/Contents/Info.plist"
: >"$FAKE_APP/Contents/MacOS/FakeCodex"
chmod +x "$FAKE_APP/Contents/MacOS/FakeCodex"
"$NODE_BIN" -e '
  const fs = require("fs");
  fs.writeFileSync(process.argv[1], JSON.stringify({
    port: 19335, appPath: process.argv[2], nodePath: process.execPath
  }));
' "$TEST_HOME/Library/Application Support/CodexDreamSkin/install-state.json" "$FAKE_APP"
HOME="$TEST_HOME" /bin/bash -c '
  set -euo pipefail
  . "$1/scripts/lib/mac-common.sh"
  [ "$(dream_installed_port)" = "19335" ]
  dream_resolve_app ""
  [ "$APP_BUNDLE" = "$2" ]
' test "$ROOT" "$FAKE_APP"

echo "Checking isolated one-command installation..."
mkdir -p "$TEST_HOME/.codex"
printf '%s\n' '[desktop]' 'appearanceTheme = "dark"' >"$TEST_HOME/.codex/config.toml"
HOME="$TEST_HOME" "$ROOT/scripts/autoskin-macos.sh" install \
  --no-start --no-auto-recover --port 19337 --app "$FAKE_APP" --node "$NODE_BIN" >/dev/null
INSTALLED_ROOT="$TEST_HOME/Library/Application Support/CodexDreamSkin"
[ -x "$INSTALLED_ROOT/runtime/scripts/autoskin-macos.sh" ] || fail "unified installer did not create a stable runtime"
[ -f "$INSTALLED_ROOT/config.before-dream-skin.toml" ] || fail "unified installer did not back up base colors"
[ ! -e "$TEST_HOME/Library/LaunchAgents/com.codex-autoskin.watcher.plist" ] || fail "--no-auto-recover installed a LaunchAgent"
HOME="$TEST_HOME" /bin/bash -c '
  set -euo pipefail
  . "$1/runtime/scripts/lib/mac-common.sh"
  [ "$(dream_installed_port)" = "19337" ]
' test "$INSTALLED_ROOT"

echo "Checking repeatable uninstall without a backup..."
rm -f "$INSTALLED_ROOT/config.before-dream-skin.toml"
for _ in 1 2; do
  HOME="$TEST_HOME" "$ROOT/scripts/restore-dream-skin.sh" \
    --uninstall --restore-base-theme --node "$NODE_BIN" >/dev/null
done
[ ! -e "$TEST_HOME/Library/Application Support/CodexDreamSkin/runtime" ] || fail "runtime was not removed"
[ ! -e "$TEST_HOME/Library/Application Support/CodexDreamSkin/install-state.json" ] || fail "install state was not removed"

echo "All macOS tests passed."
