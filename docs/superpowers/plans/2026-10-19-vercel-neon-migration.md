# Supabase → Vercel + Neon 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 下线 Telegram，把 sojan 的数据库与认证从 Supabase 迁到 Neon（Postgres + Neon Auth 邮箱验证码），托管仍是现有 Vercel 项目。

**Architecture:** 浏览器只通过同源 cookie 会话访问自己的服务端；所有读写收口到 `lib/data/*.ts` 的 `"use server"` 模块，它们先用 `requireUid()` 从 Neon Auth 会话取 uid，再执行带 uid 过滤的 SQL（`lib/db.ts`）。客户端门面 `lib/{profiles,dwellings,…}.ts` 保留原有导出名，页面 import 路径基本不动。

**Tech Stack:** Next 16 App Router / React 19 · `@neondatabase/auth@0.6.0-beta`（锁死）· `@neondatabase/serverless` · Vitest 2 · Neon 项目 `lucky-lake-64982745`（ap-southeast-1）

**Spec:** `docs/superpowers/specs/2026-10-19-vercel-neon-migration-design.md`

## Global Constraints

- 分支：在 `feat/neon-migration` 上做；合 `main` 前全部任务须经 reviewer accept（pact 规则）。**生产只有推 `production` 分支才会变**，本计划 Task 12 之前不得推 `production`。
- `@neondatabase/auth` 版本锁死 `0.6.0-beta`（`package.json` 写精确版本，不带 `^`）。
- 环境变量（全部 server-only，无 `NEXT_PUBLIC_` 前缀）：`DATABASE_URL`（Neon pooled 连接串）、`NEON_AUTH_BASE_URL`、`NEON_AUTH_COOKIE_SECRET`（≥32 字符）；测试另有可选 `TEST_DATABASE_URL`（Neon `dev` 分支）。
- 身份唯一来源：`lib/account/uid.ts` 的 `getViewer()` / `getUid()` / `requireUid()`。**任何 route / action 不得从请求体、query 或 header 取 uid。**
- 每条业务 SQL 必须带 `user_id = ${uid}`（`dwellings` / `fengshui_reports` 列名是 `uid`）条件；按 id 操作的 update/delete 一律 `where id = ${id} and user_id = ${uid}`。
- 保留的 localStorage 键前缀 `zhaojian.*`（见 CLAUDE.md），不得改名。
- 未登录访客不能存档（D1）：任何写入 action 在无会话时返回 `{ ok: false, code: "unauthenticated" }`，客户端门面把它转成 `UnauthenticatedError` 抛出，页面捕获后引导登录，不建本地档案。
- **server action 不得靠 throw 向页面传业务错误**：Next 生产构建会把 server action 抛出的错误脱敏（类名和 message 都丢失）。`lib/data/*` 的写操作一律返回 `ActionResult<T>`（定义见 Task 4），由 `lib/{profiles,dwellings,…}.ts` 门面在客户端解包并抛出。读操作在无会话时返回 `[]` / `null`。
- 每个任务结束时：`pnpm --filter @sojan/web test` 全绿、`pnpm --filter @sojan/web lint` 0 errors；涉及 core/llm 的任务另跑对应包的 `test`。
- 中文方位名、Tailwind 断点、五行色等 CLAUDE.md 陷阱条目照旧适用，本计划不改 UI 样式。
- **Task 4–9 期间分支处于半迁移状态**：只保证测试与 lint 全绿，不保证本地端到端可用。本地联调（dev 分支 env）从 Task 5 起逐步恢复，Task 10 起完整可用。Task 11 之前不得部署。

## Review Focus

1. **未登录直接打开 `/chart` `/calendar` `/fengshui` `/fengshui/dwellings` `/fengshui/object` `/dream` `/spirit` `/profiles`**：不崩、不弹 401 错误，显示「登录后建档」引导（Task 6 的页面测试逐页覆盖）。
2. **用户 A 的会话拿用户 B 的 `profileId` / `dwellingId` 调 action**：读返回空、写影响 0 行，不泄露也不改动 B 的数据（Task 3 定义模式，Task 6/7/8 的 db 测试各加一条跨用户用例）。
3. **会话在页面打开期间过期后再调用 action**：抛 `UnauthenticatedError`（不是 500），页面转为登录引导（Task 4 测试 `requireUid`，Task 6 测试页面处理）。
4. **验证码填错、过期、发码过频**：显示可读错误、可重发，输入框不清空（Task 5）。
5. **注销后**：同一浏览器再访问视为未登录；该 uid 在 8 张业务表里 0 行（Task 9 的 db 测试）。

---

### Task 1: Neon 环境就绪与四项验证（运维任务，无代码）

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-vercel-neon-migration-design.md`（在 §2 末尾追加「Task 1 验证结果」小节）

**Interfaces:**
- Produces: Neon 分支 `staging`、`dev` 及各自的 `DATABASE_URL` / `NEON_AUTH_BASE_URL`；`neon_auth` 用户表的确切表名与列名（供 Task 4 / Task 12 使用）；S2 结论（`auth.deleteUser()` 是否可用）。

> 本任务对 Neon 项目和 Vercel 项目有写操作，执行前须 owner 在会话里确认一次。

- [ ] **Step 1: 在 production 分支开启 Neon Auth**
  Neon MCP `provision_neon_auth`（project `lucky-lake-64982745`，branch `br-steep-firefly-a1zje5v4`）。Console → Settings → Better Auth：开启 Sign-up and Sign-in with Email；Email OTP 可用；Application Name = `照见 Sojan`；trusted domain 加 `https://sojan.app`；关闭 Allow Localhost。
  验证：`get_auth` 不再 404，`get_neon_auth_config` 显示 email 开启。
- [ ] **Step 2: 从 production 分出 `staging` 与 `dev` 两个分支**
  staging：trusted domain 加 `https://zhaojian.agentjoey.ai`，关 localhost。dev：开 Allow Localhost。
  验证：三个分支各自 `get_neon_auth_config` 返回不同的 base URL。
- [ ] **Step 3: 记录 `neon_auth` 结构**
  在 dev 分支跑：`select table_name, column_name, data_type from information_schema.columns where table_schema = 'neon_auth' order by 1, ordinal_position;`
  把用户表名、id 类型、email / emailVerified 列名写进 spec 追加小节。
- [ ] **Step 4: S1 + S2 冒烟（dev 分支）**
  用 Neon 官方 `nextjs` 示例或 Task 4 产物，在 localhost 完成：发码 → 验码登录 → 刷新后会话仍在 → 调 `auth.deleteUser()`。
  记录 deleteUser 是否成功；**不成功**则在 spec 写明 Task 9 改走 Neon API `DELETE /projects/{id}/branches/{id}/auth/users/{userId}`（`NEON_API_KEY` 仅服务端）。
- [ ] **Step 5: Vercel 函数区域**
  确认项目当前函数区域（Vercel 控制台 Settings → Functions），记录到 spec。Task 10 会在 `vercel.json` 固定 `"regions": ["sin1"]`。
- [ ] **Step 6: Commit**
  ```bash
  git add docs/superpowers/specs/2026-10-19-vercel-neon-migration-design.md
  git commit -m "docs(neon): Task 1 环境就绪与验证结果"
  ```

---

### Task 2: 下线 Telegram（仍在 Supabase 上，可单独验收）

**Files:**
- Move: `apps/web/lib/tg/admin.ts` → `apps/web/lib/supabase-admin.ts`（**过渡用**：`supabaseAdmin` 被 `entitlements` / `consent` / `access` / `account/uid` / `billing` / `spirit/{dream,jiao}` / `account/{delete,rename}` 引用，Task 10 删除）；同步改这些文件的 import
- Delete: `apps/web/app/api/tg/**`、`apps/web/app/api/auth/telegram/`、`apps/web/app/api/spirit/chat/`、`apps/web/lib/tg/**`（admin.ts 已移走）、`apps/web/components/tg/**`、`apps/web/types/telegram.d.ts`、`apps/web/lib/__tests__/dwellings-tg.test.ts`、`apps/web/lib/__tests__/fengshui-report-tg.test.ts`、`packages/core/src/tg/**`
- Modify: `apps/web/app/page.tsx`（删 `TG_ENTRIES` 及 TG 分支）、`apps/web/components/AppShell.tsx`（去掉 `{!tg && …}` 包裹，侧栏与胶囊导航无条件渲染）、所有 import `@/lib/tg/client|ui|theme|session` 的页面与 lib（去掉 `hasTgSession()` 分流，只留 web 分支）、`apps/web/app/api/auth/logout/route.ts`（删除该路由——它只清 TG cookie）、`packages/core/src/index.ts`（删 tg 导出）、`apps/web/vercel.json`（删 `crons`）、`apps/web/package.json`（删 `grammy`）、`docs/deployment.md` env 表（删 TG 相关 6 行与 `CRON_SECRET`）
- Test: `apps/web/app/__tests__/page.test.tsx`、`apps/web/components/__tests__/AppShell.test.tsx` 及各受影响页面测试（删除 TG 用例）

**Interfaces:**
- Consumes: 无
- Produces: 仓库中不再有 `lib/tg`、`hasTgSession`、`TG_ENTRIES`、`grammy`；`lib/access.ts` 的 `AccessInfo` 去掉 `hasTelegram` 字段，`identified` 仅由「真实已验证邮箱」决定。

- [ ] **Step 1: 改写守护测试**
  `app/__tests__/page.test.tsx`：删掉断言 `TG_ENTRIES` 的用例，新增 `it("首页不再渲染任何 Telegram 入口")`，断言 `container.textContent` 不含 `Telegram`。
  `AppShell.test.tsx`：新增 `it("导航无条件渲染")`，在 `window.Telegram` 有值时仍能找到 `/fengshui` 链接。
- [ ] **Step 2: 跑测试确认失败**
  Run: `pnpm --filter @sojan/web test -- app/__tests__/page.test.tsx components/__tests__/AppShell.test.tsx`
  Expected: 新用例 FAIL。
- [ ] **Step 3: 按 Files 列表删除与修改**
  `lib/access.ts`：`identified = hasVerifiedEmail`，删掉 `tg_users` 查询。`lib/account/uid.ts` 的 `resolveUid` 只保留 Bearer 分支。删除后，`packages/core`、`packages/llm` 里**没有任何剩余 importer** 的导出一并删掉（用 `grep -rn <name> apps packages` 逐个确认）。**`deriveSpirit`、`buildSpiritSystemPrompt` 不删**（解梦、掷筊在用）。
- [ ] **Step 4: 全量验证**
  Run: `pnpm -r test && pnpm --filter @sojan/web lint && grep -rn "lib/tg\|hasTgSession\|grammy" apps packages --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules`
  Expected: 测试全绿；lint 0 errors；grep 无输出。
- [ ] **Step 5: Commit**
  ```bash
  git add -A apps/web packages docs/deployment.md
  git commit -m "feat: 下线 Telegram bot 与 Mini App（EP-tg-replan 另行规划）"
  ```

---

### Task 3: Neon schema baseline、迁移脚本与 `lib/db.ts`

**Files:**
- Create: `apps/web/db/migrations/0001_baseline.sql`、`apps/web/scripts/db-migrate.mjs`、`apps/web/lib/db.ts`、`apps/web/test/db.ts`（db 测试辅助）、`apps/web/db/__tests__/baseline.db.test.ts`
- Modify: `apps/web/package.json`（加依赖 `@neondatabase/serverless`、`server-only`，加脚本 `"db:migrate": "node scripts/db-migrate.mjs"`）、`apps/web/.env.example`（加 `DATABASE_URL`、`TEST_DATABASE_URL`）
- Delete: `supabase/`（整个目录）

**Interfaces:**
- Produces:
  - `lib/db.ts`：`import "server-only"; export function sql(): NeonQueryFunction<false, false>`（惰性 `neon(process.env.DATABASE_URL!)` 单例；缺 env 时抛 `Error("DATABASE_URL 未配置")`）。
  - `test/db.ts`：`export const hasTestDb: boolean`（`!!process.env.TEST_DATABASE_URL`）；`export async function resetTestDb(): Promise<void>`（对 8 张业务表执行 `truncate … cascade`）；`export function useTestDb(): void`（在 `beforeAll` 里把 `process.env.DATABASE_URL` 指向 `TEST_DATABASE_URL`）。
  - db 测试文件命名 `*.db.test.ts`，统一用 `describe.skipIf(!hasTestDb)`。

- [ ] **Step 1: 写 baseline 测试**（`baseline.db.test.ts`）
  - `it("profiles_freeze 拒绝改 chart")`：插入一行后 `update profiles set chart = '{}'`，期望 reject，错误消息包含 `命盘已冻结`。
  - `it("consume_llm_credit_account 第 p_free+1 次返回 false")`：`p_free = 2` 时三次调用依次返回 `true, true, false`。
  - `it("删 profile 级联删 dream_history 与 jiao_history")`。
- [ ] **Step 2: 跑测试确认失败**
  Run: `TEST_DATABASE_URL=<dev 分支串> pnpm --filter @sojan/web test -- db/__tests__/baseline.db.test.ts`
  Expected: FAIL（表不存在）。
- [ ] **Step 3: 写 `0001_baseline.sql`**
  严格按 spec §6：8 张表的列、约束、索引与生产一致，去掉 `references auth.users` 和 `default auth.uid()`；`profiles_freeze` 函数与触发器原样；`consume_llm_credit_account` 去掉 `security definer`；建 `schema_migrations` 表。
  `db-migrate.mjs`：按文件名排序读取 `db/migrations/*.sql`，跳过 `schema_migrations` 里已有的，每个文件在一个事务里执行并登记。用 `@neondatabase/serverless` 的 `Pool`；Node 25 自带 WebSocket。
- [ ] **Step 4: 应用到 dev 分支并跑测试**
  Run: `DATABASE_URL=<dev 分支串> pnpm --filter @sojan/web db:migrate && TEST_DATABASE_URL=<dev 分支串> pnpm --filter @sojan/web test -- db/__tests__/baseline.db.test.ts`
  Expected: 迁移输出 `applied 0001_baseline.sql`，再跑一次输出 `up to date`；三条测试 PASS。
- [ ] **Step 5: 不带 `TEST_DATABASE_URL` 跑全量**
  Run: `pnpm --filter @sojan/web test`
  Expected: 全绿，db 测试显示 skipped。
- [ ] **Step 6: Commit**
  ```bash
  git add -A apps/web/db apps/web/scripts apps/web/lib/db.ts apps/web/test apps/web/package.json apps/web/.env.example supabase pnpm-lock.yaml
  git commit -m "feat(db): Neon baseline schema、迁移脚本与 lib/db"
  ```

---

### Task 4: 认证接缝（Neon Auth server/client + 统一身份入口）

**Files:**
- Create: `apps/web/lib/auth/server.ts`、`apps/web/lib/auth/client.ts`、`apps/web/app/api/auth/[...path]/route.ts`、`apps/web/lib/errors.ts`、`apps/web/lib/data/_shared.ts`、`apps/web/lib/data/__tests__/shared.test.ts`
- Modify: `apps/web/lib/account/uid.ts`（整体重写）、`apps/web/lib/access.ts`、`apps/web/lib/account/__tests__/uid.test.ts`、`apps/web/lib/access.test.ts`、`apps/web/package.json`（`"@neondatabase/auth": "0.6.0-beta"`）、`apps/web/.env.example`

**Interfaces:**
- Consumes: Task 1 的 `NEON_AUTH_BASE_URL`
- Produces:
  - `lib/auth/server.ts`：`export const auth`（`createNeonAuth({ baseUrl: process.env.NEON_AUTH_BASE_URL!, cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! } })`）
  - `lib/auth/client.ts`：`"use client"; export const authClient = createAuthClient()`（来自 `@neondatabase/auth/next`）
  - `lib/account/uid.ts`：
    - `export type Viewer = { uid: string; email: string; emailVerified: boolean }`
    - `export async function getViewer(): Promise<Viewer | null>`（`auth.getSession()`，无会话或出错返回 null）
    - `export async function getUid(): Promise<string | null>`
    - `export async function requireUid(): Promise<string>`（无会话抛 `UnauthenticatedError`，只在服务端内部使用）
    - 旧的 `resolveUid(req)` 暂留为 `@deprecated`，Task 10 删除
  - `lib/errors.ts`（客户端、服务端都可 import，无指令）：
    - `export class UnauthenticatedError extends Error`（`name = "UnauthenticatedError"`）
    - `export type ActionErrorCode = "unauthenticated" | "profile_limit" | "profile_not_found"`
    - `export type ActionResult<T> = { ok: true; value: T } | { ok: false; code: ActionErrorCode }`
    - `export function unwrap<T>(r: ActionResult<T>): T`（`unauthenticated` → 抛 `UnauthenticatedError`，其余 → 抛 `new Error(code)`；这样 `profile_limit` 与现有页面的 `err.message === "profile_limit"` 判断保持兼容）
  - `lib/data/_shared.ts`（`import "server-only"`，非 action 模块）：`export async function withUid<T>(fn: (uid: string) => Promise<T>): Promise<ActionResult<T>>`。无会话返回 `{ ok: false, code: "unauthenticated" }`；`fn` 抛出 `ActionError(code)` 时返回对应 code；其余异常照常抛出。另导出 `export class ActionError extends Error { constructor(public code: ActionErrorCode) }`
  - `lib/access.ts`：`export async function resolveAccess(viewer: Viewer | null): Promise<AccessInfo>`，`AccessInfo = { level: AccessLevel; hasVerifiedEmail: boolean }`。规则：`null` → `anonymous`；`emailVerified` → `identified`；再加 `isMember(await getEntitlement(uid))` → `member`。

- [ ] **Step 1: 重写 `uid.test.ts` 与 `access.test.ts`**（`vi.mock("@/lib/auth/server")`，让 `auth.getSession` 返回桩）
  - `getViewer` 无会话 → `null`
  - `getViewer` 有会话 → `{ uid: "u1", email: "a@b.c", emailVerified: true }`
  - `getSession` 返回 error → `null`
  - `requireUid` 无会话 → `rejects.toBeInstanceOf(UnauthenticatedError)`
  - `resolveAccess(null).level === "anonymous"`
  - 已验证邮箱且无订阅 → `"identified"`
  - 已验证邮箱且 `member_until` 在未来 → `"member"`
  - `emailVerified: false` → `"anonymous"`
  - `shared.test.ts`：
    - 无会话时 `withUid(fn)` 返回 `{ ok: false, code: "unauthenticated" }`，且 `fn` 未被调用
    - `fn` 抛 `new ActionError("profile_limit")` → `{ ok: false, code: "profile_limit" }`
    - `fn` 抛普通 `Error` → reject
    - `unwrap({ ok: false, code: "unauthenticated" })` 抛 `UnauthenticatedError`；`unwrap({ ok: false, code: "profile_limit" })` 抛 message 为 `profile_limit` 的 Error
- [ ] **Step 2: 跑测试确认失败**
  Run: `pnpm --filter @sojan/web test -- lib/account lib/access.test.ts lib/data`
  Expected: FAIL。
- [ ] **Step 3: 实现 Produces 列出的文件**
  `app/api/auth/[...path]/route.ts` 内容是 `export const { GET, POST } = auth.handler();`。
  `lib/entitlements.ts` 暂不动（Task 7 改）。
- [ ] **Step 4: 跑测试确认通过**
  Run: `pnpm --filter @sojan/web test -- lib/account lib/access.test.ts lib/data`
  Expected: PASS。旧调用方仍用 `@deprecated` 的 `resolveUid`；`resolveAccess` 的调用方（`spirit/{dream,jiao}`、`fengshui-reading`、`billing-gate`）在本任务里改为传 `await getViewer()`，全量测试保持绿。
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/lib/auth apps/web/app/api/auth apps/web/lib/account apps/web/lib/errors.ts apps/web/lib/data apps/web/lib/access.ts apps/web/lib/fengshui-reading.ts apps/web/lib/billing-gate.ts apps/web/app/api/spirit apps/web/lib/access.test.ts apps/web/package.json apps/web/.env.example pnpm-lock.yaml
  git commit -m "feat(auth): Neon Auth 接缝与统一身份入口 getViewer/requireUid"
  ```

---

### Task 5: 邮箱验证码登录页（`/account` 重写）

**Files:**
- Modify: `apps/web/app/account/page.tsx`（重写，复用现有 `ui.tsx` 原语与 i18n 键风格）、`apps/web/app/account/__tests__/page.test.tsx`、i18n 字典文件（新增 `account.otp.*` 键）
- Create: `apps/web/lib/data/account.ts`（`"use server"`）
- Delete: `apps/web/app/auth/callback/`、`apps/web/app/api/account/merge-anon/`、`apps/web/app/api/account/attach/`、`apps/web/app/api/account/identities/`、`apps/web/lib/consent.ts` 中仅 TG 用的调用点

**Interfaces:**
- Consumes: `authClient`、`getViewer`、`resolveAccess`（Task 4）
- Produces:
  - `lib/data/account.ts`：
    - `export async function getAccountSummary(): Promise<{ email: string; access: AccessInfo } | null>`
    - `export async function acceptTermsOnce(): Promise<void>`（内部 `recordConsentOnce(uid, "terms", TERMS_VERSION)`）
  - 登录成功后跳转到 `?next=` 参数指定的地址：只接受以 `/` 开头且不以 `//` 开头的值，否则回到 `/account`。
  - 导出 `export function safeNext(raw: string | null): string`（放在 `lib/auth/next.ts`）。

- [ ] **Step 1: 写页面测试**（mock `@/lib/auth/client` 与 `@/lib/data/account`）
  - 未登录显示邮箱输入；提交后调用 `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })`，并切到验证码输入。
  - 输入 6 位码调用 `authClient.signIn.emailOtp({ email, otp })`；成功后调用 `acceptTermsOnce`，并 `router.replace(safeNext(next))`。
  - `signIn.emailOtp` 返回 error 时显示错误文案，验证码输入框保留原值，「重新发送」按钮可点（Review Focus 4）。
  - `sendVerificationOtp` 返回 429 类错误时显示「发送过于频繁」文案。
  - 已登录时显示邮箱、会员与额度区（沿用 `/api/billing/status`）、登出按钮（`authClient.signOut()`）、注销区。
  - `safeNext("//evil.com") === "/account"`；`safeNext("/dream") === "/dream"`；`safeNext(null) === "/account"`。
- [ ] **Step 2: 跑测试确认失败**
  Run: `pnpm --filter @sojan/web test -- app/account`
  Expected: FAIL。
- [ ] **Step 3: 实现页面、`lib/data/account.ts`、`lib/auth/next.ts`，删除 Files 里列出的路由**
- [ ] **Step 4: 跑测试**
  Run: `pnpm --filter @sojan/web test -- app/account lib/auth`
  Expected: PASS。全量测试 PASS（被删路由的测试随路由一起删）。
- [ ] **Step 5: 本地手测**（dev 分支 env）
  `pnpm --filter @sojan/web dev` → `http://localhost:3030/account` 完成发码、验码、刷新后仍登录、登出。
- [ ] **Step 6: Commit**
  ```bash
  git add -A apps/web/app/account apps/web/app/auth apps/web/app/api/account apps/web/lib/data/account.ts apps/web/lib/auth/next.ts apps/web/lib/consent.ts apps/web/messages
  git commit -m "feat(account): 邮箱验证码登录，删除匿名升级/合并/绑定流程"
  ```
  （i18n 字典的实际路径以仓库为准，`git add` 时替换 `apps/web/messages`）

---

### Task 6: 档案（profiles）收口到服务端 + 访客门控

**Files:**
- Create: `apps/web/lib/data/profiles.ts`（`"use server"`）、`apps/web/lib/data/__tests__/profiles.db.test.ts`、`apps/web/lib/reading-draft.ts`
- Modify: `apps/web/lib/profiles.ts`（改成客户端门面）、`apps/web/app/reading/ReadingForm.tsx`、所有调用 `getActiveProfile` 的页面（`HomeClient`、`chart`、`calendar`、`fengshui`、`fengshui/dwellings`、`fengshui/object`、`dream`、`spirit`、`profiles`）及其测试、`apps/web/app/api/account/rename/route.ts`

**Interfaces:**
- Consumes: `sql()`（Task 3）、`getUid`、`withUid` / `ActionError`、`ActionResult` / `unwrap` / `UnauthenticatedError`（Task 4）
- Produces:
  - `lib/data/profiles.ts`（`"use server"`）：
    - 读：
      - `listProfiles(): Promise<Profile[]>`（无会话返回 `[]`）
      - `getProfile(id: string): Promise<Profile | null>`
      - `getSpiritMemory(profileId: string): Promise<string | null>`
      - `getQuestionnaire(profileId: string): Promise<QuestionnaireAnswers | null>`
    - 写（全部经 `withUid` 包装）：
      - `createProfile(input: { nickname?: string; birthInput: BirthInput; chart: UnifiedChart }): Promise<ActionResult<Profile>>`
      - `saveReading(profileId: string, markdown: string, model?: string): Promise<ActionResult<void>>`
      - `deleteProfile(id: string): Promise<ActionResult<void>>`
      - `saveSpiritMemory(profileId: string, memory: string): Promise<ActionResult<void>>`
      - `saveQuestionnaire(profileId: string, answers: QuestionnaireAnswers): Promise<ActionResult<void>>`
      - `renameProfile(id: string, nickname: string): Promise<ActionResult<void>>`
  - `lib/profiles.ts`（无指令，可被客户端 import）：
    - 保留 `Profile` 类型与 `getActiveProfileId` / `setActiveProfile` / `getActiveProfile`。
    - 读函数直接转出。
    - 写函数用同名包装：`await unwrap(await data.createProfile(input))`。页面看到的签名与迁移前一致（`Promise<Profile>` / `Promise<void>`）。
    - `createProfile` 成功后调用 `setActiveProfile`；`deleteProfile` 成功后清理指针。
  - 建档上限：`BILLING_ENABLED === "1"` 时在 `createProfile` **服务端**校验——非会员档案数 ≥ `Number(process.env.FREE_PROFILE_LIMIT ?? 3)` 时 `throw new ActionError("profile_limit")`。原客户端的 `NEXT_PUBLIC_BILLING_ENABLED` / `NEXT_PUBLIC_FREE_PROFILE_LIMIT` 判断删除，env 改为无前缀的 `FREE_PROFILE_LIMIT`。
  - `lib/reading-draft.ts`：
    - `saveReadingDraft(d: ReadingDraft): void`
    - `takeReadingDraft(): ReadingDraft | null`（读出后删除）
    - 键名 `zhaojian.readingDraft`，存 `sessionStorage`。
  - `/api/account/rename` 路由删除，调用方改用 `renameProfile`。

- [ ] **Step 1: 写 db 测试**（`profiles.db.test.ts`，mock `@/lib/account/uid` 返回可切换的 uid）
  - 用户 u1 `createProfile` 后，`listProfiles` 返回 1 条，`user_id` 是 u1。
  - 切到 u2：`getProfile(u1 的 id)` 返回 `null`；`saveReading(u1 的 id, …)` 后用 u1 读，`reading` 仍为 null；`deleteProfile(u1 的 id)` 后 u1 那条仍存在（Review Focus 2）。
  - 无会话：`listProfiles()` 返回 `[]`；`createProfile(…)` 返回 `{ ok: false, code: "unauthenticated" }`，且库中无新行。
  - `BILLING_ENABLED=1`、`FREE_PROFILE_LIMIT=1` 时，第二次 `createProfile` 返回 `{ ok: false, code: "profile_limit" }`。
  - 门面单测（`lib/__tests__/profiles.test.ts`，mock `@/lib/data/profiles`）：`createProfile` 收到 `unauthenticated` 时 reject 为 `UnauthenticatedError`，且未调用 `setActiveProfile`。
- [ ] **Step 2: 写页面测试**
  - `ReadingForm`：mock `createProfile` 抛 `UnauthenticatedError` → 调用 `saveReadingDraft`，并 `router.push("/account?next=/reading")`。
  - 挂载时 `takeReadingDraft()` 有值则回填表单字段，不自动提交。
  - 八个依赖档案的页面：`listProfiles` 返回 `[]` 且未登录时，渲染登录引导链接（`href` 以 `/account?next=` 开头），不渲染错误态（Review Focus 1）。
  - 页面在加载后某次 action 抛 `UnauthenticatedError` → 显示同一登录引导（Review Focus 3）。
- [ ] **Step 3: 跑测试确认失败**
  Run: `TEST_DATABASE_URL=<dev> pnpm --filter @sojan/web test -- lib/data/__tests__/profiles app/reading app/chart app/calendar app/fengshui app/dream app/spirit app/profiles app/__tests__`
  Expected: FAIL。
- [ ] **Step 4: 实现**
  - 页面判断「未登录」：用 `authClient.useSession()`（来自 `lib/auth/client`）。
  - 登录引导做成一个共享组件 `components/SignInPrompt.tsx`，props 为 `{ next: string }`，复用现有 `ui.tsx` 原语。
- [ ] **Step 5: 跑测试**
  Run: 同 Step 3 命令，再跑一次不带 `TEST_DATABASE_URL` 的全量。
  Expected: PASS。
- [ ] **Step 6: Commit**
  ```bash
  git add -A apps/web/lib/data apps/web/lib/profiles.ts apps/web/lib/reading-draft.ts apps/web/components/SignInPrompt.tsx apps/web/app
  git commit -m "feat(profiles): 档案读写收口到服务端，未登录不可建档"
  ```

---

### Task 7: 风水数据、权益与额度

**Files:**
- Create: `apps/web/lib/data/dwellings.ts`、`apps/web/lib/data/fengshui-report.ts`、`apps/web/lib/data/__tests__/dwellings.db.test.ts`、`apps/web/lib/data/__tests__/entitlements.db.test.ts`
- Modify: `apps/web/lib/dwellings.ts`、`apps/web/lib/fengshui-report.ts`（改成门面；`fengshuiFingerprint` 保持纯函数留在门面）、`apps/web/lib/entitlements.ts`、`apps/web/lib/fengshui-reading.ts`、`apps/web/app/api/fengshui/reading/route.ts`、`apps/web/app/api/fengshui/object/route.ts`、`apps/web/app/api/billing/status/route.ts` 及它们的测试、`apps/web/app/fengshui/**` 中取 Bearer token 的代码

**Interfaces:**
- Consumes: `sql()`、`getUid`、`withUid`、`unwrap`、`getViewer`、`resolveAccess`
- Produces（写操作返回 `ActionResult`，门面用 `unwrap` 恢复原签名，同 Task 6）：
  - `lib/data/dwellings.ts`：
    - `listDwellings(): Promise<Dwelling[]>`（无会话返回 `[]`）
    - `createDwelling(d: Omit<Dwelling, "id">): Promise<ActionResult<Dwelling>>`
    - `updateDwelling(id: string, patch: Partial<Omit<Dwelling, "id">>): Promise<ActionResult<void>>`
    - `deleteDwelling(id: string): Promise<ActionResult<void>>`
  - `lib/data/fengshui-report.ts`：
    - `readFengshuiReport(fingerprint: string): Promise<FengshuiSections | null>`
    - `saveFengshuiReport(args: { fingerprint: string; profileId: string; dwellingId: string | null; layer: number; locale: string; sections: FengshuiSections }): Promise<ActionResult<void>>`（按 `(uid, input_fingerprint)` upsert）
  - `lib/entitlements.ts`（server-only 普通模块）：`getEntitlement(userId)`、`isMember(e)`、`consumeLlm(userId)` 签名不变。内部改用 `sql()`；`consumeLlm` 执行 `select consume_llm_credit_account(${userId}, ${free}) as ok`，`free = Number(process.env.FREE_LLM_MONTHLY ?? 30)`（沿用现值）。
  - API 路由一律 `const uid = await getUid(); if (!uid) return 401`；不再读 `Authorization` 头。

- [ ] **Step 1: 写 db 测试**
  - u2 `updateDwelling(u1 的 id)` / `deleteDwelling(u1 的 id)` 后，u1 的记录不变。
  - u2 读不到 u1 同 fingerprint 的报告。
  - 同一 `(uid, fingerprint)` 第二次 save 覆盖 `sections`，行数仍是 1。
  - `consumeLlm`：`BILLING_ENABLED=1`、`FREE_LLM_MONTHLY=2` 时，第三次返回 `{ ok: false, reason: "paywall" }`；有效会员连续调用 5 次都返回 `{ ok: true }`。
- [ ] **Step 2: 改写路由测试**
  把对 `resolveUid` / `supabaseAdmin` 的 mock 换成对 `@/lib/account/uid` 与 `@/lib/data/*` 的 mock；保留每个路由原有的 401 / 403 / 额度断言。
- [ ] **Step 3: 跑测试确认失败**
  Run: `TEST_DATABASE_URL=<dev> pnpm --filter @sojan/web test -- lib/data app/api/fengshui app/api/billing app/fengshui`
  Expected: FAIL。
- [ ] **Step 4: 实现，删除 `app/fengshui/**` 中所有 `getSession()` / `Authorization` 拼装**
- [ ] **Step 5: 跑测试**
  Run: 同 Step 3，再跑全量。
  Expected: PASS。
- [ ] **Step 6: Commit**
  ```bash
  git add -A apps/web/lib apps/web/app/api/fengshui apps/web/app/api/billing apps/web/app/fengshui
  git commit -m "feat(fengshui): 居所/报告/权益/额度改走服务端 SQL"
  ```

---

### Task 8: 解梦与掷筊

**Files:**
- Create: `apps/web/lib/data/dream-history.ts`、`apps/web/lib/data/jiao-history.ts`、`apps/web/lib/data/__tests__/history.db.test.ts`
- Modify: `apps/web/lib/dream-history.ts`、`apps/web/lib/jiao-history.ts`（门面）、`apps/web/app/api/spirit/dream/route.ts`、`apps/web/app/api/spirit/jiao/route.ts` 及测试、`apps/web/app/dream/page.tsx`、`apps/web/app/spirit/page.tsx`、`apps/web/app/calendar/AskToday.tsx`、`apps/web/app/chart/SpiritPanel.tsx`（删除 Bearer 拼装）

**Interfaces:**
- Consumes: `sql()`、`getUid`、`withUid` / `ActionError`、`unwrap`、`getViewer`、`resolveAccess`、`consumeLlm`
- Produces（门面用 `unwrap` 恢复原签名）：
  - `listDreamHistory(profileId: string): Promise<DreamHistoryEntry[]>`
  - `appendDreamHistory(profileId: string, summary: string, fullText: string): Promise<ActionResult<void>>`
  - `listJiaoHistory(profileId: string): Promise<JiaoHistoryEntry[]>`
  - `appendJiaoHistory(profileId: string, omen: Omen, summary: string, fullText: string): Promise<ActionResult<void>>`
  - 每个 profile 只保留最近 10 条：在 append 里**同一事务**内插入后裁剪（`sql().transaction([...])`），裁剪条件同时带 `profile_id` 和 `user_id`。
  - append 时校验 `profileId` 属于当前 uid，不属于则 `throw new ActionError("profile_not_found")`。

- [ ] **Step 1: 写 db 测试**
  - 连续 append 12 条后，list 返回 10 条且是最新的 10 条。
  - u2 对 u1 的 profileId 调 append 返回 `{ ok: false, code: "profile_not_found" }`，u1 的历史条数不变。
  - u2 list u1 的 profileId 返回 `[]`。
  - `jiao_history.omen` 传非三词值时被 check 约束拒绝。
- [ ] **Step 2: 改写两个路由测试**（mock 方式同 Task 7 Step 2），保留危机前置拦截与额度断言。
- [ ] **Step 3: 跑测试确认失败**
  Run: `TEST_DATABASE_URL=<dev> pnpm --filter @sojan/web test -- lib/data/__tests__/history app/api/spirit app/dream app/spirit app/calendar app/chart`
  Expected: FAIL。
- [ ] **Step 4: 实现**
- [ ] **Step 5: 跑测试**
  Run: 同 Step 3，再跑全量。
  Expected: PASS。
- [ ] **Step 6: Commit**
  ```bash
  git add -A apps/web/lib apps/web/app/api/spirit apps/web/app/dream apps/web/app/spirit apps/web/app/calendar apps/web/app/chart
  git commit -m "feat(spirit): 解梦/掷筊历史改走服务端 SQL"
  ```

---

### Task 9: 注销账号

**Files:**
- Modify: `apps/web/app/api/account/delete/route.ts` 及其测试
- Create: `apps/web/lib/data/__tests__/delete-account.db.test.ts`、`apps/web/lib/data/delete-account.ts`（server-only 普通模块，非 action）

**Interfaces:**
- Consumes: `sql()`、`getUid`、`auth`（Task 4）
- Produces: `export async function purgeUserData(uid: string): Promise<void>`，在一个 `sql().transaction([...])` 里按依赖顺序删除：`jiao_history`、`dream_history`、`fengshui_reports`、`dwellings`、`profiles`、`llm_usage`、`entitlements`、`user_consents` 中属于该 uid 的行。
  路由流程：`getUid()`，无会话 → 401；`purgeUserData(uid)`；`auth.deleteUser()`（Task 1 Step 4 如判定不可用，改调 Neon API）；成功返回 `{ ok: true }`；`deleteUser` 失败返回 502，且业务数据已清（可重试）。

- [ ] **Step 1: 写 db 测试**
  为 u1、u2 各造齐 8 张表的数据，`purgeUserData(u1)` 后：u1 在 8 张表各 0 行，u2 各表行数不变（Review Focus 5）。
- [ ] **Step 2: 写路由测试**
  - 无会话 → 401，且未调用 `purgeUserData`。
  - 正常 → 依次调用 `purgeUserData`、`auth.deleteUser`，返回 200。
  - `deleteUser` 返回 error → 502，且 `purgeUserData` 已被调用。
- [ ] **Step 3: 跑测试确认失败**
  Run: `TEST_DATABASE_URL=<dev> pnpm --filter @sojan/web test -- delete`
  Expected: FAIL。
- [ ] **Step 4: 实现**
- [ ] **Step 5: 跑测试**
  Expected: PASS。
- [ ] **Step 6: 本地手测**
  dev 分支上登录 → 建档 → 注销 → 刷新是未登录态 → 用同一邮箱重新登录后档案列表为空。
- [ ] **Step 7: Commit**
  ```bash
  git add apps/web/app/api/account/delete apps/web/lib/data
  git commit -m "feat(account): 注销先清业务数据再删 Neon Auth 账号"
  ```

---

### Task 10: 移除 Supabase 残余，全量闸门

**Files:**
- Delete: `apps/web/lib/supabase.ts`、`apps/web/lib/supabase-admin.ts`（Task 2 移来的过渡文件）、`lib/account/uid.ts` 中 `@deprecated` 的 `resolveUid`
- Modify: `apps/web/package.json`（删 `@supabase/supabase-js`）、`apps/web/vercel.json`（加 `"regions": ["sin1"]`）、`apps/web/.env.example`（删全部 `SUPABASE` / `TELEGRAM` / `TG` / `CRON` 项）

**Interfaces:**
- Consumes: Task 2–9 全部完成

- [ ] **Step 1: 残余检查**
  Run: `grep -rniE "supabase|resolveUid|ensureSession|Authorization.*Bearer" apps/web packages --include='*.ts' --include='*.tsx' --include='*.json' | grep -v node_modules`
  Expected: 无输出（文档、注释中的历史说明除外——**注释里提到 Supabase 的一并改写或删除**）。
- [ ] **Step 2: 删除与修改**（按 Files）
- [ ] **Step 3: 全量闸门**
  Run: `pnpm install && pnpm -r test && pnpm --filter @sojan/web lint && pnpm --filter @sojan/web build`
  Expected:
  - 测试全绿。
  - lint 0 errors。
  - build 成功。**构建期不需要任何 Supabase/TG env**——原先 `TELEGRAM_BOT_TOKEN` 未配置导致构建失败的问题随 TG 一起消失。
- [ ] **Step 4: typecheck 对照**
  Run: `pnpm --filter @sojan/web exec tsc --noEmit`
  Expected: 错误数 ≤ 迁移前的 7 处（`EP-web-typecheck-debt`），且没有新增错误位于本计划触及的文件。
- [ ] **Step 5: Commit**
  ```bash
  git add -A apps/web pnpm-lock.yaml
  git commit -m "chore: 移除 Supabase 依赖，函数区域固定 sin1"
  ```

---

### Task 11: Staging 切换与端到端实测

**Files:**
- Modify: `docs/deployment.md`（env 表改为 Neon 三项 + 各分支对应关系）

> 涉及 Vercel env 写入与 Neon SMTP 配置，执行前须 owner 确认；Resend 发信域名 DNS 由 owner 操作。

- [ ] **Step 1: 邮件**
  Resend 验证发信域名 `sojan.app`（SPF/DKIM），在 Neon `staging` 与 `production` 分支配置 Custom SMTP，发件人 `noreply@sojan.app` / `照见 Sojan`。
  验证：Neon API `send_test_email` 收到信。
- [ ] **Step 2: Vercel Preview env**（作用于 git 分支 `staging`）
  设置 `DATABASE_URL`（staging 分支 pooled 串）、`NEON_AUTH_BASE_URL`（staging）、`NEON_AUTH_COOKIE_SECRET`（新生成，`openssl rand -base64 32`）、`BILLING_ENABLED`（沿用现值）、`FREE_PROFILE_LIMIT`（如需）。
- [ ] **Step 3: 迁移 staging 库**
  Run: `DATABASE_URL=<staging 串> pnpm --filter @sojan/web db:migrate`
  Expected: `applied 0001_baseline.sql`。
- [ ] **Step 4: 部署 staging**
  把 `feat/neon-migration` 合入 `main` 后推 `staging`（合并前须所有任务已被 reviewer accept）。
- [ ] **Step 5: 浏览器实测 `https://zhaojian.agentjoey.ai`**（内置浏览器，桌面 + 375px 两档）
  - 未登录逐页打开 Review Focus 1 的八个页面，确认显示引导。
  - 起盘时被引导去登录，回来后表单已回填。
  - 用邮箱验证码登录（错码一次，确认提示）。
  - 建档 → `/chart` 生成解读 → 刷新后解读仍在。
  - `/calendar` 正常；`/fengshui` 新建居所、生成报告；`/dream` 一次；`/spirit` 掷筊一次。
  - `/profiles` 改名、删档。
  - 登出 → 再登录 → 注销 → 再登录档案为空。
  - 逐项记录结果；任何失败按 `superpowers:systematic-debugging` 处理后重测。
- [ ] **Step 6: Commit**
  ```bash
  git add docs/deployment.md
  git commit -m "docs(deploy): Neon env 与分支对应关系"
  ```

---

### Task 12: Production 切换、owner 数据导入、文档收尾

**Files:**
- Modify: `CLAUDE.md`（技术栈表「部署」行与 LLM 行之间加 DB/Auth 行；删除 TG 两条陷阱条目与 `SYNTHETIC_EMAIL_DOMAIN` 说明；Dev Commands 加 `db:migrate`）、`docs/architecture.md`（§2 图、§6 持久化、§7b/§7c 中 TG 与 Supabase 描述）、`docs/operations.md`（加 Neon 排障行：会话 401、`DATABASE_URL` 缺失、区域）、`.agent/CURRENT.md`、`.agent/BACKLOG.md`（新增 `EP-tg-replan`、`EP-llm-unauth`；关闭 `EP-jiao-tg` 等 TG 条目并注明原因）

> 生产写操作（Vercel Production env、推 `production`、Neon production 写数据、暂停 Supabase）每一步执行前都要 owner 明确确认。

- [ ] **Step 1: Production env 与迁移**
  Vercel Production 设 `DATABASE_URL` / `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET`（production 分支，cookie secret 与 staging 不同）。
  Run: `DATABASE_URL=<production 串> pnpm --filter @sojan/web db:migrate`
- [ ] **Step 2: 推 `production` 分支，部署后 owner 用 `yuan1985@outlook.com` 登录一次**
- [ ] **Step 3: 导入 owner 数据**
  1. 从 Supabase 查出 owner 旧 uid：`select id from auth.users where email = 'yuan1985@outlook.com'`。
  2. 从 Neon 查出新 uid（表名、列名按 Task 1 Step 3 记录）。
  3. 用 Supabase MCP `execute_sql` 导出旧 uid 名下各表数据（JSON）。
  4. 在 Neon production 用 `jsonb_populate_recordset` 插入，`user_id` / `uid` 换成新 uid，保留原 `id`（`dream_history` / `jiao_history` 的 `profile_id` 引用才不会断）。
  验证：`/profiles` 列表条数与 Supabase 一致，`/chart` 显示已存的解读，不触发重新生成。
- [ ] **Step 4: 生产冒烟**
  `https://sojan.app` 重复 Task 11 Step 5 的已登录主路径（不做注销）。
- [ ] **Step 5: 暂停 Supabase 项目 `sxjcpoxhphlnwhpzachi`**
  记录 2–4 周后删除的提醒，写进 BACKLOG `EP-supabase-sunset`。
- [ ] **Step 6: 文档**
  按 Files 更新；`.agent/CURRENT.md` 的 Version History 与 Last Updated 按 CLAUDE.md「Release 后必做」处理。
- [ ] **Step 7: Commit**
  ```bash
  git add CLAUDE.md docs .agent
  git commit -m "docs: Neon 迁移完成，更新架构/部署/运维与 backlog"
  ```
