# quick-theme.ps1 — 一张图变成 Codex 主题：自动取色 + 背景替换，立即应用。
#
#   .\quick-theme.ps1 -Image C:\path\我的图.png [-Name mytheme]
#
# 零 AI、零新依赖：只用 PowerShell 自带的 System.Drawing 取色，再走仓库现有的
# Node 脚本应用。生成的是"第一阶段"主题——背景替换 + 基础配色，横幅(banner)与
# 全屏(fullscreen)两种版式都可用。想精修裁剪/文案/装饰，把仓库和图丢给你的
# Codex / Claude，说：照 THEME-SPEC.md 精修 <主题名> 主题。
#
# 兼容 Windows PowerShell 5.1 与 PowerShell 7+（文件本身为 UTF-8 with BOM）。

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Image,
  [string]$Name
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Port = 9335
Add-Type -AssemblyName System.Drawing

function Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Ok([string]$Message) { Write-Host "    $Message" -ForegroundColor Green }
function Note([string]$Message) { Write-Host "    $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "[X] $Message" -ForegroundColor Red; exit 1 }

function Clamp([double]$Value, [double]$Lo, [double]$Hi) {
  return [Math]::Min($Hi, [Math]::Max($Lo, $Value))
}

function Get-Hsl([double]$R, [double]$G, [double]$B) {
  $r = $R / 255.0; $g = $G / 255.0; $b = $B / 255.0
  $max = [Math]::Max($r, [Math]::Max($g, $b))
  $min = [Math]::Min($r, [Math]::Min($g, $b))
  $l = ($max + $min) / 2.0
  if (($max - $min) -lt 1e-9) { return @{ H = 0.0; S = 0.0; L = $l } }
  $d = $max - $min
  if ($l -gt 0.5) { $s = $d / (2.0 - $max - $min) } else { $s = $d / ($max + $min) }
  if ($max -eq $r) { $h = (($g - $b) / $d) }
  elseif ($max -eq $g) { $h = (($b - $r) / $d) + 2.0 }
  else { $h = (($r - $g) / $d) + 4.0 }
  $h = $h * 60.0
  if ($h -lt 0) { $h += 360.0 }
  return @{ H = $h; S = $s; L = $l }
}

function Get-RgbFromHsl([double]$H, [double]$S, [double]$L) {
  $c = (1.0 - [Math]::Abs(2.0 * $L - 1.0)) * $S
  $hh = ((($H % 360.0) + 360.0) % 360.0) / 60.0
  $x = $c * (1.0 - [Math]::Abs(($hh % 2.0) - 1.0))
  $r1 = 0.0; $g1 = 0.0; $b1 = 0.0
  $sector = [int][Math]::Floor($hh)
  switch ($sector) {
    0 { $r1 = $c; $g1 = $x }
    1 { $r1 = $x; $g1 = $c }
    2 { $g1 = $c; $b1 = $x }
    3 { $g1 = $x; $b1 = $c }
    4 { $r1 = $x; $b1 = $c }
    default { $r1 = $c; $b1 = $x }
  }
  $m = $L - $c / 2.0
  return @(
    [int][Math]::Round(255.0 * ($r1 + $m)),
    [int][Math]::Round(255.0 * ($g1 + $m)),
    [int][Math]::Round(255.0 * ($b1 + $m))
  )
}

function HexOfRgb($Rgb) { return ('#{0:x2}{1:x2}{2:x2}' -f [int]$Rgb[0], [int]$Rgb[1], [int]$Rgb[2]) }
function HexOfHsl([double]$H, [double]$S, [double]$L) { return (HexOfRgb (Get-RgbFromHsl $H $S $L)) }
function RgbaOf($Rgb, [string]$Alpha) { return ('rgba({0}, {1}, {2}, {3})' -f [int]$Rgb[0], [int]$Rgb[1], [int]$Rgb[2], $Alpha) }

# 白底染色：$T 是主题色占比（0.03 = 白里染 3%）
function MixWhite($Rgb, [double]$T) {
  return @(
    [int][Math]::Round(255.0 + ($Rgb[0] - 255.0) * $T),
    [int][Math]::Round(255.0 + ($Rgb[1] - 255.0) * $T),
    [int][Math]::Round(255.0 + ($Rgb[2] - 255.0) * $T)
  )
}

function HueDist([double]$A, [double]$B) {
  $d = [Math]::Abs($A - $B) % 360.0
  if ($d -gt 180.0) { $d = 360.0 - $d }
  return $d
}

# ---------------------------------------------------------------------------
# 1. 校验图片与主题名
# ---------------------------------------------------------------------------
Step '检查图片'
$resolved = Resolve-Path -LiteralPath $Image -ErrorAction SilentlyContinue
if (-not $resolved) { Fail "找不到图片：$Image" }
$imgFull = $resolved.ProviderPath
$ext = [IO.Path]::GetExtension($imgFull).ToLowerInvariant()
if ($ext -notin @('.png', '.jpg', '.jpeg')) {
  Fail "只支持 PNG / JPG 图片（拿到的是 '$ext'）。webp 等格式请先转成 PNG。"
}

if (-not $Name) {
  $base = [IO.Path]::GetFileNameWithoutExtension($imgFull)
  $Name = ($base.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
}
$namePattern = '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
if (-not ($Name -match $namePattern)) {
  Fail "主题名 '$Name' 不可用（需要小写字母开头的 kebab-case，如 sunset-hills）。文件名转不出合法名字时请手动指定，例如：-Name my-theme"
}

$themeDir = Join-Path $Root "themes\$Name"
$privateDir = Join-Path $Root "themes-private\$Name"
if (Test-Path -LiteralPath $privateDir) {
  Fail "themes-private\$Name 已存在同名主题，请换个名字：-Name 另一个名字"
}
if (Test-Path -LiteralPath $themeDir) {
  $existingJson = Join-Path $themeDir 'theme.json'
  $overwritable = $false
  if (-not (Test-Path -LiteralPath $existingJson)) {
    $overwritable = $true   # 上次生成失败留下的半成品
  } else {
    try {
      $existing = [IO.File]::ReadAllText($existingJson, [Text.Encoding]::UTF8) | ConvertFrom-Json
      if ($existing.notes -and $existing.notes.generator -eq 'quick-theme') { $overwritable = $true }
    } catch { $overwritable = $true }
  }
  if (-not $overwritable) {
    Fail "主题 '$Name' 已存在（不是 quick-theme 生成的，不敢覆盖）。请换个名字：-Name 另一个名字"
  }
  Note "覆盖上一次 quick-theme 生成的 '$Name'"
}

# ---------------------------------------------------------------------------
# 2. 解码 + 降采样取色
# ---------------------------------------------------------------------------
Step '分析图片配色'
try {
  $bmp = [System.Drawing.Bitmap]::FromFile($imgFull)
} catch {
  Fail "图片无法解码（文件损坏或不是真实的图片）：$($_.Exception.Message)"
}
try {
  $srcWidth = $bmp.Width
  $srcHeight = $bmp.Height
  if ($srcWidth -lt 1200) {
    Note "图片宽度只有 $srcWidth px（建议 >= 1600），全屏背景可能会糊，继续生成"
  }
  $sample = New-Object System.Drawing.Bitmap 64, 64
  $gfx = [System.Drawing.Graphics]::FromImage($sample)
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gfx.DrawImage($bmp, 0, 0, 64, 64)
  $gfx.Dispose()
} finally {
  $bmp.Dispose()
}

$buckets = @{}
$lumSum = 0.0
$pixelCount = 0
for ($y = 0; $y -lt 64; $y++) {
  for ($x = 0; $x -lt 64; $x++) {
    $px = $sample.GetPixel($x, $y)
    if ($px.A -lt 96) { continue }
    $lumSum += 0.2126 * $px.R + 0.7152 * $px.G + 0.0722 * $px.B
    $pixelCount++
    $key = (([int]$px.R -shr 5) -shl 6) -bor (([int]$px.G -shr 5) -shl 3) -bor ([int]$px.B -shr 5)
    $bucket = $buckets[$key]
    if ($null -eq $bucket) {
      $bucket = @{ N = 0; R = 0.0; G = 0.0; B = 0.0 }
      $buckets[$key] = $bucket
    }
    $bucket.N++
    $bucket.R += $px.R; $bucket.G += $px.G; $bucket.B += $px.B
  }
}
$sample.Dispose()
if ($pixelCount -eq 0) { Fail '图片几乎全透明，取不了色，请换一张图。' }
$avgLum = $lumSum / $pixelCount / 255.0

$clusters = @(foreach ($bucket in $buckets.Values) {
  $r = $bucket.R / $bucket.N; $g = $bucket.G / $bucket.N; $b = $bucket.B / $bucket.N
  $hsl = Get-Hsl $r $g $b
  [pscustomobject]@{ N = $bucket.N; R = $r; G = $g; B = $b; H = $hsl.H; S = $hsl.S; L = $hsl.L }
})

# 主色：优先"有分量、有饱和度、亮度居中"的簇，按 出现量 ×（0.5 + 饱和度）打分
$minN = [Math]::Max(8, $pixelCount * 0.01)
$mainCand = @($clusters | Where-Object { $_.N -ge $minN -and $_.S -ge 0.18 -and $_.L -ge 0.15 -and $_.L -le 0.85 })
if ($mainCand.Count -eq 0) { $mainCand = @($clusters | Where-Object { $_.N -ge $minN -and $_.S -ge 0.08 }) }
if ($mainCand.Count -eq 0) { $mainCand = $clusters }
$main = $mainCand | Sort-Object { $_.N * (0.5 + $_.S) } -Descending | Select-Object -First 1

# 辅助亮色：与主色色相拉开 >= 40 度的次强饱和簇；没有就用主色相邻色
$accCand = @($clusters | Where-Object {
  $_.N -ge [Math]::Max(5, $pixelCount * 0.008) -and $_.S -ge 0.22 -and
  $_.L -ge 0.22 -and $_.L -le 0.9 -and (HueDist $_.H $main.H) -ge 40
})
if ($accCand.Count -gt 0) {
  $acc = $accCand | Sort-Object { $_.N * (0.5 + $_.S) } -Descending | Select-Object -First 1
  $accH = $acc.H
  $accS = Clamp $acc.S 0.3 0.8
} else {
  $accH = ($main.H + 36.0) % 360.0
  $accS = Clamp $main.S 0.3 0.7
}

# 墨色的色相：取图里最暗的有分量簇（保留色相地加深）
$darkest = @($clusters | Where-Object { $_.N -ge $minN }) | Sort-Object L | Select-Object -First 1
if ($null -eq $darkest) { $darkest = $main }
if ($darkest.S -ge 0.08) { $inkH = $darkest.H } else { $inkH = $main.H }

# 派生饱和度：近灰图保持灰，彩图收进安全区间
if ($main.S -lt 0.12) { $dSat = $main.S } else { $dSat = Clamp $main.S 0.25 0.75 }

$isLight = ($avgLum -ge 0.52)
if ($isLight) { $routeLabel = '亮图路线（浅 overlay + 深色标题）' } else { $routeLabel = '暗图路线（深 overlay + 白标题）' }
Ok ("平均亮度 {0:P0}，走{1}" -f $avgLum, $routeLabel)
Ok ("主色 H={0:N0} S={1:P0}，辅色 H={2:N0}" -f $main.H, $main.S, $accH)

# ---------------------------------------------------------------------------
# 3. 生成 28 个 token（crop 用两种版式都稳的通用默认：cover + 主体偏右）
# ---------------------------------------------------------------------------
$tintBase = Get-RgbFromHsl $main.H $dSat 0.55
$tokens = [ordered]@{}
$tokens['--dream-ink'] = HexOfHsl $inkH ([Math]::Min($dSat, 0.5)) 0.2
$tokens['--dream-purple'] = HexOfHsl $main.H $dSat 0.4
$tokens['--dream-violet'] = HexOfHsl $main.H ($dSat * 0.9) 0.55
$tokens['--dream-pink'] = HexOfHsl $accH $accS 0.66
$tokens['--dream-page-bg-0'] = HexOfRgb (MixWhite $tintBase 0.035)
$tokens['--dream-page-bg-1'] = HexOfRgb (MixWhite $tintBase 0.09)
$tokens['--dream-page-glow-a'] = RgbaOf (Get-RgbFromHsl $main.H $dSat 0.62) '.30'
$tokens['--dream-page-glow-b'] = RgbaOf (Get-RgbFromHsl $accH $accS 0.68) '.26'
# 通用安全裁剪：cover 永不露底；位置"主体偏右"（左侧压标题）
$tokens['--dream-hero-art-size'] = 'cover'
$tokens['--dream-hero-art-position'] = '65% 30%'
$tokens['--dream-fullscreen-art-size'] = 'cover'
$tokens['--dream-fullscreen-art-position'] = '65% 30%'
$tokens['--dream-polaroid-art-size'] = 'cover'
$tokens['--dream-polaroid-art-position'] = '65% 35%'

if ($isLight) {
  # 亮图路线（参照 ember-bloom 模板）：近白 overlay + 深色标题
  $pale1 = MixWhite $tintBase 0.05
  $pale2 = MixWhite $tintBase 0.1
  $pale3 = MixWhite $tintBase 0.16
  $titleRgb = Get-RgbFromHsl $main.H ([Math]::Min(($dSat + 0.05), 0.7)) 0.26
  $tokens['--dream-hero-overlay'] = ('linear-gradient(90deg, {0} 0%, {1} 54%, {2} 78%, transparent 100%)' -f (RgbaOf $pale1 '.96'), (RgbaOf $pale2 '.88'), (RgbaOf $pale3 '.50'))
  $tokens['--dream-fullscreen-overlay'] = ('linear-gradient(90deg, {0} 0%, {1} 47%, {2} 72%, transparent 100%)' -f (RgbaOf $pale1 '.95'), (RgbaOf $pale2 '.84'), (RgbaOf $pale3 '.44'))
  $tokens['--dream-fullscreen-wash'] = RgbaOf (MixWhite $tintBase 0.03) '.06'
  $tokens['--dream-hero-title-color'] = HexOfRgb $titleRgb
  $tokens['--dream-hero-subtitle-color'] = RgbaOf $titleRgb '.82'
  $tokens['--dream-hero-title-shadow'] = '0 1px 0 rgba(255, 255, 255, .92)'
  $tokens['--dream-hero-chip-color'] = HexOfHsl $main.H $dSat 0.38
  $tokens['--dream-hero-chip-bg'] = 'rgba(255, 255, 255, .58)'
  $tokens['--dream-hero-chip-line'] = RgbaOf (Get-RgbFromHsl $main.H $dSat 0.45) '.36'
  $chatOpacity = '.12'
  $tokens['--dream-chat-wash'] = RgbaOf (MixWhite $tintBase 0.02) '.72'
} else {
  # 暗图路线（参照 aurora-veil 模板）：深 overlay + 白标题
  $deep1 = Get-RgbFromHsl $main.H ([Math]::Min(($dSat + 0.1), 0.8)) 0.13
  $deep2 = Get-RgbFromHsl $main.H ([Math]::Min(($dSat + 0.1), 0.8)) 0.18
  $deep3 = Get-RgbFromHsl $main.H $dSat 0.24
  $tokens['--dream-hero-overlay'] = ('linear-gradient(90deg, {0} 0%, {1} 54%, {2} 78%, transparent 100%)' -f (RgbaOf $deep1 '.92'), (RgbaOf $deep2 '.82'), (RgbaOf $deep3 '.46'))
  $tokens['--dream-fullscreen-overlay'] = ('linear-gradient(90deg, {0} 0%, {1} 47%, {2} 72%, transparent 100%)' -f (RgbaOf $deep1 '.88'), (RgbaOf $deep2 '.72'), (RgbaOf $deep3 '.38'))
  $tokens['--dream-fullscreen-wash'] = RgbaOf (MixWhite $tintBase 0.12) '.08'
  $tokens['--dream-hero-title-color'] = '#fff'
  $tokens['--dream-hero-subtitle-color'] = RgbaOf (MixWhite $tintBase 0.07) '.94'
  $tokens['--dream-hero-title-shadow'] = ('0 2px 12px {0}, 0 1px 0 rgba(255, 255, 255, .18)' -f (RgbaOf (Get-RgbFromHsl $main.H $dSat 0.08) '.50'))
  $tokens['--dream-hero-chip-color'] = HexOfHsl $accH 0.55 0.84
  $tokens['--dream-hero-chip-bg'] = RgbaOf (Get-RgbFromHsl $accH 0.6 0.7) '.18'
  $tokens['--dream-hero-chip-line'] = RgbaOf (Get-RgbFromHsl $accH 0.6 0.75) '.55'
  $chatOpacity = '.10'
  $tokens['--dream-chat-wash'] = RgbaOf (MixWhite $tintBase 0.03) '.78'
}

$titleName = (Get-Culture).TextInfo.ToTitleCase($Name.Replace('-', ' '))
$tokens['--dream-hero-subtitle'] = ('"' + "与 $titleName 一起，把灵感写进每一天" + '"')
$tokens['--dream-chat-art-size'] = 'cover'
$tokens['--dream-chat-art-position'] = '65% 30%'
$tokens['--dream-chat-art-opacity'] = $chatOpacity

# ---------------------------------------------------------------------------
# 4. 落盘：themes/<name>/theme.json + 图片
# ---------------------------------------------------------------------------
Step "生成主题 themes\$Name"
if (Test-Path -LiteralPath $themeDir) {
  Get-ChildItem -LiteralPath $themeDir -Force | Remove-Item -Force -Recurse
} else {
  New-Item -ItemType Directory -Force -Path $themeDir | Out-Null
}
if ($ext -eq '.png') { $artFile = 'art.png' } else { $artFile = 'art.jpg' }
Copy-Item -LiteralPath $imgFull -Destination (Join-Path $themeDir $artFile) -Force

$button = $Name.Split('-')[0]
if ($button.Length -gt 6) { $button = $button.Substring(0, 6) }
if ($isLight) { $routeName = 'light' } else { $routeName = 'dark' }

$theme = [ordered]@{
  name = $Name
  notes = [ordered]@{
    generator = 'quick-theme'
    route = $routeName
    source = [IO.Path]::GetFileName($imgFull)
    zh = 'quick-theme.ps1 自动生成：背景替换 + 基础配色，crop 用通用安全默认值。想精修裁剪/文案/装饰，请照 THEME-SPEC.md。'
  }
  meta = [ordered]@{
    button = $button
    brand = $titleName
    edition = "$titleName · AutoSkin"
    signature = "$titleName ✦"
  }
  art = [ordered]@{
    home = $artFile
    chat = $artFile
  }
  tokens = $tokens
}
$json = $theme | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $themeDir 'theme.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Ok "themes\$Name\theme.json + $artFile 已生成（$routeName 路线）"

# ---------------------------------------------------------------------------
# 5. 应用到正在运行的 Codex
# ---------------------------------------------------------------------------
function Test-SkinPort {
  foreach ($loopback in @('127.0.0.1', '[::1]')) {
    try {
      $targets = Invoke-RestMethod "http://$($loopback):$($Port)/json/list" -TimeoutSec 2
      if ($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) { return $true }
    } catch {}
  }
  return $false
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ((-not $nodeCmd) -or (-not (Test-SkinPort))) {
  Write-Host ''
  Note "主题已生成，但换肤引擎还没在运行，暂时看不到效果。"
  Write-Host '    先执行  .\quickstart.ps1  完成安装，再重跑一次本命令即可。'
  exit 0
}

Step '重载皮肤引擎（不重启 Codex）'
try {
  & (Join-Path $Root 'scripts\start-dream-skin.ps1') -Port $Port | Out-Null
} catch {
  Fail "皮肤引擎重载失败：$($_.Exception.Message)（试试先跑 .\quickstart.ps1）"
}

Step "应用主题 '$Name'"
& $nodeCmd.Source (Join-Path $Root 'scripts\set-theme.mjs') $Name fullscreen | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "主题生成了，但应用失败。手动试试：node scripts\set-theme.mjs $Name fullscreen"
}

Write-Host ''
Write-Host "完成！'$Name' 已经亮在你的 Codex 上。" -ForegroundColor Green
Write-Host "  换横幅版式：node scripts\set-theme.mjs $Name banner"
Write-Host "  不满意配色/裁剪？把这个仓库和你的图丢给你的 Codex / Claude，说："
Write-Host "  “照 THEME-SPEC.md 精修 $Name 主题”" -ForegroundColor Cyan
