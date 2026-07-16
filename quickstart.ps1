# quickstart.ps1 — 一条命令装好 Codex AutoSkin：自检环境 -> 安装 -> 启动 -> 点亮默认主题。
#
#   .\quickstart.ps1
#
# 可以重复执行（幂等）。装好之后，用自己的图做主题：
#   .\quick-theme.ps1 -Image C:\path\你的图.png
#
# 兼容 Windows PowerShell 5.1 与 PowerShell 7+（文件本身为 UTF-8 with BOM）。

[CmdletBinding()]
param(
  [int]$Port = 9335
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Ok([string]$Message) { Write-Host "    $Message" -ForegroundColor Green }
function Note([string]$Message) { Write-Host "    $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "[X] $Message" -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host 'Codex AutoSkin 快速安装' -ForegroundColor Magenta
Write-Host ''

# ---------------------------------------------------------------------------
# 1/4 环境自检
# ---------------------------------------------------------------------------
Step '1/4 环境自检'

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Fail '没找到 Node.js（需要 20 或更高版本）。去 https://nodejs.org/zh-cn 下载 LTS 安装包，装完重开 PowerShell 再运行本脚本。'
}
$nodeVersion = (& $nodeCmd.Source -v).Trim()
$nodeMajor = 0
if ($nodeVersion -match '^v(\d+)\.') { $nodeMajor = [int]$Matches[1] }
if ($nodeMajor -lt 20) {
  Fail "Node.js 版本太旧（$nodeVersion，需要 >= 20）。去 https://nodejs.org/zh-cn 升级到 LTS 版本再运行本脚本。"
}
Ok "Node.js $nodeVersion"

$codexPkg = $null
$codexProbeFailed = $false
try {
  $codexPkg = Get-AppxPackage OpenAI.Codex -ErrorAction Stop | Sort-Object Version -Descending | Select-Object -First 1
} catch {
  $codexProbeFailed = $true
}
if ($codexPkg) {
  Ok "Microsoft Store 版 Codex $($codexPkg.Version)"
} elseif ($codexProbeFailed) {
  Note '查询不到 Store 应用列表，跳过 Codex 检测（如果后面报错，请确认已从 Microsoft Store 安装 Codex）'
} else {
  Fail '没找到 Microsoft Store 版 Codex。打开 Microsoft Store 搜索 "Codex"（OpenAI 出品）安装并登录一次，再运行本脚本。商店入口：https://apps.microsoft.com/search?query=OpenAI+Codex'
}

$codexConfig = Join-Path $HOME '.codex\config.toml'
if (-not (Test-Path -LiteralPath $codexConfig)) {
  Fail 'Codex 还没初始化（没找到 ~\.codex\config.toml）。先正常打开一次 Codex 并登录，再运行本脚本。'
}
Ok 'Codex 配置文件就绪'

# ---------------------------------------------------------------------------
# 2/4 安装（写入配套官方浅色主题、快捷方式、自恢复守护）
# ---------------------------------------------------------------------------
Step '2/4 安装换肤引擎'
& (Join-Path $Root 'scripts\install-dream-skin.ps1') -Port $Port | Out-Null
Ok '安装完成（重复运行也不会出错）'

# ---------------------------------------------------------------------------
# 3/4 启动带皮肤的 Codex（Codex 正开着的话会自动重启它一次）
# ---------------------------------------------------------------------------
Step '3/4 启动 Codex 并注入皮肤'
& (Join-Path $Root 'scripts\start-dream-skin.ps1') -Port $Port -RestartExisting | Out-Null
Ok '皮肤已注入'

# ---------------------------------------------------------------------------
# 4/4 点亮默认主题
# ---------------------------------------------------------------------------
Step '4/4 应用默认主题'
$setTheme = Join-Path $Root 'scripts\set-theme.mjs'
$defaultTheme = $null
try {
  $list = (& $nodeCmd.Source $setTheme --list) | ConvertFrom-Json
  if ($list.ok) { $defaultTheme = $list.defaultTheme }
} catch {}
if (-not $defaultTheme) { $defaultTheme = 'aurora-veil' }
& $nodeCmd.Source $setTheme $defaultTheme fullscreen | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "皮肤在跑，但应用主题失败。手动试试：node scripts\set-theme.mjs $defaultTheme fullscreen" }
Ok "当前主题：$defaultTheme（全屏版式）"

Write-Host ''
Write-Host "成功！Codex 已经换上 '$defaultTheme' 主题。" -ForegroundColor Green
Write-Host ''
Write-Host '  下一步，把你自己的图变成主题（自动取色、立即生效）：'
Write-Host '    .\quick-theme.ps1 -Image C:\path\你的图.png' -ForegroundColor Cyan
Write-Host ''
Write-Host '  看所有主题：node scripts\set-theme.mjs --list'
Write-Host '  还原官方外观：.\scripts\restore-dream-skin.ps1'
