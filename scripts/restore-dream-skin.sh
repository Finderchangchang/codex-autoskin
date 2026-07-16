#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

PORT=9335
UNINSTALL=0
RESTORE_BASE_THEME=0
NODE_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --restore-base-theme) RESTORE_BASE_THEME=1; shift ;;
    --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--port 9335] [--uninstall] [--restore-base-theme]"; exit 0 ;;
    *) dream_die "unknown argument: $1" ;;
  esac
done

dream_require_macos
dream_validate_port "$PORT"
dream_resolve_node "$NODE_PATH"

STATE_ROOT="$(dream_state_root)"
STATE_PATH="$STATE_ROOT/state.json"
WATCHER_STATE_PATH="$STATE_ROOT/watcher-state.json"
PLIST_PATH="$HOME/Library/LaunchAgents/com.codex-autoskin.watcher.plist"

launchctl bootout "gui/$UID/com.codex-autoskin.watcher" >/dev/null 2>&1 || true
if [ -f "$WATCHER_STATE_PATH" ]; then
  WATCHER_PID="$(dream_read_json_number "$WATCHER_STATE_PATH" watcherPid 2>/dev/null || true)"
  [ -z "$WATCHER_PID" ] || dream_stop_pid_if_matches "$WATCHER_PID" "watch-dream-skin.sh"
  rm -f "$WATCHER_STATE_PATH"
fi
rm -rf "$STATE_ROOT/watcher.lock"

if [ -f "$STATE_PATH" ]; then
  INJECTOR_PID="$(dream_read_json_number "$STATE_PATH" injectorPid 2>/dev/null || true)"
  [ -z "$INJECTOR_PID" ] || dream_stop_pid_if_matches "$INJECTOR_PID" "$SCRIPT_DIR/injector.mjs"
  rm -f "$STATE_PATH"
fi
sleep 0.25
"$NODE_BIN" "$SCRIPT_DIR/injector.mjs" --remove --port "$PORT" --timeout-ms 3000 >/dev/null 2>&1 || true

if [ "$UNINSTALL" -eq 1 ]; then
  rm -f "$PLIST_PATH"
fi

if [ "$RESTORE_BASE_THEME" -eq 1 ]; then
  CONFIG_PATH="$HOME/.codex/config.toml"
  BACKUP_PATH="$STATE_ROOT/config.before-dream-skin.toml"
  [ -f "$BACKUP_PATH" ] || dream_die "no pre-install config backup is available"
  "$NODE_BIN" "$SCRIPT_DIR/configure-base-theme.mjs" \
    --config "$CONFIG_PATH" --backup "$BACKUP_PATH" --restore
fi

echo "The live Dream Skin was removed."
