#!/bin/bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
IMAGE_PATH="${1:-}"

if [ -z "$IMAGE_PATH" ]; then
  IMAGE_PATH="$(/usr/bin/osascript -e 'POSIX path of (choose file with prompt "选择一张 PNG 或 JPG 图片来生成 AutoSkin 主题")' 2>/dev/null)"
  if [ -z "$IMAGE_PATH" ]; then
    echo "没有选择图片。"
    exit 0
  fi
fi

"$ROOT/scripts/autoskin-macos.sh" quick-theme "$IMAGE_PATH"
STATUS=$?

echo
if [ "$STATUS" -eq 0 ]; then
  echo "完成。你现在可以关闭这个窗口。"
else
  echo "主题生成失败（退出码 ${STATUS}）。请保留上面的错误信息。"
fi
printf '按回车键关闭… '
read -r _
exit "$STATUS"
