"use server";

import { getViewer } from "@/lib/account/uid";
import { resolveAccess, type AccessInfo } from "@/lib/access";
import { recordConsentOnce, TERMS_VERSION } from "@/lib/consent";

/** 当前会话的账号概要；无会话返回 null（页面据此决定显示登录表单还是账号视图）。 */
export async function getAccountSummary(): Promise<{ email: string; access: AccessInfo } | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  return { email: viewer.email, access: await resolveAccess(viewer) };
}

/**
 * 登录成功后记一次条款接受（幂等、best-effort）。
 * 无会话时静默返回：这是登录流程的附带动作，不该因它失败而挡住用户。
 */
export async function acceptTermsOnce(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;
  await recordConsentOnce(viewer.uid, "terms", TERMS_VERSION);
}
