"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { phaseAfter, formatQuestionnaire, MAX_THROWS, type Omen, type BlockFace } from "@sojan/core";
import { getActiveProfile, getSpiritMemory, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { supabase } from "@/lib/supabase";
import { throwJiao } from "@/lib/jiao";
import { detectJiaoCrisis } from "@/lib/jiao-crisis";
import { listJiaoHistory, appendJiaoHistory, type JiaoHistoryEntry } from "@/lib/jiao-history";
import { JiaoThrow, JiaoBlocksStatic } from "@/components/JiaoThrow";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { PageHeader } from "@/components/PageHeader";
import { CastingOverlay } from "@/components/CastingOverlay";
import { Button, Emphasis } from "@/components/ui";
import { Paywall } from "@/components/Paywall";
import { TwoColumn } from "@/components/TwoColumn";
import { useShellContext } from "@/components/ShellContext";
import { jiaoSummaryAction } from "@/app/actions";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

type Stage =
  | { kind: "asking" } // 输入问题，尚未掷
  | { kind: "crisis" } // 危机前置拦截命中：不掷，直接转向求助资源（见 lib/jiao-crisis.ts）
  | { kind: "throwing"; blocks: [BlockFace, BlockFace]; omen: Omen }
  | { kind: "revealed"; blocks: [BlockFace, BlockFace]; omen: Omen } // UAT②：动画落定后先定格揭晓，用户点「继续」才推进
  | { kind: "rethrow"; omen: Omen } // 笑筊，可重掷
  | { kind: "reading" } // 落定，等灵解
  | {
      kind: "conversing";
      seed: { role: "user" | "spirit"; content: string }[];
      /** 这一卦的筊象——追问要带着它走 continueJiaoReply 的 omenForFollowUp 契约（最终评审 I4）。 */
      omen: Omen;
      /** 是否为「三笑筊拆解」那一卦；追问沿用同一套规则，见 SpiritPanel 的注释。 */
      exhausted: boolean;
      /** 首轮问题原文；续接历史时未知（jiao_history 不存问题原文，迁移 0019），传 undefined。 */
      question?: string;
    };

/** 筊象 → 传统释义 的 i18n 键（UAT②：揭晓屏用）。
 *  筊象大字名不再走 i18n 键（验收返工 I3）：`stage.omen` 本身就是中文术语
 *  （圣筊/笑筊/阴筊），两个 locale 都该原样显示——en 此前的
 *  "圣筊 (Sheng — assent)" 有 19 字符，44px 大字在 402px 视口折 2–3 行，
 *  而英文是默认路径；gloss 由下一行的释义（omenXxxDesc）承担。 */
const OMEN_DESC_KEY: Record<Omen, string> = { 圣筊: "jiao.omenShengDesc", 笑筊: "jiao.omenXiaoDesc", 阴筊: "jiao.omenYinDesc" };
/** 筊杯卡三列释义的单字短注（5c）——与揭晓屏长句刻意不同文，见 zh.ts 键上注释。 */
const OMEN_SHORT_KEY: Record<Omen, string> = { 圣筊: "jiao.omenShengShort", 笑筊: "jiao.omenXiaoShort", 阴筊: "jiao.omenYinShort" };

/** 3d「最近问过的」筊象单字着色（03-screens 掷筊节）：圣 wood、阴 cinnabar、笑 gold。 */
const OMEN_CHAR_COLOR: Record<Omen, string> = {
  圣筊: "var(--color-wood)",
  笑筊: "var(--color-gold)",
  阴筊: "var(--color-cinnabar)",
};

const OMENS: Omen[] = ["圣筊", "笑筊", "阴筊"];

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

  // 3e（03-screens 掷筊节）：胶囊语境显示筊象名——揭晓与追问（灵解）期间，移动端
  // 顶部语境胶囊从路由默认的「掷筊」换成这一卦的筊象名（如「圣筊」）。桌面端不做
  // 胶囊语境（06-desktop §4：语境由竖栏当前项 + 页头大标题承担），此声明在桌面
  // 无可见效果。useShellContext 是 hook，必须无条件调用、位于所有早退之前。
  useShellContext(
    stage.kind === "revealed" || stage.kind === "conversing" ? stage.omen : null,
  );

  useEffect(() => {
    if (!ENABLED) return;
    (async () => {
      try {
        // EP-jiao 最终评审 C1：TG 首页入口已摘除（`app/page.tsx` 的 `TG_ENTRIES`），
        // 但这个分支特意保留——用户仍可能在 TG webview 里直接打开 /spirit 的 URL
        // （比如浏览器历史、别处的深链）。**如实说明现状**：这里能把 TG 身份下的
        // profile 读出来、页面能正常渲染到「输入问题」这一步，但掷筊落定后的
        // `askSpirit`（下面）与追问（`SpiritPanel`）一律走浏览器侧
        // `supabase().auth.getSession()` 取 Bearer token——TG webview 里没有这份
        // 浏览器侧 Supabase 会话，token 恒为 undefined，会在那一步撞 401（引导去
        // /account 登录，对 TG 用户是死胡同）。这不是「看起来支持其实不支持」的
        // 假象：会话真的成立，只是流程后半段确实无法完成，且会给出清晰的登录引导
        // 而不是静默失败。TG 侧要接得起来需要照抄 `api/tg/dream` 补一条
        // `api/tg/jiao` 中介臂，见 `.agent/BACKLOG.md` 的 EP-jiao-tg。
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
    // 危机前置拦截（EP-jiao 最终评审补项，见 lib/jiao-crisis.ts 顶部注释）：
    // 命中最窄的一层自伤/医疗急症词表时，不调用 throwJiao（全仓唯一随机点）、不进
    // throwing 阶段、不发起任何消耗额度的请求——检查必须发生在这里、真正掷筊之前，
    // 否则「阴筊·不允」会先被大字定格展示给一个正在讲「我该不该活下去」的人。
    if (detectJiaoCrisis(question)) {
      setStage({ kind: "crisis" });
      return;
    }
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
      // omen/exhausted/question 一并带进 conversing 阶段：SpiritPanel 的追问要靠它们
      // 重建 continueJiaoReply 的 omenForFollowUp 契约，让掷筊守护栏覆盖整场对话
      // （最终评审 I4），而不只是首轮受管、第二轮起失控。
      setStage({ kind: "conversing", seed: [{ role: "user", content: q }, { role: "spirit", content: reply }], omen, exhausted, question: q });
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
  if (profile === undefined) return <CastingOverlay title={t("spirit.loadingProfile")} mode="pending" />;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("jiao.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("spirit.goCast")}
        </Link>
      </Centered>
    );

  // UI v3 C3（03-screens 掷筊 5c/3d/3e）：问事态（asking/rethrow）历史以页内列表
  // 呈现（设计 3d「最近问过的」，筊象单字着色）；其余阶段仍由 UAT④ 的页头常驻
  // 入口 + 展开面板承担——两种形态同一时刻只挂一种，不存在重复渲染。
  const inlineHistory = stage.kind === "asking" || stage.kind === "rethrow";

  const historyRow = (h: JiaoHistoryEntry) => {
    const summary = (
      <>
        {/* 验收返工 I2：筊象色只进字前 6px 色点（装饰，aria-hidden），单字用 ink——
            wood 3.06:1 / gold 2.48:1 都低于 13px 正文的 AA 4.5:1（同 C1 根因）。 */}
        <span
          data-testid="omen-dot"
          aria-hidden="true"
          className="mr-1.5 inline-block h-[6px] w-[6px] rounded-full align-middle"
          style={{ background: OMEN_CHAR_COLOR[h.omen] }}
        />
        <span className="mr-2 font-serif font-semibold" style={{ color: "var(--color-ink)" }}>
          {h.omen.slice(0, 1)}
        </span>
        {h.summary}
      </>
    );
    return h.fullText ? (
      <li key={h.id}>
        <button
          type="button"
          onClick={() => {
            // 续接历史：没有问题原文（jiao_history 不存，迁移 0019），question 传
            // undefined——continueJiaoReply 据此走「续接历史」重载，不重建首轮 prompt。
            // exhausted 未知，默认 false：历史列表不存这一位，绝大多数条目本就不是
            // 「三笑筊拆解」那种，默认按普通规则续问，代价可接受。
            setStage({ kind: "conversing", seed: [{ role: "spirit", content: h.fullText! }], omen: h.omen, exhausted: false, question: undefined });
            setHistoryOpen(false);
          }}
          className="block w-full text-left text-[13px] leading-relaxed text-ink-2 underline decoration-[var(--color-line)] underline-offset-4 transition-colors hover:text-ink hover:decoration-[var(--color-cinnabar)]"
        >
          {summary}
        </button>
      </li>
    ) : (
      <li key={h.id} className="text-[13px] leading-relaxed text-ink-2">{summary}</li>
    );
  };

  const historyToggle = history.length > 0 && !inlineHistory && (
    <button
      type="button"
      onClick={() => setHistoryOpen((v) => !v)}
      className="shrink-0 text-[12px] text-ink-2 underline decoration-[var(--color-line)] underline-offset-4 transition-colors hover:text-ink hover:decoration-[var(--color-cinnabar)]"
    >
      {t("jiao.historyTitle")} {historyOpen ? "↑" : "→"}
    </button>
  );
  const historyPanel = history.length > 0 && historyOpen && !inlineHistory && (
    <div className="border-b border-[var(--color-line)] bg-surface px-4 py-4">
      <ul className="space-y-2.5">{history.map(historyRow)}</ul>
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
        <SpiritPanel
          profile={profile}
          seedTurns={stage.seed}
          omen={stage.omen}
          exhausted={stage.exhausted}
          question={stage.question}
          memory={memory ?? undefined}
          questionnaire={questionnaire}
        />
        <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
      </main>
    );
  }

  const throwable = stage.kind === "asking" || stage.kind === "rethrow";

  // 左列（06-desktop §3：掷筊左列 440px＝筊台；问题输入与掷筊按钮同属筊台一侧）。
  // 筊杯卡（5c）：细线卡；图区 262px 随阶段换内容（静态弦月插画 / 抛掷动画 / 落定
  // 静态筊），三列筊象释义（圣筊走强调手法），卡脚「掷 筊 问 事」+ 46px 朱砂圆钮。
  // ⚠️ 验收返工 C4：crisis 时左列整体不渲染——「命中即直接换成求助引导屏」意味着
  // 筊杯卡（262px 图区 + 三列释义）与三掷点都不能留在屏上：402×850 下它们会把
  // 热线号码挤出首屏，且三掷点的 aria-label「还可以掷 n 次」会在危机屏上向读屏
  // 用户播报剩余掷筊次数。右列的引导文案由那个跨 stage 持续挂载的 aria-live
  // region 承载（不卸载、播报可靠），左列只是为空，TwoColumn 结构不变。
  const left = stage.kind === "crisis" ? null : (
    <>
      {throwable && (
        <div className="mb-6">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("jiao.placeholder")}
            rows={3}
            className="w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 font-serif text-[19px] text-ink placeholder:font-sans placeholder:text-[14px] placeholder:text-muted focus:border-[var(--color-cinnabar)] focus:outline-none"
            style={{ caretColor: "var(--color-cinnabar)" }}
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
            <span>{tooLong ? t("jiao.errorTooLong") : ""}</span>
            <span className="font-latin">{question.trim().length} / 500</span>
          </div>
        </div>
      )}

      <section
        data-testid="jiao-card"
        className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-surface"
      >
        {/* 图区 262px：asking/rethrow/reading 静态弦月插画；throwing 抛掷动画
            （JiaoThrow 已上线，不碰）；revealed 落定静态筊（仓库几何版）。
            crisis 到不了这里——左列整个被门控（见 left 定义处 C4 注释）。 */}
        <div className="relative flex h-[262px] items-center justify-center overflow-hidden border-b border-[var(--color-line)]">
          {stage.kind === "throwing" ? (
            <JiaoThrow blocks={stage.blocks} onSettled={() => setStage({ kind: "revealed", blocks: stage.blocks, omen: stage.omen })} />
          ) : stage.kind === "revealed" ? (
            <JiaoBlocksStatic blocks={stage.blocks} />
          ) : (
            <JiaoCardArt />
          )}
        </div>

        {/* 三列筊象释义（圣/笑/阴），圣筊走强调手法（02-components §2「选中筊象」）。
            列头用单字（圣/笑/阴）+ 单字短注，不用筊象全名与长句——全名/长句与揭晓屏
            同文会让 getByText 唯一匹配撞车（见 OMEN_SHORT_KEY 注释）。 */}
        <div className="grid grid-cols-3 gap-3 px-5 py-4">
          {OMENS.map((omen) => {
            const body = (
              <>
                <p className="font-serif text-[16px] font-semibold text-ink">{omen.slice(0, 1)}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{t(OMEN_SHORT_KEY[omen])}</p>
              </>
            );
            return omen === "圣筊" ? (
              <Emphasis key={omen} data-testid="jiao-omen-emphasis">{body}</Emphasis>
            ) : (
              <div key={omen}>{body}</div>
            );
          })}
        </div>

        {/* 卡脚：只在可掷阶段（asking/rethrow）出现——掷筊按钮是这里唯一的触发点，
            46px 朱砂圆钮，钮内是长按摇动图标（中心实心点 + 按压环 + 左右震动弧）。
            ⚠️ 设计 5c 卡脚另有「长按摇杯 · 震动与落地声可关」小字：长按手势与震动/
            落地声开关在仓库现状里不存在（现状是单击掷筊），写上等于声称不存在的
            功能（反幻觉），故不渲染——见实施报告。 */}
        {throwable && (
          <div className="flex items-center justify-between border-t border-[var(--color-line)] px-5 py-3">
            <span className="text-[13px] tracking-[0.3em] text-ink-2">{t("jiao.cardCta")}</span>
            <button
              type="button"
              onClick={doThrow}
              disabled={!canThrow}
              aria-label={stage.kind === "rethrow" ? t("jiao.xiaoRethrow") : t("jiao.throwCta")}
              className="zj-wheel-focus inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[var(--color-cinnabar)] text-[var(--color-paper)] transition-colors duration-200 hover:bg-[var(--color-cinnabar-press)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
                <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M3.6 9.2a8.6 8.6 0 0 0 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M20.4 9.2a8.6 8.6 0 0 1 0 5.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </section>

      {/* 三掷点（3d）：每用掉一次掷筊点亮一格；笑筊重掷状态行紧随其后。 */}
      <div
        data-testid="jiao-throw-dots"
        className="mt-4 flex items-center justify-center gap-2"
        aria-label={t("jiao.throwsLeft", { n: String(MAX_THROWS - throws.length) })}
      >
        {Array.from({ length: MAX_THROWS }, (_, i) => (
          <span
            key={i}
            data-lit={i < throws.length}
            className="h-[6px] w-[6px] rounded-full"
            style={{ background: i < throws.length ? "var(--color-cinnabar)" : "var(--color-line-strong)" }}
          />
        ))}
      </div>
      {stage.kind === "rethrow" && (
        <p className="mt-2 text-center text-[12px] text-muted">{t("jiao.throwsLeft", { n: String(MAX_THROWS - throws.length) })}</p>
      )}
    </>
  );

  // 右列（06-desktop §3：揭晓 + 灵解 + 追问；移动端单列时按 DOM 序接在筊台之后）。
  const right = (
    <>
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
       * UI v3 C3：revealed 的大字名按 3e 提到 serif 44px（揭晓屏主视觉）。
       */}
      <p
        aria-live="polite"
        role="status"
        className={
          stage.kind === "revealed"
            ? "mt-2 font-serif text-[44px] font-bold leading-[1.2] text-ink"
            : stage.kind === "rethrow"
              ? "mt-6 text-[14px] leading-relaxed text-ink-2"
              : stage.kind === "reading" || stage.kind === "throwing"
                ? "mt-8 text-center text-[14px] text-muted"
                : stage.kind === "crisis"
                  ? "mt-6 text-left text-[14px] leading-relaxed text-ink-2"
                  : "sr-only"
        }
      >
        {/* jiao.throwing：此前这个 live region 的上方长注释就写着「跨…throwing…五个
            stage」，但下面的分支从未真正接上 throwing——筊块抛起翻转的这几秒，屏幕
            阅读器用户什么都听不到，直到落定才突然听见筊象名。补上这一分支才是
            注释原本承诺的样子（最终评审 I5 顺带项：jiao.throwing 键此前定义了却
            无人使用，正是这个缺口的症状）。
            crisis 分支同一套道理：命中危机拦截时页面从「输入问题」直接换成求助
            引导，这个变化本身也必须被播报出来，而不是静默换了一屏文字。 */}
        {stage.kind === "revealed"
          ? stage.omen
          : stage.kind === "rethrow"
            ? t("jiao.xiaoHint")
            : stage.kind === "reading"
              ? t("jiao.reading")
              : stage.kind === "throwing"
                ? t("jiao.throwing")
                : stage.kind === "crisis"
                  ? <><strong className="block text-[15px] font-medium text-ink">{t("jiao.crisisTitle")}</strong><span className="mt-2 block">{t("jiao.crisisBody")}</span></>
                  : ""}
      </p>

      {/* 3e 揭晓屏：筊象大字（上面的 live region）+ 传统释义 + 细线 +「继续」。
          落定静态筊在左列筊杯卡图区（仓库几何版 blockVisual，02 §6）。 */}
      {stage.kind === "revealed" && (
        <div className="mt-3">
          <p className="max-w-[380px] text-[13px] leading-relaxed text-ink-2">{t(OMEN_DESC_KEY[stage.omen])}</p>
          <div className="mt-6 border-t border-[var(--color-line)] pt-6">
            <Button onClick={() => void proceedAfterReveal(stage.omen)}>{t("jiao.revealContinue")}</Button>
          </div>
        </div>
      )}

      {stage.kind === "crisis" && (
        <div className="mt-5">
          <Button onClick={reset}>{t("jiao.crisisBack")}</Button>
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

      {/* 3d「最近问过的」：问事态页内列表，筊象单字着色（圣 wood / 阴 cinnabar / 笑 gold）。 */}
      {inlineHistory && history.length > 0 && (
        <section className="mt-10 border-t border-[var(--color-line)] pt-6">
          <h2 className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("jiao.historyTitle")}</h2>
          <ul className="mt-3 space-y-2.5">{history.map(historyRow)}</ul>
        </section>
      )}
    </>
  );

  const header = (
    <PageHeader as="div" kicker={t("jiao.kicker")} title={t("jiao.title")} annotation={t("jiao.subtitle")} action={historyToggle || undefined} />
  );

  return (
    <main>
      <TwoColumn leftWidth={440} header={header} left={left} right={right} />
    </main>
  );
}

/**
 * 筊杯卡图区的静态弦月插画（5c，asking/rethrow 等未掷阶段）：两枚饱满弦月筊，
 * 几何取 02-components §6（外弧 A56,56、内缘二次曲线内凹 30px、两枚内缘相对、
 * 落地姿态不对称）。面色用专用令牌 --color-jiao-down/up（验收返工 I4：设计稿
 * 漆色以新令牌形式落地，不违反「无裸十六进制」；此前用 cinnabar/tint 凑，
 * 「仰」仅 1.18:1，两枚不可区分）。右上竖排「筊/杯」、底部「一 俯 一 仰 · 圣 筊 /
 * 朱漆 · 手掷」为插画固定字样（命理术语两个 locale 都保持中文）。
 */
function JiaoCardArt() {
  return (
    <div className="relative h-full w-full" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 264 172" className="h-[150px] w-auto">
          <path
            d="M132,30 A56,56 0 0 0 132,142 Q102,86 132,30 Z"
            fill="var(--color-jiao-down)"
            transform="translate(-20,16) rotate(-34 132 86) scale(.94)"
          />
          <path
            d="M132,30 A56,56 0 0 1 132,142 Q162,86 132,30 Z"
            fill="var(--color-jiao-up)"
            transform="translate(4,-8) rotate(27 132 86)"
          />
        </svg>
      </div>
      <div
        className="absolute right-4 top-3 flex gap-2 text-muted"
        style={{ writingMode: "vertical-rl" }}
      >
        <span className="font-serif text-[15px]">筊<span className="ml-1 font-latin text-[10px] tracking-normal">jiǎo</span></span>
        <span className="font-serif text-[15px]">杯<span className="ml-1 font-latin text-[10px] tracking-normal">bēi</span></span>
      </div>
      <div className="absolute inset-x-0 bottom-3 text-center">
        <p className="font-serif text-[13px] tracking-[0.3em] text-ink-2">一 俯 一 仰 · 圣 筊</p>
        <p className="mt-1 text-[10.5px] tracking-[0.28em] text-muted">朱 漆 · 手 掷</p>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
