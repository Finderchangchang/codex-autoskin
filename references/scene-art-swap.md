# Scene art swap — 实战记录（2026-07-16）

把一个主题的视觉图从"设计效果图/截图"换成"整幅纯净场景图"（THEME-SPEC §5.1 预设）的完整实操。
本文是一次私有主题（本地 `themes-private/`）换图的真实记录，下次换图（任何主题）照此步骤执行即可。

## 前提确认（换图前逐项过）

1. 新图必须是 A 类"干净艺术图"：**无 UI、无文字、无水印**（有的话回 THEME-SPEC §5 决策树走 B 类）。
2. 用 PIL 查角落像素：`Image.open(p).convert("RGBA")` 后看四角 + 对角线像素。
   - 角上是纯白/透明圆角 → crop 要 bleed（size 略超 100%）或 inset 裁掉；
   - 角上是正常场景色（本次：RGB 模式、四角浅粉）→ 直接 `cover` 即可。
3. 记录主体位置（本次：1672×941，人物脸约 x 69% / y 24%，中右）。图宽略低于 1920 画布理想值可接受，`cover` 轻微放大无感。

## 换图步骤

1. **停 watcher**（防止它在注入器被杀时抢救）：Windows 从 `%LOCALAPPDATA%\CodexDreamSkin\watcher-state.json` 取 PID 后 `Stop-Process`；macOS 从 `~/Library/Application Support/CodexDreamSkin/watcher-state.json` 取 PID 后 `kill`。测完必须重启（见下）。
2. **停注入守护**：从平台状态目录的 `state.json` 取 injectorPid 后停止进程。守护持有旧 payload，不停它会在页面 reload 时回灌旧图。
3. **备份旧图**：挪到平台状态目录下的 `retired-themes/<theme>-v1/art-v1.png`（不要留在主题文件夹里，避免误入仓库/payload）。
4. **换图**：新图拷成 `themes*/<theme>/art.png`（保持 theme.json 的 art 文件名不变最省事）。
5. **改 theme.json tokens**：抄 §5.1 场景预设作为起点，再按图微调（见下"最终参数"）。
   干净场景图的遮罩要比"压鬼影"时代**轻得多**：径向 overlay 首档 ≈.68（旧值 .92+），wash 每档 ≤.25，否则饱和度全没。
6. **向运行实例重注入**（不重启 Codex）：`node scripts/injector.mjs --once --port 9335 --screenshot <png>`。
   - 引擎 ≥2.2.0 会按 art 指纹自动发现图变了并重建 blob（旧版会复用旧 blob，换图必须 reload——已修，见 renderer-inject.js artSigs）。
7. **实时调参**（别改文件重注入！）：scratchpad 的 `tune.mjs` 往 documentElement 设 inline 变量 + 截图：
   `node tune.mjs --port 9335 --shot out.png --var "--dream-fullscreen-overlay=..." --var "--dream-card-alpha=.72"`
   每轮检查：标题/副标题对比度、主体（脸）无遮挡、卡片区可读、四角无异物。收敛后把终值写回 theme.json，`node tune.mjs --clear` 清 inline，再 `--once` 复核。
8. **四个 crop 角色都要重调**：fullscreen（主画布）、hero（banner 横带）、polaroid（小竖卡）、chat（聊天淡背景，红线：消息文字绝对主导）。
9. **回归**：全部主题 × 两版式截图；elementsFromPoint 命中账号按钮/四卡/输入框/发送键；restore 后 check-clean；重启 start 脚本恢复守护；**重启 watcher 并看日志无误杀**。

## 本次最终参数（1672×941 场景图，写在 theme.json tokens 里）

```jsonc
"--dream-fullscreen-art-size": "cover",             // 图与画布比例几乎一致，无需 bleed
"--dream-fullscreen-art-position": "50% 30%",
"--dream-fullscreen-overlay-width": "100%",         // 场景预设：不再是左侧竖条
"--dream-fullscreen-overlay": "radial-gradient(110% 82% at 21% 29%, rgba(255,250,247,.68) 0%, rgba(255,246,242,.42) 34%, rgba(255,243,239,.15) 55%, rgba(255,240,236,.03) 70%, transparent 82%)",
"--dream-fullscreen-wash": "linear-gradient(180deg, rgba(255,250,246,.10) 0%, rgba(255,250,246,.02) 30%, rgba(255,248,244,.03) 64%, rgba(255,246,242,.14) 100%)",
"--dream-hero-art-size": "auto 300%",               // banner：人脸+雪山横带
"--dream-hero-art-position": "50% 11%",
"--dream-hero-overlay": "linear-gradient(90deg, rgba(255, 250, 247, .92) 0%, rgba(255, 244, 240, .78) 50%, rgba(255, 238, 234, .38) 76%, transparent 100%)",
"--dream-polaroid-art-size": "360% auto",           // 小卡取脸部特写
"--dream-polaroid-art-position": "76% 16%",
"--dream-chat-art-size": "auto 125%",               // 聊天页：脸+一点场景，opacity .10
"--dream-chat-art-position": "74% 20%",
"--dream-sticker-bubble-top": "17.5%",              // 气泡右移避开帽子
"--dream-sticker-bubble-right": "13.5%"
```

配套：`cards.opacity` 从 .66 → .72（新图卡片区是浅色花海，.72 白度更接近设计稿且副标题更稳）。

## 踩坑备忘

- **旧 blob 复用坑**：2.2.0 之前 renderer-inject 只要主题名齐全就复用上次注入的 blob URL，换图后 `--once` 重注入看到的还是旧图，极具迷惑性（token 生效了、图没变）。已用 art 指纹（dataURL 长度+尾部）修复；再遇到"换图不生效"先查引擎版本。
- 场景图人物在右，首页大标题在左上 —— 标题区径向渐变锚点跟着标题走（21% 29%），不要照抄旧竖条 overlay。
- 卡 3 位于人物毛衣/手臂上方发灰的问题随新图消失（卡片区变成浅色花海）；若再换图后复发，优先调 `cards.opacity` 而不是加 wash。
