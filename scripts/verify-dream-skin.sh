#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"
PORT="$(dream_installed_port)"
SCREENSHOT=""
APP_PATH=""
NODE_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --screenshot) SCREENSHOT="$2"; shift 2 ;;
    --app) APP_PATH="$2"; shift 2 ;;
    --node) NODE_PATH="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--port 9335] [--screenshot /absolute/path.png] [--app PATH]"; exit 0 ;;
    *) dream_die "unknown argument: $1" ;;
  esac
done

dream_require_macos
dream_validate_port "$PORT"
dream_resolve_app "$APP_PATH"
dream_resolve_node "$NODE_PATH"
ARGS=("$SCRIPT_DIR/injector.mjs" --verify --port "$PORT")
"$NODE_BIN" "${ARGS[@]}"
if [ -n "$SCREENSHOT" ]; then
  # Page.captureScreenshot closes the renderer CDP socket in current macOS
  # Codex builds. Capture the renderer's on-screen window rectangle instead.
  "$NODE_BIN" "$SCRIPT_DIR/macos-capture.mjs" --port "$PORT" --output "$SCREENSHOT"
fi
