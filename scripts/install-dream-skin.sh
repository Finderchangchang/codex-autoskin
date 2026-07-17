#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

PORT="$(dream_installed_port)"
NO_AUTO_RECOVER=0
APP_PATH=""
NODE_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
    --no-auto-recover) NO_AUTO_RECOVER=1; shift ;;
    --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
    --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--port 9335] [--no-auto-recover] [--app /path/to/ChatGPT.app]"; exit 0 ;;
    *) dream_die "unknown argument: $1" ;;
  esac
done

dream_require_macos
dream_validate_port "$PORT"
dream_resolve_app "$APP_PATH"
dream_resolve_node "$NODE_PATH"

STATE_ROOT="$(dream_state_root)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_ROOT="$STATE_ROOT/runtime"
INSTALL_STATE_PATH="$STATE_ROOT/install-state.json"
CONFIG_PATH="$HOME/.codex/config.toml"
BACKUP_PATH="$STATE_ROOT/config.before-dream-skin.toml"
PLIST_PATH="$HOME/Library/LaunchAgents/com.codex-autoskin.watcher.plist"
mkdir -p "$STATE_ROOT" "$HOME/Library/LaunchAgents"
[ -f "$CONFIG_PATH" ] || dream_die "Codex config not found: $CONFIG_PATH"

launchctl bootout "gui/$UID/com.codex-autoskin.watcher" >/dev/null 2>&1 || true
WATCHER_STATE_PATH="$STATE_ROOT/watcher-state.json"
if [ -f "$WATCHER_STATE_PATH" ]; then
  WATCHER_PID="$(dream_read_json_number "$WATCHER_STATE_PATH" watcherPid 2>/dev/null || true)"
  [ -z "$WATCHER_PID" ] || dream_stop_pid_if_matches "$WATCHER_PID" "watch-dream-skin.sh"
fi
rm -f "$WATCHER_STATE_PATH"
rm -rf "$STATE_ROOT/watcher.lock"
INJECTOR_STATE_PATH="$STATE_ROOT/state.json"
if [ -f "$INJECTOR_STATE_PATH" ]; then
  INJECTOR_PID="$(dream_read_json_number "$INJECTOR_STATE_PATH" injectorPid 2>/dev/null || true)"
  [ -z "$INJECTOR_PID" ] || dream_stop_pid_if_matches "$INJECTOR_PID" "injector.mjs"
  rm -f "$INJECTOR_STATE_PATH"
fi

"$NODE_BIN" "$SCRIPT_DIR/sync-macos-runtime.mjs" \
  --source "$SOURCE_ROOT" --destination "$RUNTIME_ROOT" >/dev/null
RUNTIME_SCRIPTS="$RUNTIME_ROOT/scripts"

"$NODE_BIN" "$RUNTIME_SCRIPTS/configure-base-theme.mjs" \
  --config "$CONFIG_PATH" --backup "$BACKUP_PATH" --platform darwin

if [ "$NO_AUTO_RECOVER" -ne 1 ]; then
  "$NODE_BIN" "$RUNTIME_SCRIPTS/macos-launch-agent.mjs" \
    --output "$PLIST_PATH" \
    --watcher "$RUNTIME_SCRIPTS/watch-dream-skin.sh" \
    --node "$NODE_BIN" \
    --app "$APP_BUNDLE" \
    --port "$PORT" \
    --stdout "$STATE_ROOT/launch-agent.log" \
    --stderr "$STATE_ROOT/launch-agent-error.log" >/dev/null
  plutil -lint "$PLIST_PATH" >/dev/null
  launchctl bootstrap "gui/$UID" "$PLIST_PATH"
  launchctl kickstart -k "gui/$UID/com.codex-autoskin.watcher" >/dev/null
else
  rm -f "$PLIST_PATH"
fi

"$NODE_BIN" -e '
  const fs = require("fs");
  const [file, port, appPath, nodePath, runtimeRoot, sourceRoot] = process.argv.slice(1);
  fs.writeFileSync(file, JSON.stringify({
    port: Number(port), appPath, nodePath, runtimeRoot, sourceRoot,
    installedAt: new Date().toISOString(), platform: "darwin"
  }, null, 2) + "\n");
' "$INSTALL_STATE_PATH" "$PORT" "$APP_BUNDLE" "$NODE_BIN" "$RUNTIME_ROOT" "$SOURCE_ROOT"

echo "Codex Dream Skin installed for macOS."
echo "Installed runtime: $RUNTIME_ROOT"
echo "Launch it with: $RUNTIME_SCRIPTS/autoskin-macos.sh start"
