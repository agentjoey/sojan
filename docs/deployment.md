# Deployment — Eastern-Astrology-MVP

> 托管：**Vercel**（Next.js App Router，函数区域固定 `sin1`，见 `apps/web/vercel.json`）。数据库 + 认证：**Neon**（Postgres + Neon Auth），2026-10 自 Supabase 迁入。设计见 `docs/superpowers/specs/2026-10-19-vercel-neon-migration-design.md`。
> ✅ **切换完成**：staging 2026-10-19、production 2026-10-20 已切到 Neon 并实测。Supabase 项目 `sxjcpoxhphlnwhpzachi` 已于 2026-10-20 暂停（回滚窗口 2–4 周，见 BACKLOG `EP-supabase-sunset`），Vercel Production 上的旧 Supabase/TG 变量随其下线一并删除。

## 环境变量
见 `.env.example`。生产用 `vercel env` 管理。下表均为**服务端变量**（无 `NEXT_PUBLIC_` 前缀，不会进客户端包）：

| Key | 用途 |
|-----|------|
| `DATABASE_URL` | Neon 连接串（pooled）。仅服务端；缺失时数据层报「`DATABASE_URL` 未配置」。**每个 Vercel 环境指向各自的 Neon 分支**（见下节映射）|
| `NEON_AUTH_BASE_URL` | Neon Auth 地址，**每个 Neon 分支各一个**（见下节）|
| `NEON_AUTH_COOKIE_SECRET` | 签名 session cookie 的密钥，≥32 字符（`openssl rand -base64 32`）。**staging 与 production 必须不同** |
| `TEST_DATABASE_URL` | 可选，仅 `*.db.test.ts` 用，指向 Neon dev 分支；不设则这些测试 skip。**不要配进 Vercel** |
| `LLM_API_KEY` | LLM 密钥。默认 MiniMax-M3 走 anthropic 兼容线（`sk-cp…`）；兼容读取 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` 作为回退 |
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_BASE_URL` / `LLM_WIRE` | 可插拔 LLM，未设时用 MiniMax-M3 默认值（见 CLAUDE.md）|
| `BILLING_ENABLED` | 会员闸门总开关。**不为 `"1"`（默认）时不做任何限制** |
| `FREE_LLM_MONTHLY` | 免费账号每月 LLM 额度，不设 = 30（`lib/entitlements.ts`；仅 `BILLING_ENABLED=1` 时生效）|
| `FREE_PROFILE_LIMIT` | 免费档案上限，不设 = 3（仅 `BILLING_ENABLED=1` 时生效）|
| `NEXT_PUBLIC_SPIRIT_ENABLED` | 本命之灵 / 掷筊 flag，`=1` 开启 |
| `NEXT_PUBLIC_FENGSHUI_ENABLED` | 风水「境」flag，`=1` 开启。**2026-08-16 起 Production + Preview 均已设为 1** |
| `NEXT_PUBLIC_DREAM_ENABLED` | 解梦 flag，`=1` 开启 |

⚠️ `NEXT_PUBLIC_*`（上表三个 flag：`SPIRIT` / `FENGSHUI` / `DREAM`；代码里只用到这三个）是**构建期内联**的：改后必须**重新部署**才生效。
⚠️ **每个会执行 `next build` 的 Vercel 环境（Production **和** Preview）都必须配 `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET`**：`app/api/auth/[...path]/route.ts` 在 import 时就实例化 auth，缺任何一个 `next build` 直接失败（不是运行时才报错）。Preview 可指向 dev 分支的值。
⚠️ **已移除**（迁移后 Vercel 上若还留着请清掉）：所有 `SUPABASE*` / `NEXT_PUBLIC_SUPABASE_*`、`TELEGRAM_*`、`TG_*`、`NEXT_PUBLIC_TG_*`、`NEXT_PUBLIC_MINIAPP_URL`、`CRON_SECRET`、`NEXT_PUBLIC_BILLING_ENABLED`、`NEXT_PUBLIC_FREE_PROFILE_LIMIT`。

## Neon 分支 ↔ Vercel 环境
Neon 项目 `sojan`（`lucky-lake-64982745`，AWS ap-southeast-1，PG 18）。**Neon Auth 状态随分支复制，每个分支有独立的 `NEON_AUTH_BASE_URL` 与 trusted origins。**

| Neon 分支 | branch id | 对应环境 | git 分支 | trusted origins |
|---|---|---|---|---|
| production | `br-steep-firefly-a1zje5v4` | Vercel Production · `sojan.app` | `production` | `https://sojan.app` |
| staging | `br-dry-recipe-a1yu0b5m` | Vercel Preview · `zhaojian.agentjoey.ai` | `staging` | `https://zhaojian.agentjoey.ai` |
| dev | `br-sweet-shadow-a1j0jfsd` | 本地开发 + `TEST_DATABASE_URL` | — | 无（靠 localhost）|

- 各分支的 `NEON_AUTH_BASE_URL` 形如 `https://<ep-id>.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth`，取值见 Neon Console → Auth（或设计文档 §2 Task 1 表）。
- Vercel 随机预览域名**不在白名单，预览部署里登录不可用**（已接受的取舍）；验证一律在 staging 上做。

### 上线前必做（Neon Console，MCP 无对应开关）
1. **关闭 `allow_localhost`**：Console → Settings → Better Auth，把 **production 与 staging** 两个分支的 `allow_localhost` 关掉（三个分支目前都还是 `true`，对应 Task 11 Step 1b）。dev 分支保持开启。
2. **配 Custom SMTP**（staging / production 上线前必须，共享 SMTP 仅限 dev）：用 Resend，**暂用已验证的 `agentjoey.ai` 发信域名**（owner 2026-10-19 决定；以后可换 `sojan.app`，届时先在 DNS 配 SPF/DKIM）。Neon Console → 对应分支 → Settings → Better Auth → Email provider 选 Custom SMTP：Host `smtp.resend.com`、Port `465`（SSL）、Username `resend`、Password 填 Resend API key、Sender `noreply@agentjoey.ai`、Sender name「照见 Sojan」；配好后用 Neon 的 send test email 验证。staging/production 两个分支各配一次。

## 部署
- **平台：** Vercel（Next.js App Router 原生，Fluid Compute）。**函数区域固定 `sin1`**（`apps/web/vercel.json` 的 `regions`），必须与 Neon 同在新加坡，否则默认 `iad1` 每条 SQL 都要跨太平洋走一个来回。
- **计算：** 排盘 + LLM 调用在 Server Action / Route Handler，密钥不出服务端。
- **持久化：** Neon Postgres。Schema 在 `apps/web/db/migrations/`，**部署前**对目标分支手动迁移（幂等，记录在 `schema_migrations` 表）：
  ```bash
  DATABASE_URL=<目标分支连接串> pnpm --filter @sojan/web db:migrate
  ```
- **命令：**
  ```bash
  pnpm install
  pnpm build
  vercel deploy            # preview
  vercel deploy --prod     # production
  ```
- **回滚：** 切换后 Supabase 项目（`sxjcpoxhphlnwhpzachi`）暂停保留 2–4 周；回滚 = 把 Vercel env 和代码分支回退。到期删除须 owner 确认（BACKLOG `EP-supabase-sunset`）。Supabase 暂停时间待 Task 12 后补。
- **Telegram 已下线**：bot webhook、`/api/tg/*`、cron 均已删除，无需再配 `setWebhook`。重新接入见 BACKLOG `EP-tg-replan`。

## 发布
```bash
./scripts/release.sh [patch|minor|major]   # 自动 bump 版本 + 同步 .agent/CURRENT.md & CLAUDE.md
# 随后手动补 Version History 描述（PostBash Hook 会提醒），再 git commit + tag
```
