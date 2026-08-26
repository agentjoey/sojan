# UI v3 · 子项目 C 第一波：桌面骨架 + 卷首 + 运势 — 设计

2026-08-26 · claude · 分支 `feat/ui-v3`（承接 A 地基外壳、B 命理可视化）

设计包事实源：`design-guide/03-screens.md` 卷首 `5a` · `desktop-guide/06-desktop.md` §2/§3/§4 与 `8a` 今日运势。

---

## 1. C 为什么要再拆

子项目 C（逐屏重建）覆盖 8 个页面共 **3610 行** × 2 个断点，还要先建桌面两栏骨架——单份 spec 装不下。按依赖与聚类拆四波，每波各自 spec → plan → 执行：

| 波 | 内容 | 切法理由 |
|---|---|---|
| **C1（本文）** | 桌面两栏骨架 + 卷首 + 运势 | 两栏骨架是 8a/8b/境/掷筊共用的地基，必须先建；卷首与运势共用「今日卡」 |
| C2 | 命盘 + 三段式解读 + 紫微棋盘页 | 接 B 块的 `WuxingWheel`/`BaziPillars`/`ZiweiBoard` |
| C3 | 掷筊 + 解梦 | 两个 LLM 交互面 |
| C4 | 我的+账号合并（6c）+ 境（6d） | 两个最大页面（1026 + 1066 行） |

## 2. 范围

**做：**
| # | 内容 | 性质 |
|---|---|---|
| 1 | `TwoColumn` 桌面「左定右动」两栏骨架 | 新建 |
| 2 | `TodayCard` 今日卡（卷首与运势共用） | 新建 |
| 3 | `WindBell` 风铃**占位**组件 | 新建（占位） |
| 4 | `CompassWatermark` 五层转盘水印 + `zjSpinRev` keyframes | 新建（取代 `HeroWheel`） |
| 5 | `app/page.tsx` 卷首重建（5a） | 重建 |
| 6 | `app/calendar/page.tsx` 运势重建（桌面 8a；移动版推导） | 重建 |

**不做：**
- 其余 6 屏（C2/C3/C4）。
- 排盘过场 5s 七拍（D 块）。
- **风铃真实素材**——见 §7，本波只出占位。

## 3. 桌面骨架（06-desktop §2/§3）

### 3.1 断点

| 断点 | 布局 |
|---|---|
| < 768px | 移动版，无竖栏（A 块已交付的顶部胶囊 + 菜单键） |
| 768–1199px | 竖栏 + **单列**，列宽 `min(100% - 96px, 720px)` 居中 |
| ≥ 1200px | 竖栏 + **两栏**（§3.2） |
| ≥ 1600px | 布局不变，内容列上限 1120px，多出留白。**不拉第三栏** |

内容区：`max-width: 1120px; margin: 0 auto; padding: 44px 56px 48px`。段间距比移动版放大一档（24 → 32/44）。

### 3.2 `TwoColumn`

```
display: grid; grid-template-columns: <固定> 1fr
两列各自 overflow: auto; min-height: 0     ← 右列长解读滚动时左列的盘不动，这是桌面端相对移动端的主要收益
列间 1px 竖线（border-right: 1px solid line）
左列 padding-right 32px / 右列 padding-left 40px
页头固定在 grid 之上（不参与两列滚动）
正文列宽上限 620px（约 34 汉字/行），不满宽铺文字
```

⚠️ `min-height: 0` 不是可选项——grid 子项默认 `min-height: auto`，不设它两列都不会真的独立滚动，而是一起把页面撑高。这是本组件最容易做错、且「看起来能用」的地方。

`TwoColumn` 只负责骨架，左右内容由调用方传入。左列宽度由调用方指定（8a 是 392px，8b 是 440px）。

### 3.3 桌面特有（06-desktop §4）

- **hover**：行/卡 hover 只允许 `border-color` 由 `line` → `line-strong`、箭头由 `muted` → `ink`。**不得**加投影、位移、放大。
- **focus**：所有可点元素 `:focus-visible` 2px 朱砂 + `outline-offset: 2px`（复用 `.zj-wheel-focus`）。
- **页头行**：左侧眉标 + 大标题，右侧一行 12px 元数据，`border-bottom: 1px solid line-strong`。这条底线是**桌面页头专有**，与 A 块 `PageHeader` 删掉的那条通栏细线不是一回事。

## 4. 卷首 `5a` → `app/page.tsx`

1. **Hero**：转盘水印 + 眉标「卷 首」+ serif 42px 大标题 + 13.5px 定位句
2. **今日卡**（细线卡，左右两栏）——见 §6
3. **七十二候标尺**（B 块已交付 `SeasonRuler`）
4. **目录**：4 行，每行朱文方印字符（盘/灵/运/候）+ serif 19px 标题，当前主入口方印朱砂描边
5. 免责一句 + 页脚品牌行

### 4.1 转盘水印 `CompassWatermark`

```
position: absolute; right: -128px; top: -26px; width: 336px; opacity: .17
五层异速正反转：
  外圈刻度环      zjSpinSlow 150s
  十二地支环      zjSpinRev  190s
  八卦爻画环      zjSpinSlow 110s
  十二宫环 + 十二角交角星  zjSpinRev 84s
  中心 8 线小盘   zjSpinSlow 80s
```

⚠️ **`zjSpinRev` 在 `globals.css` 里不存在，要新增**（`@keyframes zjSpinRev { to { transform: rotate(-360deg); } }`）。已核。

⚠️ 取代既有的 `HeroWheel`（`components/ui.tsx`）——它只是单层转圈。**`HeroWheel` 删除前须查证全仓消费方**；若别处还在用，保留并各自共存，不要为省事把别处一起改了（那是别的波的范围）。

⚠️ 五层动画必须挂 CSS keyframes，`globals.css` 既有的 `prefers-reduced-motion` 降级块才覆盖得到。降级后水印静止但仍可见（它是装饰，静止无损）。

## 5. 运势 `8a` → `app/calendar/page.tsx`

**桌面（≥1200px）**：`TwoColumn` 左列 **392px**
- 左：日期 + 干支徽 + **今日卡**（与卷首同一组件）+ 判词强调块（`Emphasis`）
- 右：五维 / **宜忌两栏** / 七十二候标尺 / 免责
- **桌面端不出黄历**（06-desktop §3 明定的信息密度取舍）

**宜忌两栏（桌面）**：`grid-template-columns: 1fr 1fr; column-gap: 40px`；每栏 = 表头行（8px 方点 + serif 16px 标题 + 右侧条数 Cormorant 12px，`border-bottom: 1px solid ink`）+ 逐条 `padding: 13px 0; border-bottom: 1px solid line`。两栏逐行对齐成同一节奏，**不要用无边框 `<ul>` 散排**。

**周历条（桌面）**：7 格铺满内容列宽（`repeat(7,1fr); gap 8px`），格高 `padding: 10px 0`。

**移动（<768px）——设计包无稿，由 claude 推导（owner 已授权 D4）**：
- 沿用桌面 8a 的信息顺序（日期干支 → 今日卡 → 判词 → 五维 → 宜忌 → 候标尺 → 免责），单列纵向排布
- **移动端保留黄历**（桌面不出是刻意取舍，移动端信息密度不同，且黄历是既有能力，删了是功能回退）
- 宜忌在移动端用单栏细线分行，不做两栏

## 6. `TodayCard`（卷首与运势共用）

```
卡头：`今 日`（朱砂眉标） | 日期 + 农历（Cormorant 13px）
左栏 124px，border-right 1px line：风铃图撑满，幡面写当日判词
右栏：候名「处暑 · 初候」(11px/.28em) → 物候名 serif 23px/700 朱砂 → 1px 细线
      → 润色一句 serif 14.5px → 元数据行（`庚申 · 官杀当值` / `五维 3/10`）
卡脚：`展开今日日签 →`（指向 /calendar）
```

桌面端与移动端**同一个组件**，桌面只放宽内边距（06-desktop §4 明定：「不要在桌面端换成花窗裱画那一套」）。

⚠️ 候名与物候名从 B 块的 `getCurrentSolarHou()` 取，**不要另算**。

## 7. 风铃：本波只出占位

`WindBell`（原误称「风幡」——这是风铃的另一张图，不是风幡）组件接口按最终形态设计（`<WindBell verdict="谨" />`），但**渲染占位**：一块符合设计语言的细线区域 + 判词大字，不试图模仿幡面。

理由见 backlog `EP-uiv3-banner`：设计包两张素材都烧着字、`windbell-source` 连 alpha 通道都没有，**没有可用的无字透明底图**；不 P 图伪造素材、不用手绘矢量凑数（`EP-jiao` 掷筊那轮已验证手绘到不了参考图水准，owner 判「效果太差，质感粗糙，放弃」）。

拿到素材后只需换 `WindBell` 内部实现，调用方不动。**占位必须一眼看得出是占位**，不要做成「像是完成品的次品」——那会让人误以为这就是最终效果。

## 8. 测试策略

沿用 A/B 口径，并针对本波的两处新风险加强：

- **`TwoColumn`**：`min-height: 0` 与 `overflow: auto` 必须有断言（这是「看起来能用、实际不独立滚动」的坑）。⚠️ jsdom 无布局，断言打在**样式属性**上，不是算出来的高度。
- **断点行为**：768/1200/1600 三档用 Tailwind 响应式类，断言类名而非视口——jsdom 测不了媒体查询生效。
- **`TodayCard` 双消费方**：卷首与运势渲染的是**同一个组件**，补一条断言防止日后各自复制一份。
- **`CompassWatermark`**：五层各自的动画名与时长、正反方向。⚠️ 别断言 SVG path。
- **`WindBell` 占位**：断言它渲染的是占位而非成品（例如带 `data-placeholder`），避免日后素材到位时忘了替换。
- **B 块组件的接线**：`SeasonRuler` 的 `index` 来自 `getCurrentSolarHou()`，断言接线而非硬编码。
- 关键改动做 **mutation 复验**。
- ⚠️ 本波若动 `packages/core` 要跑三个包。

## 9. 验收标准

- [ ] `TwoColumn` 两列真正独立滚动（`min-height:0` + `overflow:auto` 有断言守）
- [ ] 三档断点按 06-desktop §2 实现，≥1600px **不拉第三栏**
- [ ] 卷首五层转盘水印方向与时长正确，`zjSpinRev` 已加入 `globals.css`
- [ ] `TodayCard` 被卷首与运势**同一份**消费，有断言防复制
- [ ] 桌面运势**不出黄历**，移动运势**保留黄历**
- [ ] 宜忌桌面两栏逐行对齐（非 `<ul>` 散排）
- [ ] 候名/物候名来自 `getCurrentSolarHou()`，非硬编码
- [ ] `WindBell` 是**一眼可辨的占位**，接口按最终形态设计
- [ ] hover 只改 `border-color`/箭头色，**无投影、无位移、无放大**
- [ ] 没有第二种强调手法；无新增裸十六进制；`--shadow-*` 仍全 `none`
- [ ] 三包测试全绿；tsc/lint 不新增；关键改动 mutation 复验通过
- [ ] `HeroWheel` 的处置（删除或共存）有明确结论，非静默留着

## 10. 待定

1. **风铃素材**（backlog `EP-uiv3-banner`）——等 owner。
2. **移动版运势的版式**由 claude 推导（owner 授权），若日后 owner 补稿以稿为准。
3. `HeroWheel` 是否还有别处消费方——实施时查证。
