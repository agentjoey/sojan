/** 邮箱验证码位数（Neon Auth / Better Auth 默认 6 位）。 */
export const OTP_LENGTH = 6;

/**
 * 发码请求的客户端超时。Neon Auth 走慢 SMTP 时可能挂约 30 s 才回 504，
 * 期间按钮全部禁用；超时后解锁界面，但服务端可能仍会发出邮件。
 */
export const OTP_SEND_TIMEOUT_MS = 15_000;

/** 发码后「重新发送」的冷却秒数。每次重发都会让上一封邮件里的码失效，冷却减少串码。 */
export const OTP_RESEND_COOLDOWN_S = 30;
