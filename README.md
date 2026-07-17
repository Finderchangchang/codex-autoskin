<div align="center">

# Codex AutoSkin

**发一张图，你的 Codex 换上专属皮肤**

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4)
![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-339933)
![Release](https://img.shields.io/github/v/release/Finderchangchang/codex-autoskin)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

两条命令 · 两分钟上手 · 不改任何官方文件 · 一键还原

[快速开始](#-快速开始) · [做自己的主题](#-做自己的主题) · [工作原理](#-工作原理与安全) · [English](#english)

</div>

---

## 预览

| Aurora Veil（内置） | Ember Bloom（内置） |
|---|---|
| ![aurora fullscreen](docs/screenshot-aurora-veil-fullscreen.png) | ![ember fullscreen](docs/screenshot-ember-bloom-fullscreen.png) |
| ![aurora banner](docs/screenshot-aurora-veil-banner.png) | ![ember banner](docs/screenshot-ember-bloom-banner.png) |

> 内置主题素材均为程序化生成的原创图片，仓库不含任何真人照片；截图侧栏已模糊、项目名为演示示例。

## ✨ 特性

- 🖼 **一张图生成主题** — `quick-theme.ps1 -Image 你的图.png`：自动取色、自动判断明暗路线、生成主题、立即生效
- ⚡ **两条命令上手** — `quickstart.ps1` 自检环境并完成安装，缺什么用人话告诉你去哪下
- 📁 **主题即文件夹** — 一个 `theme.json` + 一张图就是一个主题，增删主题零改码
- 🤖 **AI 精修（可选）** — 把仓库丢给你的 Codex / Claude，照 [THEME-SPEC.md](THEME-SPEC.md) 深度定制裁剪、文案、贴纸
- 🔒 **安全可逆** — CDP 仅本机回环注入，不碰 `WindowsApps`、不碰 `app.asar`，登录态会话原样保留，一条命令还原
- 🛡 **稳定守护** — 双栈端口探测、崩溃防抖熔断、装饰层命中测试，重启 Codex 后皮肤自动恢复

## 🚀 快速开始

| 环境要求 | 说明 |
|---|---|
| 系统 | Windows 10 / 11 |
| Codex | Microsoft Store 版桌面端（打开并登录过一次） |
| Node.js | ≥ 20（[下载](https://nodejs.org/zh-cn)） |

```powershell
git clone https://github.com/Finderchangchang/codex-autoskin.git   # 或 Download ZIP 解压
cd codex-autoskin

.\quickstart.ps1                          # ① 安装并启动，Codex 带内置主题亮起
.\quick-theme.ps1 -Image C:\path\你的图.png  # ② 你的图变成主题，立即生效
```

不满意配色？换张图重跑即可；`-Name 名字` 可给主题命名。

> - 提示"禁止运行脚本"：先执行 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`；ZIP 下载的再执行 `Get-ChildItem -Recurse | Unblock-File`
> - **更懒的方式**：把整个仓库丢给你的 Codex / Claude，说 **"安装这个皮肤"**

**图片要求**：PNG / JPG，横向图宽度 ≥ 1600，主体尽量靠右（左侧压标题文字），画面无文字 / 水印 / 界面元素，素材版权责任自负。

## 🎨 日常使用

```powershell
node scripts\set-theme.mjs --list                  # 列出全部主题
node scripts\set-theme.mjs aurora-veil fullscreen  # 切主题 + 版式（banner / fullscreen）
scripts\restore-dream-skin.ps1                     # 一键还原官方外观
```

选择自动持久化；也可以直接跟你的 Codex 说"切到极光主题"。Codex 应用更新后重跑一次 `.\quickstart.ps1` 即可。

## 🛠 做自己的主题

**快速**：`quick-theme.ps1` 一条命令（见上），覆盖背景替换 + 基础配色，全屏 / 横幅两种版式。

**进阶**：把仓库和图丢给你的 Codex / Claude，说 **"照着 THEME-SPEC.md 精修 <主题名> 主题"**。[THEME-SPEC.md](THEME-SPEC.md) 是写给 AI agent 读的完整规范——28 个取色 token、四种画面角色的裁剪调参、明暗路线决策树、验收清单，agent 读完即可独立产出并自测交付。内置的 [aurora-veil](themes/aurora-veil/theme.json)（暗图路线）与 [ember-bloom](themes/ember-bloom/theme.json)（亮图路线）即是两份对照样例。

## 🔍 工作原理与安全

以 `--remote-debugging-port=9335`（仅本机回环）启动 Store 版官方 `ChatGPT.exe`，通过 Chrome DevTools Protocol 向主渲染器注入一段 CSS + JS：

- 不替换、不修改任何官方文件与可执行程序，登录态 / 会话 / 插件保持原样
- `restore-dream-skin.ps1` 现场移除全部注入内容；加 `-Uninstall -RestoreBaseTheme` 连快捷方式与安装前配色备份一并还原
- 全部运行时状态位于 `%LOCALAPPDATA%\CodexDreamSkin`，删除即无痕
- 隐藏 watcher 在 Codex 正常重启后自动补皮肤（防抖 + 频率熔断，不与应用打架）
- 桌面宠物等辅助渲染窗口永不注入，保持透明

> 脚本名与内部标识沿用 `dream` 前缀——那是默认风格包的名字，也是对初版的致敬。

## 🗑 卸载

```powershell
scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme
```

之后正常启动 Codex 即为纯官方状态。

## 🤝 参与贡献

欢迎三类贡献：**新主题**（PR 一个 `themes/` 文件夹 + 截图）、**macOS 移植**（引擎为跨平台 Node.js，缺启动与守护适配）、**引擎修复**。规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 💬 关于

用 CDP 注入给 Codex 换肤的初版（当时叫 **Dream Skin**）出自我之手，很高兴看到这个玩法在社区里开枝散叶。AutoSkin 是对这个想法的全面重写：v1 回答"能不能换肤"，这一版回答"怎么让任何人发一张图就得到自己的皮肤"。

## ⚠️ 免责声明

- 装饰性社区项目，**与 OpenAI 无关**；Codex 及相关商标归其权利人所有
- Codex 桌面端更新可能改变内部结构，届时需重新适配（按语义选择器定位，小更新通常无感）
- 用户自制主题素材的版权与肖像权责任自负；不得使用他人肖像制作并公开传播主题，私人主题请放入已 gitignore 的 `themes-private/`

## 📄 License

[MIT](LICENSE) © Vikicc

---

## English

**Send one image — your Codex gets its own skin.**

A skin engine for the Windows Codex desktop app. Injects CSS/JS into the official renderer over Chrome DevTools Protocol (loopback only): no app files modified, fully reversible, login/session untouched.

**Quick start** (Windows 10/11, Store-installed Codex signed in once, [Node.js ≥ 20](https://nodejs.org/)):

```powershell
git clone https://github.com/Finderchangchang/codex-autoskin.git
cd codex-autoskin
.\quickstart.ps1                            # install & launch with a bundled theme
.\quick-theme.ps1 -Image C:\path\your.png   # your image becomes a live theme
```

**Features**: one-image theme generation (auto palette, light/dark route detection) · themes are plain folders (`theme.json` + one image) · optional AI refinement — hand this repo to your Codex/Claude agent with "refine theme &lt;name&gt; following THEME-SPEC.md" · switch via `node scripts/set-theme.mjs <theme> [banner|fullscreen]` · uninstall via `scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme`.

Image tips: PNG/JPG, landscape ≥ 1600 px, subject on the right, clean art without text/watermark/UI. You are responsible for the rights to images you use; never publish themes using a real person's likeness (keep private themes in git-ignored `themes-private/`).

Currently **Windows only** — macOS is on the roadmap, PRs welcome ([CONTRIBUTING.md](CONTRIBUTING.md)). Bundled demo art is 100% procedurally generated; no photos of real people in this repo.

Originally created as **Dream Skin** (v1) by the same author — AutoSkin is the full rewrite. Decorative community project, not affiliated with OpenAI.

[MIT](LICENSE) © Vikicc
