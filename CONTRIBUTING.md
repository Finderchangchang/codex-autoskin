# 贡献指南 / Contributing

感谢你愿意给 Codex AutoSkin 出力。我们最欢迎三类贡献：

## 1. 新主题（最容易上手）

主题是纯数据：往 `themes/` 里放一个文件夹就是一个主题，**不需要也不允许改任何引擎代码**。

**做法**：读 [THEME-SPEC.md](THEME-SPEC.md)（它本来就是写给 agent 读的——把仓库和你的图丢给你自己的 Codex / Claude，让它照规范产出，通常比手写快得多）。

**主题 PR 的验收标准 = THEME-SPEC.md §7 的验收清单**，逐项过：

1. `node scripts/injector.mjs --themes` 里出现你的主题，无 skipped/REJECTED 告警；
2. banner / fullscreen 两种版式各截一张图：原生卡片、项目选择器、输入框全部可见可用，四角与接缝**无原图文字鬼影、无原图边框线**，标题区对比度充足；
3. 聊天页背景隐约可见即可，消息文字对比度不受影响；
4. 交互回归：装饰层全部 `pointer-events: none`，`elementsFromPoint` 命中的都是控件真身；
5. 平台对应的 `restore-dream-skin` 脚本执行后 DOM 干净，重新 start 能恢复；
6. 桌面宠物辅助窗口保持透明；
7. 配了 `cards.subtitles` / `stickers` 的主题：按 §7.7 / §7.8 验证收缩降级与版式限定。

**PR 里请附上**：两种版式的截图（截图里不要出现你自己的真实项目名/个人信息，侧栏模糊掉）。

**素材红线（不满足直接拒收）**：

- **杜绝真人肖像**——不得使用任何真实人物（明星或素人）的照片或可识别形象；
- 不得使用你没有权利再分发的素材（盗图、无授权的商业插画等）；
- `theme.json` 的 `notes` 里注明素材来源（程序生成脚本 / 自绘 / 授权说明）；
- `stickers` 保持默认关闭或只放中性文案，不放个人推广信息。

涉及肖像或私人素材的主题请留在本地的 `themes-private/`（已 gitignore），不要提交。

## 2. 平台适配

Windows 与 macOS 的启动、安装、验证、恢复和 watcher 闭环都已经实现。平台代码分工如下：

- Windows：PowerShell 脚本、动态 Appx 发现、Startup 快捷方式 watcher、`%LOCALAPPDATA%\CodexDreamSkin`；
- macOS：POSIX shell 脚本、`ChatGPT.app` / `Codex.app` bundle 发现、LaunchAgent watcher、`~/Library/Application Support/CodexDreamSkin`；
- 跨平台：`scripts/injector.mjs`、`scripts/set-theme.mjs`、`assets/renderer-inject.js` 和主题 manifest。

新增平台或修改 watcher 前建议先开 issue 对齐方案。必须保留 `references/runtime-notes.md` 中的双栈回环、防抖、重启限频和熔断语义。macOS 启动必须经过 LaunchServices；验证截图必须按原生窗口 ID 捕获，不能用会关闭当前 Codex macOS CDP socket 的 `Page.captureScreenshot`。

## 3. 引擎修复与增强

- Codex 更新后的 DOM 适配、选择器修复；
- watcher / 注入守护的健壮性改进（**必须保留防抖 + 熔断语义，绝不允许出现 kill-loop**，见 `references/runtime-notes.md`）;
- 新的可选装饰能力（照 v1.1/v1.2 的模式：theme.json 可选字段 + 缺省关闭 + 向后兼容 + 非法值只丢弃不连坐）。

引擎 PR 请说明测试方式；动了注入/恢复路径的，跑一遍 `references/qa-inventory.md` 的签核清单。

---

## English (short)

Three kinds of contributions are most welcome:

1. **New themes** — a theme is a data folder under `themes/` (`theme.json` + one image); never modify engine files. Author it by handing this repo + your image to your own agent with [THEME-SPEC.md](THEME-SPEC.md). Acceptance = the QA checklist in THEME-SPEC.md §7. Attach screenshots of both layouts (blur your own sidebar/project names). Hard rules: **no real-person likeness**, no assets you can't redistribute, state the art's origin in `theme.json` `notes`, keep stickers neutral or off. Personal themes belong in the git-ignored `themes-private/`.
2. **Platform support** — Windows and macOS are implemented. Keep platform launch/install/watch/restore code separate and the injection engine cross-platform. Open an issue before adding a platform; preserve all debounce/circuit-breaker guarantees in `references/runtime-notes.md`.
3. **Engine fixes** — DOM re-adaptation after Codex updates, watcher robustness (the debounce + circuit-breaker semantics are non-negotiable), new opt-in decor fields following the v1.1/v1.2 pattern (optional, off by default, backward compatible). Run the signoff list in `references/qa-inventory.md` when touching inject/restore paths.
