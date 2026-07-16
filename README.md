# Codex AutoSkin

**发一张图给你的 Codex，它自己给自己换肤。**

这是 Windows Codex 桌面端的换肤引擎 2.0 版：不改任何官方文件，通过 Chromium DevTools Protocol（CDP）把皮肤"注入"到官方渲染器里，随时一键还原。**上手只要两条命令、两分钟、不需要 AI**：`quickstart.ps1` 装好引擎，`quick-theme.ps1 -Image 你的图.png` 自动取色、把任意一张图变成你的专属主题。主题是纯数据（一个文件夹：`theme.json` + 一张图），而配套的 [THEME-SPEC.md](THEME-SPEC.md) 是一份**写给 AI agent 读的定制规范**——想精修时，把这个仓库和一张图丢给你的 Codex / Claude，它就能照着规范自己产出一套完整主题、自己截图调参、自己交付。你的 Codex，自己给自己换肤。

| Aurora Veil（内置 demo） | Ember Bloom（内置 demo） |
|---|---|
| ![aurora fullscreen](docs/screenshot-aurora-veil-fullscreen.png) | ![ember fullscreen](docs/screenshot-ember-bloom-fullscreen.png) |
| ![aurora banner](docs/screenshot-aurora-veil-banner.png) | ![ember banner](docs/screenshot-ember-bloom-banner.png) |

> 两个内置主题的视觉图都是 `tools/generate-demo-art.py` 程序化生成的原创图片（固定种子，可复现），仓库不含任何真人照片。截图中的侧栏做了模糊处理、项目名为演示用示例。

## 关于这个项目

用 CDP 注入给 Codex 换肤这个思路的初版（当时叫 **Dream Skin**）出自我之手。后来很高兴看到这个玩法在社区里传开，出现了各种分支和衍生版本，加了新平台、新主题——这正是开源该有的样子。

**AutoSkin 是我对这个想法的全面重写**：v1 回答的是"能不能给 Codex 换肤"，AutoSkin 回答的是"怎么让**任何人发一张图**就得到一套自己的皮肤"——重点从"肤"挪到了"Auto"。

## 2.0 新在哪

1. **两条命令冷启动**——`quickstart.ps1` 自检环境并一键装好，`quick-theme.ps1` 把你的任意一张图自动取色、生成主题、立即点亮，全程不需要 AI、不需要懂任何概念。
2. **Manifest 驱动引擎**——主题与引擎彻底解耦。加一个主题 = 往 `themes/` 放一个文件夹，零改码；注入器启动时自动扫描、校验、打包。删掉文件夹主题就消失，引擎代码里没有任何主题名。
3. **THEME-SPEC.md：规范即生成器**（全项目最大卖点）——这不是给人读的开发文档，而是给 agent 读的作业指导书：28 个取色 token 的逐个取法、四种画面角色的裁剪调参流程、"干净图 vs 带字截图"决策树、逐项验收清单。用户只要把一张图和这个仓库丢给自己的 Codex / Claude，agent 读完 spec 就能独立产出主题并自测交付。**不用等作者更新主题包，你的 agent 就是主题生成器。**
4. **一句话切换**——`node scripts/set-theme.mjs <theme> [layout]` 程序化切主题/版式，选择自动持久化。界面上刻意不放切换控件：跟你的 agent 说"换成极光"就行。
5. **风格包 v1.2 视觉**——花饰边框卡片、渐变圆徽章 + 可配置定制图标、建议卡副标题、可配置装饰贴纸（气泡/推广牌/角饰，默认关闭）、输入框占位文案，全部是主题里的可选声明字段，向后兼容。
6. **久经实战的健壮性**——这些坑都替你踩完了：CDP 回环双栈探测（Chromium 重启后可能只绑 `[::1]`）、watcher 防抖 + 频率熔断（绝不把 Codex 打进重启死循环）、换图 blob 指纹修复（换图重注入不再吃旧缓存）、`elementsFromPoint` 命中测试 QA（装饰层永远不吃掉真实控件的点击）。细节见 `references/runtime-notes.md`。

**目前的边界（诚实版）**：仅支持 Windows 上的 Store 版 Codex 桌面端。macOS 在路线图上——引擎的注入/manifest 层是跨平台的 Node.js，主要缺一个 mac 的启动与守护适配，**欢迎 PR**（见 [CONTRIBUTING.md](CONTRIBUTING.md)）。

## 快速开始（两条命令）

宗旨只有一个：**解决冷启动**——从拿到仓库到"自己的图亮在 Codex 上"，两条命令、两分钟，不需要 AI，不需要懂任何概念。

前提：Windows 10/11、Microsoft Store 版 Codex（打开并登录过一次）、[Node.js ≥ 20](https://nodejs.org/zh-cn)。

1. **下载仓库**——`git clone` 本仓库，或 Code → Download ZIP 解压，然后在仓库目录打开 PowerShell；
2. **一键安装**——`.\quickstart.ps1`：自检环境（缺什么会用人话告诉你去哪下）→ 安装 → 启动，Codex 会带着内置主题亮起来；
3. **换成你自己的图**——`.\quick-theme.ps1 -Image C:\path\你的图.png`：自动取色、生成主题、立即生效。不满意就换张图重跑；`-Name` 可以给主题起名。

> 提示"禁止运行脚本"？先执行 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`；ZIP 下载的再执行 `Get-ChildItem -Recurse | Unblock-File`。
>
> **更懒的方式**（如果你有 Codex / Claude 这类 agent）：把整个仓库丢给它，说 **"安装这个皮肤"**，剩下的它自己搞定。
>
> 脚本名和内部标识沿用 `dream` 前缀——那是默认皮肤的名字，也算对 v1 的致敬。

### 对图片的要求

- PNG 或 JPG，横向图，宽度建议 ≥ 1600；
- 主体（人物 / 景物）尽量靠右——左侧会压标题文字；
- 干净的图效果最好：没有文字、水印、界面元素；
- 素材版权、肖像权责任自负（见免责声明）。

## 换主题 / 还原

```powershell
node scripts\set-theme.mjs --list                 # 看有哪些主题
node scripts\set-theme.mjs aurora-veil fullscreen # 切主题 + 版式（banner / fullscreen），自动持久化
scripts\restore-dream-skin.ps1                    # 一键还原官方外观
```

或者更简单——跟你的 Codex 说："**切到花瓣主题**"。

## 进阶：让 AI 精修主题

`quick-theme.ps1` 走的是最稳的通用参数：背景替换 + 基础配色。想更进一步——精调裁剪构图、卡片文案、装饰贴纸、特例样式——把这个仓库和你的图丢给你的 Codex / Claude，说：

> **"照着 THEME-SPEC.md 精修 <主题名> 主题"**（或从零开始："照着 THEME-SPEC.md 做一个主题"）

[THEME-SPEC.md](THEME-SPEC.md) 是写给 agent 读的作业指导书：28 个取色 token 的逐个取法、四种画面角色的裁剪调参流程、"干净图 vs 带字截图"决策树、逐项验收清单。agent 读完就能独立产出 `themes/<名字>/theme.json + art.png`（必要时带作用域受限的 `extra.css`），自己截图迭代 crop 参数，再 `node scripts/set-theme.mjs <名字>` 给你看效果。

内置的 [aurora-veil](themes/aurora-veil/theme.json)（暗图路线）和 [ember-bloom](themes/ember-bloom/theme.json)（亮图路线）就是两份对照样例，覆盖了明暗两种取色模板。

## 工作原理与安全

- **CDP 注入**：以 `--remote-debugging-port=9335` 启动 Store 版官方 `ChatGPT.exe`，通过 DevTools 协议往主渲染器注入一段 CSS + JS。端口只绑定**本机回环**，不要暴露到局域网。
- **不改任何官方文件**：不碰 `WindowsApps`、不碰 `app.asar`、不替换任何可执行文件，登录态/会话/插件全部保持原样。
- **随时还原**：`scripts\restore-dream-skin.ps1` 现场移除所有注入内容，DOM 恢复得干干净净；加 `-Uninstall -RestoreBaseTheme` 连快捷方式和安装前的配色备份一起还原。所有运行时状态都在 `%LOCALAPPDATA%\CodexDreamSkin`，删掉即无痕。
- **Codex 更新后**：重跑一遍 `.\quickstart.ps1` 即可，脚本每次动态发现当前 Appx 包，不存版本化路径。
- **自恢复**：一个隐藏 watcher 在正常重启 Codex 后自动补皮肤（防抖、频率熔断、失败冷却，不会跟应用打架）。
- **辅助窗口保护**：桌面宠物等 `initialRoute` 辅助渲染器永远不注入、保持透明。

## 卸载

```powershell
scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme
```

之后正常启动 Codex 即为纯官方状态。

## 免责声明

- 本项目是装饰性的社区项目，**与 OpenAI 无关，非官方项目**；Codex 及相关商标归其权利人所有。
- Codex 桌面端更新可能改变内部 DOM 结构，届时需要重新适配（引擎按语义选择器定位，小更新通常无感）。
- 内置 demo 主题的视觉素材为程序化生成的原创图片（`tools/generate-demo-art.py`，可复现）。
- **用户自制主题的素材版权与肖像权责任自负**。不得使用他人（尤其是真人明星）的肖像制作并公开传播主题；`themes-private/` 目录（已 gitignore）就是为把私人主题留在本地而设的。

## License

[MIT](LICENSE) © Vikicc　·　当前版本 **v2.0.0**

---

## English (short version)

**Send one image to your Codex, and it reskins itself.**

Codex AutoSkin — a manifest-driven skin engine for the Windows Codex desktop app, a full rewrite by the author of the original CDP-injection skin known as Dream Skin (glad to see the idea spread through community forks and derivatives — that's open source working as intended).

It injects CSS/JS into the official renderer over the Chrome DevTools Protocol — no app files are modified, fully reversible, login/session untouched, CDP bound to loopback only.

What's new in 2.0:

- **Two-command cold start** — `quickstart.ps1` checks your environment and installs everything; `quick-theme.ps1 -Image your-image.png` extracts colors from any picture, generates a theme, and applies it immediately. No AI required, no concepts to learn.
- **Manifest-driven engine** — adding a theme = dropping a folder into `themes/` (`theme.json` + one image). Zero engine changes.
- **[THEME-SPEC.md](THEME-SPEC.md) is the generator** — an agent-readable spec (28 color tokens, crop workflow, decision tree, QA checklist). Hand this repo plus one picture to your Codex/Claude agent and it authors, tunes, and ships a complete theme on its own.
- **One-liner switching** — `node scripts/set-theme.mjs <theme> [banner|fullscreen]` (or just tell your agent). No on-screen switcher by design.
- **Style-pack visuals** — ornamented cards, custom badge icons, card subtitles, opt-in stickers, composer placeholder — all optional per-theme declarations.
- **Battle-tested robustness** — dual-stack loopback CDP probing, watcher debounce + circuit breaker (never kill-loops Codex), art-blob fingerprinting for image swaps, hit-testing QA so decorations never steal clicks.

Currently **Windows (Store Codex) only** — macOS is on the roadmap and PRs are very welcome ([CONTRIBUTING.md](CONTRIBUTING.md)).

**Quick start (two commands, ~2 minutes, no AI needed)** — prerequisites: Store-installed Codex (opened and signed in once) and [Node.js ≥ 20](https://nodejs.org/):

1. Clone or download this repo, open PowerShell in the repo folder;
2. `.\quickstart.ps1` — environment check, install, launch with a bundled theme;
3. `.\quick-theme.ps1 -Image C:\path\your-image.png` — auto-extracts colors, generates your theme, applies it live (optional `-Name mytheme`).

Image tips: PNG/JPG, landscape, ≥ 1600 px wide, subject on the right (the left side carries the title), clean art without text/watermark/UI; you are responsible for the rights to the images you use.

Prefer the lazy way? Hand the repo to your Codex/Claude agent and say "install this skin". For fine-tuning (crop, copy, stickers, per-theme CSS), say "refine theme <name> following THEME-SPEC.md" — that spec turns your agent into the theme generator. Uninstall: `scripts\restore-dream-skin.ps1 -Uninstall -RestoreBaseTheme`.

Bundled demo art is 100% procedurally generated (`tools/generate-demo-art.py`); no photos of real people in this repo. Do not publish themes using a real person's likeness — keep private themes in the git-ignored `themes-private/`. Decorative community project, not affiliated with OpenAI; Codex and related marks belong to their respective owners.

[MIT](LICENSE) © Vikicc · **v2.0.0**
