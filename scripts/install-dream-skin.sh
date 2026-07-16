#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

PORT=9335
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
CONFIG_PATH="$HOME/.codex/config.toml"
BACKUP_PATH="$STATE_ROOT/config.before-dream-skin.toml"
PLIST_PATH="$HOME/Library/LaunchAgents/com.codex-autoskin.watcher.plist"
mkdir -p "$STATE_ROOT" "$HOME/Library/LaunchAgents"
[ -f "$CONFIG_PATH" ] || dream_die "Codex config not found: $CONFIG_PATH"

"$NODE_BIN" "$SCRIPT_DIR/configure-base-theme.mjs" \
  --config "$CONFIG_PATH" --backup "$BACKUP_PATH" --platform darwin

if [ "$NO_AUTO_RECOVER" -ne 1 ]; then
  launchctl bootout "gui/$UID/com.codex-autoskin.watcher" >/dev/null 2>&1 || true
  "$NODE_BIN" "$SCRIPT_DIR/macos-launch-agent.mjs" \
    --output "$PLIST_PATH" \
    --watcher "$SCRIPT_DIR/watch-dream-skin.sh" \
    --node "$NODE_BIN" \
    --app "$APP_BUNDLE" \
    --port "$PORT" \
    --stdout "$STATE_ROOT/launch-agent.log" \
    --stderr "$STATE_ROOT/launch-agent-error.log" >/dev/null
  plutil -lint "$PLIST_PATH" >/dev/null
  launchctl bootstrap "gui/$UID" "$PLIST_PATH"
  launchctl kickstart -k "gui/$UID/com.codex-autoskin.watcher" >/dev/null
else
  launchctl bootout "gui/$UID/com.codex-autoskin.watcher" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
fi

echo "Codex Dream Skin installed for macOS."
echo "Launch it with: $SCRIPT_DIR/start-dream-skin.sh"
