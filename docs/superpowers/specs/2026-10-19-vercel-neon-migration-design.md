# Supabase → Vercel + Neon（含 Neon Auth）迁移设计

> 状态：**设计定稿**（2026-10-19，owner 已拍板 §3 全部决策）· 实施计划：`docs/superpowers/plans/2026-10-19-vercel-neon-migration.md`
> 作者：claude

## 1. 目标与范围

- **托管不变**：继续用现有 Vercel 项目（`.vercel/project.json` 里叫 `zhaojian-mvp`，`prj_0A4RtXkXRyjIvy8E8v6IYhAm7anA`）。
- **数据库 + 认证整体迁到 Neon**：Postgres + Managed Better Auth（下称 Neon Auth）。
- **下线 Telegram**（bot + Mini App + 全部 `/api/tg/*`），以后重新规划。
- 不在范围内：UI 改版；修 TG 与 web 的差距；`/api/reading`、`app/actions.ts` 里 daily 系列 LLM 入口现有的「未鉴权」问题（单独记 backlog，见 §9）。

## 2. 现状要点（2026-10-19 实测）

**生产 Supabase**（`sojan`，us-west-1）
- 66 个账号：63 个匿名测试号、2 个 TG 测试号、1 个 owner 邮箱。
- **非匿名账号名下只有 3 条 `profiles`**。除 owner 外没有真实用户。

**Neon 项目**（owner 已建）

| 项 | 值 |
|---|---|
| 项目 | `sojan`，`lucky-lake-64982745` |
| 区域 | **AWS ap-southeast-1（新加坡）** |
| 版本 | PostgreSQL 18 |
| 分支 | 默认分支 `production` = `br-steep-firefly-a1zje5v4` |
| 现状 | 空库，只有 `public` schema，**Auth 未开启** |

**代码依赖面**（`apps/web`）
- 约 60 个文件引用 `lib/tg/*`。
- 42 个非测试文件直接用 Supabase。
- 31 个测试文件 mock 了 Supabase。
- `profiles` 表 DDL 和 `profiles_freeze` 触发器**不在仓库里**（没有 `0001` 迁移），§6 用生产实况补齐。

**Neon Auth 能力边界**（官方文档 + `@neondatabase/auth` 0.6.0-beta 源码核对；服务端 Better Auth 1.7.6）
- 有：Email OTP、同源 HTTP-only cookie 会话、服务端 `auth.getSession()`、`auth.deleteUser()`、Custom SMTP，`send.otp` webhook 可自定义邮件。
- 没有：**匿名账号**（`signInAnonymously` 直接报 `AnonymousProviderDisabled`）、`updateUser({ email })` 改邮箱、免会话的 service-role admin 接口。
- 只能用在 AWS 区域；Free 套餐 6 万 MAU。

## 3. 决策（owner 已定）

| # | 决策 | 含义 |
|---|---|---|
| D1 | **未登录访客不能存档** | 不登录不能起盘建档，也不在本地暂存。起盘表单提交时没登录 → 先把表单草稿存进 `sessionStorage`，跳去登录，回来后自动回填（不自动提交）。依赖档案的页面对未登录者显示「登录后建档」引导 |
| D2 | **TG 先下线** | 删除 bot、Mini App、`/api/tg/*`、`/api/auth/telegram`、`/api/spirit/chat`（web 侧已零调用、只剩 TG 在用）、`lib/tg/*`、`components/tg/*` 及所有 `hasTgSession` 分流；`vercel.json` 的 cron 删掉；依赖 `grammy` 移除 |
| D3 | **数据访问全部收口到服务端** | 浏览器不再直连数据库。`"use server"` 模块统一用会话取 uid，再用 SQL 带 uid 过滤。不开 Neon Data API，不依赖 RLS |
| D4 | **登录方式：邮箱验证码** | `emailOtp.sendVerificationOtp({ type: "sign-in" })` + `signIn.emailOtp()`。不做密码 UI，不做 magic link，第三方登录以后再说 |

由此带出的推论：
- **没有匿名用户了。** `ensureSession()`、匿名升级、`merge_anon_profiles`、`/api/account/merge-anon`、`ANON_MERGE_TOKEN_KEY`、`/auth/callback` 全部删除。
- **没有 TG 了。** 合成邮箱 `SYNTHETIC_EMAIL_DOMAIN`、`email_bind_pending`、`/api/account/attach`、`/api/account/identities`、`consume_llm_credit`（TG 额度）、`spirit_messages` 表全部删除。
- **`resolveAccess` 简化**：已登录且邮箱已验证 → `identified`；再叠加有效订阅 → `member`；没有会话 → `anonymous`。

## 4. 目标架构

```
浏览器 ──(同源 cookie)──▶ Vercel · Next 16（函数区域 sin1，与 Neon 同在新加坡）
  ├─ app/api/auth/[...path]   → auth.handler()，代理到 Neon Auth
  ├─ lib/auth/server.ts       → createNeonAuth({ baseUrl, cookies.secret })
  ├─ lib/auth/client.ts       → createAuthClient()（只用来发码、验码、登出）
  ├─ lib/account/uid.ts       → getViewer() / getUid() / requireUid()，全站唯一身份入口
  ├─ lib/db.ts                → server-only，@neondatabase/serverless 的 neon(DATABASE_URL)
  ├─ lib/data/*.ts            → "use server"：先取会话 uid，再执行带 uid 过滤的 SQL；写操作返回 ActionResult（生产环境 server action 抛出的错误会被脱敏，不能靠 throw 传业务错误）
  └─ lib/{profiles,dwellings,…}.ts → 客户端门面（类型 + localStorage 指针 + 转出 data actions），页面 import 路径不变
Neon lucky-lake-64982745（ap-southeast-1）
  ├─ production（br-steep-firefly-a1zje5v4）← sojan.app（Vercel Production，git 分支 production）
  ├─ staging（从 production 分出）            ← zhaojian.agentjoey.ai（Vercel Preview，git 分支 staging）
  └─ dev（从 production 分出）                ← 本地开发 + 数据库集成测试（TEST_DATABASE_URL）
```

- **Neon Auth 必须先在 `production` 分支开启，再分出 staging / dev。** auth 状态随分支复制，每个分支有自己的 `NEON_AUTH_BASE_URL`。
- 每个分支要分别配置 trusted domains：
  - production：`https://sojan.app`
  - staging：`https://zhaojian.agentjoey.ai`
  - dev：允许 localhost
- Vercel 的随机预览域名不进白名单，**预览部署里登录不可用，这是已接受的取舍**。验证一律在 staging 上做。

## 5. 身份与会话

- **不再用 Bearer token。** 页面里约 20 处 `supabase().auth.getSession()` 拼 `Authorization` 头的代码删掉，同源 fetch 自动带 cookie。
- **路由 handler 和 server action 只认会话**：一律通过 `getUid()` / `requireUid()`（底层是 `auth.getSession()`）拿身份，不读请求里传来的 uid。
- **注销**（`POST /api/account/delete`）：
  1. 先在**一个事务**里删掉该 uid 名下的全部业务行；
  2. 再调 `auth.deleteUser()` 删认证账号。
  - 顺序是故意的：如果第 2 步失败，留下的只是一个空账号，可以重试；反过来的顺序可能留下没有主人的个人数据。
- **条款记录**：`recordConsentOnce` 改在**首次登录成功后**调用。`account` 页登录成功时调 server action `acceptTermsOnce()`。

## 6. 目标 Schema（`db/migrations/0001_baseline.sql`）

**通用规则**
- 业务表的 `user_id` / `uid` 是 `uuid not null`，**不加外键指向 `neon_auth`**。避免和托管 schema 耦合，删除由 §5 的应用层事务保证。
- 去掉所有 `default auth.uid()`、RLS 策略、`anon` / `authenticated` 的授权语句。
- 业务表之间的外键原样保留：
  - `dream_history.profile_id` → `profiles` on delete cascade
  - `jiao_history.profile_id` → `profiles` on delete cascade
  - `fengshui_reports.dwelling_id` → `dwellings` on delete cascade

**保留的 8 张表**（列、约束、索引与生产一致，只去掉指向 `auth` 的外键和默认值）：
`profiles`、`dwellings`、`fengshui_reports`、`dream_history`、`jiao_history`、`entitlements`、`llm_usage`、`user_consents`。

**函数与触发器**
- `profiles_freeze()` + 触发器 `profiles_freeze_trg`（before update）：原样保留。
- `consume_llm_credit_account(p_user_id uuid, p_free int default 30) returns boolean`：保留函数体，**去掉 `security definer`**。只有服务端会调用它，一条语句就是一个事务，原子性不受影响。

**不迁移的**：`spirit_messages`、`tg_users`、`email_bind_pending`、`consume_llm_credit`、`merge_anon_profiles`。

**迁移记录**：用 `schema_migrations(name text primary key, applied_at timestamptz default now())` 表，由 `apps/web/scripts/db-migrate.mjs` 维护。旧的 `supabase/migrations/` 目录整体删除（git 历史保留）。

## 7. 邮件

- dev 分支用 Neon 共享 SMTP 即可。验证码在共享 SMTP 上也能发。
- staging / production 上线前必须配 **Custom SMTP**：
  - 推荐 Resend SMTP，发信地址 `noreply@sojan.app`；
  - 要先在 DNS 配好 SPF/DKIM；
  - Neon 里把应用名设成「照见 Sojan」。
- 品牌化、双语的邮件模板（改用 `send.otp` webhook 由我们自己发信）不在本次范围。

## 8. 数据迁移与切换

- **只迁 owner 的数据。** 步骤：
  1. owner 在 Neon production 上用同一邮箱登录一次，生成新 uid；
  2. 从 Supabase 导出 owner（`yuan1985@outlook.com`）名下的 `profiles`（含已生成的解读）、`dwellings`、`fengshui_reports`、`dream_history`、`jiao_history`、`entitlements`、`user_consents`；
  3. 把 uid 换成新值，插入 Neon。
- 匿名和 TG 测试数据不迁。
- **切换顺序**：先 staging（Neon staging 分支 + Vercel Preview env），再 production。
- **回滚**：切换后 Supabase 项目**暂停保留 2–4 周**，期间回滚就是把 Vercel env 和代码分支回退；到期经 owner 确认再删除。

## 9. 风险与遗留

- **Neon Auth SDK 仍是 beta 版本号**：`@neondatabase/auth` 锁死在 `0.6.0-beta`，升级前看 changelog（10-16 那次升级已经改过 account 方法的参数）。
- **会话 cookie 的 `sameSite` 默认是 `strict`**：对验证码登录没影响，以后加 magic link 或第三方登录时要重新评估。
- **区域一致**：Vercel 函数区域必须设为 `sin1`。否则（默认 `iad1`）每条 SQL 都要跨太平洋走一个来回。
- **现存的未鉴权 LLM 入口**（`/api/reading`、`app/actions.ts` 的 `dailyPolish` / `dailyBehavior`）不在本次范围，记 BACKLOG `EP-llm-unauth`。
- **TG 恢复**：日后从 git 历史按新身份模型重新接入，记 BACKLOG `EP-tg-replan`。
