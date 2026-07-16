#!/bin/bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/scripts/autoskin-macos.sh" uninstall
STATUS=$?

echo
if [ "$STATUS" -eq 0 ]; then
  echo "完成。重新打开 Codex 后即为官方界面。"
else
  echo "卸载失败（退出码 $STATUS）。请保留上面的错误信息。"
fi
printf '按回车键关闭… '
read -r _
exit "$STATUS"
