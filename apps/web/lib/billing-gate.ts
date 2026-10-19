import { resolveAccess } from "@/lib/access";
import { getViewer } from "@/lib/account/uid";

export type PaymentGateResult = { ok: true } | { ok: false; reason: "not_identified" };

/**
 * 发起支付前的校验（EP-account2-05，spec §5）。本轮不接支付本体
 * （Stripe/TG Stars 卡凭据，见 billing spec T5/T6），这个函数是给未来
 * checkout 路由用的闸门——卡在**发起支付前**，不在回调后：回调时款已收讫，
 * 再拒绝就成了退款问题。
 *
 * 调用方（未来）：
 *   web  `/api/billing/checkout`：校验不过时返回特定错误码，Paywall
 *        就地展开「绑定邮箱」而不是把用户踢走。
 */
export async function requireVerifiedEmailForPayment(): Promise<PaymentGateResult> {
  // resolveAccess 只在 emailVerified 时才抬到 identified/member，
  // 所以「非 anonymous」已蕴含「邮箱已验证」——不需要第二道 hasVerifiedEmail 守卫。
  const access = await resolveAccess(await getViewer());
  if (access.level === "anonymous") return { ok: false, reason: "not_identified" };
  return { ok: true };
}
