#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=9335
SCREENSHOT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --screenshot) SCREENSHOT="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--port 9335] [--screenshot /absolute/path.png]"; exit 0 ;;
    *) echo "dream-skin: unknown argument: $1" >&2; exit 1 ;;
  esac
done

NODE_BIN="$(command -v node 2>/dev/null || true)"
[ -n "$NODE_BIN" ] || { echo "dream-skin: Node.js >= 20 is required" >&2; exit 1; }
ARGS=("$SCRIPT_DIR/injector.mjs" --verify --port "$PORT")
"$NODE_BIN" "${ARGS[@]}"
if [ -n "$SCREENSHOT" ]; then
  # Page.captureScreenshot closes the renderer CDP socket in current macOS
  # Codex builds. Capture the renderer's on-screen window rectangle instead.
  "$NODE_BIN" "$SCRIPT_DIR/macos-capture.mjs" --port "$PORT" --output "$SCREENSHOT"
fi
