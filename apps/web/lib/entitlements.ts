import "server-only";
import { sql } from "@/lib/db";

/** 权益与 LLM 额度（Neon）。仅服务端使用：路由、Server Action、data 层。 */

export type Entitlement = { tier: string; memberUntil: string | null };

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const rows = await sql()`select tier, member_until from entitlements where user_id = ${userId}`;
  const r = rows[0] as { tier: string | null; member_until: string | Date | null } | undefined;
  return {
    tier: r?.tier ?? "free",
    memberUntil: r?.member_until ? new Date(r.member_until).toISOString() : null,
  };
}

export function isMember(e: Entitlement): boolean {
  return e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now();
}

export async function consumeLlm(userId: string): Promise<{ ok: boolean; reason?: "paywall" }> {
  if (process.env.BILLING_ENABLED !== "1") return { ok: true }; // pre-prod 放行
  if (isMember(await getEntitlement(userId))) return { ok: true }; // 会员无限
  const free = Number(process.env.FREE_LLM_MONTHLY ?? 30);
  const rows = await sql()`select consume_llm_credit_account(${userId}, ${free}) as ok`;
  return rows[0]?.ok === true ? { ok: true } : { ok: false, reason: "paywall" };
}

/** 本月已用 LLM 次数。period 与 `consume_llm_credit_account` 同口径（库内 `YYYY-MM`）。 */
export async function getLlmUsed(userId: string): Promise<number> {
  const rows = await sql()`
    select uses from llm_usage
    where user_id = ${userId} and period = to_char(now(), 'YYYY-MM')`;
  return Number(rows[0]?.uses ?? 0);
}
