"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { getAccountSummary, acceptTermsOnce } from "@/lib/data/account";
import { DEFAULT_NEXT, safeNext } from "@/lib/auth/next";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_S, OTP_SEND_TIMEOUT_MS, settleAuthCall } from "@/lib/auth/otp";
import { Paywall } from "@/components/Paywall";
import { PageHeader } from "@/components/PageHeader";
import { CastingOverlay } from "@/components/CastingOverlay";
import { Emphasis } from "@/components/ui";
import { clearLocalCaches } from "@/lib/local-cache";
import { useT } from "@/lib/i18n/I18nProvider";
import { LocaleSwitch } from "@/lib/i18n/switch";

/** 信息分区：小标签 + 内容，区间 1px 细线（当代东方编辑式）。 */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="py-7" style={{ borderTop: "1px solid var(--color-line)" }}>
      <h2 className="mb-4 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </h2>
      {children}
    </section>
  );
}

type ViewState = { kind: "loading" } | { kind: "in"; email: string } | { kind: "out" };

/**
 * 发码结果：`uncertain` = 客户端超时或网关 504——服务端可能已经生成并发出了新码
 * （此时旧邮件里的码已失效），所以按「可能已发出」处理，而不是报失败。
 */
type SendOutcome = "sent" | "uncertain" | "failed";

type BillingStatus = {
  tier: string;
  memberUntil: string | null;
  used: number;
  free: number;
};

export default function AccountPage() {
  const t = useT();
  const router = useRouter();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  // 验证码错误时保留输入框原值、只显示错误文案，方便改一位重试或点「重新发送」。
  const [error, setError] = useState<string | null>(null);
  // 非错误的提示（如「以最新一封为准」），与 error 分开展示。
  const [notice, setNotice] = useState<string | null>(null);
  // 「重新发送」冷却截止时刻（按时间戳算剩余秒数，后台标签页节流也不会拖慢倒计时）。
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 会话以服务端为准（Neon Auth cookie），不在浏览器侧读 token。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await getAccountSummary();
        if (!cancelled) setView(summary ? { kind: "in", email: summary.email } : { kind: "out" });
      } catch {
        if (!cancelled) setView({ kind: "out" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 会员状态与本月额度（同源请求，身份由 cookie 带上）
  useEffect(() => {
    if (view.kind !== "in") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/status", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as BillingStatus;
        if (!cancelled) setBilling(json);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  /** 发送（或重新发送）验证码；最多等 OTP_SEND_TIMEOUT_MS，超时即中止请求并解锁界面。 */
  async function sendCode(): Promise<SendOutcome> {
    const addr = email.trim();
    if (!addr.includes("@")) {
      setError(t("account.invalidEmail"));
      return "failed";
    }
    setBusy("send");
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve("timeout");
      }, OTP_SEND_TIMEOUT_MS);
    });
    let outcome: SendOutcome;
    try {
      const res = await Promise.race([
        settleAuthCall(
          authClient.emailOtp.sendVerificationOtp({
            email: addr,
            type: "sign-in",
            fetchOptions: { signal: controller.signal },
          }),
        ),
        timedOut,
      ]);
      if (res === "timeout") outcome = "uncertain";
      else if (!res.error) outcome = "sent";
      else if (res.error.status === 504) outcome = "uncertain";
      else {
        setError(res.error.status === 429 ? t("account.otp.rateLimited") : t("account.otp.sendFailed"));
        outcome = "failed";
      }
    } catch {
      if (controller.signal.aborted) outcome = "uncertain";
      else {
        setError(t("account.otp.sendFailed"));
        outcome = "failed";
      }
    } finally {
      clearTimeout(timer);
      setBusy(null);
    }
    if (outcome !== "failed") {
      setEmail(addr);
      const n = Date.now();
      setNow(n);
      setCooldownUntil(n + OTP_RESEND_COOLDOWN_S * 1000);
      if (outcome === "uncertain") setNotice(t("account.otp.sendUncertain"));
    }
    return outcome;
  }

  async function handleSendEmail() {
    if ((await sendCode()) !== "failed") setStep("code");
  }

  async function handleResend() {
    // 每次重发都会让上一封邮件里的码失效——明确告诉用户以最新一封为准。
    if ((await sendCode()) === "sent") setNotice(t("account.otp.resent"));
  }

  async function handleVerify() {
    if (code.length !== OTP_LENGTH) return;
    setBusy("verify");
    setError(null);
    try {
      const { error: err } = await settleAuthCall(authClient.signIn.emailOtp({ email, otp: code }));
      if (err) {
        setError(err.status === 429 ? t("account.otp.rateLimited") : t("account.otp.invalidCode"));
        return;
      }
      // 验证码通过后会话 cookie 必须已经落地：服务端读不到会话（trusted origin / cookie 配置问题等）
      // 就别假装登录成功——停在验证码表单、保留输入，给出可读错误。
      const summary = await getAccountSummary().catch(() => null);
      if (!summary) {
        setError(t("account.otp.sessionMissing"));
        return;
      }
      // 条款接受记录是登录的附带动作，失败不挡路。
      await acceptTermsOnce().catch(() => {});
      // ?next= 只接受同源相对路径（safeNext 拒绝 "//evil.com" 等），防 open redirect。
      const target = safeNext(new URLSearchParams(window.location.search).get("next"));
      router.replace(target);
      // 目标就是本页时 replace 不会重挂载组件，要自己把视图切成已登录。
      if (target === DEFAULT_NEXT) setView({ kind: "in", email: summary.email });
    } catch {
      setError(t("account.otp.verifyFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteAccount() {
    if (!deleteChecked) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError(json.error || t("account.deleteFailed"));
        return;
      }
      clearLocalCaches();
      await authClient.signOut().catch(() => {});
      location.href = "/";
    } catch {
      setDeleteError(t("account.deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLogout() {
    await authClient.signOut().catch(() => {});
    clearLocalCaches();
    setView({ kind: "out" });
    setStep("email");
    setCode("");
    setError(null);
    setNotice(null);
    setBilling(null);
    router.refresh();
  }

  if (view.kind === "loading") {
    // owner 打磨批指令 7：加载态统一为持续版风铃过场（原为居中一行「加载中…」）。
    return <CastingOverlay title={t("common.loading")} mode="pending" />;
  }

  const title = view.kind === "in" ? view.email : t("account.saveYourSojan");

  const primaryBtn = "w-full px-4 py-3 text-[14px] font-medium transition-colors disabled:opacity-60";
  const primaryStyle = {
    background: "var(--color-cinnabar)",
    color: "var(--color-paper)",
    borderRadius: "var(--radius-button)",
  };
  const inputCls =
    "w-full border bg-transparent px-4 py-3 text-[14px] outline-none transition-colors focus:border-[var(--color-cinnabar)]";
  const inputSt = {
    borderColor: "var(--color-line)",
    color: "var(--color-ink)",
    borderRadius: "var(--radius-button)",
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <PageHeader kicker={t("account.kicker")} title={title} />

      <div className="mt-6 flex items-center justify-between py-2">
        <span className="text-[13px]" style={{ color: "var(--color-ink)" }}>{t("account.language")}</span>
        <LocaleSwitch />
      </div>

      {billing && (
        <Section label={t("account.sectionSubscription")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              {/* 6c：订阅等级 serif 19px。 */}
              <p className="font-serif text-[19px] font-semibold" style={{ color: "var(--color-ink)" }} data-testid="billing-tier">
                {billing.tier === "member" ? t("account.tierMember") : t("account.tierFree")}
              </p>
              {billing.tier === "member" && billing.memberUntil ? (
                <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                  {t("account.expiresOn", { date: new Date(billing.memberUntil).toLocaleDateString("zh-CN") })}
                </p>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--color-muted)" }}>
                  {t("account.usageThisMonth", { used: billing.used, free: billing.free })}
                </p>
              )}
            </div>
            {billing.tier !== "member" && (
              <button
                type="button"
                onClick={() => setShowPaywall(true)}
                className="px-4 py-2 text-[13px] font-medium transition-colors"
                style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}
              >
                {t("paywall.upgrade")}
              </button>
            )}
          </div>
          {showPaywall && (
            <div className="mt-4">
              <Paywall reason="quota" onClose={() => setShowPaywall(false)} />
            </div>
          )}
        </Section>
      )}

      {view.kind === "out" && (
        <Section label={t("account.sectionLogin")}>
          {step === "email" ? (
            <>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t("account.otp.intro")}
              </p>

              <div className="mt-4 space-y-2">
                <label htmlFor="email" className="block text-[13px]" style={{ color: "var(--color-ink)" }}>
                  {t("account.emailAddress")}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={inputCls}
                  style={inputSt}
                  onKeyDown={(e) => e.key === "Enter" && busy !== "send" && handleSendEmail()}
                />
              </div>

              <button
                type="button"
                onClick={handleSendEmail}
                disabled={busy === "send"}
                className={`${primaryBtn} mt-4`}
                style={primaryStyle}
              >
                {busy === "send" ? t("common.sending") : t("account.otp.send")}
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {t("account.otp.sentTo", { email })}
              </p>

              <div className="mt-4 space-y-2">
                <label htmlFor="otp" className="block text-[13px]" style={{ color: "var(--color-ink)" }}>
                  {t("account.otp.codeLabel")}
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                  placeholder="000000"
                  className={`${inputCls} tracking-[0.5em]`}
                  style={inputSt}
                  onKeyDown={(e) => e.key === "Enter" && busy === null && handleVerify()}
                />
              </div>

              <button
                type="button"
                onClick={handleVerify}
                disabled={busy !== null || code.length !== OTP_LENGTH}
                className={`${primaryBtn} mt-4`}
                style={primaryStyle}
              >
                {busy === "verify" ? t("account.otp.verifying") : t("account.otp.verify")}
              </button>

              <div className="mt-3 flex items-center justify-between text-[13px]">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={busy === "send" || cooldown > 0}
                  className="underline underline-offset-4 disabled:opacity-60"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {cooldown > 0 ? t("account.otp.resendIn", { s: cooldown }) : t("account.otp.resend")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                    setNotice(null);
                  }}
                  className="underline underline-offset-4"
                  style={{ color: "var(--color-ink-2)" }}
                >
                  {t("account.otp.changeEmail")}
                </button>
              </div>
            </>
          )}

          {notice && (
            <p role="status" className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--color-ink-2)" }}>
              {notice}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
              {error}
            </p>
          )}
        </Section>
      )}

      {view.kind === "in" && (
        <Section label={t("account.sectionData")}>
          {/* 6c：危险区走全站唯一的强调手法（Emphasis，02-components §2 列出的
              「危险区」用例）——取代此前的朱砂边框盒（那是第二种强调手法）。 */}
          <Emphasis data-testid="danger-zone" className="py-1">
            <h3 className="mb-2 text-[13px] font-medium" style={{ color: "var(--color-cinnabar)" }}>
              {t("account.dangerZone")}
            </h3>
            <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--color-cinnabar)" }}>
              {t("account.deleteWarning")}
            </p>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="w-full px-4 py-3 text-[13px] font-medium transition-colors"
                style={{
                  border: "1px solid var(--color-cinnabar)",
                  color: "var(--color-cinnabar)",
                  background: "transparent",
                  borderRadius: "var(--radius-button)",
                }}
              >
                {t("account.deleteAccount")}
              </button>
            ) : (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={deleteChecked}
                    onChange={(e) => setDeleteChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-cinnabar)]"
                  />
                  <span className="text-[12px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
                    {t("account.deleteAcknowledge")}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={!deleteChecked || deleteLoading}
                  className="w-full px-4 py-3 text-[13px] font-medium transition-colors disabled:opacity-50"
                  style={primaryStyle}
                >
                  {deleteLoading ? t("account.deleting") : t("account.confirmDelete")}
                </button>
                {deleteError && (
                  <p className="text-[12px]" style={{ color: "var(--color-cinnabar)" }}>
                    {deleteError}
                  </p>
                )}
              </div>
            )}
          </Emphasis>
        </Section>
      )}

      {view.kind === "in" && (
        <div className="py-7" style={{ borderTop: "1px solid var(--color-line)" }}>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 text-[14px] font-medium transition-colors"
            style={{
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              background: "transparent",
              borderRadius: "var(--radius-button)",
            }}
          >
            {t("account.signOut")}
          </button>
        </div>
      )}
    </main>
  );
}
