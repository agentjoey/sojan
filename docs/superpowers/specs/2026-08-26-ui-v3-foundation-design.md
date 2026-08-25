# UI v3 · 子项目 A：地基与外壳 — 设计

2026-08-26 · claude · 分支 `feat/ui-v3`

设计包事实源：
- 移动版 `/Users/xtation/Playground/design/sojan-design/design-guide/`（`01-tokens` / `02-components` / `03-screens` / `04-motion` / `05-open-questions`）
- 桌面版 `/Users/xtation/Playground/design/sojan-design/desktop-guide/`（`06-desktop`）
- 参考稿 `desktop-guide/reference/Sojan Mobile.dc.html`（**用桌面包这份**，它是移动包那份的超集，多 t8 一轮）

> 两包的 `01-tokens.md` 与 `02-components.md` 逐字节一致，已核。冲突时：桌面事项以 `06-desktop.md` 为准，其余以移动包为准；**参考稿与 md 冲突时 md 优先**（README 明定）。

---

## 1. 背景

UI v3 是全站重设计，总量太大，已拆成四个子项目（owner 2026-08-26 批准）：

| 块 | 内容 | 依赖 |
|---|---|---|
| **A（本文）** | 设计原语 + 新外壳 + 导航模型 | — |
| B | 命理可视化（五行盘/候标尺/风幡图新建，紫微棋盘·四柱改造） | — |
| C | 逐屏重建（8 屏 × 2 断点） | A + B |
| D | 排盘过场 5s 七拍 | — |

A 与 B 可并行；A 先行，因为做完就能在 staging 上看到「新外壳 + 旧内容」，owner 能最早给反馈。

## 2. 范围

**做：** 设计原语层收敛 · 移动端新外壳（顶部语境胶囊 + 菜单键 + 九宫格覆盖层，删底栏）· 桌面竖栏改造 · 导航项单一事实源 · 「我的/账号」可达性桥接 · `AppShell` 测试重写。

**不做（明确排除）：**
- **Telegram 一律不动**（owner 决定：TG 冻结，二期另排）。见 §7.3。
- 逐屏内容区重排（C 的活）。A 只换外壳，页面内容原样。
- 五行盘 / 候标尺 / 风幡图（B 的活）。九宫格下方的七十二候列表在 A 里**只做数据接线与朴素列表**，标尺可视化归 B。
- `/profiles` 与 `/account` 的 6c 合并屏（C 的活）。A 只保证可达，见 §7.2。
- 过场动画（D 的活）。

## 3. 已定决策（owner，2026-08-25/26）

| # | 决策 | 影响 |
|---|---|---|
| D1 | **TG 冻结，二期再说** | 新外壳整个放进 `AppShell.tsx` 现有的 `{!tg && …}` 里；`TG_ENTRIES` 内容不变 |
| D2 | **桌面保留 82px 竖栏**（设计包 `06-desktop` §1） | 只删移动底栏，不删竖栏；不加桌面顶部菜单键 |
| D3 | **长活分支 `feat/ui-v3`，一次性切** | 不引 `UI_V3` flag，不维护新旧两套外壳 |
| D4 | **无稿表面由 claude 用既有原语推导补齐** | 六处灰区（移动 `/calendar`、`/reading`、解梦结果页、境的化解/添置 tab、`/fengshui/{dwellings,object}`、紫微大限叠加）不发明新语言 |
| D5 | **九宫格 6 项 / 竖栏 7 项，「我的」不在九宫格** | 见 §4 |
| D6 | **移动端「我的」入口 = 顶部语境胶囊** | 见 §6.1，代价已记入 §10 |

## 4. 导航模型

### 4.1 项集

单一事实源新建 `apps/web/lib/nav.ts`，导出全部导航项及其 flag 门控；三个消费方（桌面竖栏 / 移动九宫格 / TG 首页）各自取子集。

```
NAV_ITEMS   id        href          char  i18n key        flag
            calendar  /calendar     运    nav.calendar    —
            chart     /chart        盘    nav.chart       —
            spirit    /spirit       灵    nav.spirit      NEXT_PUBLIC_SPIRIT_ENABLED
            fengshui  /fengshui     境    nav.fengshui    NEXT_PUBLIC_FENGSHUI_ENABLED
            dream     /dream        梦    nav.dream       NEXT_PUBLIC_DREAM_ENABLED
            reading   /reading      起    nav.reading     —
            profiles  /profiles     我    nav.profiles    —
```

| 消费方 | 取值 | 全 flag 开 | 全 flag 关 |
|---|---|---|---|
| 桌面竖栏 | 全部 7 项，`profiles` 用 `margin-top:auto` 沉底 | 7 | 4 |
| 移动九宫格 | 除 `profiles` 外 6 项 | 6 | 3 |
| TG 首页 `TG_ENTRIES` | **维持现状不动**（D1） | — | — |

**为什么要抽单一事实源**：CLAUDE.md 头号教训是「两处导航入口不同步」，已经踩过三次（风水静默失踪、居所编辑无入口、掷筊 bot CTA）。现状是 `NAV` 写在 `AppShell.tsx`、`TG_ENTRIES` 写在 `app/page.tsx`，两份硬编码列表靠人肉对齐。抽出来之后**门控条件只有一处**，TG 消费方即使取不同子集，flag 判断也共用同一个表达式。

⚠️ 抽取时 `TG_ENTRIES` 的**实际渲染结果必须逐项不变**（含「灵」已被 EP-jiao 摘除这一状态）。回归由 `app/__tests__/page.test.tsx` 现有用例守，一条都不许改断言。

### 4.2 项集变化对照

| | 现状 | A 之后 |
|---|---|---|
| 「照」首页 | NAV 首项；竖栏用 `NAV.slice(1)` 排除、由铜铃承担 | **移出 NAV**，铜铃即首页（桌面）。移动端见 §10 待定1 |
| 「账」账号 | 独立常驻项（EP-account-login 加的） | **移除**，并入「我的」（设计包 6c） |
| 「起」起盘 | 不在 NAV（只在 TG_ENTRIES） | **新增**到竖栏与九宫格 |

### 4.3 `NAV_COMPACT`

沿用「≥6 项时项内边距收紧到 6px」规则，但**基数变了**，三条边界测试必须按新项集重算（见 §9）。全 flag 关时竖栏 4 项 < 6 → 不收紧，原始不变量（「flag 全关时不得被收紧规则波及」，来自风水波1 最终评审 Blocking 4）继续成立。

## 5. 设计原语

先盘点既有的，**只补缺口、不重复造**。`components/ui.tsx` 现有 8 个导出与设计包对照：

| 设计包要求（02-components） | 现状 | 处置 |
|---|---|---|
| §2 强调手法（2px 朱砂左线 + 向右淡出底 + 朱砂粗字） | **无** | **新建** `Emphasis`，含横（`90deg`/`border-left`）与竖（`180deg`/`border-top`）两向 |
| §3 细线卡 `surface / 1px line / radius 8 / 无阴影` | `Card` 合规 | 保留 |
| §3 卡内分栏用 1px 竖线，不嵌套卡 | — | 由 `Card` 使用方遵守，写进注释 |
| §4 chip `padding 4px 11px; radius 4px` | `Tag` 是 `px-2 py-0.5`(8/2px)、12px | **改尺寸** |
| §4 胶囊 chip `radius 9999px; border 1px line; padding 5px 12px; 11.5px` | **无** | **新建**（或 `Tag` 加 `shape="pill"`） |
| §4 四化标签 17–18px，五行实底 + on-* 字 | `MutagenTag` 合规（h-18/radius-chip/五行底） | 保留 |
| §4 干支圆徽 26/34/46 三档 | `GanzhiBadge` size 任意、默认 44 | **收敛为三档**（`sm/md/lg`），默认 34 |
| §4 朱文方印 30–34px / radius 4 / border 1.2px | `SealIcon` | 核对后调整 |
| §4 唯一动作按钮 `padding 16–17px 0; radius 8; 16px/500; letter-spacing .16em` | `Button primary` 是 `px-6 py-3`、15px、无字距 | **新增 `variant="action"`**（满宽、字距），保留原 primary 给次要场景 |

### 5.1 一处正面冲突：`Card.topAccent`

`Card` 现有 `topAccent` 属性会画一条 2px 的五行/朱砂**顶边彩条**。这与设计包「强调只有一种手法」（README 硬约束 2）直接冲突——同一个视觉目的存在两种表达。

**处置：废弃 `topAccent`。** 先查证全仓消费方，逐处改为 `Emphasis` 或直接去掉。若某处确实需要「这张卡属于某五行」的语义，用 §4 的四化标签/chip 表达，不用顶边条。

> 这条不能顺手留着——留着就等于新设计上线第一天就有一条例外，而例外一旦有先例，「唯一强调手法」这条约束在后续 C 块的 8 屏里就守不住了。

### 5.2 `GanzhiBadge.highlight` 的 `boxShadow`

`highlight` 用 `boxShadow: 0 0 0 2px paper, 0 0 0 3px cinnabar` 画双描边。这是**用 box-shadow 画描边，不是投影**，与「零阴影」不矛盾（零阴影约束的是层次表达）。保留，但加注释说明，免得后人按「全站禁 box-shadow」误删。

## 6. 移动外壳

### 6.1 语境胶囊（左）

```
padding: 7px 14px 7px 11px; border-radius: 9999px
纸底页：background surface; border 1px line
压图上：background rgba(248,246,240,.82); backdrop-filter blur(14px); border 1px rgba(255,255,255,.5)
内容：BellLogo 17px (motion="ring") + font-serif 14px/600 当前语境词
```

**语境词**由页面提供，不是从 pathname 猜——`/spirit` 在不同阶段是「问事」或「圣筊」（03-screens 掷筊揭晓屏），`/calendar` 是「庚申·七月初三」。实现为 `AppShellContext` + `useShellContext(label)` 钩子，页面挂载时声明；未声明时回退到该路由的 i18n `nav.*` 标签。

**点击行为：进「我的」**（D6）。

### 6.2 菜单键（右）

```
44×44; border-radius 9999px; 底/描边同胶囊
三道横线 width 100%/100%/60%，第三道 cinnabar；height 1.5px; gap 4px; padding 0 11px
```
按下打开九宫格覆盖层；覆盖层内同位换 `✕`，**尺寸/底/描边不变**（避免位移抖动）。

### 6.3 外壳容器

```
padding: 56px 16px 0
```
`56px` 是状态栏安全区的设计值；实现时用 `max(56px, env(safe-area-inset-top) + 12px)`（05-open-questions 明确要求换成 env）。

### 6.4 删除底栏

`AppShell` 的 `md:hidden` 那段 `<nav>` 整个删除，`children` 容器的 `pb-24 md:pb-0` 同步改为 `pb-0`——底部不再有遮挡物。

## 7. 桌面与可达性

### 7.1 竖栏

现有实现**已经基本符合** `06-desktop` §1（82px / surface / 1px 右线 / py-24 / gap-8 / 铜铃 30px `motion="ring"` / 36×36 字符块 radius 4 serif 18 / 10px 标签 / 4px 圆点 / 过渡 .25s / 当前项墨底纸字）——设计包本就是照现有代码复刻的。**只改三处**：

1. 项集换成 §4.1 的 7 项
2. `profiles` 项 `margin-top: auto` 沉底，与功能项之间留出视觉分隔
3. `NAV_COMPACT` 按新基数重算

### 7.2 「我的 / 账号」可达性

- 移动端：语境胶囊 → `/profiles`（D6）
- 桌面端：竖栏沉底的「我」→ `/profiles`
- `/account` 路由**继续存在**；A 在 `/profiles` 页头加一条明确的「账号与登录 →」入口（不是嵌在正文里的文字链接）。真正的 6c 合并屏在 C 做。

> 为什么 A 就要管这个：EP-account-login（2026-08-21 owner 实测）的根因正是 `/account` 没有直接入口。A 移除了常驻「账」项，如果不同时补上桥接，就是把那个已修的 bug 原样造回来。

### 7.3 Telegram 冻结线

`AppShell.tsx` 的 `{!tg && (…)}` 就是冻结线，新外壳整个放在里面。`app/page.tsx` 的 `TG_ENTRIES` 与其 flag 门控**一行不改**。

⚠️ 但 §4.1 要把 flag 表达式抽进 `lib/nav.ts`，`TG_ENTRIES` 会改为消费它——这是**重构不是行为变更**，判据是 `app/__tests__/page.test.tsx` 现有断言全绿且一条不改。

## 8. 动效与无障碍

- 覆盖层进出用 `zjRise`/`zjFade`（既有），挂 keyframes——`globals.css` 的 `prefers-reduced-motion` 降级块才覆盖得到（04-motion 明确要求，禁止 JS 逐帧驱动）
- 铜铃在常驻位置用 `motion="ring"`（挂载敲一次），**不用 `idle` 常驻晃动**（04-motion §3）
  - ⚠️ 与并行进行的「风铃动效」任务重叠，需在其合入 main 后 rebase
- 覆盖层：`role="dialog" aria-modal="true"`、焦点进入后陷入、`Esc` 关闭、关闭后焦点归还菜单键
- 当前项 `aria-current="page"`
- `:focus-visible` 2px 朱砂 + `outline-offset 2px`（复用既有 `.zj-wheel-focus`）
- 菜单键与胶囊触控目标 ≥44px

## 9. 测试策略

实测：55 个 web 测试文件里**只有 7 个触碰 DOM/样式结构**，其余 48 个测的是路由/闸门/额度/数据流/API 契约。所以本轮测试风险集中在外壳一处，不是全面塌方。

| 类别 | 处置 |
|---|---|
| 行为测试（48 文件） | **一条不动**。它们是资产 |
| `components/__tests__/AppShell.test.tsx`（24 处结构断言） | **重写**。按新语义契约写，不是照抄新 class 名 |
| `app/__tests__/page.test.tsx`（TG_ENTRIES） | **断言一条不改**，作为 §7.3 重构的判据 |
| 其余 5 个结构测试文件（图表/native/BellLogo） | A 不碰（归 B / 风铃任务 / TG 二期） |

**新增覆盖**：
1. 九宫格开关（菜单键 → 覆盖层出现 / ✕ 与 Esc 关闭 / 焦点归还）
2. 九宫格项集随 flag 变化（全开 6 / 全关 3），**且不含 `profiles`**（D5 的判据）
3. 竖栏项集随 flag 变化（全开 7 / 全关 4）与 `NAV_COMPACT` 三条边界
4. 移动端不再渲染底栏（防止「删干净了吗」回归）
5. 语境胶囊：页面声明时用声明值，未声明时回退 `nav.*`
6. 胶囊指向 `/profiles`（D6 的判据）
7. `lib/nav.ts` 的 flag 表达式与两个消费方一致（单一事实源的判据）

关键改动照仓库惯例逐条做 **mutation 复验**（改坏必红）。

## 10. 待定

1. **移动端怎么回首页 `/`？** 九宫格 6 项不含首页，胶囊已被 D6 占给「我的」。
   **建议默认**：覆盖层里的胶囊按 2a′ 显示「照见」并链到 `/`（普通页面上胶囊显示语境词、链到「我的」；两者标签不同，行为不同是可读的）。**待 owner 在 spec 评审时确认。**
2. **`Card.topAccent` 的现有消费方**逐处怎么改，要等查证后才知道数量；若某处改动会影响 C 的屏，届时归 C。
3. 语境词的完整清单（照见/命盘/解读/问事/解梦/我的/境/圣筊/干支农历）由 C 逐屏落实，A 只建机制与回退。

## 11. 验收标准

- [ ] 移动端底栏消失；顶部胶囊 + 菜单键在全部 web 路由上出现且位置逐像素一致
- [ ] 九宫格：6 项、不含「我的」、当前项墨底纸字、下接七十二候列表（朴素版）
- [ ] 桌面竖栏 7 项、「我」沉底、`NAV_COMPACT` 边界三条重新核过
- [ ] `lib/nav.ts` 是导航项与 flag 门控的唯一事实源，三个消费方都从它取
- [ ] **TG 零变化**：`app/__tests__/page.test.tsx` 全绿且断言未改；TG 内手工过一遍首页与任一功能页
- [ ] `/profiles` 与 `/account` 在移动与桌面都可达
- [ ] `Card.topAccent` 全仓零消费方
- [ ] web 全量测试绿；`lint` 不新增问题（基线 2 errors/18 warnings，见 CURRENT.md 更正）；`tsc -p apps/web` 不新增错误（基线 7，`EP-web-typecheck-debt`）
- [ ] 关键改动 mutation 复验通过
- [ ] `prefers-reduced-motion` 下覆盖层无动画且功能完整
