"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getWebUser, signInWithEmail, signOutWeb, upgradeAnonymousToEmail, supabase, ANON_MERGE_TOKEN_KEY } from "@/lib/supabase";
import { Paywall } from "@/components/Paywall";
import { PageHeader } from "@/components/PageHeader";
import { CastingOverlay } from "@/components/CastingOverlay";
import { Emphasis } from "@/components/ui";
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

type ViewState =
  | { kind: "loading" }
  | { kind: "email"; email: string }
  | { kind: "anon"; user: { id: string; email: string | null; isAnonymous: boolean } | null };

type BillingStatus = {
  tier: string;
  memberUntil: string | null;
  used: number;
  free: number;
};

export default function AccountPage() {
  const t = useT();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");
  const [mergeNotice, setMergeNotice] = useState<number | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [identities, setIdentities] = useState<{ email: string | null } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // EP-auth-return：从别的页面（如 /dream 的 needLogin 引导条）带 ?next= 过来时，
  // 登录成功后应该送回那一页，而不是永远落在 /account。只接受同源相对路径
  // （拒绝 "//evil.com" 这类协议相对地址），防 open redirect。
  const [nextPath, setNextPath] = useState<string | null>(null);
  useEffect(() => {
    // setState 放进异步体而不是 effect 同步段：同步 setState 会触发
    // react-hooks/set-state-in-effect（本仓库把它降为 warn 但不接受新增，见
    // 下方 bind 的 effect 同一处理）。
    (async () => {
      const raw = new URLSearchParams(window.location.search).get("next");
      if (raw && raw.startsWith("/") && !raw.startsWith("//")) setNextPath(raw);
    })();
  }, []);

  /**
   * 邮箱绑定确认屏（重设计）：用户点了验证邮件、/auth/callback 把 nonce 转到
   * 这里。绑定会把一个已验证邮箱移到另一个账号上，属于需要知情同意的动作——
   * 必须让用户看清「要绑哪个邮箱」并显式确认，而不是点开链接就悄悄完成。
   */
  const [bind, setBind] = useState<
    | { state: "none" }
    | { state: "loading"; nonce: string }
    | { state: "confirm"; nonce: string; email: string }
    | { state: "done" }
    | { state: "error"; message: string }
  >({ state: "none" });

  useEffect(() => {
    async function resolve() {
      const user = await getWebUser();
      if (user && user.email && !user.isAnonymous) {
        setView({ kind: "email", email: user.email });
      } else {
        setView({ kind: "anon", user });
      }
    }
    resolve();
  }, []);

  // 绑定确认：URL 带 ?bind=<nonce> 时先 peek（只读，不消费），拿到要绑的邮箱
  // 给用户看，等他确认再 complete。
  useEffect(() => {
    const nonce = new URLSearchParams(window.location.search).get("bind");
    if (!nonce) return;
    (async () => {
      // setBind 放进异步体里而不是 effect 同步段：同步 setState 会触发
      // react-hooks/set-state-in-effect（本仓库把它降为 warn 但不接受新增）。
      setBind({ state: "loading", nonce });
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setBind({ state: "error", message: t("account.bindExpired") });
          return;
        }
        const res = await fetch("/api/account/attach", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ kind: "email", phase: "peek", nonce }),
        });
        if (!res.ok) {
          setBind({ state: "error", message: t("account.bindExpired") });
          return;
        }
        const json = (await res.json()) as { email: string };
        setBind({ state: "confirm", nonce, email: json.email });
      } catch {
        setBind({ state: "error", message: t("account.bindExpired") });
      }
    })();
  }, [t]);

  useEffect(() => {
    const n = sessionStorage.getItem("zj_merged");
    if (n) {
      setMergeNotice(Number(n));
      sessionStorage.removeItem("zj_merged");
    }
  }, []);

  // 已绑定身份
  useEffect(() => {
    if (view.kind !== "email") return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/account/identities", {
          credentials: "include",
          headers,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { email: string | null };
        if (!cancelled) setIdentities(json);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind]);

  // 会员状态与本月额度
  useEffect(() => {
    if (view.kind === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch("/api/billing/status", {
          credentials: "include",
          headers,
        });
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

  /**
   * EP-account-login：换设备时这台设备几乎必然已经有匿名会话（起盘/解梦等页面
   * 挂载时就会 `ensureSession()`），所以之前这里无条件走 `upgradeAnonymousToEmail`
   * ——把邮箱**绑到当前这个匿名用户**。如果这个邮箱其实已经注册在别的设备上，
   * 绑定被正确拒绝，用户却只看到一句「邮箱重复」，从没机会真正登录自己的账号。
   *
   * 现在：先按「这是一个全新邮箱」尝试 upgrade；失败就退回真正的 `signInWithEmail`
   * 登录——不去猜测/匹配具体的错误文案（Supabase 的报错措辞不是稳定契约），失败
   * 就统一当作「这个邮箱可能已经属于别的账号」处理。退回登录前把这台设备当时的
   * 匿名 access token 存下来，`/auth/callback` 认出新会话后会用它把这台设备的
   * 匿名数据合并进真正登录的账号。
   */
  async function handleSendLink() {
    if (!email.includes("@")) {
      setStatus({ error: t("account.invalidEmail") });
      return;
    }
    setStatus("sending");
    const isAnon = view.kind === "anon" && !!view.user?.isAnonymous;
    if (!isAnon) {
      const result = await signInWithEmail(email, undefined, nextPath ?? undefined);
      if (result.ok) setStatus("sent");
      else setStatus({ error: result.error });
      return;
    }

    const { data: sessionData } = await supabase().auth.getSession();
    const anonToken = sessionData.session?.access_token;

    const upgraded = await upgradeAnonymousToEmail(email, nextPath ?? undefined);
    if (upgraded.ok) {
      setStatus("sent");
      return;
    }

    // upgrade 失败——大概率是邮箱已属于别的账号。退回真正的登录，让用户能进
    // 自己的账号；先存好这台设备的匿名 token 供 callback 合并数据。
    if (anonToken) localStorage.setItem(ANON_MERGE_TOKEN_KEY, anonToken);
    const signedIn = await signInWithEmail(email, undefined, nextPath ?? undefined);
    if (signedIn.ok) {
      setStatus("sent");
    } else {
      localStorage.removeItem(ANON_MERGE_TOKEN_KEY);
      setStatus({ error: signedIn.error });
    }
  }

  async function handleConfirmBind() {
    if (bind.state !== "confirm") return;
    const { nonce } = bind;
    setBind({ state: "loading", nonce });
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setBind({ state: "error", message: t("account.bindExpired") });
        return;
      }
      const res = await fetch("/api/account/attach", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: "email", phase: "complete", nonce }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setBind({
          state: "error",
          message: json.error === "taken" || json.error === "already_attached"
            ? t("account.linkEmailInUse")
            : t("account.bindExpired"),
        });
        return;
      }
      setBind({ state: "done" });
      // 绑定成功后账号身份变了，重载让 identities/billing 重新取。
      location.href = "/account";
    } catch {
      setBind({ state: "error", message: t("account.bindFailed") });
    }
  }

  async function handleDeleteAccount() {
    if (!deleteChecked) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError(json.error || t("account.deleteFailed"));
        return;
      }
      await signOutWeb().catch(() => {});
      location.href = "/";
    } catch {
      setDeleteError(t("account.deleteFailed"));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLogout() {
    const webUser = await getWebUser().catch(() => null);
    const webExists = !!webUser && !!webUser.email && !webUser.isAnonymous;
    if (webExists) await signOutWeb().catch(() => {});
    location.reload();
  }

  if (view.kind === "loading") {
    // owner 打磨批指令 7：加载态统一为持续版风铃过场（原为居中一行「加载中…」）。
    return <CastingOverlay title={t("common.loading")} mode="pending" />;
  }

  const title = view.kind === "email" ? view.email : t("account.saveYourSojan");

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

  const identitiesRows = (
    <>
      <div className="space-y-2 text-[13px]">
        {/* 6c（03-screens 我的+账号节）：绑定与登录诸行，未绑定项朱砂。 */}
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--color-muted)" }}>{t("account.email")}</span>
          <span data-testid="identity-email" style={{ color: identities?.email ? "var(--color-ink)" : "var(--color-cinnabar)" }}>
            {identities?.email ?? t("account.notLinked")}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
      <PageHeader kicker={t("account.kicker")} title={title} />

      <div className="mt-6 flex items-center justify-between py-2">
        <span className="text-[13px]" style={{ color: "var(--color-ink)" }}>{t("account.language")}</span>
        <LocaleSwitch />
      </div>

      {bind.state === "confirm" && (
        <div
          className="mt-2 p-4"
          style={{ border: "1px solid var(--color-cinnabar)", borderRadius: "var(--radius-card)" }}
        >
          <h3 className="mb-2 text-[13px] font-medium" style={{ color: "var(--color-cinnabar)" }}>
            {t("account.bindConfirmTitle")}
          </h3>
          <p className="mb-3 text-[13px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
            {t("account.bindConfirmBody", { email: bind.email })}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={handleConfirmBind} className={primaryBtn} style={primaryStyle}>
              {t("account.bindConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setBind({ state: "none" })}
              className="w-full px-4 py-3 text-[14px] font-medium transition-colors"
              style={{
                border: "1px solid var(--color-line)",
                color: "var(--color-ink)",
                background: "transparent",
                borderRadius: "var(--radius-button)",
              }}
            >
              {t("account.bindCancel")}
            </button>
          </div>
        </div>
      )}

      {bind.state === "error" && (
        <p className="mt-2 px-4 py-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
          {bind.message}
        </p>
      )}

      {mergeNotice !== null && (
        <div
          className="mt-2 px-4 py-3 text-[13px]"
          style={{
            background: "var(--color-tint)",
            color: "var(--color-cinnabar)",
            borderRadius: "var(--radius-chip)",
          }}
        >
          {t("account.mergedProfiles", { count: mergeNotice })}
        </div>
      )}

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

      {view.kind === "email" ? (
        <Section label={t("account.sectionBinding")}>
          {identitiesRows}
        </Section>
      ) : (
        <Section label={t("account.sectionLogin")}>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
            {t("account.anonymousDescription")}
          </p>

          <div className="mt-4 space-y-2">
            <label htmlFor="email" className="block text-[13px]" style={{ color: "var(--color-ink)" }}>
              {t("account.emailAddress")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className={inputCls}
              style={inputSt}
              onKeyDown={(e) => e.key === "Enter" && handleSendLink()}
            />
          </div>

          <button
            onClick={handleSendLink}
            disabled={status === "sending"}
            className={`${primaryBtn} mt-4`}
            style={primaryStyle}
          >
            {status === "sending" ? t("common.sending") : t("account.sendMagicLink")}
          </button>

          {status === "sent" && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
              {t("account.magicLinkSent")}
            </p>
          )}
          {typeof status === "object" && "error" in status && (
            <p className="mt-3 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
              {status.error}
            </p>
          )}
        </Section>
      )}

      {view.kind === "email" && (
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

      {view.kind === "email" && (
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
