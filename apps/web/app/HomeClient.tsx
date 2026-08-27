"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SealIcon } from "@/components/ui";
import { CompassWatermark } from "@/components/CompassWatermark";
import { PageHeader } from "@/components/PageHeader";
import { TodayCard } from "@/components/TodayCard";
import { CastingOverlay } from "@/components/CastingOverlay";
import { SeasonRuler } from "@/components/charts/SeasonRuler";
import { useIsTelegram } from "@/lib/tg/ui";
import { Group, Cell } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";
import { isNavEnabled } from "@/lib/nav";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { useDailyFortune, gradeOf } from "@/lib/useDailyFortune";
import { MOOD_LABEL } from "@/lib/fortune-images";
import { solarHouAction } from "@/app/actions";

/**
 * 卷首目录（web 分支专属，UI v3 03-screens 5a §4）：朱文方印目录，4 行基线 + 「梦」
 * 按 flag 追加为可选第 5 行。
 *
 * 「起」（起盘建档）已并入 Hero 主 CTA 按钮，不在此重复出现——目录不是「把 AppShell
 * 的项集再抄一遍」，而是卷首自己的取舍。「灵」沿用 `isNavEnabled("spirit")` 门控
 * （单一事实源），与 AppShell 侧栏、TG 首页各自决定是否显示一致地取同一个开关。
 * 「候」映射到既有 `home.entries.annual`（本年时序 · 流年大限四化）——七十二候本身
 * 就是「时序」的载体，这一行与上方 `SeasonRuler` 呼应，不是新造的第五个功能。
 *
 * 「运」（今日运势）视为本页主入口，`SealIcon` 取 `zhu` 变体（朱砂描边）；其余取
 * `ink`（存在但非当前，语义见 `components/ui.tsx` `SealIcon` 文档）。
 */
const TOC_ENTRIES = [
  { char: "盘", key: "chart" as const, href: "/chart" },
  ...(isNavEnabled("spirit") ? [{ char: "灵", key: "spirit" as const, href: "/spirit" }] : []),
  { char: "运", key: "calendar" as const, href: "/calendar" },
  { char: "候", key: "annual" as const, href: "/chart" },
  ...(isNavEnabled("dream") ? [{ char: "梦", key: "dream" as const, href: "/dream" }] : []),
] as const;

/**
 * Telegram 内的**唯一**导航。
 *
 * ⚠️ `AppShell.tsx` 用 `{!tg && (…)}` 把桌面侧栏与移动底栏整个包住——TG 里不渲染任何
 * web 导航。所以只往 `AppShell.NAV` 加入口的新功能，在 Telegram 里入口数是**零**。
 * 风水「境」就是这么静默失踪的：flag 已开、页面已上线、web 导航有入口，但 TG 用户
 * 走不到，而当时全套测试是绿的（`TG_ENTRIES` 此前零覆盖）。
 *
 * **加新功能时两处都要加**，门控条件也要一致。回归由 `app/__tests__/page.test.tsx` 守。
 *
 * 注：`accent` 与 `起` 同为 `--color-earth`——土是居所/方位的五行，语义上对，
 * 但两行同色；若日后调色板扩充，这里值得给「境」一个独立色。
 *
 * flag 门控判断统一取自 `lib/nav.ts` 的 `isNavEnabled`（单一事实源）——这里的
 * `icon`/`accent`/`key`/`path` 仍是本文件自己的事，不受该模块影响。
 */
const TG_ENTRIES = [
  { icon: "运", accent: "var(--color-cinnabar)", key: "calendar" as const, path: "/calendar" },
  { icon: "盘", accent: "var(--color-water)", key: "chart" as const, path: "/chart" },
  // EP-jiao 最终评审 C1：「灵」入口在此摘除（内测期 TG 不上掷筊，owner 决定）。
  // 根因：`/spirit` 的 `askSpirit`/`SpiritPanel` 追问一律走浏览器侧
  // `supabase().auth.getSession()` 取 Bearer token——Telegram Mini App webview 里
  // 没有这份浏览器侧 Supabase 会话，token 恒为 undefined，每次掷筊必然撞 401，
  // 对 TG 用户是死胡同。TG 侧要接得起来需要照抄 `api/tg/dream` 补一条
  // `api/tg/jiao` 中介臂（`hasTgSession()` 分流），这条待办记在
  // `.agent/BACKLOG.md` 的 EP-jiao-tg。**加回来时别忘了同时恢复这里的
  // NEXT_PUBLIC_SPIRIT_ENABLED 门控**——两处（这里 + AppShell.NAV）条件必须一致
  // （CLAUDE.md 记的教训）；本文件顶部这条历史注释也留着，因为它是另一半同形状的坑。
  ...(isNavEnabled("fengshui")
    ? [{ icon: "境", accent: "var(--color-earth)", key: "fengshui" as const, path: "/fengshui" }]
    : []),
  { icon: "起", accent: "var(--color-earth)", key: "reading" as const, path: "/reading" },
  ...(isNavEnabled("dream")
    ? [{ icon: "梦", accent: "var(--color-water)", key: "dream" as const, path: "/dream" }]
    : []),
  { icon: "档", accent: "var(--color-wood)", key: "profiles" as const, path: "/profiles" },
];

/** 服务端 `page.tsx` 现算好传下来的候数据形状——不从 `@sojan/core` 取类型，
 * 避免这个 client 组件对该包产生哪怕是 type-only 的引用（保持 bundle 分析可读）。 */
type SolarHouProp = {
  hou: string;
  wuHou: string;
  index: number;
};

/** 服务端 `page.tsx` 用 `new Date()` 现算一次、当 useState 初值传下来的日期形状——
 * 只是「ISR 重新生成时刻」的快照，挂载后立刻会被访客本地时钟纠偏，见下方 hook。 */
type TodayProp = {
  /** `YYYY.MM.DD`，服务端时区/时刻现算。 */
  date: string;
  /** `Date#getDay()` 的 0–6，喂给 `calendar.weekDays` 做星期文案索引。 */
  dayIndex: number;
};

export type HomeClientProps = {
  /** 七十二候：服务端组件 `page.tsx` 用 `getCurrentSolarHou()` 现算后传入，
   * 本组件不再自己调用（该函数来自 `@sojan/core`，静态 import 会把整条排盘依赖链
   * 打进 TG 首页客户端 chunk，见 `.superpowers/sdd/2026-08-26-ui-v3-c1-daily/bundle-fix-report.md`）。 */
  solarHou: SolarHouProp;
  /** 今日日期/星期索引的**初值**——来自 `page.tsx` 服务端现算，作用是让本组件的
   * 首次客户端渲染与服务端预渲染的 HTML 逐字节一致（防 hydration mismatch）。
   * 挂载后的 `useEffect` 会用访客本地时钟覆盖它，这个 prop 不是最终显示值。 */
  today: TodayProp;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function computeToday(): TodayProp {
  const now = new Date();
  return {
    date: `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`,
    dayIndex: now.getDay(),
  };
}

export default function HomeClient({ solarHou, today: initialToday }: HomeClientProps) {
  const inTg = useIsTelegram();
  const router = useRouter();
  const t = useT();

  /**
   * 为什么初值来自 `page.tsx` 传下来的 prop，而不是直接在这里 `new Date()`：
   *
   * `/` 是全静态预渲染路由（见 `page.tsx` 的 `export const revalidate = 3600`）——
   * 这个 client component 照样会被服务端预渲染进静态 HTML。若这里的首次渲染
   * 直接读 `new Date()`，服务端预渲染用的是部署/ISR 机器的 UTC 时刻，客户端
   * hydrate 时读的是访客本地时钟，两者不一致的时长等于时区偏移量——华裔用户
   * 每天本地 00:00–07:59、美西用户每天本地 17:00–23:59 都会踩到，是**常态**
   * 而非边界时刻。React 19 会把这类文本 mismatch 当 recoverable error 处理并
   * 报 console 错误（丢弃该处服务端 HTML、客户端重渲染），不是「静默换值」。
   *
   * 用服务端算好的 `initialToday` 作 `useState` 初值，服务端渲染与客户端首次
   * 渲染就逐字节一致——mismatch 从根上不存在。随后下面的 `useEffect`（只在
   * 挂载后跑，服务端不执行）立刻用访客本地时钟重算并 `setState` 覆盖：不冻结
   * （`initialToday` 有 ISR 1 小时兜底）、无 hydration 错误（首渲一致）、
   * 最终显示值仍以访客本地时钟为准（effect 覆盖），三者同时满足。
   */
  const [today, setToday] = useState<TodayProp>(initialToday);

  useEffect(() => {
    // 有意为之（不是可挪进渲染体的派生状态）：这正是「先用服务端初值渲染避免
    // hydration mismatch、挂载后立刻用访客本地时钟纠偏」的规范写法，与
    // `lib/i18n/I18nProvider.tsx`（62 行）、`components/tg/DarkImage.tsx`
    // （21 行）是同一类已被本仓库接受的模式。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(computeToday());

    // ⚠️ 复审 Minor M6：上面这行只在挂载时纠偏一次——长驻标签页（不刷新、
    // 不切走再切回）跨过本地午夜后，`today` 会一直停在挂载那一刻的日期，
    // 卷首日期/星期整整错一天，且没有任何机制会自动纠正（`visibilitychange`
    // 也不会触发，因为标签页可能全程保持前台）。补一个到「下一次本地
    // 00:00」的 `setTimeout`，到点重算并重新调度下一次午夜。
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleMidnightRollover = () => {
      const now = new Date();
      // +5s 缓冲：避免系统时钟/定时器抖动导致提前几毫秒触发、读到的还是前一天。
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => {
        // 不需要 eslint-disable：`react-hooks/set-state-in-effect` 只管 effect
        // body 里直接同步的 setState，这里是定时器回调里的 setState（订阅外部
        // 时钟变化），是规则本身认可的写法（同上方注释引的 DarkImage 例子）。
        setToday(computeToday());
        scheduleMidnightRollover();
      }, nextMidnight.getTime() - now.getTime());
    };
    scheduleMidnightRollover();

    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  // owner 打磨批指令 2：今日卡复用运势数据流——有档案才渲染，与 /calendar
  // 逐字同源（dailyFortuneAction + polish 缓存 + 本地日期的候）；无档案不显示。
  // TG 臂不渲染今日卡，也不发起任何取数（TG 冻结）。
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    if (inTg) return;
    let alive = true;
    getActiveProfile()
      .then((p) => { if (alive) setProfile(p); })
      .catch(() => { if (alive) setProfile(null); });
    return () => { alive = false; };
  }, [inTg]);

  // 候：SSR 首帧用服务端 prop（防 hydration mismatch），挂载后按访客本地日期经
  // server action 覆盖——消除服务端 UTC 快照与本地日历日的错位（原 M7 记录）。
  const [hou, setHou] = useState<SolarHouProp>(solarHou);
  const todayIso = today.date.replaceAll(".", "-");
  useEffect(() => {
    if (inTg) return;
    let alive = true;
    solarHouAction(todayIso)
      .then((h) => { if (alive) setHou(h); })
      .catch(() => { /* 覆盖失败则保留服务端初值 */ });
    return () => { alive = false; };
  }, [inTg, todayIso]);

  const { fortune, polish } = useDailyFortune(inTg ? null : profile, todayIso);

  return (
    <main className="mx-auto w-full max-w-[480px] pb-16 lg:max-w-5xl">
      {!inTg && (
        <>
          {/* 等待过场（owner 打磨批指令 7）：档案/流日未落定期间全屏遮盖。 */}
          {(profile === undefined || (profile !== null && !fortune)) && (
            <CastingOverlay title={t("common.loading")} mode="pending" />
          )}
          {/* ===== 卷首 Hero（转盘水印 + 大标题 + 定位句，03-screens 5a §1） ===== */}
          <section className="relative overflow-hidden px-7 pt-12 lg:px-16 lg:pt-20">
            <CompassWatermark
              className="pointer-events-none absolute -right-24 top-10 w-[300px] lg:-right-16 lg:w-[380px]"
              style={{ opacity: 0.22 }}
            />

            {/* owner 打磨批指令 3/5：独立 logo+「照见」行与「卷 首」眉标已移除
               （品牌词上移进移动端胶囊；眉标小字废除）。 */}
            <div className="relative mt-24 lg:mt-32">
              <h1 className="zj-rise mt-4 font-serif text-[42px] font-bold leading-[1.18] lg:text-[64px]" style={{ animationDelay: ".16s" }}>
                {t("home.heroTitle1")}<br />{t("home.heroTitle2")}
              </h1>
              <p className="zj-rise mt-5 max-w-[290px] text-[13.5px] leading-[1.9] text-ink-2 lg:max-w-[400px] lg:text-[15px]" style={{ animationDelay: ".26s" }}>
                {t("home.heroSubtitle")}
              </p>
              <div className="zj-rise mt-9" style={{ animationDelay: ".34s" }}>
                <Link
                  href="/reading"
                  className="zj-btn inline-flex items-center justify-center px-7 py-3.5 text-[15px] font-medium transition-colors duration-200 hover:bg-[var(--color-cinnabar-press)]"
                  style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}
                >
                  {t("home.ctaButton")}
                </Link>
              </div>
            </div>
          </section>

          {/* ===== 今日卡（owner 打磨批指令 2：与运势页同一数据流、同一组件；
              有档案才渲染，无档案整块不出；卡脚保留指向 /calendar 的入口） ===== */}
          {profile && fortune && (
            <div className="zj-rise relative mt-14 px-7 lg:mx-auto lg:mt-20 lg:max-w-4xl lg:px-16" style={{ animationDelay: ".4s" }}>
              <TodayCard
                label={t("common.todayCard.label")}
                date={today.date}
                dateNote={fortune.lunarDate || ""}
                term={hou.hou}
                wuHou={hou.wuHou}
                polish={polish ?? t("calendar.todayVerdict")}
                meta={`${fortune.dayGanZhi} · ${MOOD_LABEL[fortune.relation]}`}
                href="/calendar"
                expandLabel={t("common.todayCard.expand")}
                bellAlt={t("common.todayCard.bellAlt", { verdict: t(`calendar.grade.${gradeOf(fortune.scores.overall)}`) })}
              />
            </div>
          )}

          {/* ===== 七十二候标尺（03-screens 5a §3；挂载后按访客本地日期覆盖） ===== */}
          <div className="relative mt-10 px-7 lg:mx-auto lg:max-w-4xl lg:px-16">
            <SeasonRuler index={hou.index} label={hou.hou} />
          </div>

          {/* ===== 目录（03-screens 5a §4：朱文方印 + serif 标题，卡片网格废除） ===== */}
          <div className="relative mt-16 px-7 lg:mx-auto lg:mt-20 lg:max-w-4xl lg:px-16">
            {/* owner 打磨批指令 5：「目 录」眉标小字废除；五入口印章统一朱文 zhu
               （此前只有「运」是 zhu、其余墨文 ink——ui.tsx 的 variant 语义注释
               是档案列表语境，目录这里按 owner 拍板统一）。 */}
            <div className="zj-rise mt-5" style={{ borderTop: "1px solid var(--color-line)" }}>
              {TOC_ENTRIES.map((e) => (
                <Link
                  key={e.key}
                  href={e.href}
                  data-testid="toc-row"
                  className="group flex items-center gap-4 py-5"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <SealIcon char={e.char} variant="zhu" size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-[19px] font-semibold">{t(`home.entries.${e.key}.title`)}</div>
                    <div className="mt-1 text-[12px] text-muted">{t(`home.entries.${e.key}.sub`)}</div>
                  </div>
                  <span className="text-[15px] text-muted transition-colors group-hover:text-ink">→</span>
                </Link>
              ))}
            </div>

            <p className="mt-16 text-[12px] leading-relaxed text-muted">
              {t("home.disclaimer")}
            </p>
            <p className="mt-10 text-[11px] tracking-[0.2em] text-muted">
              {t("home.footerBrand")}
            </p>
          </div>
        </>
      )}

      {inTg && (
        <div className="px-5 pt-10">
          <PageHeader kicker={t("home.kickerHero")} title={t("common.brand")} annotation={t("home.tg.tagline")} />
          <div className="mt-5">
            <Group>
              {TG_ENTRIES.map((e) => (
                <Cell
                  key={e.key}
                  icon={e.icon}
                  accent={e.accent}
                  title={t(`home.tg.entries.${e.key}.title`)}
                  subtitle={t(`home.tg.entries.${e.key}.subtitle`)}
                  onClick={() => router.push(e.path)}
                />
              ))}
            </Group>
          </div>
        </div>
      )}
    </main>
  );
}
