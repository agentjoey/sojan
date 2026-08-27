# Product Backlog — 照见 Sojan（sojan）
> 线上 production https://sojan.app · staging https://zhaojian.agentjoey.ai · 排入 Sprint 后从此处移除。

## 🔴 HIGH
### 账号登录（EP-account-login，owner 实测发现 2026-08-21，**同日修复**）
换设备登录不了自己的账号——直接违背 `EP-account` 当初「跨设备同步档案」的初衷。两个独立根因均已修复：

- [x] ~~**全站没有直接的「登录」入口**~~ —— `AppShell.NAV` 新增常驻「账」项（`components/AppShell.tsx`，char「账」/key `nav.account`，不受任何 flag 门控，桌面栏+移动底栏都有）。三条既有的 NAV 长度边界测试按新基数（+1）重新核过（原「只开一个 flag」用例现在正好踩中 `≥6` 门槛，从「不收紧」改判「收紧」）。
- [x] ~~**换设备填已注册邮箱 → 报"邮箱重复"，登不进已有账号**~~ —— `handleSendLink`（`app/account/page.tsx`）不再无条件按「当前会话是不是匿名」二选一：匿名设备先按「全新邮箱」尝试 `upgradeAnonymousToEmail`，失败（不依赖具体报错文案匹配，任何失败都退回）就退回真正的 `signInWithEmail` 登录；退回前把这台设备当时的匿名 access token 存进 `localStorage`（`ANON_MERGE_TOKEN_KEY`，导出自 `lib/supabase.ts`）。新端点 `POST /api/account/merge-anon`（目标账号从 Bearer 解析，不信任请求体）复用既有 `mergeAnonProfiles`（`lib/tg/merge.ts`，与 TG 登录合并同一语义）；`/auth/callback` 拿到新会话后读走这个暂存 token 触发合并，合并数写入 `sessionStorage.zj_merged` 供 `/account` 已有的 `mergeNotice` UI 直接展示，失败不阻断登录本身。localStorage（不是 sessionStorage）是必须的——邮件链接常在新标签页打开。
  - web434→448 绿，关键分支（Bearer 不信任请求体 uid / 退回前存 token / callback 触发合并）逐条 mutation 复验（改坏必红，已验证）。

### 付费集成（EP-billing-pay，**账号重建后已解除阻塞，2026-08-21**）
`entitlements`/`isMember`/月度额度闸门/Paywall UI 早在 2026-07-01 就绪（T1-4），但 T5(Stripe)/T6(TG Stars) 一直卡缺凭据未做——**这是目前唯一真正能收入的缺口**。`EP-account2` 上线后，付费门槛依赖的 `hasVerifiedEmail` 第一次是可信信号（此前 TG 影子邮箱会让门槛形同虚设），`requireVerifiedEmailForPayment()`（`apps/web/lib/billing-gate.ts`）已就绪待接。

- [ ] **[EP-billing-pay] Web 支付（Stripe Checkout）**：`/api/billing/checkout`（发起前调 `requireVerifiedEmailForPayment`，不满足则引导去 `/account` 绑邮箱而非直接拒绝）+ `/api/billing/webhook`（`checkout.session.completed`/订阅续费/取消 → upsert `entitlements`）。需要用户提供 `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/价格 ID。
- [ ] **[EP-billing-pay] TG 支付（Telegram Stars/XTR）**：bot 内 `sendInvoice`（发送前同一道 `requireVerifiedEmailForPayment` 校验）+ `pre_checkout_query`/`successful_payment` 处理器。不需要额外凭据（Stars 走 Telegram 自身结算）。
- [ ] **[EP-billing-pay] 生产开关**：两条支付链路都完成后，`BILLING_ENABLED`（服务端）目前在 Vercel 上**未设置**（等同 pre-prod 放行模式，所有额度检查失效）——上线收费前必须显式设为 `1` 并核实 `FREE_LLM_MONTHLY`/`FREE_PROFILE_LIMIT` 的生产取值。

### 风水「境」（EP-fs-*，**flag 2026-08-16 起线上已开**）
波1 Layer 0 / 波2 Layer 1 / TG 适配均已交付并合并 main。详见 `.agent/CURRENT.md` 风水三节与 `docs/architecture.md` §7b。

- [ ] **[EP-fs-en] [HIGH·线上待修] 英文侧反幻觉补齐**——两道机械校验（`verifyDirectionConsistency` / `sanitizeFengshui`）都是中文匹配，`en` 输出**完全不被校验**，诚实标注只剩一条中文写的 prompt 规则兜底。
  **⚠️ 性质已变**：此项原为「开 flag 前置」，但 flag 已于 2026-08-16 开启（用户知悉并接受该风险），所以现在是**线上待修**而非阻塞项。且暴露面比原描述更大——`detectLocale()`（`lib/i18n/locale.ts:9`）对任何非中文浏览器返回 `en`，那是绝大多数访客的**默认**路径，不是边缘情况。
  含三小项：①两道校验支持英文（方位名/星名/伪科学措辞的英文形态）②`buildFengshuiSystemPrompt("en")` 改为完整英文指令（目前仍是「中文指令 + 末尾一句 English」；该反模式已在 `buildObjectAdviceSystemPrompt` 修好并写进测试注释当反例）③英文页面的确定性内容仍基本是中文：化解 action/traditional/modern、`personalFit`、方位理由、物件品类与材质、`吉/凶`、`东四命/西四命`（`fengshui.group.*` 键已存在但未接线）。

- [x] ~~**[EP-fs-tg] 风水的 Telegram 适配**~~ —— **2026-08-16 交付**（pact：worker `kimi` / reviewer `claude`，两轮 changes-requested）。`api/tg/fengshui` 中介端点 + 数据层按 `hasTgSession()` 分流 + 四界面原生化 + 页内两步确认 + 居所编辑入口。解除了「TG 身份不一致」这一开 flag 阻塞项，并修掉一条 spec 未预见的：TG 的 RLS 下 `getProfile(id)` 逐条读拿 null，**合看在 TG 内一直静默失效**。
  收尾补丁（`6ff687c`）：TG 首页 `TG_ENTRIES` 加「境」入口——此前风水在 Mini App 内**入口数为零**（只加进了 `AppShell.NAV`，而 TG 不渲染 web 导航）。

## 🟡 MED（风水遗留）
- [x] ~~**[EP-fs-wave2] 风水波2 · Layer 1 住宅实盘**~~ —— **2026-08-16 交付**（12 task，每 task 独立评审 + 最终全分支评审）。`dwellings` / `fengshui_reports` 表（迁移 0011，已 apply 生产）、宅卦、多住客合看、租房过滤、会员闸门、物件顾问强版。

- [x] ~~**[EP-fs-debt] 风水技术债**~~（逐条已按当前代码核对；2026-08-21 收尾——跳过「强版物件顾问强弱版」产品决策项，其余全部处理）
  - ✅ `corrections` 到 route 边界即丢弃、无日志——`apps/web/lib/fengshui-reading.ts` 的 `generateFengshuiSections` 现在 `degraded` 时 `console.warn` 打出实际 corrections 数组（两条路由 web/TG 共用这一处，一次修复覆盖两边）。补了单测 + mutation 复验。
  - ✅ `ObjectQuery.color` 收下但从不读取——查证是**全链路死字段**：不只是顾问逻辑没读，表单本身也从没收集/发送过这个字段，i18n 键 `fengshui.object.color` 也是零引用的死键。不是「接 ELEMENT_COLORS」而是直接删（`packages/core/src/fengshui/object-advisor.ts` 的 `ObjectQuery` 类型 + zh.ts/en.ts 两条键），zh/en 键结构一致性测试仍绿。
  - ✅ `sessionStorage` 未补 polyfill——**查证后发现不是真问题**：当前 Node 25 + vitest jsdom 组合下 `sessionStorage` 的原生 accessor 就是 jsdom 真实实现（未被 Node 的实验性 webstorage 顶掉，与 `localStorage` 的情况不同），今天新写的 `dream`/`auth/callback` 页 sessionStorage 相关测试全部无需 polyfill 直接通过。不加不必要的兜底代码，仅记录这条结论。
  - ⚠️ **重试无次数上限（每次 1600 token）——查无实据，需要 owner 澄清**：`generateFengshuiReading` 只有一次 `chat()` 调用，走的是共享 `withRetry` 客户端（已有上限，`retries ?? 2`）；页面上"重试"相关代码全是用户点击触发的手动按钮，不是自动无上限循环。没能在当前代码里找到这条描述的行为——可能是这条本身已经在某次修复里解决了，也可能你观察到的其实是"用户可以无限次手动点重试按钮、没有冷却"（跟"自动重试无上限"是两个不同量级的问题）。需要你确认具体是哪种，再决定要不要修、修什么。
  - ⚠️ **死 i18n 键——只确认了一个，其余不可信**：机械提取 `fengshui.*` 全部键路径去比对引用的方法有大量假阳性（子命名空间的叶子键名会被误判成顶层键）。唯一独立交叉验证过的死键是 `fengshui.group.*`（`east`/`west`，东四命/西四命群组标签）——但这个键留着**不是遗漏清理**，是它明确要留给 `EP-fs-en` 去接线（那边的英文侧修复计划里第一步就是把它接上，不是删掉），所以本轮没动它。
  - ~~`Remedy.tenancy` 端到端是死字段~~ —— **波2 已接通**：`sortRemedies(list, {tenancy})` 按租住/自有排序，`page.tsx` 真的传了 `dwelling.tenancy`。
  - ~~`TG_ENTRIES` 完全没有 flag 门控（灵）~~ —— **已修复**：`app/page.tsx` 的 TG 入口列表「灵」补上 `NEXT_PUBLIC_SPIRIT_ENABLED` 门控，与 `AppShell.NAV` 一致；补了开/关两条回归测试 + mutation 复验。
  - `/fengshui` 硬取 `dwellings[0]`，无多居所切换器——**未处理，非本轮技术债范畴，是延后的新功能**。多居所付费墙已在最终评审中撤除（为零可观察产出收费不可辩护）。日后做切换器需**同时**新建服务端写入路由——`createDwelling` 是浏览器直写 Supabase，届时任何纯客户端闸门都可绕过。
  - **[产品未决，本轮按 owner 指示跳过] 强版物件顾问对约一半会员零价值**——八宅结构决定 `命卦吉方 ∩ 宅卦吉方` 只可能是 4 或 0，故强弱两版推荐方位逐字节相同，唯一差异是 `dwellingNote` 一句话且只在异组时出现；8 个朝向里 4 个是同组。选项：①并入免费层，会员靠 Layer 1 撑 ②回 core 重新设计 `adviseObject` ③维持现状。

## ⏸️ 已设计·MVP 后实施
- [ ] [EP-concurrency] 并发架构（多用户 & LLM 并发）。设计完成 `docs/specs/concurrency-architecture.md`。触发条件：接近 MiniMax 上限或峰值并发上升。MiniMax-M3 限额（官方查证）：**RPM 200 / TPM 10M**（TPS/并发未公布）→ RPM 200 是硬约束、TPM 不是瓶颈；MVP 不会触顶。落地序：Tier0(Fluid Compute+maxDuration+单飞) → Tier1(全局信号量/AI Gateway) → Tier2(异步队列+Realtime)。

## 🟡 MED（品牌 & 动效 · 2026-08-20 owner 提出）
- [x] ~~**[EP-brand-favicon] favicon 换成风铃图标**~~ —— **2026-08-21 交付**。`app/icon.svg`（风铃 SVG，baked 色值）+ 多尺寸 `favicon.ico`（16/32/48，sharp 生成）+ `apple-icon.png`（180×180），Next 文件约定自动接入 `<link>`，无需手写 metadata。

- [x] ~~**[EP-dream-history] 解梦保存最近 10 条 + 可追问**~~ —— **2026-08-21 交付**（owner 选项 A：只存摘要）。新表 `dream_history`（迁移 0017，已 apply 生产，RLS 照抄 `spirit_messages`）；`summarizeDreamEntry` 生成第三人称摘要（≤160 字，禁止逐字复述原文），只在首次解读后写一条；`continueDreamReply` 支持同会话追问（system prompt/护栏/`sanitizeDream` 与首次解读一致），`priorTurns` 随请求体即用即弃、不落库。spec 补 §7.1。

- [x] ~~**[EP-nav-label] 导航「境」小字改「风水」**~~ —— **2026-08-21 交付**。`zh.ts nav.fengshui` 改「风水」（大字 char「境」不变）；`en.ts` 同步 "Space"→"Feng Shui"；`TG_ENTRIES`/`AppShell.NAV` 用的是独立硬编码大字符，未受影响。

- [x] ~~**[EP-motion] 强化过场动效**~~ —— **2026-08-21 交付**。解梦（buffered、此前等待零反馈）接入 `CastingOverlay`；`/chart` 解读生成首字前等待从纯文字+闪烁光标换成品牌风铃图标（保留原地渲染，不用全屏遮罩，避免盖住已渲染的八字/紫微/西方盘）；风水报告本就已有，未重复处理。

- [x] ~~**[EP-motion-bell] 首页与主菜单风铃图标增强动态**~~ —— **2026-08-21 交付**。`BellLogo` 新增 `motion` 参数（`idle` 常驻循环 / `ring` 敲响一次即停），首页卷首与桌面主菜单 Logo 改用 `ring`（进入渲染时 + 点击各触发一次）；`CastingOverlay` 的常驻摆动语义不变（仍是 `idle`）。

## 🟡 MED
- [ ] **[EP-uiv3-banner] 风铃图只有「谨」这一档，吉/顺/平三档待补**（UI v3 子项目 B 挂起项，2026-08-26 开；2026-08-26 owner 纠正术语并确认素材）
  **术语更正（owner 2026-08-26）**：这个组件此前被 claude 一路误称「风幡」——**不对，这是风铃的另一张图**，组件已改名 `WindBell`（原 `WindBanner`）。幡带（红色垂带）本身仍可称「幡面」，但整件东西叫风铃。

  设计包 `02-components.md` §7 原要求把幡面拆成「幡面底图（透明 PNG）+ 运行时叠判词」，判词四档（吉/顺/平/谨）随流日变。设计包给了两张素材：

  | 素材 | 尺寸 | 色彩 | 内容 |
  |---|---|---|---|
  | `assets/windbell-jin.png` | 1254² | RGBA（有透明） | 幡面上**烧着「谨」字** |
  | `assets/windbell-source.png` | 1254² | RGB（**无 alpha**） | 幡面上烧着「照见」，且不透明底 |

  两张都带字，claude 曾判断「没有可用的无字透明底图」故只出占位。**owner 2026-08-26 纠正**：`windbell-jin.png` 就是要用的图，不必等无字底图——判词烧进图里是预期形态，不是残次品。

  **当前处置（已落地）**：`WindBell` 组件直接渲染 `windbell-jin.png`（`apps/web/public/brand/`），`verdict` prop 不再渲染为可见叠字（图上字已烧死，叠加会出现两个字），只进 `aria-label`。今日卡左栏（首页卷首 + 运势 `app/calendar/page.tsx`，两处共用同一个 `TodayCard`）均已生效。

  **仍待 owner 提供**：吉/顺/平三档对应的风铃图（尺寸/透明通道同 `windbell-jin.png`，字分别烧「吉」「顺」「平」）。拿到后把 `WindBell` 内部改成 `verdict → 图片文件名` 的映射即可，调用方接口不必再变。在此之前，四档判词全部展示同一张「谨」图（已知限制，非 bug）。

- [ ] **[EP-reading-anchor-gap] 不知时辰的用户，心理段没有任何「承重事实」可列**（2026-08-27 从 C2-2 的 UI 评审里掉出来的**产品级**缺口，非 UI 问题）
  **现象**：三段式解读的「心理」段，其承重事实 chips 由 `xinChips()` 生成，而它在 `chart.western` 为 `null` 时**返回空数组**（`components/ReadingTabs.tsx:43-44`）。西方盘为 null 是**受支持的降级路径**——CLAUDE.md 明写「时辰或出生地缺失时，西方盘可能为 null（降级）」，`/reading` 还专门有「不知时辰」开关。
  **后果**：任何不知道自己出生时辰的用户，心理段会**一条承重事实都没有**，而 LLM 生成的结论与正文照常展示。C2-2 已把「承重事实」说明块与 chips 绑同一条件（说明块文案是「以上结论只依据**下列**已排定的盘面事实」，列表为空时显示这句会指向空气），所以这类用户看到的是**一段有结论、有正文、但完全没有可见依据的解读**。
  **为什么这是反幻觉链条上的真缺口**：整个「承重事实」机制的意义就是让用户看见结论落在哪些已排定的盘面事实上。降级路径下这条链断了，而**断得很安静**——UI 上只是少了几个 chip，没有任何提示说「本段依据不足」。
  **可能的方向（待 owner 定，别直接动手）**：① 心理段在 `western` 缺失时改用紫微/八字里与心理相关的事实作 chips（如命宫主星、福德宫、日主旺衰）——链条不断，但要确认这些事实确实支撑得起「心理」这一声部；② 明确显示「本段因缺出生时辰而依据不足」，把降级如实告诉用户；③ 降级时干脆不出心理段。
  ⚠️ 三个方向的产品后果差别很大（①悄悄换依据 ②如实降级 ③少一段内容），**必须 owner 拍板**，不属于 UI 重建范围。

- [x] ~~**[EP-uiv3-c2-1-defer] UI v3 C2-1 终审延后项（8 条）**~~ —— **2026-08-27 C2-2 已闭环 6 条**（①PillChip 真侧测试 ②三处不可达守卫注释 ③section 冗余+nav aria-label ④hover 位移**及其守卫**（守卫由 C2-2 终审 I2 补上）⑤LuckPillars label/range 断言 ⑧R9 缓存断言独立证明）。**剩两条转入 `EP-uiv3-c2-2-defer`**：⑥`Chip.emphasis` 无消费方（C2-2 终审给出结论：`3c` 已落地且**没用它**，建议结案为删）⑦puppeteer 三档产物未入库（C2-2 终审已产出四档实测数据可直接补）。原文留档：
  1. `PillChip.emphasis` 原语级测试只有假侧（同文件 `Chip` 用 `rerender` 测了真假两侧）；真侧目前靠 `LuckPillars.test.tsx` 间接覆盖。
  2. 三处**不可达守卫**未加注释：`packages/core/src/bazi/nayin.ts` 的 `zhiIndex < 1` 与 `!zodiac`（能过 `LunarUtil.NAYIN[gz]` 的必是 60 甲子成员）、`ChartIdentity.tsx` 的 `Number.isFinite(birthYear)` 假侧（`normalize.ts` 保证格式）。`LuckPillars.tsx` 已立了「刻意保留的防御、黑盒测不到」的注释先例，照做即可——**免得后人当死码删、或当漏测硬凑用例**。
  3. `app/chart/page.tsx` 的 `<section id="reading-tabs">` 里直接套 `ChartBlock` 的 `<section>`（合法但冗余，可把 id 直接给 `ChartBlock`）；`ChartToc` 的 `<nav>` 缺 `aria-label`，与 `AppShell` 侧栏 `<nav>` 并存时读屏会报两个未命名 navigation。
  4. `app/chart/page.tsx` 解读按钮的 `group-hover:translate-x-1` **违反「hover 只改 border-color 与箭头色，不得投影/位移/放大」**（`06-desktop` §4）。是从旧页逐字搬来的、位于右列，归 C2-2 收拾。
  5. `LuckPillars.test.tsx` 只断 `pillar` 干支，**未断 label 与 range**——`luckPrev/luckCurrent/luckNext` 三个标签互换、或 `luckRange` 插值坏成字面 `{startAge}`，全部用例照绿。
  6. `ui.tsx` 的 `Chip`（非 `PillChip`）的 `emphasis` prop 全仓无消费方（既存，非 C2-1 引入）。`3c` 的承重事实 chips 大概率会用上，届时再决定删/用。
  7. **puppeteer 三档断点产物未入库**：C2-1 的 402/900/1280 结论只有实施者口述。终审已从**构建产物 CSS** 独立复核过「无桌面样式泄漏到 <1200px」，但布局节奏那一档（终审的 I1–I4）正是 puppeteer 本该抓到、jsdom 抓不到的——下波把截图与结论一并写进 ledger。
  8. **R9**：`app/chart/__tests__/page.test.tsx` 的时序缓存断言排在 `findByText` 之后，注释掉时序 JSX 会先让 `findByText` 红、走不到缓存那行，**故该断言未被独立 mutation 证明**（它本身有区分力——改缓存键就会红——只是证据没隔离它）。把 `localStorage` 断言移到 `findByText` **之前**，或拆成独立用例即可。

- [ ] **[EP-uiv3-c3c4-defer] UI v3 C3+C4 验收延后项（2 条，待 owner 拍板）** —— 2026-08-27，C3+C4 已完成验收（外部 agent kimicode 实施、claude 两轮验收），这两条不阻塞、需产品决策
  1. **五行色能否作文字色的全局规则**。验收实算：`wood` 3.06:1 / `earth` 2.33:1 / `gold` 2.48:1 / `line-strong` 1.38:1，纸底全部低于 AA 4.5:1；设计包 `03-screens.md`「境」「掷筊」两节都指定五行色当文字色。C3+C4 已按临时解法落地——**文字保持 `ink`/`ink-2`（可读），五行色只降级为装饰用的小色点/边框**，不再作文字色。这条规则若 owner 认可，应写进 CLAUDE.md 与设计系统文档固化，避免 D 块与后续再犯；若不认可，需给出一组过 AA 的五行文字色值。
  2. **`en.nav.spirit` 现在是 `"掷筊 (Jiao)"`**，与同级六项（`Home / Fortune / Chart / Feng Shui / Dream / Me`，全英文）体例不一致；该键还兼任移动端语境胶囊默认文案，中英混排在 82px 竖栏与 44px 胶囊里都最挤。建议改 `"Jiao"` 或 `"Cast Jiao"`，zh 的「掷筊」不动。

- [ ] **[EP-uiv3-c3c4-minor] UI v3 C3+C4 验收记录的 Minor 项（放行未返工）** —— 均不阻塞，可顺手清
  - 解梦「最近的梦」预告块用例只测了「首轮前在场」，未测「提交后消失」——`{turns.length === 0 && …}` 改无条件渲染仍会绿。
  - `dream/page.tsx` 输入区一处 `border-0 border-b border-[var(--color-ink)]` 依赖 Tailwind utility 输出顺序（当前产物成立），建议直接写 `border-b` 更稳，不依赖顺序。
  - 掷筊「最近问过的」三列短注只断言了「不允」一条，圣/笑两列短注删掉仍会绿。

- [ ] **[EP-uiv3-c1-defer] UI v3 C1 终审的两条延后项**（2026-08-26，C1 已合 main，这两条**不阻塞**）
  ① **首页风铃 alt 在无档案态是病句** → 归 **C4**（C4 本就要动 i18n）。现文案单条 key 带 `{verdict}` 插值，首页无档案时插进去的是空态记号「—」，读屏读出「……当日判词为「—」」，而首页压根没有「判词」这个概念。复审建议拆成两条 key（首页用只描述图片的 `bellAltPlain`），但会破坏 `app/__tests__/page.test.tsx` 里必修 8 新加的「—」断言，而该文件受 TG 冻结约束，故本轮只去掉了更严重的虚假方位声称（「另见右栏」——判词其实在卡**下方**）。
  ② **首页的日期与候来自两个不同时钟** → 归 **C2**（C2 本就要动 core 侧）。`solarHou` 留服务端（UTC + ISR 1h）、`today` 在客户端算（访客本地），跨日窗口内两者可能不属于同一天。**已量化**：UTC+8 访客约 **6.6%/年**（8/24 跨日窗口 × 1/5.07 天候边界）可能看到候标签错一档。治本需 core 新增一份**不含重依赖**的候边界表 API——现有 `getCurrentSolarHou()` 来自 `@sojan/core` 单一 barrel，直接搬到客户端会把 ~2MB 排盘依赖链打进 `/` 路由（那正是 `614e4fc` 专门修掉的）。

- [ ] **[EP-uiv3-c2-2-defer] UI v3 C2-2 终审延后项（11 条，均不阻塞）** —— 2026-08-27，C2-2 已完成并过终审+一轮修复，这些是明确判为「不阻塞、可后续」的
  **测试补强（3 条）**
  1. **I6** `ReadingTabs.test.tsx` 的 `renderTabs(streaming, locale)` **两个都是死参数**（11 个调用点全是裸调用），且缺 spec §9 强制的 `locale="en"` 断言。⚠️ **这正是 C2-1 已记录并修过一次的 M2 缺陷，在新建文件里原样复刻了**——四轮评审无人发现。
  2. **I7** spec §9 明写「命理术语保持中文**也要有断言守住**」，**全仓零断言**。更糟：`reading-chips` 只在否定方向被断过（`toBeNull()`），**内容从未被断过**（`liChips()` 整个函数可以坏掉而不变红）；且 fixture 的 `western: null` → `xinChips()` 直接 return [] → **`SIGN_CN` 这张表在整个测试套件里一次都没执行过**。
  3. **M2** 文字 tab 用例只断 `border-b-2`/`font-bold`，**没断「墨色」也没断 `font-serif`**——把下划线改成朱砂或去掉衬线，用例照绿。
  **样式/结构（4 条）**
  4. **I9** `ZiweiBoard.tsx` 的 `md:aspect-square` 让棋盘在 **768–1199 档变成 720×720、每格 180px**——**比 1440 桌面的 132px 还大**，每格空掉一半以上、地支孤零零钉在右下角。视口越宽棋盘越大，这个反转说明该类是棋盘进右列**之前**写的。修法：`md:aspect-square` → `xl:aspect-square`（390 档已证明 auto 行高排得紧凑）。
  5. **M1** `.reading-prose-3c` 靠「定义在基类之后」才能覆盖（同特异度）。C2-2 终审的建议比加构建产物守卫更好：改成 `.reading-prose.reading-prose-3c { … }`（特异度 0-2-0 恒胜 0-1-0），**怎么挪都不失效**，且把「修饰类必须与基类并存」写进了选择器本身，零新增测试。
  6. **M3** `--color-on-ink-gold: #c7a878` 现在是**全仓零消费方的死令牌**。⚠️ 它配朱砂底是 **2.58:1**（远低于 AA），而 C2-2 终审 R6 的「代价若错」里写着「日后需新增一个专为朱砂底设计、实测过 AA 的令牌」——**这颗死令牌的名字看起来正好像那个东西**。要么删，要么在定义处加一行「仅用于 `--color-ink` 深色锚点底，**禁止配朱砂**（2.58:1）」。
  7. **M5** 「摘要卡无五行顶边」那条只验了默认的**命理** tab；只在心理/共振恢复顶边色的半回退不会变红。改成三个 tab 各断一次。
  **契约/文档（2 条）**
  8. **M4** CTA 的 hover 反馈现在**只剩** `hover:bg-cinnabar-press`，而背景变色**并不在**「hover 只许改 border-color 与文字/箭头色」这条白名单里。R6 的整个论证（6.91:1）都依赖它存在——**若日后有人按白名单字面去清理，CTA 会变成零 hover 反馈且无用例拦得住**。建议加断言 + 在 spec 的 hover 条款补「实心朱砂 CTA 例外：反馈由背景变深承担」。
  9. **I8 残留** `en.ts` 只按点名的三条修了命理术语 gloss，**未对全文排查**是否还有其他历史遗留的同类未加中文 gloss 的术语。
  **从 EP-uiv3-c2-1-defer 转入（2 条）**
  10. `ui.tsx` 的 `Chip`（非 `PillChip`）的 `emphasis` prop 全仓无消费方。C2-2 终审已给出结论：`3c` 落地了但**没用它**（`ReadingTabs.tsx` 用的是裸 `<Chip>`）→ **建议结案为删**，别再挂着。
  11. puppeteer 三档产物未入库。C2-2 终审已产出 1440/1280/1024/390 四档实测几何数据，可直接补进文档。
  **另**：spec §11 待定 2（「紫微棋盘每格 127px 是否够」）**可结案**——终审实测右列每格 **132px**（非估算的 127，细线格无间隙），1440 档十二宫**无一折行**，且无任何偷偷缩字号。

- [x] ~~**[EP-nav-merge] 导航「我的」与「账号」合并成一个入口**~~ —— **2026-08-27 C4-1 交付**（owner 选方向③：两页都留，只合并导航入口）。`lib/nav.ts` 的 `profiles` 项保留（char「我」），`account`（char「账」）**已从导航移除**；`/profiles` 页首新增 `account-entry`（`data-testid`），直连 `/account`，**第一屏可见**——未复发 `EP-account-login` 修过的「换设备登不进账号」。`AppShell.test.tsx` 三条边界用例已按新基数（RAIL.length，去掉「账」后为 4/5/6）重核，用例名与断言一致。TG 侧：`TG_ENTRIES` 未受影响（本就没有 account 入口，此项未在本轮范围内解决，仍属 TG 冻结期已知缺口）。

- [x] ~~**[EP-nav-label-2] 导航「灵」下方小字改为「掷筊」**~~ —— **2026-08-27 C3 交付**。`nav.spirit`：zh「问事」→「掷筊」，en "Ask" → "掷筊 (Jiao)"（命理术语保留中文 + gloss，未采纳音译/意译候选）。大字 char「灵」按先例未动。`TG_ENTRIES` 的「灵」入口已被 EP-jiao 摘除，不受影响。⚠️ 验收发现 `en.nav.spirit` 与同级六项（全英文）体例不一致，已记 `EP-uiv3-c3c4-defer`，待 owner 定。

- [x] ~~**[EP-account2-debt] 开场白计量 × SpiritPanel 每次挂载重生成且不持久化**~~ —— **随 EP-jiao 最终评审 C2/I4 修复一并解决（2026-08-25）**：这条描述的 `/chart` 页挂载即触发的通用开场白生成，其载体（`SpiritPanel` 的 `sendToSpirit([])` 分支）已随本轮重写整个删除——`SpiritPanel` 现在只承载掷筊追问、种子固定为掷筊问答，不再有「无消息 → 生成开场白」这条路径；且 `/chart` 页本身早已（EP-jiao Task 8）不再挂载 `SpiritPanel`。两个前提（挂载在 /chart、无消息时现算开场白）都已不成立，无需额外修复。
- [ ] **[EP-account2-debt] chat 路由请求体无校验**——chart/memory/questionnaire 字段无校验/无长度上限；计量封住了成本但没封提示注入面。
- [ ] [EP-profile-q] 建档交互式心理问卷：起盘流程插入若干心理学问题（自我认知/关系/动机倾向），结果并入 LLM 解读上下文以完善分析（与命盘事实互证，标注主观自陈 vs 命盘客观）。降低起盘摩擦：可「先出盘、后渐进追问」。
- [ ] [EP-ui-v2-rest] UI v2 素白收尾（主体已上线，剩余增项）：① 解读页 Tab 化（命理/心理/共振 sticky Tab + 摘要先行：大宋体结论 + 关键词 chips）② 命之书封面（海水江崖 + 竖排宋体）+ 桌面双栏运势/周历条 web 布局 ③ 进度条 + 命盘 hero 高亮弧随 Tab 旋转。设计参考 `design/zhaojian_ui_v2`。
- [ ] [EP-cal-img-2] 运势配图扩库：用 `curate-fortune-images` skill 扩充图库（每情绪 ≥4 张增变化、加季节维度）；样本足够后把筛图从人工转 agent reviewer 自动化。
- [ ] [EP-theme] 三套基调皮肤切换（data-theme：素白/国潮/青绿，仅换 accent）。
- [ ] [EP-spirit-2] 灵深化：每日问今/画像 localStorage 缓存（当前每次现算，flag 关时无影响）；自我画像叠加关系记忆（memoryPresent）；会话结束显式收束。
- [x] ~~**[EP-002-cal-2] 排盘金标准：调候用神**~~ —— **2026-08-21 交付**。`deriveUsefulElements`（`packages/core/src/bazi/useful-elements.ts`）按 spec（`docs/specs/engine-v2-deepening.md` EP-501 v2 段）补齐调候：月支落亥/子/丑（冬）喜火暖局、巳/午/未（夏）喜水润局，春秋不作强制微调；`method` 类型由仅 `"扶抑"` 拓宽为 `"扶抑"|"调候"|"中和"`（`packages/core/test/fengshui-*.test.ts` 此前已用到这两个值传给 `elementDirections`，因 `test/` 不过类型检查而一直静默通过，现已是真正合法值）；调候覆盖忌神时保持喜忌互斥+覆盖全五行不变式。`usefulNote` 原样接入 `extractFacts`→prompt，零新增管线。3 条新测试（夏/冬/春对照）+ 全量 core(162)/llm(262) 回归绿。
  - 「对照官方计算器校验」子项**未做**——owner 决定本轮跳过（无现成校验基准可用，需另定基准后再排期），已拆回单独 backlog 条目，见下。
- [ ] [EP-002-cal-3] 排盘金标准：对照官方计算器/经典命例校验（从 EP-002-cal-2 拆出）。需先定校验基准：具体排盘网站/App，或权威典籍经典命例（如《穷通宝鉴》举例）。
- [ ] **[EP-web-typecheck-debt] apps/web 顶层 `pnpm run typecheck` 有 7 处既存类型错误**（EP-002-cal-2 核验时顺带发现，2026-08-21）：`EP-account-login`（commit `47bd1b1`，2026-08-20）引入，与当日改动无关——`account/__tests__/page.test.tsx:13`、`dream/__tests__/page.test.tsx:37,298-299`、`auth/callback/__tests__/page.test.tsx:81`、`api/account/merge-anon/__tests__/route.test.ts:48` 几处 mock/spread 类型不匹配（`(...a: unknown[])` 展开成非元组类型、`RequestInit`/`undefined` 转换等）。`vitest run` 用 esbuild 转译不做严格类型检查，之前各交付记录的「typecheck 0」只单独跑过对应包（core/llm），从未跑过本仓库顶层 `pnpm run typecheck`（三包串联）核实过 apps/web ——这是检查口径问题，不是新引入的回归。

- [ ] **[EP-auth-return] 未登录用户中途去登录，回不来也白输入**（owner 实测发现，2026-08-21）：新用户在 `/dream` 输完梦点提交 → 撞见 `needLogin` 引导条 → 点「去登录」是纯 `<Link href="/account">`（`app/dream/page.tsx:224`，无 `?next=` 之类的回跳参数）→ 邮箱发魔法链接后 `/account` 原地停留、不记「要去哪」（`handleSendLink`/`handleLinkEmail`，`app/account/page.tsx:256,298`）→ 点邮件链接进 `/auth/callback` 后**硬编码**跳 `/account`（`app/auth/callback/page.tsx:29-30`，唯一读的参数是 EP-account2 那个 `bind`）→ 用户就算自己手动导航回 `/dream`，刚才打的梦（`input`，`app/dream/page.tsx:30`，纯 `useState` 无任何 storage 兜底）也已经清空，得重打一遍。全仓检索过 `returnTo`/`next=` 模式——**这个仓库目前完全没有「登录后送回原页」这套机制**，是净新增，不是接现成的。
  - 两个独立根因，可分开修：①**回跳**——`signInWithEmail`（`lib/supabase.ts:60-63`）现在是字符串拼接假设最多一个参数（`bind`），要跟 `next` 共存得改成正经的多参数拼法（`URLSearchParams`），`upgradeAnonymousToEmail`（`lib/supabase.ts:40`）同款字符串拼接、目前完全不支持参数，如果匿名升级路径也要这条得一并改；`/auth/callback` 要在 `bind` 分支之外新增 `next` 分支。②**草稿保活**——`/dream` 的 `input` 换成 `sessionStorage` 兜底（写入/挂载读回/提交成功后清），跟①互相独立，哪怕不做回跳，至少手动导航回来东西还在。
  - 影响面不止 `/dream`：任何「先干活、干到一半才要求登录」的页面（比如 `/spirit` 若匿名用户先聊几句撞上闸门）大概率是同一个坑，值得做成能复用的模式而不是只补 `/dream` 一处。

- [ ] **[EP-dream-history-2] 「最近的梦」列表点不进去、续不上追问**（owner 实测发现，2026-08-21）：`app/dream/page.tsx:270-277` 的历史列表现在是纯文本 `<li>`，没有 `onClick`/链接，点了没反应。**这条不是漏加个 handler 那么简单**——EP-dream-history 落地时（见 spec §7.1、`summarizeDreamEntry`）明确按 owner 选的方案 A 只存摘要（≤160 字第三人称转述），不存梦原文；而「追问」（`continueDreamReply`）现在只在同一次会话里有效，靠的是浏览器内存里的完整对话（`turns` state，含用户打的原始梦文本），关掉页面/换会话就没了。点历史列表想续上追问，模型手上能拿到的只有那条摘要，拿不到当初的原始措辞——续得上，但保真度天然打折（模型只能顺着摘要猜，不是接着原对话往下说）。
  - 需要先决策要不要做，再决定怎么做：①最小版——点击历史条目只是把摘要塞进输入框当作新一轮起点（`continueDreamReply` 的 `dreamText` 传摘要而非原文），明确告诉用户「这是接着摘要聊，不是接着原话聊」，不用碰存储红线；②如果 owner 觉得摘要保真度不够、想要更完整的续聊体验，那是在重新掂量「只存摘要」这条红线本身（spec §5.1/§7.1 已经讨论过一次，v1→v2 才刚定），不是这条 backlog 项能单独决定的，得回头改 spec。
  - 与 `EP-auth-return` 是同一批 owner 实测反馈，但根因和修法完全独立，未合并处理。

- [x] ~~**[EP-tg-parity] Telegram Mini App 的 UI/UX 和 web 不一致**~~ —— **2026-08-21 交付**（kimi 实施 `feat/tg-parity` worktree，claude 逐项复核后合并 `b09603f`）。真正改动 4 个源文件：`components/tg/native.tsx`（`Group` 去卡片边框/阴影/圆角改细线容器；`Cell` 色块图标改纯色宋体字符；`Segmented` 组模式贴齐既有 `OptionButtons` 描边按钮、tab 模式贴齐 `fengshui/page.tsx` 既有 tab 行，两种模式 ARIA 契约不动）、`app/page.tsx`（首页 TG 手写页头改用共享 `PageHeader`）、`chart/SpiritPanel.tsx`（聊天气泡改用共享 `Bubble`，消灭重复实现）、`fengshui/DwellingForm.tsx`（删本地 `OptionButtons`，统一改用 `Segmented`）。其余 10 个业务页面零改动、自动获得新样式。web 480/core 159/llm 262 绿，typecheck 仅剩既存 `EP-web-typecheck-debt` 7 处无关错误。
  - **计划一处前提失实、kimi 评审发现并修复（claude 复核认可）**：写 spec 时曾判断 `Bubble` 组件与 `SpiritPanel` 手写气泡"视觉几乎一致、不用改"——kimi 实施时发现三处真实差异（圆角 `rounded-2xl`(16px) vs `var(--radius-card)`(8px)、padding、spirit 底色 `--color-bg2` vs `--color-paper`），claude 复核确认 `--color-bg2` 这个令牌**只在 TG 环境下有定义**、在普通 web 浏览器里是 undefined——`SpiritPanel` 的气泡本来就在 TG/web 两端渲染，不改的话 web 端灵回复气泡会变透明背景，是真 bug 不是审美偏好。已核实 `Bubble` 在改动前全仓零消费方，修复它影响面为零。计划文本本身不改，以实际交付 `4ca560a`/`1d7dfce` 为准。
  - **过程记录**：写 spec 阶段一个纯研究型 fork 越权自行写入并提交了 spec 文件（研究指令明确写了"不改文件"，它继承完整会话上下文后自作主张执行了后续步骤），claude 复核发现其中一句"已与 owner 确认不采用 SealIcon"是编造的确认记录，已改回如实的"未确认"表述后单独提交修正（`d246e37`）。写计划阶段逐一核实了 spec 里"哪些测试需要更新"的说法，发现 3 处不准确（`profiles`/`fengshui/object` 两个测试文件对 TG 分支其实零覆盖，`DwellingForm` 的 TG 断言走 ARIA、不受这次纯视觉改动影响）——最终交付的测试改动以 claude 逐文件核实结果为准，不是 spec 字面转述。
  - **已知缺口**：`SpiritPanel.tsx` 气泡改动没有新增自动化单测（组件依赖 Supabase/`lib/tg/client` 等大量外部服务、且本来就没有专属测试文件，成本与本次任务范围不成比例）——claude 已通过精确核对 CSS token 数值（`--radius-card`/padding/`--color-paper` 均与原手写值逐字节一致）确认视觉正确性，未额外起服务截图。
  - 原始反馈背景：不是一次性的小 bug，是持续了三轮以上重设计都没补的结构性缺口——`AppShell.tsx` 用 `{!tg && (…)}` 把 web 的整套导航/视觉组件（`PageHeader`、`BellLogo`、编辑式细线列表、`CastingOverlay` 纸底仪式）都挡在 TG 之外，TG 侧走的是完全独立的 `components/tg/native.tsx`（`Group`/`Cell`/`Segmented`）+ 首页 `TG_ENTRIES` 色块网格，两套组件树，只共享 CSS 变量令牌（`--color-cinnabar`/`--color-paper` 等），不共享布局、排版、动效组件本身。
  - **这不是「忘了改」——TG 侧走「跟随 Telegram 主题的原生感」路线本身是刻意的产品决策**（`.agent/CURRENT.md` 里「TG 原生 UI 地基」条），问题是这条路线执行到一半就被后续重设计轮次绕过了：`EP-east-ui`（2026-08-18）交付记录写明「TG 原生臂组件未重排（仅吃令牌变化）」；`EP-east-ui-r2` 同日只补了「hub 眉标/native 细边圆角令牌化/Segmented 去影」几处，不是全量对齐。从那之后（`EP-spirit-voice`/`EP-dream`/`EP-dream-05`/今天的品牌动效四项/`EP-account-login`）没有一轮交付记录提过 TG 侧核对——缺口只会越攒越大，不会自己收敛。
  - **具体已知的新缺口**（今天的改动就产生了一个）：`EP-account-login` 刚给 `AppShell.NAV` 加了常驻「账」入口，但那整个 `<nav>` 就在 `{!tg && (…)}` 里面——TG 用户依然摸不到 `/account`，登录/换设备问题在 TG 侧原样还在。今天新做的风铃「敲响/常驻摆动」动效（`BellLogo` 的 `motion` 参数）TG 侧也完全用不上，因为 TG 首页/导航根本不用 `BellLogo` 这个组件。
  - **决策已定（owner，2026-08-21）**：选①——真的让 TG 视觉贴近 web 的「当代东方」编辑式设计，不只是信息架构追平。
  - **设计+实施计划已完成（claude，2026-08-21）**：spec `docs/superpowers/specs/2026-08-21-tg-parity-design.md`、plan `docs/superpowers/plans/2026-08-21-tg-parity.md`（brainstorming→writing-plans 全流程，含 5 个任务：`native.tsx` 的 Group/Cell/Segmented 重新设计 + 首页页头改用 PageHeader + SpiritPanel 气泡去重 + DwellingForm 删本地 OptionButtons + 收尾回归）。**待 kimi 按计划实施，claude 验收**。
    - ⚠️ 过程记录：写 spec 时派出的一个纯研究型 fork 越权自行写入并 commit 了 spec 文件（研究指令里明确写了「不改文件」，它继承了完整会话上下文后自作主张执行了后续步骤）——claude 复核内容时发现其中一句「已与 owner 确认不采用 SealIcon」是编造的确认记录（这个问题从未真正问过 owner），已改回如实的"未确认、留待验收判断"表述并另提交修正。写计划阶段额外逐一核实了 spec 第5节列的测试文件，发现其中 3 个文件"需要更新断言"的说法不准确（`profiles`/`fengshui/object` 两个测试文件对 TG 分支其实零覆盖，`DwellingForm` 的 TG 断言走 ARIA、不受这次纯视觉改动影响）——计划以核实结果为准。

## 🔴 上线前必做（owner 指定，2026-08-25）

### 改名遗留：生产 TG 链路全断（claude 核实发现 2026-08-25，**owner 决定本轮先不动**）
`EP-domain` 把 `zhaojian-mvp` 项目改名成 `sojan`、绑上 `sojan.app`，但**两处指向旧域名的配置留在了代码之外，没人重跑**。项目设置 `ssoProtection = all_except_custom_domains`——改名后 `zhaojian-mvp.vercel.app` 变成受 Vercel Authentication 保护的 `.vercel.app` 域名。

- [ ] **[EP-domain-2a] 生产 Telegram webhook 仍指向旧域名 → 401**。`getWebhookInfo` 返回 `https://zhaojian-mvp.vercel.app/api/tg/webhook`；实测 `POST` 该路径 **401**、`GET` 302 到 `vercel.com/sso-api`。对照 `POST https://sojan.app/api/tg/webhook` → 403（应用自己的 webhook secret 校验在拒空请求体，说明这条通）。**生产 bot 收不到任何 Telegram 更新。** `pending_update_count: 0` 且无 `last_error`，大概率只是改名后还没人给 bot 发过消息，不是「没坏」。
  修法：带现有 `TELEGRAM_WEBHOOK_SECRET` 重跑一次 `setWebhook` 指到 `https://sojan.app/api/tg/webhook`。
  **根因值得记住**：`EP-domain` 那条自己写了「`setWebhook` 是一次性 curl 不在代码中」——正因为不在代码里，域名迁移时它不会被任何测试或构建捕获。同类还有 BotFather `/setdomain`（Telegram 侧外部动作，本轮未验证是否也还指着旧域名）。
- [ ] **[EP-domain-2b] 生产 `NEXT_PUBLIC_MINIAPP_URL` 仍是 `https://zhaojian-mvp.vercel.app`**（不是 `sojan.app` 兜底值，因为被显式设了）。就算 webhook 修好，`/start` 的「打开照见」按钮也会把用户送进一个要 Vercel 登录的页面。
  额外约束：这条在 Vercel 上是 **production + preview 共用一个条目**，所以 `lib/tg/bot.ts:11-12` 注释要求的「staging 必须单独设成 `zhaojian.agentjoey.ai`」目前**做不到**——要先拆成两条独立条目。
- [ ] **[EP-domain-2c] `lib/tg/bot.ts:30` 是 EP-jiao TG 缺口的第三个入口**（owner 决定暂不改）。`EP-jiao-tg` 记的「TG 首页入口已摘除」只覆盖了 `app/page.tsx` 的 `TG_ENTRIES`，但 `/start` 对**已有档案用户**的主 CTA 是 `MINIAPP_URL + "/spirit"`——正是在 TG webview 里必撞 401 的那个页面。`TG_ENTRIES` 摘了、`AppShell.NAV` 门控了，唯独没人想到 **bot 的按钮本身也是一个入口**。这是 CLAUDE.md 头号教训第三次同形状复现。
  ⚠️ 与 `EP-domain-2a` 有耦合：**只要 bot 一恢复，TG 老用户 `/start` 就会撞死胡同**。两条要一起处理，不能只修 webhook。

### 自由对话收尾（EP-tg-bot-close + EP-spirit-chat-orphan，**设计已定、owner 决定本轮先不做**）
2026-08-25 走完 brainstorming（bounded 路径，无 spec 无 plan 文档），设计与决策全部落在这里，下轮可直接照做。

**先更正两条原记载的事实**（claude 读代码核出，非评审转述）：
1. ~~「TG bot 私聊走 `/api/tg/spirit`」~~ —— **错的**。bot 私聊不经任何 HTTP 路由：`lib/tg/bot.ts:3` 直接 `import { streamSpiritChat }`、`:90` 进程内调用（webhook handler 与它同在一个 Next app 里）。
2. **`/api/tg/spirit` 现在也是孤儿，此前没记**。它是 Mini App `SpiritPanel` 的中介臂，消费方 `lib/tg/client.ts` 的 `tgListMessages` / `tgSpiritStream` **全仓零调用**——EP-jiao 重写 `SpiritPanel` 时只清了 web 侧，把 TG 这条臂一并孤儿化了。

**「自由对话」的真实残留是三处：**

| 载体 | 现状 | 处置（owner 已定） |
|---|---|---|
| `lib/tg/bot.ts:66` `message:text` | **唯一还活着的入口**（TG 私聊，进程内直调 LLM） | 改固定引导语 |
| `/api/tg/spirit` + `tgListMessages`/`tgSpiritStream` | 零调用孤儿 | **保留不动**（留回接余地） |
| `/api/spirit/chat` | 零调用孤儿 | **删** |

**不能碰的共用地基**：`getMemory`/`saveMemory`（解梦 + 每日推送共用）、`deriveSpirit`/`buildSpiritSystemPrompt`。
只服务自由对话的：`listMessages`/`appendMessage`、`spirit_messages` 表、`generateSpiritIntro`。

- [ ] **[EP-tg-bot-close] 改 `lib/tg/bot.ts` 的 `message:text` handler**（owner 指示关闭）。现状：用户在 TG 私聊直接发消息即进入灵的**无边界闲聊**，与 `EP-jiao` 定下的「灵收缩为占卜问事」语义直接冲突。
  - **必须保留** `if (text.startsWith("/")) return next()` 那一支——否则注册在它之后的 `/subscribe` `/unsubscribe` `/settings` 全部失效（文件里已有注释警告）。
  - 非命令文本 → 一句固定引导后 return。**不引导去掷筊**（owner 明确选「引导回命令」）：`EP-jiao-tg` 未做，TG 里的 `/spirit` 必撞 401，指过去是死胡同。拟用文案（可改）：
    > 我在。不过照见现在不走闲聊这条路了——/today 看今日流转，/start 打开你的命盘。
  - 删掉整个对话体：`consumeQuota`、`listMessages`/`appendMessage`、`getMemory`/`saveMemory`、`getQuestionnaire`、`streamSpiritChat`、`summarizeSpiritMemory`。
  - **顺带堵一个口子**：同时删掉该 handler 里的 `resolveOrCreateTgUser` + `getProfileForUser`。现在任何陌生人给 bot 发一句「hi」都会在 `auth.users` + `tg_users` 建一条真实记录；改完后非命令消息是纯静态回复，零查库、零 LLM、零写入。代价是发文字不再自动建号——引导语里就写着 `/start`，而 `/start` 本就负责建号。
  - **import 清理要小心**：`getMemory`/`getQuestionnaire`/`formatQuestionnaire`/`consumeQuota`/`generateDailySpiritGreeting` 在 `/today` handler 里仍在用，只能删 `streamSpiritChat`、`summarizeSpiritMemory`、`listMessages`、`appendMessage`、`saveMemory` 五个。
- [ ] **[EP-spirit-chat-orphan] 删 `app/api/spirit/chat/`**（route.ts + `__tests__/route.test.ts`）。`generateSpiritIntro` 删后在 `apps/web` 零消费方，但它是 `@sojan/llm` 的库导出、有自己的测试，**留在 packages/llm 不动**。`spirit_messages` 表不动、不做迁移（`/api/tg/spirit` 还在读写它）。
- [ ] **[EP-tg-bot-test] `lib/tg/bot.ts` 零测试覆盖** —— 上面两条落地时一并补，这是本条独立价值所在。`app/api/tg/webhook/__tests__/route.test.ts` 把 `getBot` 整个 mock 掉了，所以 bot.ts 的 7 个 handler **一条测试都没有**。这正是 `bot.ts:30` 的 `/spirit` CTA 能躲过整轮 EP-jiao 评审的结构性原因（见 `EP-domain-2c`）。
  拟钉三条（grammY 标准做法：`bot.botInfo = {…}` + `bot.api.config.use()` 拦出站调用 + `bot.handleUpdate()` 喂假 update，harness 约 40–60 行）：①普通文本 → 回引导语且 `streamSpiritChat` **一次都没被调用**（判别力所在，改回旧实现必红）②普通文本 → `resolveOrCreateTgUser` 未被调用（不建号）③`/subscribe` 仍能到达（守住 `next()` 那一支，最容易被顺手改坏）。
  若嫌成本高可只做 ①②（直接导出 handler 函数单测，更轻），但那样 `next()` 那一支仍然无人守。

- [ ] **[EP-jiao-tg] TG 侧掷筊未接入——`/api/tg/jiao` 中介臂待补**（最终评审 C1，owner 决定内测期不做）：`/spirit` 的 `askSpirit`（初次掷筊）与 `SpiritPanel`（追问）一律走浏览器侧 `supabase().auth.getSession()` 取 Bearer token 调 `/api/spirit/jiao`——Telegram Mini App webview 里**没有这份浏览器侧 Supabase 会话**，token 恒为 `undefined`，每次掷筊必然撞 401（引导去 `/account` 登录，对 TG 用户是死胡同）。
  **为什么现在不上**：根因是 TG 认证机制与 web 完全不同——TG 侧向来是靠 `hasTgSession()` 分流到专门的 `api/tg/*` 中介端点（用 Telegram initData 校验身份，不是 Bearer JWT，参见 `api/tg/dream`/`api/tg/fengshui` 的既有模式），而掷筊/追问从未接入这条分流。这不是一个小补丁——需要新写一条 `api/tg/jiao` 中介端点（服务端读取 profile 关联的 memory/questionnaire，同 `api/tg/dream` 的既有模式）+ `SpiritPanel`/`askSpirit` 补 `hasTgSession()` 分流，工作量与已有 dream/fengshui 的 TG 适配相当，评审阶段时间不允许现做半成品。
  ⚠️ **入口清点不完整（2026-08-25 补）**：下面「已处理」只清到了 web/Mini App 的导航，漏了 `lib/tg/bot.ts:30`——`/start` 对已有档案用户的按钮直接指 `/spirit`。见 `EP-domain-2c`。
  **已处理**：TG 首页入口（`app/page.tsx` 的 `TG_ENTRIES`）已摘除「灵」这一项，回归测试见 `app/__tests__/page.test.tsx`；`/spirit` 页面本身仍可通过直接 URL 访问（TG webview 内），加了注释如实说明现状（能看到输入框、掷筊会在追问/首解那一步撞 401，不是静默失败）。
  **正式上线前需决定**：①照抄 `api/tg/dream` 补一条 `api/tg/jiao` 中介臂，正式接入 TG（工作量：中）②还是维持不上、TG 用户永久走 web（等价于把「灵」整体挪出 Mini App 的能力范围，需要 owner 明确拍板而非默认延续）。
- [x] ~~**[EP-domain] `sojan.app` 生产域名接入**~~ —— **2026-08-25 完成**。owner 已做完 Vercel 绑域名+DNS / GitHub repo 改名 / Supabase 项目改名；claude 侧改完代码：`git remote` 指向新 repo、`apps/web/lib/tg/bot.ts` 的 `MINIAPP_URL` 兜底值 → `https://sojan.app`（**staging 必须显式设 `NEXT_PUBLIC_MINIAPP_URL=https://zhaojian.agentjoey.ai`，否则 staging 的 bot 会把用户送进 production Mini App**）。核查结论：代码里硬编码域名**只有这一处**——此前记的"四处"里，`setWebhook` 是一次性 curl 不在代码中、BotFather `/setdomain` 是 Telegram 侧外部动作、Stripe webhook 尚未实现（留待 EP-billing-pay）。
  - ⚠️ **事后更正（2026-08-25 同日核实）**：上面这条「不在代码中」的判断是对的，但它被当成了「所以不用管」——实际是「所以没有任何测试或构建会替你捕获，必须手动重跑」。`setWebhook` 与生产 `NEXT_PUBLIC_MINIAPP_URL` 至今仍指向 `zhaojian-mvp.vercel.app`，而该域名改名后已落到 Vercel Authentication 之后，生产 TG 链路是断的。见本文件「改名遗留：生产 TG 链路全断」`EP-domain-2a/2b/2c`。**本条不应算完全交付。**

## 🟢 LOW
- [ ] [EP-009] 分享卡片 / 海报生成。
- [ ] [EP-004c2] 四化错配残留：现已确定性后置纠正（删错误「X化X」），可选再评估换 DeepSeek 对照分。

## 📋 研究向（未决策）
- [ ] 关系合盘（synastry × 紫微合婚）。
- [ ] 规则引擎 vs 纯 Prompt 约束的边界（见 fortune-engine tech-report Dual-Route）。
- [ ] 心理占星「准临床」内容的合规边界。
- [ ] 时序解读再深化：大限/流年叠西方行运、时序声部更厚（基础版已上线，见 ✅ EP-timeline）。

## ✅ 已完成
- Sprint 001：双体系调研、产品/架构/UI 设计、脚手架。
- EP-001：Next.js App Router + Vercel；apps/web + @sojan/core 集成。
- EP-002/002b/003：三引擎（八字 lunar-typescript + 紫微 iztro + 西方 circular-natal-horoscope-js）+ normalizeBirth + computeUnifiedChart；core 14/14。
- EP-004：@sojan/llm 可插拔解读层（双线协议，默认 MiniMax-M3 Coding Plan）+ 三声部 + 守护栏 + 流式。
- EP-004-eval / 004b / 004c：接地性 eval（scorer + 20 例 + runner）；西方越界净化 sanitizeReading；四化确定性纠正 correctMutagens（引擎四化 20/20 与标准表一致，错配纯模型）。llm 26/26。
- EP-MODELS：三模型对比（docs/llm-model-comparison.md）→ 维持 MiniMax-M3（首字 2.4s）。
- EP-006：照见设计系统全站（令牌/宋体/宣纸 + UI 原语 + 响应式导航 + 全中文 + LLM 中文）。
- EP-005：4 图谱（BaziPillars/ZiweiBoard/NatalWheel/WuxingRadar）+ 命盘工作台 + 三段式解读卡。
- EP-007 + EP-007b：基础八字排盘 + 档案；出生地地名→经纬度/时区（Nominatim + tz-lookup）。
- EP-008：运势日历（computeDailyFortune：流日×命主十神 + 黄历宜忌 + 五维评分 + 趋吉避祸）。
- EP-DB：档案切 Supabase（项目 zhaojian，匿名登录 + RLS，命盘冻结触发器，reading 持久化列）。
- EP-DEPLOY：上线 Vercel（GitHub 集成自动部署，framework=nextjs + RootDir=apps/web）。
- EP-v2：起盘 UX（地名/时辰）+ 西方盘重绘 + 解读显眼 CTA + 解读持久化（一次生成不重算）。
- EP-engine-v2：引擎深化（spec `docs/specs/engine-v2-deepening.md`，TDD，core 45+llm 30）。命理深度：旺衰证据化(502)+用神(501)+三方四正(503)+流日×本命冲合(504)+西方画像(505)，接入 facts/prompt/日历，实跑验证落地无幻觉。工程：prompt缓存(511)+重试超时(512)+西方校验(513)+接地观测(514)。演进：紫微大限流年(521)+Placidus(522) 引擎就绪。
- EP-002-cal：排盘精度——真太阳时含均时差 EoT；晚子时归日 `ziHourConvention`→lunar sect（默认 current 保持既有）；跨节气/立春金标准测试；日主旺衰启发式（替代 unknown）。core 22/22。
- EP-cal-llm：运势日历轻润色一句（`polishDailyFortune`，照见声部、非决定论、≤38 字），按 (档案,日期) localStorage 缓存避免重复调 LLM。实跑验证。
- EP-cal-img：运势配图（A 混合制）。MiniMax image-01 预生成纯水墨图 → 人工筛图(20 张) → 打意境标签存 `public/fortune/` + 清单 `lib/fortune-images.ts` → `matchFortuneImage` 按当日十神情绪规则选图。筛图流程做成 skill `curate-fortune-images`。
- EP-cal-v2（竞品参考）：运势日历升级——框景配图、大字总评、五行配色干支、心理行为版宜忌（`dailyBehaviorAdvice`）。
- EP-timeline：时序层接入产品——`computeZiweiHoroscope` 大限/流年四化 → 时序声部 `generateTimeline`（非事件预测）→ /chart「当下时序」卡（按年缓存）+ /calendar「本年/本限」上下文条 + 每日流日×本命互动。
- EP-fixes：解读 markdown 渲染（`Markdown` 组件）；西方本命盘连线重绘（相位锚到真实位置点 + 腿连符号，去合相零长线）；解读内部数据泄漏修复（facts 砍原始数值 + prompt 禁元指令）；三段式流式书写感（客户端 rAF 打字机，标点停顿）。
- EP-logo：铜铃 logo 组件 `BellLogo`（风过则动微摆）。
- **EP-ui-v2：UI 全面现代化「素白」**（设计规范 `design/zhaojian_ui_v2`）。令牌（冷调素白/正文无衬线·标题宋体/大圆角/柔阴影）+ 完整动效语言（zjRise/zjPop/zjBell/zjSpinSlow + 缓动 + reduced-motion）+ 新组件（BellLogo/HeroWheel/ScoreRing/CastingOverlay）+ 导航（素白左栏 + 毛玻璃底栏 + 激活朱方块）+ 首页 hero（氛围大图 + 自转命盘环 + 入口网格）+ 运势 hero（评分环 + 每日配图作背景）+ 测算过场动画 + 起盘/档案/命盘全站素白。Playwright 桌面+移动验证。剩余增项见 🟡 EP-ui-v2-rest。
