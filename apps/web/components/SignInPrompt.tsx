"use client";

import Link from "next/link";
import { SealIcon } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

/**
 * 「登录后建档」引导（D1：未登录访客不能存档）。依赖档案的页面对访客、以及会话中途
 * 失效（action 抛 `UnauthenticatedError`）时整页换成它。`next` 是登录后回到的路径，
 * 由 /account 的 `safeNext` 校验同源。
 */
export function SignInPrompt({ next }: { next: string }) {
  const t = useT();
  return (
    <main
      data-testid="sign-in-prompt"
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
    >
      <SealIcon char="照" variant="zhu" size={48} />
      <h1 className="mt-5 font-serif text-[20px] font-semibold text-ink">{t("signInPrompt.title")}</h1>
      <p className="mt-2 max-w-[320px] text-[13.5px] leading-relaxed text-ink-2">{t("signInPrompt.body")}</p>
      <Link
        href={`/account?next=${encodeURIComponent(next)}`}
        className="zj-btn mt-6 inline-flex items-center justify-center px-6 py-3 text-[15px] font-medium transition-colors duration-200 hover:bg-[var(--color-cinnabar-press)]"
        style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}
      >
        {t("signInPrompt.cta")}
      </Link>
    </main>
  );
}
