"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, getQuestionnaire, saveReading, type Profile } from "@/lib/profiles";
import { hasTgSession, isTelegram, tgGetProfile, tgGetQuestionnaire } from "@/lib/tg/client";
import type { QuestionnaireAnswers } from "@sojan/core";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { timelineAction } from "@/app/actions";
import { Card, BellLogo, cn } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";
import { Markdown } from "@/components/Markdown";
import { ReadingTabs } from "@/components/ReadingTabs";
import { BaziPillars } from "@/components/charts/BaziPillars";
import { ZiweiBoard } from "@/components/charts/ZiweiBoard";
import { WuxingWheel } from "@/components/charts/WuxingWheel";
import { NatalWheel } from "@/components/charts/NatalWheel";
import { TwoColumn } from "@/components/TwoColumn";
import { ChartIdentity } from "@/components/chart/ChartIdentity";
import { LuckPillars } from "@/components/chart/LuckPillars";
import { ChartToc } from "@/components/chart/ChartToc";
import { SelfPortrait } from "./SelfPortrait";

type Section = { key: string; title: string; body: string; accent?: "fire" | "water" | "metal" };

function splitSections(md: string): Section[] {
  const parts = md.split(/^##\s+/m).filter(Boolean);
  return parts.map((p, i) => {
    const nl = p.indexOf("\n");
    const title = (nl === -1 ? p : p.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : p.slice(nl + 1)).trim();
    const accent = title.includes("命理") ? "fire" : title.includes("心理") ? "water" : /成长|建议|共振/.test(title) ? "metal" : undefined;
    return { key: `${i}-${title}`, title, body, accent };
  });
}

const YEAR = new Date().getFullYear();
const todayYmd = `${YEAR}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

export default function ChartPage() {
  const { locale } = useLocale();
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [reading, setReading] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<string | null>(null);
  const [qAnswers, setQAnswers] = useState<Awaited<ReturnType<typeof getQuestionnaire>>>(null);

  const inTg = useIsTelegram();

  useTgMainButton({
    text: streaming ? t("chart.generating") : t("chart.castForMe"),
    onClick: () => generate(),
    enabled: !streaming,
    visible: inTg && !reading,
  });

  useEffect(() => {
    (async () => {
      try {
        const p = hasTgSession() ? await tgGetProfile() : await getActiveProfile();
        setProfile(p);
        if (p?.reading) setReading(p.reading); // 已生成则直接展示，不再调用 LLM
        if (p) {
          loadTimeline(p);
        }
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  // 自我画像（EP-jiao Task 8：从已删除的 /spirit/portrait 独立页挪入命盘页）——
  // TG Mini App 走独立的 cookie 会话 + /api/tg/* 中介，没有浏览器侧 Supabase auth
  // 会话，getQuestionnaire 的 RLS 查询在 TG 内必然拿不到数据；必须像被删的
  // /spirit/portrait 原页那样按 hasTgSession() 分支到 tgGetQuestionnaire()，
  // 否则所有从 TG 进 /chart 的用户自我画像会静默永久缺问卷增强。
  // questionnaire 是问卷自陈，读不到时静默回落 null，SelfPortrait 仅凭命盘也能
  // 渲染，不阻塞主流程。
  useEffect(() => {
    if (!profile) return;
    (hasTgSession() ? tgGetQuestionnaire() : getQuestionnaire(profile.id))
      .then((q) => setQAnswers((q as QuestionnaireAnswers | null) ?? null))
      .catch(() => setQAnswers(null));
  }, [profile]);

  // 当下时序：按 (档案,年份) 缓存，避免重复调 LLM
  async function loadTimeline(p: Profile) {
    const key = `zhaojian.timeline.${p.id}.${YEAR}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) { setTimeline(cached); return; }
    } catch { /* ignore */ }
    const md = await timelineAction(p.birthInput, p.chart, todayYmd);
    if (md) {
      setTimeline(md);
      try { localStorage.setItem(key, md); } catch { /* ignore */ }
    }
  }

  async function generate() {
    if (!profile) return;
    setStreaming(true);
    setReading("");
    setErr(null);
    // 打字机：把（按行到达的）文本逐字铺出，标点处自然停顿——书写感，而非整段刷新
    let target = "";
    let shown = 0;
    let streamDone = false;
    let pause = 0;
    let rafId = 0;

    const finalize = async () => {
      setReading(target);
      if (target.trim()) {
        try { await saveReading(profile.id, target); } catch (e) { console.error("saveReading failed:", e); }
        setProfile({ ...profile, reading: target });
      }
      setStreaming(false);
      haptics.success();
    };
    const tick = () => {
      if (pause > 0) {
        pause--;
      } else if (shown < target.length) {
        const remaining = target.length - shown;
        // 接近书写速度：通常 1–2 字/帧(~60–120cps)，落后太多时追赶，临近收尾放慢
        const step = remaining > 500 ? 5 : remaining > 120 ? 2 : 1;
        const last = target[shown + step - 1] ?? "";
        shown += step;
        setReading(target.slice(0, shown));
        if (/[。！？\n]/.test(last)) pause = 7;        // 句末停顿 ~115ms
        else if (/[，、；：]/.test(last)) pause = 3;   // 读断停顿 ~50ms
      }
      if (shown < target.length || !streamDone) rafId = requestAnimationFrame(tick);
      else void finalize();
    };
    rafId = requestAnimationFrame(tick);

    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-zj-locale": locale },
        body: JSON.stringify(profile.birthInput),
      });
      if (!res.ok || !res.body) {
        cancelAnimationFrame(rafId);
        setErr(await res.text());
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        target += dec.decode(value, { stream: true });
      }
      streamDone = true; // tick 追平后自行 finalize（保存+收尾）
    } catch (e) {
      cancelAnimationFrame(rafId);
      setErr(e instanceof Error ? e.message : String(e));
      setStreaming(false);
    }
  }

  if (profile === undefined) return <Centered>{t("chart.loadingProfile")}</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("chart.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink" style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("chart.goCast")}
        </Link>
      </Centered>
    );

  const chart = profile.chart;
  const sections = reading ? splitSections(reading) : [];

  // 页头：放进 TwoColumn 的 header 槽，`as="div"` 避免与 TwoColumn 自己的
  // <header> 嵌套（PageHeader 默认仍是 <header>，其余消费方不受影响）。
  const header = (
    <PageHeader
      as="div"
      kicker={t("chart.kicker")}
      title={<>{profile.nickname} · {t("chart.title")}</>}
      annotation={chart.normalizedSolarTime}
      action={
        <>
          {isTelegram() && (
            <button
              onClick={() => {
                const username = process.env.NEXT_PUBLIC_TG_BOT_USERNAME || "analyst_helen_bot";
                window.Telegram?.WebApp?.openTelegramLink?.(
                  "https://t.me/share/url?url=" +
                    encodeURIComponent(`https://t.me/${username}?startapp=sojan`) +
                    "&text=" +
                    encodeURIComponent(t("chart.shareText"))
                );
              }}
              className="text-[13px] text-cinnabar underline underline-offset-4"
            >
              {t("chart.share")}
            </button>
          )}
          <Link href="/calendar" className="text-[13px] text-gold underline underline-offset-4">{t("chart.todayFortune")}</Link>
        </>
      }
    />
  );

  // 左列（设计包 5b）：盘与不动事实——日主行/chip → 五行盘 → 四柱 → 大运/流年 → 目录。
  const left = (
    <>
      <ChartIdentity chart={chart} />

      {/* 五行 */}
      <ChartBlock label={t("chart.wuxingTitle")}>
        <WuxingWheel
          counts={chart.bazi.fiveElementCounts}
          dayMasterStem={chart.bazi.dayMaster}
          dayMasterElement={chart.bazi.dayMasterElement}
        />
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-muted)" }}>{t("chart.wuxingCaption")}</p>
      </ChartBlock>

      {/* 四柱 */}
      <ChartBlock label={t("chart.baziTitle")}>
        <BaziPillars bazi={chart.bazi} />
      </ChartBlock>

      <LuckPillars bazi={chart.bazi} />

      <ChartToc />
    </>
  );

  // 右列（本波只重排、不重建，右列版式仍是 ChartBlock——见 spec §2.2）：
  // 解读 → 紫微棋盘 → 西方盘 → 自我画像 → 时序。解读排在紫微之前是刻意裁定
  // （与 5b 入口条字面顺序相反），别「顺手改回来」。
  const right = (
    <>
      {/* 三段式解读：id/testid 直接落在 ChartBlock 本体上（M7）——此前外层多套一层
          `<section id="reading-tabs">` 只为挂 id/testid，ChartBlock 自己又是一个
          `<section>`，两层嵌套纯属冗余。 */}
      <ChartBlock
        id="reading-tabs"
        data-testid="reading-tabs-anchor"
        label={t("chart.readingTitle")}
        // 右列第一块：桌面上与左列頭部对齐，去掉自己的上边距/分隔线/上内边距
        // （I3）——移动端单列态紧接在 ChartToc 之后，那条线仍是有意义的分隔，
        // 必须断点门控，不能无条件去掉。
        className="xl:mt-0 xl:border-t-0 xl:pt-0"
      >
        {!inTg && !reading && !streaming && (
          <button
            onClick={generate}
            className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-all duration-200 hover:bg-cinnabar-press"
            style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-card)", color: "var(--color-on-ink)" }}
          >
            <span>
              <span className="block text-[17px] font-semibold">{t("chart.generateReading")}</span>
              <span className="mt-1 block text-[13px] opacity-85">{t("chart.generateReadingSub")}</span>
            </span>
            {/* M8：hover 只许变色，不得位移/放大/投影（06-desktop §4）——
                此前 `group-hover:translate-x-1` 违规，改为箭头变色（on-ink → 金色）。 */}
            <span data-testid="generate-arrow" className="text-[22px] text-[var(--color-on-ink)]">✦</span>
          </button>
        )}
        {/* EP-motion：首字前的空等此前只有一条纯文字+闪烁光标；换成品牌风铃常驻摆动
            （复用 CastingOverlay 同款 idle 语义），首字一到就被 ReadingTabs 的流式打字机
            接管——这段不用全屏 CastingOverlay，因为上方八字/紫微/西方盘已经渲染在页面里，
            全屏遮罩会让用户失去已经看到的内容。 */}
        {streaming && !reading && (
          <Card>
            <p className="flex items-center gap-2 text-[14px] text-muted">
              <BellLogo size={18} />
              {t("chart.generating")}
            </p>
          </Card>
        )}
        {err && (
          <div className="px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>{err}</div>
        )}
        {reading && <ReadingTabs sections={sections} chart={chart} streaming={streaming} />}
      </ChartBlock>

      {/* 紫微：id/testid 同理直接落在 ChartBlock 本体上（M7）。 */}
      <ChartBlock id="ziwei-board" data-testid="ziwei-board-anchor" label={t("chart.ziweiTitle")}>
        <ZiweiBoard ziwei={chart.ziwei} />
      </ChartBlock>

      {/* 西方本命盘（降级隐藏） */}
      <ChartBlock label={t("chart.westernTitle")}>
        {chart.western ? (
          <NatalWheel western={chart.western} />
        ) : (
          <p className="text-[14px] text-muted">{t("chart.westernMissing")}</p>
        )}
      </ChartBlock>

      {/* 自我画像（EP-jiao Task 8：从 /spirit/portrait 独立页挪入，不再挂「和本命之灵聊聊」
          的自由聊入口——命盘页是骨架陈列，跳出去开自由聊与这里的语义不符） */}
      <ChartBlock label={t("chart.selfPortraitTitle")}>
        <SelfPortrait chart={chart} questionnaire={qAnswers ?? undefined} />
      </ChartBlock>

      {timeline && (
        <ChartBlock label={t("chart.timelineTitle")}>
          <Card>
            <div className="reading-prose"><Markdown text={timeline.replace(/^##\s*本年时序\s*/, "")} /></div>
            <p className="mt-3 text-[11px] text-muted">{t("chart.timelineDisclaimer", { year: YEAR })}</p>
          </Card>
        </ChartBlock>
      )}

      {/* 免责声明（I1）：挪进右列末尾（叙述末尾），而非 TwoColumn 外层——
          外层挂它会在 xl 断点把 document 撑高出约 116px，破坏「页面不滚、
          两列各自滚」的两栏模型（`/calendar` 无此问题，它把免责句放进了
          header 槽）。移动端单列态 DOM 顺序本就在最后，不受影响。 */}
      <p className="mt-10 pb-10 text-[12px] leading-relaxed text-muted">
        {t("chart.pageDisclaimer")}
      </p>
    </>
  );

  return (
    <main>
      <TwoColumn leftWidth={440} header={header} left={left} right={right} />
    </main>
  );
}

// 图表区块：小标签 + 直接落纸底，区块间 1px 细线分隔（取代旧 Section 的朱砂破折号 + Card 包装）。
// borderTop 改用 Tailwind 类而非内联 style（I3）——内联优先级恒高于类，
// 调用方传入的 `xl:border-t-0` 等断点类压不掉内联 style，此坑本仓已踩过一次。
function ChartBlock({
  id,
  "data-testid": testId,
  label,
  children,
  className,
}: {
  id?: string;
  "data-testid"?: string;
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} data-testid={testId} className={cn("mt-10 border-t border-[var(--color-line)] pt-8", className)}>
      <h2 className="mb-6 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{label}</h2>
      {children}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
