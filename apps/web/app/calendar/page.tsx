"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { dailyFortuneAction, dailyPolishAction, dailyBehaviorAction, ziweiHoroscopeAction } from "@/app/actions";
import { matchFortuneImage, MOOD_LABEL } from "@/lib/fortune-images";
import { Emphasis, GanzhiBadge } from "@/components/ui";
import { ScoreRing } from "@/components/ScoreRing";
import { CastingOverlay } from "@/components/CastingOverlay";
import { FortuneFrame } from "@/components/FortuneFrame";
import { PageHeader } from "@/components/PageHeader";
import { TodayCard } from "@/components/TodayCard";
import { SeasonRuler } from "@/components/charts/SeasonRuler";
import { TwoColumn } from "@/components/TwoColumn";
import { AskToday } from "./AskToday";
import { useT } from "@/lib/i18n/I18nProvider";
import { getCurrentSolarHou, type DailyFortune, type ZiweiHoroscope } from "@sojan/core";

// 按 (档案,日期,kind) 缓存 LLM 结果到 localStorage，避免重复调用。
// ⚠️ 键前缀 `zhaojian.` 刻意保留旧品牌名、不随 2026-08-25 更名 Sojan 而改（owner 决策）：
// 这是用户浏览器里已存在的键，改前缀等于让全体存量用户缓存失效、白烧一轮 LLM 额度，
// 而用户根本看不到这个字符串。同理见 lib/access.ts 的 SYNTHETIC_EMAIL_DOMAIN。
function cacheGet(kind: string, pid: string, date: string): string | null {
  try { return localStorage.getItem(`zhaojian.${kind}.${pid}.${date}`); } catch { return null; }
}
function cacheSet(kind: string, pid: string, date: string, v: string): void {
  try { localStorage.setItem(`zhaojian.${kind}.${pid}.${date}`, v); } catch { /* ignore */ }
}

// 综合分 → 大字总评（返回 i18n key）
function gradeOf(overall: number): "auspicious" | "smooth" | "neutral" | "cautious" {
  if (overall >= 8) return "auspicious";
  if (overall >= 6) return "smooth";
  if (overall >= 4) return "neutral";
  return "cautious";
}

/**
 * 判词强调块字号（终审必修 4）：`calendar.grade.*` 中文只有单字（吉/顺/平/谨），
 * 但 `detectLocale()` 对任何非中文浏览器默认返回 `en`——而英文是首发市场的默认
 * 路径，不是极端分支。英文值形如 `"吉 (Auspicious)"`（最长 14 字符），用固定
 * `text-[64px] leading-none` 在左列（桌面 392px 宽）会溢出裁切、在移动端也会
 * 挤成两三行贴死。这里按字符数分档：中文单字沿用原设计的大字号，长值降字号、
 * 放宽行高、允许换行——纯展示层字号逻辑，不做任何「按语言判断」的推算分支
 * （长度是显示层已有的字符串属性，不是从命盘再算一遍）。
 *
 * ⚠️ 复审 Minor M1：这里此前是三档（≤2 / 3–6 / 其余），但 `calendar.grade.*`
 * 目前只有 zh 的 吉/顺/平/谨（长度均为 1）与 en 的
 * "吉 (Auspicious)"/"顺 (Smooth)"/"平 (Steady)"/"谨 (Cautious)"（长度
 * 14/10/10/12）这 8 个值——中间那档（3–6）对现有全部值都不可达，是个测不到、
 * 也用不到的死分支。收成两档：CJK 单字（≤2）沿用大字号，其余（含未来更长的
 * locale 文案）统一走「降字号 + 放宽行高 + 允许换行」这一档——`break-words`
 * 本就是为兜住任意长度设计的，不需要中间那档来过渡。
 */
function verdictTextClass(len: number): string {
  if (len <= 2) return "text-[40px] leading-none xl:text-[64px]";
  return "break-words text-[22px] leading-snug xl:text-[32px]";
}

type Behavior = { do: string[]; dont: string[] };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekDays(today: Date): Date[] {
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    return d;
  });
}
const DIMS: ("career" | "wealth" | "love" | "health" | "travel")[] = [
  "career", "wealth", "love", "health", "travel",
];

export default function CalendarPage() {
  const t = useT();
  const WK = t("calendar.weekDays").split(",");
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [today] = useState(() => new Date());
  const [selected, setSelected] = useState(() => ymd(new Date()));
  const [fortune, setFortune] = useState<DailyFortune | null>(null);
  const [polish, setPolish] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<Behavior | null>(null);
  const [horoscope, setHoroscope] = useState<ZiweiHoroscope | null>(null);
  const [loading, setLoading] = useState(false);
  const [casting, setCasting] = useState(false); // 进入运势的品牌化过场（每会话一次）
  const [dark, setDark] = useState(false);
  const [fortuneImgError, setFortuneImgError] = useState(false);
  const selYear = selected.slice(0, 4);

  // 七十二候：与卷首各自取值时机不同（本页有按日期的 localStorage 缓存），故各自现算一次
  // （`TodayCard`/`SeasonRuler` 均不自己调 `getCurrentSolarHou()`，见两组件文档）。
  const solarHou = getCurrentSolarHou();

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.getAttribute("data-tg-theme") === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-tg-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const p = hasTgSession() ? await tgGetProfile() : await getActiveProfile();
        setProfile(p);
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  // 测算过场：每会话首次进入运势播 ~2.1s
  useEffect(() => {
    try {
      if (sessionStorage.getItem("zj.cast")) return;
      sessionStorage.setItem("zj.cast", "1");
    } catch { /* ignore */ }
    setCasting(true);
    const t = setTimeout(() => setCasting(false), 2100);
    return () => clearTimeout(t);
  }, []);

  // 本年/本限 时序上下文（确定性，按年取）
  useEffect(() => {
    const p = profile;
    if (!p) return;
    let alive = true;
    ziweiHoroscopeAction(p.birthInput, selected).then((h) => { if (alive) setHoroscope(h); });
    return () => { alive = false; };
  }, [profile, selYear]);

  useEffect(() => {
    const p = profile;
    if (!p) return;
    let alive = true;
    setLoading(true);
    setPolish(cacheGet("polish", p.id, selected)); // 命中缓存先显示
    const bCache = cacheGet("behavior", p.id, selected);
    setBehavior(bCache ? (JSON.parse(bCache) as Behavior) : null);
    dailyFortuneAction({ bazi: p.chart.bazi }, selected)
      .then((f) => {
        if (!alive) return;
        setFortune(f);
        // 轻润色 + 心理行为宜忌：各自缓存未命中才调 LLM
        if (!cacheGet("polish", p.id, selected)) {
          dailyPolishAction(f, p.nickname).then((line) => {
            if (alive && line) { setPolish(line); cacheSet("polish", p.id, selected, line); }
          });
        }
        if (!cacheGet("behavior", p.id, selected)) {
          dailyBehaviorAction(f, p.nickname).then((b) => {
            if (alive && b) { setBehavior(b); cacheSet("behavior", p.id, selected, JSON.stringify(b)); }
          });
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profile, selected]);

  if (profile === undefined) return <Centered>{t("calendar.loadingProfile")}</Centered>;
  if (profile === null)
    return (
      <Centered>
        <p className="text-ink-2">{t("calendar.noProfileForFortune")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3" style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}>{t("calendar.goCast")}</Link>
      </Centered>
    );

  const days = weekDays(today);

  // 宜忌两组文案：优先心理行为版（LLM），降级确定性趋吉避祸——与此前行为一致，未改数据流。
  const yiTitle = behavior ? t("calendar.todayYi") : t("calendar.auspiciousYi");
  const jiTitle = behavior ? t("calendar.todayJi") : t("calendar.cautionJi");
  const yiItems = behavior?.do?.length ? behavior.do : fortune?.auspicious ?? [];
  const jiItems = behavior?.dont?.length ? behavior.dont : fortune?.caution ?? [];

  const img = fortune ? matchFortuneImage(fortune.relation, selected) : undefined;
  const g = fortune ? gradeOf(fortune.scores.overall) : "neutral";
  const verdictText = t("calendar.grade." + g);
  const useDarkFile = dark && !!img?.darkFile && !fortuneImgError;
  const imgSrc = useDarkFile ? img?.darkFile : img?.file;

  const header = (
    <>
      <PageHeader
        as="div"
        kicker={t("calendar.kicker")}
        title={t("calendar.title")}
        annotation={`${profile.nickname} · ${t("calendar.dayMasterLabel")} ${profile.chart.bazi.dayMaster}（${profile.chart.bazi.dayMasterElement}）`}
      />

      {/* 本周日历条：桌面 7 格铺满内容列宽（06-desktop §5），移动同一份实现按比例缩窄 */}
      <div className="mt-6 grid grid-cols-7 gap-1.5 xl:gap-2">
        {days.map((d) => {
          const ds = ymd(d);
          const isSel = ds === selected;
          const isToday = ds === ymd(today);
          return (
            <button
              key={ds}
              onClick={() => setSelected(ds)}
              className="flex flex-col items-center py-2 transition-colors xl:py-2.5"
              style={{
                borderRadius: "var(--radius-card)",
                background: isSel ? "var(--color-ink)" : "var(--color-surface)",
                color: isSel ? "var(--color-on-ink)" : "var(--color-ink)",
                border: `1px solid ${isToday && !isSel ? "var(--color-cinnabar)" : "var(--color-line)"}`,
              }}
            >
              <span className="text-[10px]" style={{ color: isSel ? "var(--color-on-ink-muted)" : "var(--color-muted)" }}>{WK[d.getDay()]}</span>
              <span className="font-latin text-[17px] leading-tight">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* 本年/本限 时序上下文（大背景 → 今日） */}
      {horoscope && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--radius-card)] px-4 py-3" style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}>
          <span className="text-[13px] text-ink-2">{t("calendar.decadal")} <b className="font-semibold">{horoscope.decadal.stem}{horoscope.decadal.branch}</b></span>
          <span className="text-[13px] text-ink-2">{selYear} {t("calendar.yearly")} <b className="font-semibold">{horoscope.yearly.stem}{horoscope.yearly.branch}</b></span>
          <span className="text-[12px] text-muted">{t("calendar.yearlyJi")} <b className="text-cinnabar">{horoscope.yearly.mutagens.忌}</b>（{t("calendar.thisYearLesson")}）· {t("calendar.yearlyLu")} <b className="text-wood">{horoscope.yearly.mutagens.禄}</b>（{t("calendar.favorable")}）</span>
          <Link href="/chart" className="ml-auto shrink-0 text-[12px] text-gold underline underline-offset-4">{t("calendar.toTimeline")}</Link>
        </div>
      )}

      {/* 免责声明：合规文案（CLAUDE.md「心理占星 ≠ 临床心理…强制免责声明」），
          必须与 loading/fortune 状态无关地常显——放进 header（页级，不参与
          loading 门槛），而不是 right（loading 时整体为 null）。此前误放进
          right 导致 loading 期间免责声明连同五维/宜忌/候标尺一起消失，是纯
          回归，评审已判 Important；测试见 page.test.tsx「loading 态下免责
          声明仍然可见」。 */}
      <p className="mt-6 text-[12px] leading-relaxed text-muted">{t("calendar.disclaimer")}</p>
    </>
  );

  // 桌面左列（392px）：日期 + 干支徽 + 今日卡（与卷首同一组件）+ 判词强调块。
  // 移动端单列时同一份内容排在最前——信息顺序与桌面 8a 一致（日期干支 → 今日卡 → 判词）。
  const left =
    loading || !fortune ? (
      <div className="py-10 text-[14px] text-muted" style={{ borderTop: "1px solid var(--color-line)" }}>{t("calendar.calculating")}</div>
    ) : (
      <div className="zj-rise">
        <div className="flex items-start justify-between gap-4">
          <div className="text-[13px] text-muted">
            {selected.replaceAll("-", ".")}
            {fortune.lunarDate ? ` · ${fortune.lunarDate}` : ""}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GanzhiBadge char={fortune.dayGanZhi[0]!} size="md" />
            <GanzhiBadge char={fortune.dayGanZhi[1]!} size="md" />
          </div>
        </div>

        <div className="mt-5">
          <TodayCard
            label={t("common.todayCard.label")}
            date={selected.replaceAll("-", ".")}
            dateNote={fortune.lunarDate || ""}
            term={solarHou.hou}
            wuHou={solarHou.wuHou}
            polish={polish ?? t("calendar.todayVerdict")}
            meta={`${fortune.dayGanZhi} · ${MOOD_LABEL[fortune.relation]}`}
            bellAlt={t("common.todayCard.bellAlt", { verdict: verdictText })}
            // 终审必修 7：卡脚 href 不传——运势页复用本组件时，卡脚此前写死
            // href="/calendar" 指向当前页本身，点了原地不动，是死链。卡脚是
            // 给卷首写的「展开今日日签」入口，复用到 /calendar 上时该消失。
          />
        </div>

        {/* 判词强调块：全站唯一的强调手法（Emphasis），取代旧的裸判词大字 */}
        <Emphasis className="mt-6">
          <div data-testid="verdict-emphasis" className={`font-serif font-bold ${verdictTextClass(verdictText.length)}`}>{verdictText}</div>
          <div className="mt-2.5 text-[13px]" style={{ color: "var(--color-muted)" }}>
            {t("calendar.todayVerdict")}
            <span className="mx-1.5">·</span>
            {MOOD_LABEL[fortune.relation]}
          </div>
          {polish && (
            <p className="mt-5 font-serif text-[16px] leading-[1.9]" style={{ color: "var(--color-ink)" }}>{polish}</p>
          )}
        </Emphasis>

        {(fortune.favorableToday || fortune.interactions.length > 0) && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {fortune.favorableToday && <span className="px-2.5 py-0.5 text-[11px]" style={{ borderRadius: "var(--radius-chip)", border: "1px solid var(--color-cinnabar)", color: "var(--color-cinnabar)" }}>{t("calendar.favorableToday")}</span>}
            {fortune.interactions.map((it, i) => (
              <span key={i} className="px-2.5 py-0.5 text-[11px]" style={{ borderRadius: "var(--radius-chip)", background: "var(--color-tint)", color: "var(--color-muted)" }} title={it.note}>{t("calendar.interaction", { kind: it.kind, withPillar: it.withPillar })}</span>
            ))}
          </div>
        )}

        {/* 水墨配图：桌面 8a 稿无此位置（信息更密、更编辑式），移动端保留——
            既有能力（EP-cal-img，20 张人工筛选图 + curate skill），设计包未说废弃，
            与「黄历桌面不出、移动保留」是同一条取舍线（见任务报告/ledger）。
            ⚠️ 已知副作用（非疏忽，如实记录）：`xl:hidden` 只是不显示，节点仍会挂载，
            桌面视口下这张图与下面的深色兜底探测图仍会各发一次网络请求——这是「响应式
            只能用 Tailwind 断点类、不许 matchMedia/JS 判视口」这条约束的必然代价（要
            完全不发请求就得在 JS 里判断视口再决定渲不渲染，那正是被禁止的做法）。桌面
            用户因此会有一点不可见的图片流量，规模是 20 张图里的 1 张，可接受。 */}
        {img && (
          <div className="mx-auto mt-8 max-w-[340px] xl:hidden">
            <FortuneFrame src={imgSrc!} alt={img.alt} seed={selected} />
            {/* 深色变体 404 兜底探测：display:none 的 img 仍会发请求，但 loading="lazy"
                在没有布局盒时永不触发——所以这里绝不能加 lazy（C1 评审）。 */}
            <img src={imgSrc} alt="" aria-hidden className="hidden" onError={() => { if (useDarkFile) setFortuneImgError(true); }} />
          </div>
        )}
      </div>
    );

  // 桌面右列：五维 / 宜忌两栏 / 候标尺——桌面不出黄历（06-desktop §3 信息密度取舍）。
  // 免责声明已挪到 header（见上，页级常显，不随 loading 消失）。
  // 移动端单列时同一份内容紧随左列之后，额外保留黄历（既有已上线能力，删了是功能回退）。
  const right =
    loading || !fortune ? null : (
      <div className="zj-rise space-y-8">
        {process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1" && profile && fortune && (
          <AskToday profile={profile} fortune={fortune} dateStr={selected} />
        )}

        {/* 五维评分（细线计量，去卡片） */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] tracking-[0.3em] text-muted">{t("calendar.dimsTitle")}</div>
            <ScoreRing
              score={fortune.scores.overall}
              max={10}
              size={40}
              accent="var(--color-cinnabar)"
              showLabel={false}
              label={t("calendar.scoreLabel", { grade: verdictText, today: t("calendar.today") })}
            />
          </div>
          <div className="mt-4 space-y-3">
            {DIMS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-8 text-[13px] text-ink">{t("calendar.dims." + key)}</span>
                <div className="h-[3px] flex-1" style={{ background: "var(--color-line)" }}>
                  <div className="h-full" style={{ width: `${fortune.scores[key] * 10}%`, background: "var(--color-ink)" }} />
                </div>
                <span className="font-latin w-5 text-right text-[13px] text-muted">{fortune.scores[key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 今日宜忌：桌面两栏细线对齐，移动端单栏细线分行（不做两栏，见 brief 裁定）。
            ⚠️ 这里是本文件里唯一没有走「单容器 + xl:hidden」模式、而是两个容器各自
            渲染一份 YiJiColumn 的地方——不是疏漏。测试钉住的是 `yiji-grid` 元素本身的
            内联 `gridTemplateColumns: "1fr 1fr"`，而移动端必须是单栏；若改成单容器+
            响应式类，desktop 容器就不能再对「任意宽度」恒为内联两栏（那正是 TwoColumn
            自己的契约要刻意避免的写法），字面上的「1fr 1fr」断言与「移动端单栏」这两个
            要求没法用同一个容器同时满足，所以两份 YiJiColumn 是必要的重复，非误用。 */}
        <div data-testid="yiji-grid" className="hidden xl:grid" style={{ gridTemplateColumns: "1fr 1fr", columnGap: 40 }}>
          <YiJiColumn title={yiTitle} items={yiItems} dotColor="var(--color-wood)" />
          <YiJiColumn title={jiTitle} items={jiItems} dotColor="var(--color-cinnabar)" />
        </div>
        <div className="grid gap-8 xl:hidden">
          <YiJiColumn title={yiTitle} items={yiItems} dotColor="var(--color-wood)" />
          <YiJiColumn title={jiTitle} items={jiItems} dotColor="var(--color-cinnabar)" />
        </div>

        {/* 七十二候标尺：index 来自 getCurrentSolarHou，不硬编码 */}
        <SeasonRuler index={solarHou.index} label={solarHou.hou} />

        {/* owner 打磨批指令 1：移动端黄历块（data-testid="huangli"）已全站删除。 */}

      </div>
    );

  return (
    <main>
      {casting && <CastingOverlay title={t("calendar.calculating")} hint={t("common.casting")} mode="brief" />}
      <TwoColumn leftWidth={392} header={header} left={left} right={right} />
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}

/**
 * 宜忌单栏（表头 8px 方点 + serif 16px 标题 + 右侧条数 Cormorant 12px，
 * `border-bottom: 1px solid ink`；逐条 `padding: 13px 0; border-bottom: 1px solid line`）。
 * 桌面两栏、移动单栏各渲染一份（各自的可见性由外层 `xl:` 类控制，
 * jsdom 无布局测不了实际显隐，断言打在类名上），本组件本身不做断点判断。
 */
function YiJiColumn({ title, items, dotColor }: { title: string; items: string[]; dotColor: string }) {
  return (
    <div>
      <div className="flex items-center justify-between pb-2" style={{ borderBottom: "1px solid var(--color-ink)" }}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2" style={{ background: dotColor, borderRadius: 2 }} aria-hidden />
          <h3 className="font-serif text-[16px] font-semibold">{title}</h3>
        </div>
        <span className="font-latin text-[12px] text-muted">{items.length}</span>
      </div>
      <div>
        {items.map((item, i) => (
          <div key={i} className="text-[14px] text-ink-2" style={{ padding: "13px 0", borderBottom: "1px solid var(--color-line)" }}>{item}</div>
        ))}
      </div>
    </div>
  );
}
