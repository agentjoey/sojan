"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellLogo, SealIcon } from "@/components/ui";
import { CompassWatermark } from "@/components/CompassWatermark";
import { PageHeader } from "@/components/PageHeader";
import { TodayCard } from "@/components/TodayCard";
import { SeasonRuler } from "@/components/charts/SeasonRuler";
import { useIsTelegram } from "@/lib/tg/ui";
import { Group, Cell } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";
import { isNavEnabled } from "@/lib/nav";
import { getCurrentSolarHou } from "@sojan/core";

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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

export default function Home() {
  const inTg = useIsTelegram();
  const router = useRouter();
  const t = useT();

  // 七十二候：由 core 现算，卷首与运势页各自取值时机不同，故本页在此自取一次
  // （`TodayCard`/`SeasonRuler` 均不自己调 `getCurrentSolarHou()`，见两组件文档）。
  const solarHou = getCurrentSolarHou();
  const now = new Date();
  const todayDate = `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}`;
  const weekDay = t("calendar.weekDays").split(",")[now.getDay()];

  return (
    <main className="mx-auto w-full max-w-[480px] pb-16 lg:max-w-5xl">
      {!inTg && (
        <>
          {/* ===== 卷首 Hero（转盘水印 + 眉标 + 大标题 + 定位句，03-screens 5a §1） ===== */}
          <section className="relative overflow-hidden px-7 pt-12 lg:px-16 lg:pt-20">
            <CompassWatermark
              className="pointer-events-none absolute -right-24 top-10 w-[300px] lg:-right-16 lg:w-[380px]"
              style={{ opacity: 0.14 }}
            />
            <div className="zj-rise relative flex items-center gap-2.5">
              <BellLogo size={26} motion="ring" ringKey={0} />
              <span className="font-serif text-[17px] font-bold tracking-[0.14em]">{t("common.brand")}</span>
            </div>

            <div className="relative mt-24 lg:mt-32">
              <p className="zj-rise text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)", animationDelay: ".08s" }}>
                {t("home.kickerHero")}
              </p>
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

          {/* ===== 今日卡（TodayCard，03-screens 5a §2；卡脚指向 /calendar） ===== */}
          <div className="zj-rise relative mt-14 px-7 lg:mx-auto lg:mt-20 lg:max-w-4xl lg:px-16" style={{ animationDelay: ".4s" }}>
            <TodayCard
              date={todayDate}
              lunar={t("home.today.weekday", { day: weekDay })}
              verdict={t("home.today.verdict")}
              term={solarHou.hou}
              wuHou={solarHou.wuHou}
              polish={t("home.today.polish")}
              meta={t("home.today.meta")}
              href="/calendar"
            />
          </div>

          {/* ===== 七十二候标尺（03-screens 5a §3；index 来自 getCurrentSolarHou） ===== */}
          <div className="relative mt-10 px-7 lg:mx-auto lg:max-w-4xl lg:px-16">
            <SeasonRuler index={solarHou.index} label={solarHou.hou} />
          </div>

          {/* ===== 目录（03-screens 5a §4：朱文方印 + serif 标题，卡片网格废除） ===== */}
          <div className="relative mt-16 px-7 lg:mx-auto lg:mt-20 lg:max-w-4xl lg:px-16">
            <p className="zj-rise text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
              {t("home.kickerToc")}
            </p>
            <div className="zj-rise mt-5" style={{ borderTop: "1px solid var(--color-line)" }}>
              {TOC_ENTRIES.map((e) => (
                <Link
                  key={e.key}
                  href={e.href}
                  data-testid="toc-row"
                  className="group flex items-center gap-4 py-5"
                  style={{ borderBottom: "1px solid var(--color-line)" }}
                >
                  <SealIcon char={e.char} variant={e.key === "calendar" ? "zhu" : "ink"} size={36} />
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
