import { supabaseAdmin } from "@/lib/supabase-admin";
import { getEntitlement, isMember } from "@/lib/entitlements";

/**
 * TG 影子用户创建时用的合成邮箱域名（TG 已下线，但生产库 auth.users 里仍有存量
 * `tg_<id>@zhaojian.local` 账号）。单一事实源——任何一处漏改都会让「已验证邮箱」
 * 这个信号重新被污染。
 *
 * ⚠️ **刻意保留旧品牌名 zhaojian，不随 2026-08-25 更名 Sojan 而改**（owner 决策）：
 * 这是纯内部标识符、用户永远看不到，而**生产库 auth.users 里已有真实用户的邮箱是
 * `tg_<id>@zhaojian.local`**。改这个常量会让存量 TG 用户不再被识别为合成邮箱，
 * `hasVerifiedEmail` 对他们直接放行——正是 EP-account2 刚堵上的那个付费门槛漏洞。
 * 要改必须连生产数据一起迁移（邮箱是登录凭证的一部分），收益为零、风险实在。
 */
export const SYNTHETIC_EMAIL_DOMAIN = "zhaojian.local";

export type AccessLevel = "anonymous" | "identified" | "member";

export type AccessInfo = {
  level: AccessLevel;
  /** 真实、已验证、非合成域名的邮箱——不认 email_confirmed_at 的表面值。 */
  hasVerifiedEmail: boolean;
};

/**
 * 全站唯一访问层级事实源（EP-account2-01）。三层语义：
 *   anonymous  — 无真实已验证邮箱：只能排盘/看确定性内容
 *   identified — 有真实已验证邮箱：可用 LLM 解读，计入免费额度
 *   member     — identified + 有效订阅：会员权益
 * 纯读取，无副作用——身份建立时的条款记录（consent）是独立的调用点，不在这里做。
 */
export async function resolveAccess(uid: string): Promise<AccessInfo> {
  const sb = supabaseAdmin();

  const { data: userRes } = await sb.auth.admin.getUserById(uid);

  const email = userRes.user?.email ?? null;
  const emailConfirmed = !!userRes.user?.email_confirmed_at;
  const isSynthetic = !!email && email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
  const hasVerifiedEmail = emailConfirmed && !!email && !isSynthetic;

  const identified = hasVerifiedEmail;
  let level: AccessLevel = identified ? "identified" : "anonymous";
  if (identified) {
    const ent = await getEntitlement(uid);
    if (isMember(ent)) level = "member";
  }

  return { level, hasVerifiedEmail };
}
