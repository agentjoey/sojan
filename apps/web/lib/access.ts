import type { Viewer } from "@/lib/account/uid";
import { getEntitlement, isMember } from "@/lib/entitlements";

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
