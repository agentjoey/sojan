"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { phaseAfter, formatQuestionnaire, MAX_THROWS, type Omen, type BlockFace } from "@sojan/core";
import { getActiveProfile, getSpiritMemory, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { throwJiao } from "@/lib/jiao";
import { listJiaoHistory, appendJiaoHistory, type JiaoHistoryEntry } from "@/lib/jiao-history";
import { JiaoThrow, JiaoBlocksStatic } from "@/components/JiaoThrow";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { Paywall } from "@/components/Paywall";
import { jiaoSummaryAction } from "@/app/actions";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

type Stage =
  | { kind: "asking" } // 输入问题，尚未掷
  | { kind: "throwing"; blocks: [BlockFace, BlockFace]; omen: Omen }
  | { kind: "revealed"; blocks: [BlockFace, BlockFace]; omen: Omen } // UAT②：动画落定后先定格揭晓，用户点「继续」才推进
  | { kind: "rethrow"; omen: Omen } // 笑筊，可重掷
  | { kind: "reading" } // 落定，等灵解
  | { kind: "conversing"; seed: { role: "user" | "spirit"; content: string }[] };

/** 筊象 → 大字名 / 传统释义 的 i18n 键（UAT②：揭晓屏用，两个键此前定义了却无人使用）。 */
const OMEN_NAME_KEY: Record<Omen, string> = { 圣筊: "jiao.omenSheng", 笑筊: "jiao.omenXiao", 阴筊: "jiao.omenYin" };
const OMEN_DESC_KEY: Record<Omen, string> = { 圣筊: "jiao.omenShengDesc", 笑筊: "jiao.omenXiaoDesc", 阴筊: "jiao.omenYinDesc" };

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
  // UAT④：历史入口从「只在 asking 阶段的页面底部」挪到页头常驻按钮，本地开关控制展开/收起。
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // 风水页「就这条问一卦」带过来的预填问题（化解动作文本）。只预填，不自动掷——
  // 掷筊是用户自己的动作，不能替他掷。
  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("ask");
    if (ask) setQuestion(ask);
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
    setNeedLogin(false); // 新一次掷筊即视为用户已处理过登录态，不让旧横幅挂到刷新页面才消失
    const r = throwJiao();
    setStage({ kind: "throwing", blocks: r.blocks, omen: r.omen });
  }

  /**
   * 揭晓屏「继续」按下后按三掷规则分流（UAT②：此前挂在动画 onSettled 上直接分流，
   * 结果从未被展示给用户；现在动画落定先进 "revealed" 定格，用户确认看到筊象后
   * 点继续才走到这里——分流逻辑本身不变，只是触发时机从「动画结束」挪到「用户确认」）。
   */
  async function proceedAfterReveal(omen: Omen) {
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
          // 撤回刚才 proceedAfterReveal 追加进 throws 的这一次筊象：未登录/会话过期，
          // 连 LLM 都没调用，不应消耗用户三掷机会中的一次。
          setThrows((prev) => prev.slice(0, -1));
          setNeedLogin(true);
          setStage({ kind: "asking" });
          return;
        }
        // 匿名级免费额度烧完 → 402：走付费墙 UI，别把服务端裸 JSON 错误体
        // （`{"error":"paywall"}`）当文案展示给用户（同 SpiritPanel.submitText 的处理）。
        // 撤回刚才 proceedAfterReveal 追加进 throws 的这一次筊象：额度用尽也没有产出解读，
        // 不应消耗用户三掷机会中的一次。
        if (res.status === 402) {
          setThrows((prev) => prev.slice(0, -1));
          setError("__paywall__");
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
      // 撤回刚才 proceedAfterReveal 追加进 throws 的这一次筊象：否则第三次笑筊那一轮遇到
      // 网络错误/500，throws.length 会永久停在 >= MAX_THROWS，之后这一轮里每次
      // 掷筊都被当成 exhausted（跳过笑筊重掷逻辑），直到用户显式换个问题。
      setThrows((prev) => prev.slice(0, -1));
      setError(e instanceof Error ? e.message : String(e));
      setStage({ kind: "asking" });
    }
  }

  function reset() {
    setQuestion("");
    setThrows([]);
    setError(null);
    setNeedLogin(false); // 换一件事问：旧的登录横幅不该跟着新问题继续挂
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

  // UAT④：历史入口挪到页头常驻按钮——掷筊前/掷筊中/对话中都要看得见、点得到，
  // 不再像此前那样只在 stage.kind === "asking" 的页面底部才出现（进了对话就没影了）。
  // 只在有历史时才渲染入口，没历史没什么可点的。两个节点在下面 conversing/主两条
  // 渲染分支里各引用一次——同一时刻只会有一条分支真正被渲染，不存在重复挂载。
  const historyToggle = history.length > 0 && (
    <button
      type="button"
      onClick={() => setHistoryOpen((v) => !v)}
      className="shrink-0 text-[12px] text-ink-2 underline decoration-[var(--color-line)] underline-offset-4 transition-colors hover:text-ink hover:decoration-[var(--color-cinnabar)]"
    >
      {t("jiao.historyTitle")} {historyOpen ? "↑" : "→"}
    </button>
  );
  const historyPanel = history.length > 0 && historyOpen && (
    <div className="border-b border-[var(--color-line)] bg-surface px-4 py-4">
      <ul className="space-y-2.5">
        {history.map((h) =>
          h.fullText ? (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  setStage({ kind: "conversing", seed: [{ role: "spirit", content: h.fullText! }] });
                  setHistoryOpen(false);
                }}
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
  );

  if (stage.kind === "conversing") {
    return (
      <main className="flex h-[100dvh] flex-col">
        <header className="flex h-[56px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-line)] bg-surface px-4">
          <button type="button" onClick={reset} className="text-[14px] text-ink-2">← {t("jiao.newThrow")}</button>
          {historyToggle}
        </header>
        {historyPanel}
        <SpiritPanel profile={profile} seedTurns={stage.seed} />
        <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <PageHeader kicker={t("jiao.kicker")} title={t("jiao.title")} annotation={t("jiao.subtitle")} action={historyToggle || undefined} />
      {historyPanel}

      {/*
       * 掷筊结果播报（无障碍）：JiaoThrow 内部的 aria-live 只包着两枚纯装饰用的筊块
       * div（无 accessible text，data-* 不进无障碍树），实际什么都播报不出来——这是
       * Task 6 遗留、明确留给本任务补的缺口。真正「掷筊之后发生了什么」的文字
       * （揭晓屏的筊象名 / 笑筊提示 / 灵在看这一卦）由下面这一个持续挂载（跨
       * asking/throwing/revealed/rethrow/reading 五个 stage 都不卸载）的 live
       * region 承载——它本身**就是**各 stage 那段可见文案，不是另造一份镜像文本：
       * 只随 stage 切换 class（sr-only ⇄ 正常可见）与文字内容。这样每次更新都是
       * 「已挂载的 live region 内部文本变化」，是各家屏幕阅读器都认的可靠播报触发
       * 方式（若拆成「每个 stage 各自的新节点」，多数 AT 不保证播报节点挂载时已经
       * 有的内容——UAT②新增的揭晓屏尤其要绕开这个坑：筊象大字名就是这个 live
       * region 本身，不是揭晓屏下方另起的一个新节点）；同时避免了可见段落与播报
       * 文案各说各话、或被 getByText 命中两份重复文本。
       */}
      <p
        aria-live="polite"
        role="status"
        className={
          stage.kind === "revealed"
            ? "mt-6 text-center font-serif text-[26px] font-bold text-ink"
            : stage.kind === "rethrow"
              ? "mt-6 text-[14px] leading-relaxed text-ink-2"
              : stage.kind === "reading"
                ? "mt-8 text-center text-[14px] text-muted"
                : "sr-only"
        }
      >
        {stage.kind === "revealed"
          ? t(OMEN_NAME_KEY[stage.omen])
          : stage.kind === "rethrow"
            ? t("jiao.xiaoHint")
            : stage.kind === "reading"
              ? t("jiao.reading")
              : ""}
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

      {stage.kind === "throwing" && (
        <JiaoThrow blocks={stage.blocks} onSettled={() => setStage({ kind: "revealed", blocks: stage.blocks, omen: stage.omen })} />
      )}

      {/*
       * UAT②（最要害的一项）：动画落定后不再直接跳去 reading/rethrow——此前筊象结果
       * 从未被展示给用户，omenSheng/omenXiao/omenYin 三个键定义了却无人用正是这块
       * 缺口的症状。这里先定格展示：大字筊象名（挂在上面的持续 live region 里，见
       * 那段注释）+ 落地的两枚筊本身（一俯一仰这样的实际组合）+ 传统释义，用户看
       * 清楚了再点「继续」才推进到下一步。
       * 推进方式选「用户点继续」而非自动延时：①不给 reduced-motion 用户再引入一个
       * 新的计时器分支（延时推进得额外判断"用户是否明确点开过所以已经看过"，模型
       * 更复杂）；②这一屏的意义正是「留意你看到结果那一刻的反应」——交给用户自己
       * 决定看多久、什么时候准备好翻篇，比替他倒计时更贴合「筊象是镜子」这个立意。
       */}
      {stage.kind === "revealed" && (
        <div className="mt-4 flex flex-col items-center gap-1 text-center">
          <JiaoBlocksStatic blocks={stage.blocks} />
          <p className="mt-5 max-w-[380px] text-[13px] leading-relaxed text-ink-2">{t(OMEN_DESC_KEY[stage.omen])}</p>
          <Button onClick={() => void proceedAfterReveal(stage.omen)} className="mt-6">{t("jiao.revealContinue")}</Button>
        </div>
      )}

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
      {error === "__paywall__" ? (
        <div className="mt-4">
          <Paywall reason="quota" onClose={() => setError(null)} />
        </div>
      ) : error ? (
        <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
          {error}
        </div>
      ) : null}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
