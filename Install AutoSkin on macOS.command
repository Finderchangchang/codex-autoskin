#!/bin/bash

ROOT="$(cd "$(dirname "$0")" && pwd)"
"$ROOT/scripts/autoskin-macos.sh" install
STATUS=$?

echo
if [ "$STATUS" -eq 0 ]; then
  echo "完成。你现在可以关闭这个窗口。"
else
  echo "安装失败（退出码 $STATUS）。请保留上面的错误信息。"
fi
printf '按回车键关闭… '
read -r _
exit "$STATUS"
