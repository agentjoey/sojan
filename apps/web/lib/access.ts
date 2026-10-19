import type { Viewer } from "@/lib/account/uid";
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
  /** Neon Auth 里邮箱已验证（emailVerified）。 */
  hasVerifiedEmail: boolean;
};

/**
 * 全站唯一访问层级事实源（EP-account2-01，Neon Auth 版）。三层语义：
 *   anonymous  — 无会话，或邮箱未验证：只能排盘/看确定性内容
 *   identified — 邮箱已验证：可用 LLM 解读，计入免费额度
 *   member     — identified + 有效订阅：会员权益
 * 纯读取，无副作用——身份建立时的条款记录（consent）是独立的调用点，不在这里做。
 * 入参是 `getViewer()` 的结果：身份信息已在会话里，不再回查 auth 用户表。
 */
export async function resolveAccess(viewer: Viewer | null): Promise<AccessInfo> {
  if (!viewer || !viewer.emailVerified) return { level: "anonymous", hasVerifiedEmail: false };

  let level: AccessLevel = "identified";
  if (isMember(await getEntitlement(viewer.uid))) level = "member";
  return { level, hasVerifiedEmail: true };
}
