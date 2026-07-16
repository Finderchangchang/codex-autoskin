# THEME-SPEC — Codex Dream Skin 主题定制规范（写给 Agent 读）

> 读者设定：你是用户的 Codex / Claude agent。用户丢给你一张图片说"给我的 Codex 做个这样的皮肤"。
> 你只需要读完本文件，产出一个主题文件夹，不需要读引擎源码。

## 0. 心智模型

- 皮肤引擎 = **结构层**（`styles/dream/style.css`，只消费 CSS 变量）+ **主题数据**（`themes/<name>/`，纯数据）。
- 注入器 `scripts/injector.mjs` 启动时扫描 `themes/` 与 `themes-private/` 下所有含 `theme.json` 的文件夹，动态生成每主题的变量块、校验并拼接 `extra.css`、把图片转成 dataURL，随 manifest 一起注入 Codex 渲染器。
- **做主题 = 写一个文件夹**。你永远不需要（也不允许）修改引擎文件：
  `scripts/*.mjs`、`scripts/*.ps1`、`assets/renderer-inject.js`、`styles/dream/style.css`。

## 1. 主题文件夹格式

```
themes/<name>/            # 公开主题；本地私用放 themes-private/<name>/（已被 .gitignore）
  theme.json              # 必需：元信息 + 28 个 token + art 引用
  art.png                 # 必需：主视觉图（png/jpg/webp，建议 ≥1920 宽）
  extra.css               # 可选：主题特例样式，必须限定作用域（见 §6）
```

命名规则（不满足则整个主题被拒载，stderr 有告警）：

- 文件夹名 = 主题名，kebab-case，正则 `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`；
- `theme.json` 里的 `name` 字段可省略，写了就必须与文件夹名一致；
- 同名主题以先扫描到的为准（`themes/` 先于 `themes-private/`，各自内部按字母序）。

## 2. theme.json 完整 schema

```jsonc
{
  "name": "aurora-veil",        // 可选。必须等于文件夹名
  "order": 10,                  // 可选，默认 100。切换列表排序键（小的在前，同序按名字）
  "default": false,             // 可选。true = 启动默认主题；多个 true 取排序后第一个。
                                //   没有任何 true 时取扫描到的第一个主题。
                                //   注意：用户 localStorage 里已持久化的选择永远优先于 default
  "notes": { },                 // 可选。任意注释性字段，引擎忽略（未知字段一律忽略）
  "meta": {                     // 必需，四个字段都必须是非空字符串
    "button": "极光",           //   切换器/列表里的短名（2~4 个字）
    "brand": "Aurora Veil 极光夜空皮肤",   // 首页左上角品牌行主文案
    "edition": "Aurora Veil · Demo Edition", // 品牌行副文案（小字）
    "signature": "Aurora ✦"     //   首页右上角手写体签名
  },
  "art": {                      // 可选。省略等价于 { "home": "art.png" }
    "home": "art.png",          //   首页视觉图（hero / fullscreen / polaroid 三个角色共用）
    "chat": "art.png"           //   聊天页淡背景图；省略 = 与 home 同图
  },                            //   只能是主题文件夹内的纯文件名（png/jpg/webp），不允许路径
  "cards": {                    // 可选（v1.1）。首页建议卡片装饰，见 §3.7
    "subtitles": [              //   最多 4 条，按卡片顺序一一对应；窗口变窄原生卡 4→3→2 隐藏时
      "快速阅读代码，理解逻辑与结构",  //   对应副标题自动一起消失（优雅降级）
      "从想法到实现，快速生成代码",
      "智能审查代码，提升质量",
      "定位问题，提供修复方案"
    ],
    "opacity": 0.66             //   卡片底色透明度 0~1（透出背景场景）。缺省 .93
  },
  "stickers": {                 // 可选（v1.1）。装饰贴纸，全部缺省关闭；只在全屏版式首页出现，
    "bubble": { "text": "一起出发吧！♡" },        // 人物旁对话气泡
    "board": { "lines": ["第一行", "第二行", "第三行"] }, // 右侧花饰边框推广牌（1~3 行）
    "corner": true              //   右下角玫瑰花枝线稿角饰
  },                            //   贴纸层 pointer-events:none，永远不遮压原生控件
  "composer": {                 // 可选（v1.1）
    "placeholder": "输入你的想法…"   // 首页输入框占位文案；缺省保留 Codex 原生文案，
  },                            //   还原皮肤后自动恢复原生（走 CSS var 回退，无 DOM 改写）
  "tokens": { ... }             // 必需：28 个 CSS 变量，见 §3。key 必须匹配 --dream-[a-z0-9-]+，
                                //   value 是不含 { } ; 的字符串；缺任何一个必需 token 整个主题拒载
}
```

> v1.1 的 `cards` / `stickers` / `composer` 三个字段完全向后兼容：老 theme.json 缺这些字段照常工作；
> 字段值非法只丢弃该字段并在 stderr 告警，不会连累整个主题。
> 引擎内部把 `cards.subtitles`→`--dream-card-sub-1..4`、`cards.opacity`→`--dream-card-alpha`、
> `composer.placeholder`→`--dream-composer-placeholder` 生成为该主题的 token（手写同名 token 优先）；
> `stickers` 走 manifest 由运行时渲染（文本一律 textContent 注入，带不进任何标记）。

## 3. 28 个 token 逐个说明

取色总原则：从图片里取 1 个主色（hue 基准）、1 个辅助亮色、1 个近黑的深色；页面底色永远接近白（本皮肤是浅色皮肤，`color-scheme: light`）。

### 3.1 全局色（4 个）

| token | 控制什么 | 怎么从图取 |
|---|---|---|
| `--dream-ink` | 正文/侧栏文字主色 | 图片最深的主色调，压到近黑但保留色相（L≈20-30） |
| `--dream-purple` | 渐变深端：卡片图标圆、发送按钮、激活态 | 主色的饱和深档 |
| `--dream-violet` | 渐变中档（发送按钮渐变浅端） | 主色的中间档 |
| `--dream-pink` | 渐变亮端：图标圆渐变的亮起点 | 图里的辅助亮色（可以不同色相，形成渐变） |

### 3.2 页面底色与光晕（4 个）

| token | 控制什么 | 怎么取 |
|---|---|---|
| `--dream-page-bg-0` | 页面渐变浅端 | 白里染 2%~4% 主色调（如 `#fffdfb`） |
| `--dream-page-bg-1` | 页面渐变深端 | 白里染 6%~10% 主色调 |
| `--dream-page-glow-a` | 右上角光晕 | 主色 `rgba(..., .2~.45)` |
| `--dream-page-glow-b` | 左上角光晕 | 辅色 `rgba(..., .15~.3)` |

### 3.3 首页视觉图 crop（6 个）

语义见 §4。

| token | 作用角色 |
|---|---|
| `--dream-hero-art-size` / `--dream-hero-art-position` | 横幅（banner）版式的顶部横条 |
| `--dream-fullscreen-art-size` / `--dream-fullscreen-art-position` | 全屏（fullscreen）版式的整面画布 |
| `--dream-polaroid-art-size` / `--dream-polaroid-art-position` | 首页右下拍立得小卡（108×140） |

### 3.4 视觉图上的遮罩（3 个）

| token | 控制什么 | 怎么取 |
|---|---|---|
| `--dream-hero-overlay` | 横幅左侧压字渐变（宽度 = 结构 token `--dream-hero-split-width`，默认 58%） | 见 §5 的明暗两个模板 |
| `--dream-fullscreen-overlay` | 全屏版式左侧压字渐变（固定覆盖左 76%） | 同上；**左端第一档建议直接不透明**，防鬼影 |
| `--dream-fullscreen-wash` | 全屏画布整面轻纱 | `rgba(近白色, .04~.14)`，图越"脏"越大 |

### 3.5 hero 文案（7 个）

| token | 控制什么 | 怎么取 |
|---|---|---|
| `--dream-hero-title-color` | 大标题颜色 | 暗图用 `#fff`，亮图用 ink 同族深色 |
| `--dream-hero-subtitle-color` | 副标题颜色 | 标题色的 80%~94% 透明度版本 |
| `--dream-hero-title-shadow` | 标题投影 | 暗图 `0 2px 12px rgba(深色,.4~.5)`；亮图 `0 1px 0 rgba(255,255,255,.9)` |
| `--dream-hero-chip-color` | 标题里项目名 chip 的文字色 | 与 overlay 对比可读 |
| `--dream-hero-chip-bg` | chip 背景 | 暗图半透明亮色 `.16~.24`；亮图 `rgba(255,255,255,.5~.6)` |
| `--dream-hero-chip-line` | chip 描边 | 同族色 `.3~.7` |
| `--dream-hero-subtitle` | 副标题文案本体 | **CSS 字符串，必须带双引号**：`"\"与主题气质匹配的一句话 ✦\""` |

### 3.6 聊天页淡背景（4 个）

| token | 控制什么 | 怎么取 |
|---|---|---|
| `--dream-chat-art-size` / `--dream-chat-art-position` | 聊天页背景 crop | 聚焦主体，比首页更收敛 |
| `--dream-chat-art-opacity` | 背景透明度 | `.08~.14`。**消息文字必须绝对主导**，拿不准取小 |
| `--dream-chat-wash` | 背景上的横向白纱 | `rgba(近白, .7~.8)` |

> 另有 6 个**结构 token**（`--dream-hero-height`、`--dream-card-height`、`--dream-suggestion-gap`、`--dream-hero-copy-width`、`--dream-hero-split-width`、`--dream-fullscreen-overlay-width`）在 `styles/dream/style.css` 里有默认值，主题一般不用碰；确要改可以直接写进 `tokens`（同样的 key 规则）。

### 3.7 v1.1 可选装饰 token（全部有默认值，非必需）

通常不用手写——`cards` / `composer` 字段会自动生成前三行；手写进 `tokens` 可覆盖生成值或做更细调整。

| token | 控制什么 | 默认值 |
|---|---|---|
| `--dream-card-sub-1..4` | 四张建议卡的副标题文案（CSS 字符串，带双引号） | 无（不渲染副标题） |
| `--dream-card-alpha` | 卡片底色透明度（两种版式共用；卡片带 backdrop blur 保证可读） | `.93` |
| `--dream-composer-placeholder` | 首页输入框占位文案（CSS 字符串） | 原生文案 |
| `--dream-card-frame` | 卡片内细线装饰框颜色 | `rgba(226,158,196,.55)` |
| `--dream-card-ornament` | 卡片四角小花饰 + 底部菱形饰点颜色 | `var(--dream-pink)` |
| `--dream-card-sub-color` | 副标题文字色 | ink 与白的 color-mix |
| `--dream-sticker-ink` | 贴纸文字/玫瑰线稿主色 | `var(--dream-purple)` |
| `--dream-sticker-bubble-top` / `--dream-sticker-bubble-right` | 气泡位置（相对主区域） | `19%` / `19%` |
| `--dream-sticker-board-top` / `--dream-sticker-board-right` / `--dream-sticker-board-width` | 推广牌位置与宽度 | `29%` / `2.6%` / `186px` |

## 4. crop 调参：size/position 的语义与迭代流程

四个 art 角色本质都是 `background-size` + `background-position`：

- `auto H%`：把图缩放到"图高 = 容器高 × H%"。H% 越大越"放大"，容器窗口在图上滑动的自由度越大。
- `W% auto`：按宽缩放（polaroid 常用，如 `300% auto`）。
- position `X% Y%`：图比容器大出来的部分如何分配。`0% 0%` 贴左上，`100% 50%` 贴右、垂直居中。**它不是"图上某点的坐标"，而是溢出量的分配比例**——调它时小步走（±3%）看截图。

容器几何参考（1920×1030 窗口实测）：

| 角色 | 容器尺寸 | 特点 |
|---|---|---|
| hero（banner） | ≈1560×290 的超宽条 | 宽高比 >5，适合"人脸/主体特写横带"（大 H%，如 700%~900%） |
| fullscreen | ≈1590×920 整面 | 接近图片比例，适合展示大区域（H% 120%~300%） |
| polaroid | 108×140 竖卡 | 用 `W% auto` 取一个方寸特写 |
| chat | ≈1650×990 | 同 fullscreen，但只以 opacity .1 级别隐约可见 |

**推荐迭代流程（实时改变量 + CDP 截图，千万别改文件重启注入）：**

1. 先起皮肤（`scripts/start-dream-skin.ps1`），用 `node scripts/set-theme.mjs <name> fullscreen` 切到你的主题；
2. 通过 CDP `Runtime.evaluate` 往 `document.documentElement.style` 上 `setProperty('--dream-fullscreen-art-size', ...)`，再 `Page.captureScreenshot` 截图看效果（连接 CDP 的最小代码可以抄 `scripts/set-theme.mjs`：双栈探测 `127.0.0.1`/`[::1]` 的 `/json/list`，找 `app://-/index.html` 且无 `initialRoute` 的 target）；
3. 每轮截图检查三件事：主体落点、**有没有露出原图文字/边框线**、标题区对比度；
4. 收敛后把最终值写回 `theme.json`，**清掉 inline 变量**（`style.removeProperty`），重启注入守护（再跑一次 start 脚本）让 token 落盘生效，再截图复核一遍。

## 5. 关键决策树：源图是什么类型？

```
源图
├── A. 干净艺术图 / 人像 / 插画（无文字、无 UI 元素）
│     ├── A1. 整体偏暗 → 白标题 + 深色左 overlay
│     │        模板：themes/aurora-veil/theme.json（生成的极光夜空）
│     └── A2. 整体偏亮 → 深色标题 + 近白左 overlay
│              模板：themes/ember-bloom/theme.json（生成的暖光花瓣）
└── B. 带界面文字/水印/排版元素的截图或海报
      ├── B1. 存在"够窗口大"的干净区域（主体周围有一块无字区）
      │        → 放大裁剪，只取干净区 + 左 overlay 首档全不透明
      │        参考实战：hero 用 auto 900% 取"眼部横带"，fullscreen 用
      │        auto 280% + position 86% 10% 避开图内文字和卡片边框，
      │        overlay 左端用 rgb()（不透明）而非 rgba(...,.97)
      └── B2. 主体被 UI 四面包围，无干净区可裁
               → 高斯模糊柔焦策略（唯一正解，半透明纱压不住高对比黑字）
               → 写 extra.css，模板见下
```

### B2 模糊柔焦模板（extra.css）

原理：容器本体铺一层主题色渐变垫底 → `::before` 放重模糊的原图（`inset` 负值外扩，防模糊边缘露底）→ `::after` 放暖色渐变遮罩 → 真实内容在 z-index 3。**必须以 `html.dream-theme-<name>` 限定作用域**，否则会把别的主题的清晰图也糊掉。

```css
/* 全屏版式：把带 UI 的源图糊成氛围背景 */
html.dream-theme-<name>.dream-layout-fullscreen .dream-home > div:first-child > div:first-child > div:first-child {
  background-image: linear-gradient(120deg, <浅主题色1>, <浅主题色2>) !important;
  background-size: 100% 100% !important;
  background-position: center !important;
}
html.dream-theme-<name>.dream-layout-fullscreen .dream-home > div:first-child > div:first-child > div:first-child::before {
  content: "" !important;
  position: absolute !important;
  inset: -34px !important;              /* 外扩，避免 blur 边缘露出垫底色 */
  z-index: 0 !important;
  width: auto !important;
  border-radius: 0 !important;
  background-image: var(--dream-home-art) !important;
  background-size: auto 340% !important;      /* 按主体位置调 */
  background-position: 75% 20% !important;
  background-repeat: no-repeat !important;
  filter: blur(25px) saturate(.86) brightness(1.09) !important;  /* 25px 起步；文字仍可辨认就加大 */
}
html.dream-theme-<name>.dream-layout-fullscreen .dream-home > div:first-child > div:first-child > div:first-child::after {
  z-index: 1 !important;
  background: linear-gradient(90deg,
    rgba(<近白暖色>,.90) 0%, rgba(...,.72) 42%, rgba(...,.50) 56%,
    rgba(...,.30) 70%, rgba(...,.22) 84%, rgba(...,.34) 100%) !important;
}
html.dream-theme-<name>.dream-layout-fullscreen .dream-home > div:first-child > div:first-child > div:first-child > div:first-child {
  position: relative !important;
  z-index: 3 !important;               /* 标题/卡片浮在模糊层上 */
}
```

banner 版式对 B 类图同样适用 B1（超大 H% 取特写横带）；hero 条太矮，模糊策略在 banner 上通常不需要。

**通用铁律：宁可 overlay 压重一点，也绝不允许出现原图的"鬼影文字"。** 验收时把截图放大逐角检查。

### 5.1 场景图预设（A 类补充：整幅场景图，主体在右上、全画布有内容）

默认的全屏遮罩是"左侧竖条渐变"（压左侧文字区、露右侧主体），适合"右侧干净人物照"。
如果源图是**一整幅场景**（例如人物在右上、前景/中景铺满全画布），竖条会顾此失彼——改用场景预设：
`--dream-fullscreen-overlay-width` 拉到 100%，overlay 换成锚在标题区的径向渐变，wash 换成上下渐变
（`--dream-fullscreen-wash` 本就走 `background` 简写，填渐变和填纯色一样合法）：

```jsonc
"--dream-fullscreen-art-size": "cover",
"--dream-fullscreen-art-position": "70% 20%",        // 让主体落在右上
"--dream-fullscreen-overlay-width": "100%",
"--dream-fullscreen-overlay": "radial-gradient(120% 95% at 22% 32%, rgba(255,250,247,.92) 0%, rgba(255,246,242,.66) 36%, rgba(255,242,238,.30) 56%, rgba(255,240,236,.06) 72%, transparent 84%)",
"--dream-fullscreen-wash": "linear-gradient(180deg, rgba(255,250,246,.30) 0%, rgba(255,250,246,.06) 26%, rgba(255,248,244,.08) 60%, rgba(255,246,242,.34) 100%)"
```

半径/色值按主题基色替换；验收标准不变：标题区对比度充足、卡片副标题可读、四角无鬼影。

## 6. extra.css 规则（引擎强制校验）

- 每条规则的**每个选择器**的第一个复合选择器必须锚定主题：以 `html.` 或 `:root.` 开头，且包含 `.dream-theme-<name>`。
  - 合法：`html.dream-theme-foo .x`、`html.dream-theme-foo.dream-layout-fullscreen .y > div`、`:root.codex-dream-skin.dream-theme-foo`
  - 非法：`body { }`、`.dream-home { }`、`main.main-surface { }`
- at-rule 只允许 `@media` / `@supports`（内部同样逐条校验）。
- 违规后果：**extra.css 整体拒载**（主题本体仍加载），注入器 stderr 打 `[dream-skin] theme "<name>" extra.css: ...` 告警。改好后重跑 start 脚本。
- 装饰性内容必须 `pointer-events: none`，不得遮挡/替换任何真实 Codex 控件。

## 7. 验收清单（交付主题前必须逐项过）

1. `node scripts/injector.mjs --themes` —— 你的主题出现在列表里，无 skipped/REJECTED 告警。
2. 起皮肤后 `node scripts/set-theme.mjs <name> fullscreen`、`... <name> banner` 各截一张图：
   - 两种版式下：hero/画布、4 张原生建议卡、真实项目选择器、原生输入框全部可见，无横向滚动、无遮挡；
   - 放大检查四角与接缝：**无原图文字鬼影、无原图边框线**；
   - 标题/副标题/chip 在 overlay 上对比度充足。
3. 打开一个真实任务（聊天页）：chat 背景隐约可见即可，消息文字对比度不受影响，无可读的假 UI。
4. 交互回归：点一张建议卡、点项目选择器、在输入框打字 —— 全部正常响应（装饰层没有吃掉点击）。
   用 `document.elementsFromPoint(控件中心)` 验证侧栏"新建任务"、账号按钮、四张卡片、输入框、发送按钮
   最顶命中都是控件真身（贴纸/卡片装饰全部 `pointer-events: none`）。
5. `scripts/restore-dream-skin.ps1` 后 DOM 干净（无 `codex-dream-skin`/`dream-*` class、无注入节点、无
   `__CODEX_DREAM_SKIN_STATE__`、无 `.dream-new-task` 标记、输入框占位文案回到原生），再重新 start 能恢复。
6. 桌面宠物窗口（`initialRoute=/avatar-overlay` 辅助渲染器）保持全透明，不被注入。
7. 配了 `cards.subtitles` 的主题：把窗口拖窄让原生卡从 4 → 3 → 2 张收缩，副标题随卡片一起消失、不错位。
8. 配了 `stickers` 的主题：贴纸只出现在全屏版式首页（banner / 聊天页都不出现），且不遮压任何原生控件。

## 8. 禁止事项

- **不许改引擎文件**（§0 列表）。主题只能通过 theme.json + extra.css 表达。
- 装饰层一律 `pointer-events: none`；只有引擎自己的机制可以接收点击。
- 不得用整张截图假冒整个窗口/控件；所有真实控件必须保持原生可交互。
- 不得降低聊天消息可读性（chat opacity 超过 .14 需要非常充分的理由）。
- **不得使用真人明星肖像制作并公开发布/传播主题**。公开仓库（`themes/`）只放你拥有权利的原创或授权图片；涉及真人肖像的私人主题只能放 `themes-private/`（已 .gitignore），仅限本地自用。
- 公开主题的 art 必须可复现来源（如程序化生成脚本、或注明授权）。
- 公开主题的 `stickers` 保持缺省关闭或只放中性文案；个人推广信息（ID / 网址 / 引流位）只进 `themes-private/` 的私人主题，README 截图里不得出现。
