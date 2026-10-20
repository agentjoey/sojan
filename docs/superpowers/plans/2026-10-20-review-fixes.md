# Code review 修复（2026-10-20）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修复 2026-10-20 code review 的发现 1/2/3（正确性）与 4/6（安全）：失败解读不再被永久保存；西方盘用钟表时间；时区偏移在正确时刻取；LLM 入口全部要求登录、主生成计量；解梦/掷筊入参限长。

**Architecture:** 解读改为服务端保存——`/api/reading` 要求会话、扣额度、按 `profileId` 从库里读命盘（不再信任客户端命盘），流正常结束且四分节齐全才落库。core 的 `normalizeBirth` 额外返回「民用钟表时刻」供西方盘使用，并修正时区偏移取值时刻。

**Tech Stack:** Next 16 · Vitest 2 · `@sojan/core` / `@sojan/llm` · Neon（`lib/db.ts`）

## Global Constraints

- 分支 `fix/review-findings`；每个任务 TDD（先写失败测试并记录 RED，再实现）；任务结束 `pnpm -r test` 全绿、`pnpm --filter @sojan/web lint` 0 errors、`pnpm --filter @sojan/web exec tsc --noEmit` 0 errors。
- 身份唯一来源 `lib/account/uid.ts`（`getViewer/getUid/requireUid`）；不读请求体/头里的 uid。
- server action 不靠 throw 传业务错误（生产会脱敏）；需要区分结果时返回值显式表达。
- 计量规则（Ruling）：**整篇生成类**（`/api/reading`、`/api/fengshui/reading` POST、`/api/fengshui/object`、已有的 dream/jiao）要求「非 anonymous」并 `consumeLlm`；**辅助类** server action（`dailyPolishAction`、`dailyBehaviorAction`、`timelineAction`、`spiritMemoryAction`、`dreamSummaryAction`、`jiaoSummaryAction`、`dailySpiritGreetingAction`）只要求「非 anonymous」，不计量，无会话返回 `null`（与现有「无 key 返回 null」同一降级约定）。
- 鉴权失败不扣额度：顺序固定为「会话 → resolveAccess → consumeLlm → LLM」。
- 命盘冻结语义不变；已存在的冻结命盘不迁移、不重算。
- 中文注释与提交信息；提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. 解读流中途抛错 / 输出被截断（缺分节）→ 不落库，页面显示错误与「重新生成」，之后仍可重新生成。
2. 未登录、anonymous、额度耗尽三种情况调用 `/api/reading` → 401/401/402，且不调用 LLM。
3. 东八区以外经度（乌鲁木齐 87.6°E、马德里 −3.7°E）的西方盘与「不做真太阳时」的钟表时间一致。
4. 夏令时切换后数小时内出生（上海 1988-04-10 00:30）真太阳时校正按 +8 而不是 +9 计算。
5. 解梦/掷筊传超长 priorTurns / memory / 非法 role → 400，且不扣额度。

---

### Task 1: core 时间归一化——时区偏移取值时刻 + 西方盘用钟表时间

**Files:**
- Modify: `packages/core/src/normalize.ts`、`packages/core/src/western/index.ts`
- Test: `packages/core/test/`（沿用现有 normalize / western 测试文件所在位置与风格）

**Interfaces:**
- Produces: `NormalizedBirth` 新增 `civil: { year: number; month: number; day: number; hour: number; minute: number }`——农历已转公历、**未做**真太阳时校正的民用钟表时刻；`computeWesternChart` 用 `n.civil` 构造 `Origin`。其余字段语义不变（八字/紫微仍用真太阳时）。

- [ ] **Step 1: 写失败测试**
  - `tzOffsetMinutes` 取值时刻：`normalizeBirth({ date: "1988-04-10", time: "00:30", timezone: "Asia/Shanghai", longitude: 120, trueSolarTime: true, … })` 的校正量只含均时差（经度正好 120°E、当时尚未进入夏令时，偏移应按 +8），即 `|correction| < 16` 分钟；修复前会因按 +9 计算而多出约 −60 分钟。再加一条夏令时生效后（`1988-04-10 06:00`）按 +9 的用例，确保两侧都对。
  - 西方盘钟表时间：乌鲁木齐（lat 43.8, lon 87.6, `Asia/Shanghai`）`1990-06-15 12:00` 且 `trueSolarTime: true` 的 `computeWesternChart` 结果，其 ascendant 与 planets 应与同一输入 `trueSolarTime: false` 的结果**完全一致**（西方盘不受真太阳时开关影响）；而八字时柱/`normalizedSolarTime` 仍随开关变化。马德里（40.4, −3.7, `Europe/Madrid`）同理一条。
- [ ] **Step 2: 跑测试确认 RED**（`pnpm --filter @sojan/core test`）
- [ ] **Step 3: 实现**——偏移改为在真实时刻取：先 `guess = Date.UTC(墙钟)`，`off1 = tzOffset(guess)`，`instant = guess − off1·60000`，`off = tzOffset(instant)`（两次迭代足以覆盖切换边界）；`civil` 在农历转换之后、真太阳时校正之前记录。
- [ ] **Step 4: GREEN + 全量**（`pnpm -r test`）
- [ ] **Step 5: Commit** `fix(core): 时区偏移按真实时刻取值；西方盘改用钟表时间（review #2 #3）`

---

### Task 2: 解读改服务端保存 + `/api/reading` 鉴权计量

**Files:**
- Modify: `apps/web/app/api/reading/route.ts`、`apps/web/app/chart/page.tsx`、对应测试
- Possibly: `apps/web/lib/data/profiles.ts`（服务端内部读档案 / 写 reading 的非 action 辅助函数可放 `lib/data/` 下 server-only 模块）

**Interfaces:**
- `POST /api/reading` 请求体改为 `{ profileId: string }`（不再接受 BirthInput）。流程：`getUid()` 无 → 401；`resolveAccess(getViewer())` 为 anonymous → 401；按 `(profileId, uid)` 读档案，不存在 → 404；档案已有 `reading` → 409（不重复生成、不扣额度）；`consumeLlm(uid)` 不过 → 402；然后流式输出。流正常结束且 `splitSections`（与 `app/chart/page.tsx` 同一切分规则，抽到可共享处）得到全部四个分节时，服务端 `update profiles set reading…`（带 `user_id` 过滤）；否则不保存。流中出错时不再把错误文案拼进正文：响应以约定的结尾标记 `\n\n[[SOJAN_READING_ERROR]]` 结束（常量导出，客户端识别）。
- `streamReading` 调用传入 `signal: req.signal`（顺带让客户端断开时中止上游）。
- 页面：`generate()` 改为 POST `{ profileId }`，**不再调用 `saveReading`**；读到错误标记或非 2xx 时显示错误与「重新生成」按钮（复用现有按钮/错误样式与 i18n 风格，新增键 zh/en 各一）；成功时 `setProfile({...profile, reading})`。402 显示现有 paywall/额度提示（如已有组件则复用），401 走 `gate.handleAuthError` 等价的登录引导。`lib/profiles.ts` 门面的 `saveReading` 若已无调用方则删除（含 data 层 action 与测试）。

- [ ] **Step 1: 写失败测试**：路由测试覆盖 401（无会话）、401（anonymous）、404（别人的 profileId）、409（已有解读）、402（额度）、成功且四分节齐全 → 调用了保存、流中抛错 → 未保存且末尾含错误标记、缺分节 → 未保存；且 401/402/404/409 时未调用 LLM、401/404/409 时未调用 consumeLlm。页面测试：错误标记 → 显示错误与重新生成按钮、不再调用 saveReading；成功 → 显示解读。
- [ ] **Step 2: RED**
- [ ] **Step 3: 实现**
- [ ] **Step 4: GREEN + 全量 + lint + tsc**
- [ ] **Step 5: Commit** `fix(reading): 解读改服务端保存，失败/截断不落库；/api/reading 要求登录并计量（review #1 #4）`

---

### Task 3: 其余 LLM 入口鉴权与计量

**Files:**
- Modify: `apps/web/app/api/fengshui/reading/route.ts`（POST）、`apps/web/app/api/fengshui/object/route.ts`、`apps/web/app/actions.ts`、对应测试；调用方页面如需处理 401/402 降级则同步

**Interfaces:**
- fengshui reading POST、fengshui object：顺序「`getUid` 无 → 401 → anonymous → 401 → 既有 Layer1 会员闸门(402) → `consumeLlm` 不过 → 402 → LLM」。GET（闸门探测）不变。
- `actions.ts` 七个辅助 action：开头 `const viewer = await getViewer(); if ((await resolveAccess(viewer)).level === "anonymous") return null;`（抽一个本文件内私有 helper，不重复七遍）。`computeChartAction` / `dailyFortuneAction` / `solarHouAction` / `ziweiHoroscopeAction` / `geocodeAction` 不涉及 LLM，不改。
- 调用方：风水页与物件顾问页对 401/402 已有「静默降级为确定性内容」路径的，保持降级不报错；402 时如已有 Paywall 组件则展示。

- [ ] **Step 1: 失败测试**：两个路由各 401/401/402 且未调用 LLM、成功时扣了一次额度；每个辅助 action 在无会话/anonymous 时返回 null 且未调用对应 llm 函数（mock `@sojan/llm`）。
- [ ] **Step 2: RED** → **Step 3: 实现** → **Step 4: GREEN + 全量 + lint + tsc**
- [ ] **Step 5: Commit** `fix(llm-auth): 风水与辅助 LLM 入口要求登录，整篇生成计量（review #4）`

---

### Task 4: 解梦 / 掷筊入参校验与限长

**Files:**
- Modify: `apps/web/app/api/spirit/dream/route.ts`、`apps/web/app/api/spirit/jiao/route.ts`、测试；共享 schema 放 `apps/web/lib/spirit-request.ts`

**Interfaces:**
- 用 Zod 校验：`priorTurns` ≤ 12 条，每条 `{ role: "user" | "spirit", content: string ≤ 4000 字符 }`；`memory` ≤ 2000；`questionnaire` ≤ 2000；超限或 role 非法 → 400。校验在鉴权与 `consumeLlm` **之前**（入参非法不扣额度）。两路由共用同一个 schema 模块，常量导出。
- 现有 `DREAM_MAX_CHARS` / `JIAO_MAX_CHARS` 对 dream/question/followUp 的校验保留。

- [ ] **Step 1: 失败测试**：两路由各覆盖 超长单条 turn、非法 role、超过 12 条（应 400 而不是静默截断——改为显式拒绝）、超长 memory、超长 questionnaire → 400 且未调用 consumeLlm/LLM；合法边界值（恰好 4000/2000）通过。
- [ ] **Step 2: RED** → **Step 3: 实现** → **Step 4: GREEN + 全量 + lint + tsc**
- [ ] **Step 5: Commit** `fix(spirit): 解梦/掷筊请求体限长与 role 校验（review #6）`
