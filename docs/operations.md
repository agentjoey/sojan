# Operations — Eastern-Astrology-MVP

> 日常运维 + 故障排查。主要关注排盘正确性、LLM 调用，以及 Neon（Postgres + Neon Auth）会话与数据库连通性。部署与分支映射见 `docs/deployment.md`。

## 健康检查清单
- [ ] 排盘金标准用例通过（跨立春/跨节气/早晚子时/真太阳时；见 `packages/core/test`）
- [ ] LLM 调用成功率、P95 延迟、`stop_reason:"refusal"` 比例
- [ ] 免责声明在结果页正确展示
- [ ] 登录（邮箱验证码）→ 建档 → 刷新后档案仍在（会话 cookie + `DATABASE_URL` 通）

## 常见故障排查
| 症状 | 可能原因 | 排查 |
|------|---------|------|
| 命盘四柱错误 | 真太阳时/子时归日未生效；时区/历史 DST | 检查 normalize 输出的「实际计算时刻」；对照 iztro/lunar 已知案例 |
| 紫微星曜错位 | iztro `timeIndex` 用了小时而非时辰索引 | 改用 `astro.getTimeIndex`；核对晚子时 |
| 西方盘缺失 | 缺纬度或时辰未知 → `western=null`（预期降级） | 确认输入；非 bug |
| 四化与预期流派不符 | `ZIWEI_MUTAGEN_SCHOOL` 配置 | 核对 iztro `configure({ mutagen })` |
| LLM 编造星曜/事件预测 | 提示词守护栏失效 | 检查 `SYNTHESIS_GUARDRAILS`；确认只喂事实 JSON |
| LLM 返回 refusal | 触发安全边界（健康/生死/财务预测）| 优雅降级，提示用户换问法；强化非决定论措辞 |
| `next dev` 退出 1 / `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` / "Another next dev server is already running" | 端口被占（本机 **Hermes WhatsApp bridge 常驻 :3000**），Next 退到 3001 后 abort | Web 已固定端口 **3030**（`apps/web` dev/start 脚本 `-p 3030`）。查占用：`lsof -nP -iTCP:3030 -sTCP:LISTEN`；清掉：`lsof -nP -iTCP:3030 -sTCP:LISTEN -t \| xargs kill -9` |
| 所有用户都显示未登录 / 登录后刷新又掉线 | `NEON_AUTH_BASE_URL` 缺失或指错分支；`NEON_AUTH_COOKIE_SECRET` 缺失或短于 32 字符；当前域名不在该 Neon 分支的 trusted domains（随机 Vercel 预览域名本就不在白名单，预期不可登录） | 对照 `docs/deployment.md` 的分支映射核对 env；Neon Console → Auth 看 trusted origins；浏览器 DevTools 看 `__Secure-neon-auth.*` cookie 是否被设置 |
| 验证码邮件收不到 | dev 用 Neon 共享 SMTP 有限流；staging/production 未配 Custom SMTP 或 SPF/DKIM 未通过 | 配 Resend（当前发信域名 `agentjoey.ai`，见 deployment.md）并核对 DNS；垃圾箱也查一下 |
| 数据层报「`DATABASE_URL` 未配置」 | 该环境没设 `DATABASE_URL`（`lib/db.ts` 抛出） | 在对应 Vercel 环境补上目标 Neon 分支的连接串，重新部署；本地检查 `apps/web/.env.local` |
| 查询明显变慢（每个页面多出几百 ms） | Vercel 函数区域不是 `sin1`（默认 `iad1`，每条 SQL 跨太平洋） | 确认 `apps/web/vercel.json` 的 `regions: ["sin1"]` 已部署；响应头 `x-vercel-id` 形如 `<edge>::<function>::<id>`，**第二段（function 区域）必须是 `sin1`**；第一段是边缘节点，不看它 |
| 注销后短时间内仍显示已登录 / 写入产生孤儿数据 | 没清 `__Secure-neon-auth.*` cookie，SDK 缓存会话 TTL 300s | 检查 `/api/account/delete` 响应的 Set-Cookie（有测试覆盖）；托管 `delete-user` 端点 404，注销走 SQL 事务 |
| 新环境一开页面就报表不存在 | 目标 Neon 分支没跑迁移 | `DATABASE_URL=<该分支> pnpm --filter @sojan/web db:migrate` |
| `/api/reading` 返回 503「LLM 未配置」 | 无 `LLM_API_KEY` | 设置 key：`apps/web/.env.local` 写 `LLM_API_KEY=sk-cp…`（gitignored），或 env 注入；默认 provider=minimax(anthropic 线) |

## 本地 / 局域网运行

| 命令 | 用途 |
|------|------|
| `pnpm --filter @sojan/web dev` | 本机开发，固定端口 **3030**（避开 :3000 的 Hermes WhatsApp bridge） |
| `pnpm --filter @sojan/web dev:lan` | 绑定 `0.0.0.0:3030`，**局域网可访问** |

**局域网访问步骤：**
1. 起 `dev:lan`，日志出现 `Network: http://0.0.0.0:3030`。
2. 查本机 LAN IP：`ipconfig getifaddr en1`（en1 可能因机器而异；当前 = `192.168.0.14`）。
3. 同 WiFi/网段设备访问 `http://<LAN-IP>:3030`。
4. **MiniMax key** 从 `apps/web/.env.local` 自动加载（service `minimax-api-key`，gitignored）。

**连不上排查：**
| 症状 | 原因 | 处理 |
|------|------|------|
| 本机能开、别的设备连不上 | macOS 防火墙（`socketfilterfw --getglobalstate` = 1）拦 node 入站 | `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node && sudo ... --unblockapp /usr/local/bin/node` |
| 远端完全不通 | 远端不在同一局域网（本机默认路由走 VPN `ipsec0`） | 改用内网穿透（cloudflared/ngrok）或让远端连同一网段/VPN |
| 地址访问不到、IP 变了 | `192.168.0.14` 是 DHCP 分配，重启路由器/换网会变 | 重新 `ipconfig getifaddr en1` |

> ⚠️ **安全**：LAN 暴露 `/api/reading` 会消耗 MiniMax 额度（任何同网段设备可调用）。仅可信网络临时使用，用完停服。
> 停服：`lsof -nP -iTCP:3030 -sTCP:LISTEN -t | xargs kill -9`

## 合规要点（常驻）
- 输出禁含医疗/法律/财务/生死的决定论判断；健康/心理危机内容路由到专业资源。
- 出生信息视为敏感个人信息：仅存于登录账号名下（Neon Postgres），仅本人可见，可在「档案」删除，注销账号时连同全部业务数据一并删除。
- 内容定位「自我反思/文化研究」，规避「迷信/算命」表述（见 `research/competitor-analysis.md §5` 合规策略）。

## 遇 Bug 流程
按 orchestration-spec §5.3 + `superpowers:systematic-debugging`；P0/P1 记入 `.agent/CURRENT.md` Open Bugs。
