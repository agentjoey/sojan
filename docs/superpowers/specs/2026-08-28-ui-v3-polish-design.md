# UI v3 打磨批（黄历清理 / 今日卡同源 / 胶囊与首页 / 过场全局化）设计

日期：2026-08-28 · 分支：feat/ui-v3-polish（从 main 切，含已合并的 C3+C4）· 不 push、不合并

owner 九条指令（原始编号保留，5 出现三次），经五个关键问题拍板后的定稿设计。

## 决策记录（owner 拍板）

1. 黄历范围 = UI 区块 + core 降级混入。almanacYi/Ji 字段保留（TG API 形状不变）；
   auspicious/caution 不再混入 almanac 前两条 → TG 端这两数组内容会变，属预期代价。
2. 首页今日卡 = 直接复用运势数据；无档案访客不显示今日卡。
3. 过场动画 = 路由切换播短版（~1.2s）+ 数据等待挂持续版（pending）；
   境的每会话首揭仪式与运的 zj.cast 每会话过场删除；命盘流式打字机不盖全屏；梦提交等待维持现状。
4. 胶囊风铃 = motion="idle" 常驻循环微摆（覆盖 ui.tsx 既有「导航位不持续晃动」注释，需同步改注释）。
5. 分支 = feat/ui-v3-polish，分 commit，不 push。

## 逐项设计

### 1) 去除黄历
- 删 `apps/web/app/calendar/page.tsx:377-384` 移动端黄历块（data-testid="huangli"）。
- `packages/core/src/daily/index.ts:173-174`：`auspicious`/`caution` 去掉 `...almanacYi.slice(0, 2)` 混入。
- locale：删仅被该块消费的键（calendar.almanac 等，逐个核消费方后删）。
- 测试：`calendar/__tests__/page.test.tsx:140` 改为「huangli 不存在」反向断言；
  core 断言混入行为的用例同步改写（断言 auspicious 恰为档案条目）。
- TG daily API（app/api/tg/daily/route.ts）不改。

### 2) 首页今日卡复用运势数据
- 抽共享 hook（如 `apps/web/lib/useDailyFortune.ts`）：运势页现有取数逻辑
  （客户端本地日期、dailyFortune、localStorage polish 缓存、meta 拼装）原样搬入，日历页改用之。
  只搬位置不改逻辑；日历页既有测试应全绿。
- HomeClient：客户端 getActiveProfile()；`undefined`（加载中）→ 第 7 项全局 pending 过场；
  `null`（无档案）→ 不渲染 TodayCard；有档案 → 与运势页逐字同源。
- 首页服务端候计算（page.tsx getCurrentSolarHou / revalidate 快照 / M7 时区注释）退役，
  日期/候/星期全部客户端本地时区（沿用 HomeClient 既有午夜 rollover）。
- 死 locale 键（home.today.polish/meta 等）核实无消费后删。

### 3) 胶囊「照见」+ 去首页 logo
- MobileShell：currentPath === "/" 时胶囊文字显 `t("common.brand")`（链接行为不变：
  关闭→/profiles，开→/）。
- 删 HomeClient.tsx:185-188 的 BellLogo+「照见」块。
- nav.home 键保留（AppShell 桌面竖栏 aria-label 在用）。

### 4) 胶囊风铃 idle
- MobileShell.tsx:139 `motion="ring"` → `"idle"`；同步改 ui.tsx:27-29 的设计注释（owner 拍板覆盖）。

### 5) 八卦转盘加深
- CompassWatermark：容器 opacity 0.14 上调 + 浅环 --color-line → --color-line-strong。
  档位在真实浏览器 402/900/1280 三档实测后定，报告写实值。

### 5b) 去「卷首」「目录」
- 删 HomeClient.tsx:191-193、239-241 两个 kicker；删 zh/en 的 kickerHero/kickerToc。

### 5c) 印章统一 zhu
- HomeClient.tsx:251：五个入口一律 variant="zhu"。TOC 处加注释说明 owner 拍板
  （ui.tsx 的 variant 语义注释是档案列表语境，不冲突）。

### 6) nav.spirit 小字 → 问事
- zh.ts:44 "掷筊"→"问事"；en.ts:38 "掷筊 (Jiao)"→"问事 (Jiao)"；更新两处注释。
- 页内掷筊按钮（jiao.throwCta）不动；TG 侧无此字，冻结面不动。

### 7) 过场全局化
- 新组件 `apps/web/components/RouteCasting.tsx`：usePathname 监听，路径变化播短版。
  首次挂载不播（首屏由 pending 覆盖，避免双播）。
- CastingOverlay 新增 mode="route"（~1.2s keyframes，globals.css 新 zjCastingRoute），
  标题用品牌词「照见」。mode="brief"/"pending" 保持不变。
- AppShell 在 {!tg && …} 内挂 RouteCasting（TG 冻结）。
- 各页加载早退统一换 CastingOverlay mode="pending"，标题沿用原文案：
  fengshui:538 / dwellings:120 / object:162 / chart:169 / calendar:170 / spirit:231 /
  dream:182（白屏 return null 一并修）/ profiles:123 / account:435 / 首页（第 2 项引入）。
  各页本地 Centered 若因此无人用则删。
- 删 fengshui 首揭仪式（revealing/sessionStorage zj.fsReveal）与 calendar zj.cast；
  境的盘扇区错峰入场（staggerIn）保留但脱离 sessionStorage 门控。
- 测试：CastingOverlay.test 补 route mode；AppShell/RouteCasting 新增「切路径播一次」断言；
  fengshui 两条首揭用例、calendar 的 sessionStorage 跳过逻辑改写为新机制断言，删除理由入报告。

## 验收基线（只增不减的口径沿用）

main 现状：core 192 · llm 279 · web 813 · tsc 7 errors · lint 2 errors/17 warnings · build 通过。
删除断言仅限「被删功能的断言」，逐条在报告说明；新断言按「回退实现必变红」标准写，
关键改动做 mutation 复验并记实际输出。

## 自查

真实浏览器三档（402/900/1280）用 dev-only fixture 桩（同上一批手法，playwright-core），
重点看：转盘加深档位、印章统一、胶囊照见+风铃微摆、过场切换/等待两处、今日卡有无档案两态、
黄历块消失。实际现象写进报告。
