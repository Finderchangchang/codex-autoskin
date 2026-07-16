#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$SCRIPT_DIR/lib/mac-common.sh"

IMAGE_PATH=""
THEME_NAME=""
LAYOUT="fullscreen"
NO_APPLY=0
PORT="$(dream_installed_port)"
APP_PATH=""
NODE_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --image) [ "$#" -ge 2 ] || dream_die "--image requires a value"; IMAGE_PATH="$2"; shift 2 ;;
    --name) [ "$#" -ge 2 ] || dream_die "--name requires a value"; THEME_NAME="$2"; shift 2 ;;
    --layout) [ "$#" -ge 2 ] || dream_die "--layout requires a value"; LAYOUT="$2"; shift 2 ;;
    --no-apply) NO_APPLY=1; shift ;;
    --port) [ "$#" -ge 2 ] || dream_die "--port requires a value"; PORT="$2"; shift 2 ;;
    --app) [ "$#" -ge 2 ] || dream_die "--app requires a value"; APP_PATH="$2"; shift 2 ;;
    --node) [ "$#" -ge 2 ] || dream_die "--node requires a value"; NODE_PATH="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 <image.png|image.jpg> [--name my-theme] [--layout fullscreen|banner] [--no-apply]"
      exit 0 ;;
    -*) dream_die "unknown argument: $1" ;;
    *)
      [ -z "$IMAGE_PATH" ] || dream_die "only one image may be provided"
      IMAGE_PATH="$1"
      shift ;;
  esac
done

[ -n "$IMAGE_PATH" ] || dream_die "choose an image or pass --image /path/to/image.png"
case "$LAYOUT" in
  banner|fullscreen) ;;
  *) dream_die "layout must be banner or fullscreen" ;;
esac

dream_require_macos
dream_validate_port "$PORT"
dream_resolve_app "$APP_PATH"
dream_resolve_node "$NODE_PATH"

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_ROOT="$(dream_state_root)"
RUNTIME_ROOT="$STATE_ROOT/runtime"
ACTIVE_ROOT="$PROJECT_ROOT"
THEMES_ROOT="$PROJECT_ROOT/themes-private"
RESERVED_ROOT="$PROJECT_ROOT/themes"

if [ -f "$RUNTIME_ROOT/scripts/injector.mjs" ]; then
  [ -e "$RUNTIME_ROOT/themes-private" ] || dream_die "installed runtime is from an older version; rerun '$PROJECT_ROOT/scripts/autoskin-macos.sh install --no-start' first"
  ACTIVE_ROOT="$RUNTIME_ROOT"
  THEMES_ROOT="$STATE_ROOT/themes-private"
  RESERVED_ROOT="$RUNTIME_ROOT/themes"
fi

GENERATOR_ARGS=(
  --image "$IMAGE_PATH"
  --themes-root "$THEMES_ROOT"
  --reserved-root "$RESERVED_ROOT"
)
[ -z "$THEME_NAME" ] || GENERATOR_ARGS+=(--name "$THEME_NAME")

echo "==> 分析图片并生成主题"
REPORT="$("$NODE_BIN" "$SCRIPT_DIR/generate-quick-theme-macos.mjs" "${GENERATOR_ARGS[@]}")"
THEME_NAME="$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(process.argv[1]).name)' "$REPORT")"
THEME_ROUTE="$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(process.argv[1]).route)' "$REPORT")"
IMAGE_WIDTH="$("$NODE_BIN" -e 'process.stdout.write(String(JSON.parse(process.argv[1]).width || 0))' "$REPORT")"
THEME_DIRECTORY="$("$NODE_BIN" -e 'process.stdout.write(JSON.parse(process.argv[1]).themeDirectory)' "$REPORT")"
echo "    已生成 ${THEME_NAME}（$THEME_ROUTE 路线）"
echo "    $THEME_DIRECTORY"
if [ "$IMAGE_WIDTH" -gt 0 ] && [ "$IMAGE_WIDTH" -lt 1200 ]; then
  echo "    提示：图片宽度只有 ${IMAGE_WIDTH}px，建议使用至少 1600px 的横图。"
fi

if [ "$NO_APPLY" -eq 1 ]; then
  echo "主题已生成；已按 --no-apply 跳过实时应用。"
  exit 0
fi

if ! dream_cdp_ready "$PORT"; then
  echo ""
  echo "主题已生成，但当前 Codex 没有运行 AutoSkin。"
  if [ -f "$RUNTIME_ROOT/scripts/autoskin-macos.sh" ]; then
    echo "启动后应用：$RUNTIME_ROOT/scripts/autoskin-macos.sh start"
    echo "然后运行：$RUNTIME_ROOT/scripts/autoskin-macos.sh theme $THEME_NAME $LAYOUT"
  else
    echo "先运行：$PROJECT_ROOT/scripts/autoskin-macos.sh install"
  fi
  exit 0
fi

echo "==> 重载主题并立即应用"
"$ACTIVE_ROOT/scripts/start-dream-skin.sh" \
  --port "$PORT" --app "$APP_BUNDLE" --node "$NODE_BIN" >/dev/null
"$NODE_BIN" "$ACTIVE_ROOT/scripts/set-theme.mjs" \
  --port "$PORT" "$THEME_NAME" "$LAYOUT" >/dev/null

echo ""
echo "完成！'${THEME_NAME}' 已应用到 Codex（${LAYOUT}）。"
echo "切换版式：$ACTIVE_ROOT/scripts/autoskin-macos.sh theme $THEME_NAME banner"
echo "想精修时，可以让 agent 按 THEME-SPEC.md 调整这个主题。"
