"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { phaseAfter, formatQuestionnaire, MAX_THROWS, type Omen, type BlockFace } from "@sojan/core";
import { getActiveProfile, getSpiritMemory, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { throwJiao } from "@/lib/jiao";
import { listJiaoHistory, appendJiaoHistory, type JiaoHistoryEntry } from "@/lib/jiao-history";
import { JiaoThrow } from "@/components/JiaoThrow";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { jiaoSummaryAction } from "@/app/actions";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

type Stage =
  | { kind: "asking" } // 输入问题，尚未掷
  | { kind: "throwing"; blocks: [BlockFace, BlockFace]; omen: Omen }
  | { kind: "rethrow"; omen: Omen } // 笑筊，可重掷
  | { kind: "reading" } // 落定，等灵解
  | { kind: "conversing"; seed: { role: "user" | "spirit"; content: string }[] };

export default function SpiritPage() {
  const t = useT();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [question, setQuestion] = useState("");
  const [throws, setThrows] = useState<Omen[]>([]);
  const [stage, setStage] = useState<Stage>({ kind: "asking" });
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [memory, setMemory] = useState<string | null>(null);
  const [questionnaire, setQuestionnaire] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<JiaoHistoryEntry[]>([]);

  // 深链入口（画像页「聊聊这个」/「境」页每条化解的「聊聊这条建议」）——见下方
  // topic/query 解析。这两个入口本身就带着一件具体的事，跳过掷筊闸门直接进对话，
  // 语义上等价于「已经想清楚要问什么了」，不需要再补一次仪式。
  const [topic, setTopic] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTopic(params.get("topic"));
    setQuery(params.get("q"));
  }, []);

  useEffect(() => {
    if (!ENABLED) return;
    (async () => {
      try {
        if (hasTgSession()) {
          setProfile(await tgGetProfile());
          return;
        }
        const p = await getActiveProfile();
        setProfile(p);
        if (p) {
          const [mem, qa] = await Promise.all([getSpiritMemory(p.id), getQuestionnaire(p.id)]);
          setMemory(mem);
          setQuestionnaire(qa ? formatQuestionnaire(qa) : undefined);
        }
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  // 历史列表独立 effect + 独立 try/catch：加载失败只留空列表，不挡主流程（同 /dream）
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        setHistory(await listJiaoHistory(profile.id));
      } catch {
        /* 保持空列表 */
      }
    })();
  }, [profile]);

  const tooLong = question.trim().length > 500;
  const canThrow = !!profile && question.trim().length >= 4 && !tooLong;

  function doThrow() {
    if (!canThrow) return;
    setError(null);
    const r = throwJiao();
    setStage({ kind: "throwing", blocks: r.blocks, omen: r.omen });
  }

  /** 动画落定后按三掷规则分流。 */
  async function onSettled(omen: Omen) {
    const next = [...throws, omen];
    setThrows(next);
    const phase = phaseAfter(next);
    if (phase.kind === "rethrow") {
      setStage({ kind: "rethrow", omen });
      return; // 笑筊不走 LLM、不消耗额度
    }
    setStage({ kind: "reading" });
    await askSpirit(omen, phase.kind === "exhausted");
  }

  async function askSpirit(omen: Omen, exhausted: boolean) {
    if (!profile) return;
    const q = question.trim();
    try {
      const { data: sessionData } = await supabase().auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/spirit/jiao", {
        method: "POST",
        headers: { "content-type": "application/json", "x-zj-locale": locale, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ chart: profile.chart, question: q, omen, exhausted, memory: memory ?? undefined, questionnaire }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setNeedLogin(true);
          setStage({ kind: "asking" });
          return;
        }
        throw new Error(await res.text());
      }
      const reply = await res.text();
      setStage({ kind: "conversing", seed: [{ role: "user", content: q }, { role: "spirit", content: reply }] });
      // 历史摘要 fire-and-forget（同 /dream 的处理）：失败不影响已经拿到的回应
      jiaoSummaryAction(q, reply, locale).then((summary) => {
        if (!summary) return;
        void appendJiaoHistory(profile.id, omen, summary, reply).then(() => listJiaoHistory(profile.id).then(setHistory));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage({ kind: "asking" });
    }
  }

  function reset() {
    setQuestion("");
    setThrows([]);
    setError(null);
    setStage({ kind: "asking" });
  }

  if (!ENABLED) return <Centered><p className="text-muted">{t("spirit.notEnabled")}</p></Centered>;
  if (profile === undefined) return <Centered>{t("spirit.loadingProfile")}</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("jiao.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("spirit.goCast")}
        </Link>
      </Centered>
    );

  // topic=portrait：既有的画像开场白（固定文案，不带 URL 参数）。
  // topic=fengshui：q 是「境」页某条化解自己的动作文本（不是 remedyId），
  // 用 talkFengshuiMessage 模板拼成一句关于这条化解的提问；没有 q（畸形链接）时
  // 不拼——总不能对着空动作文本造出一句不知所云的话。
  // 其余情况（含未带 topic）不自动发送，走下面的掷筊闸门。
  const autoSend =
    topic === "portrait"
      ? t("spirit.talkPortraitMessage")
      : topic === "fengshui" && query
        ? t("spirit.talkFengshuiMessage", { action: query })
        : undefined;

  // 深链入口（画像 / 境）已经带着一件具体的事进来，直接对话——保留 EP-jiao 之前的
  // 行为，不套掷筊闸门（闸门收窄的是「/spirit 冷启动」这个起手姿势，不是每一次进入）。
  if (autoSend !== undefined) {
    return (
      <main className="flex h-[100dvh] flex-col">
        <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
          <Link href="/chart" className="flex items-center gap-1 text-[14px] text-ink-2">
            <span>←</span>
            <span>{t("common.back")}</span>
          </Link>
          <Link href="/spirit/portrait" className="text-[13px] text-cinnabar">
            {t("spirit.viewPortrait")}
          </Link>
        </header>
        <SpiritPanel profile={profile} autoSend={autoSend} />
        <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
      </main>
    );
  }

  if (stage.kind === "conversing") {
    return (
      <main className="flex h-[100dvh] flex-col">
        <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
          <button type="button" onClick={reset} className="text-[14px] text-ink-2">← {t("jiao.newThrow")}</button>
        </header>
        <SpiritPanel profile={profile} seedTurns={stage.seed} />
        <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <PageHeader kicker={t("jiao.kicker")} title={t("jiao.title")} annotation={t("jiao.subtitle")} />

      {/*
       * 掷筊结果播报（无障碍）：JiaoThrow 内部的 aria-live 只包着两枚纯装饰用的筊块
       * div（无 accessible text，data-* 不进无障碍树），实际什么都播报不出来——这是
       * Task 6 遗留、明确留给本任务补的缺口。真正「掷筊之后发生了什么」的文字
       * （笑筊提示 / 灵在看这一卦）由下面这一个持续挂载（跨 asking/throwing/
       * rethrow/reading 四个 stage 都不卸载）的 live region 承载——它本身**就是**
       * rethrow/reading 阶段那段可见文案，不是另造一份镜像文本：只随 stage 切换
       * class（sr-only ⇄ 正常可见）与文字内容。这样每次更新都是「已挂载的 live
       * region 内部文本变化」，是各家屏幕阅读器都认的可靠播报触发方式（若拆成
       * 「每个 stage 各自的新节点」，多数 AT 不保证播报节点挂载时已经有的内容）；
       * 同时避免了可见段落与播报文案各说各话、或被 getByText 命中两份重复文本。
       */}
      <p
        aria-live="polite"
        role="status"
        className={
          stage.kind === "rethrow"
            ? "mt-6 text-[14px] leading-relaxed text-ink-2"
            : stage.kind === "reading"
              ? "mt-8 text-center text-[14px] text-muted"
              : "sr-only"
        }
      >
        {stage.kind === "rethrow" ? t("jiao.xiaoHint") : stage.kind === "reading" ? t("jiao.reading") : ""}
      </p>

      {stage.kind === "asking" && (
        <div className="mt-6">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("jiao.placeholder")}
            rows={3}
            className="w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-[var(--color-cinnabar)] focus:outline-none"
          />
          {tooLong && <p className="mt-2 text-[12px]" style={{ color: "var(--color-seal)" }}>{t("jiao.errorTooLong")}</p>}
          <Button onClick={doThrow} disabled={!canThrow}>{t("jiao.throwCta")}</Button>
        </div>
      )}

      {stage.kind === "throwing" && <JiaoThrow blocks={stage.blocks} onSettled={() => void onSettled(stage.omen)} />}

      {stage.kind === "rethrow" && (
        <div className="mt-2">
          <p className="text-[12px] text-muted">{t("jiao.throwsLeft", { n: String(MAX_THROWS - throws.length) })}</p>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="mt-3 w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[14px] text-ink focus:border-[var(--color-cinnabar)] focus:outline-none"
          />
          <Button onClick={doThrow} disabled={!canThrow}>{t("jiao.xiaoRethrow")}</Button>
        </div>
      )}

      {needLogin && (
        <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
          {t("jiao.needLogin")}
          <Link href="/account?next=/spirit" className="ml-2 underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
            {t("jiao.needLoginCta")} →
          </Link>
        </div>
      )}
      {error && (
        <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
          {error}
        </div>
      )}

      {stage.kind === "asking" && history.length > 0 && (
        <div className="mt-10 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
          <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("jiao.historyTitle")}</div>
          <ul className="mt-3 space-y-2.5">
            {history.map((h) =>
              h.fullText ? (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setStage({ kind: "conversing", seed: [{ role: "spirit", content: h.fullText! }] })}
                    className="block w-full text-left text-[13px] leading-relaxed text-ink-2 underline decoration-[var(--color-line)] underline-offset-4 transition-colors hover:text-ink hover:decoration-[var(--color-cinnabar)]"
                  >
                    {h.summary}
                  </button>
                </li>
              ) : (
                <li key={h.id} className="text-[13px] leading-relaxed text-ink-2">{h.summary}</li>
              ),
            )}
          </ul>
        </div>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
