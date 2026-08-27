"use client";

import { useT } from "@/lib/i18n/I18nProvider";

const ROWS = [
  { href: "#ziwei-board", key: "chart.tocZiwei" },
  { href: "#reading-tabs", key: "chart.tocReading" },
] as const;

/**
 * 命盘页目录（设计包 5b 第 6 条）。稿子原本是一条跳转入口条
 * 「紫微十二宫 · 三段式解读 →」，**owner 2026-08-26 裁定紫微留在 /chart 页内**，
 * 故改为页内锚点两行，版式复用卷首目录行。
 * ⚠️ 目标区块的 id（`ziwei-board` / `reading-tabs`）由 `app/chart/page.tsx` 提供，
 * 改这里的 href 必须同步改那边的 id，否则锚点静默失效。
 *
 * hover 风格与卷首目录行对齐（`app/HomeClient.tsx` 的 `data-testid="toc-row"`）：
 * 唯一变化是箭头由 muted 转 ink（`group`/`group-hover:text-ink`），不加投影/位移/放大
 * （设计包 `06-desktop` §4 明令强调手法与 hover 都要克制）。
 *
 * `xl:hidden`（M6/R8）：spec §2.1/§10 的左列枚举本就不含目录；§2.2 原话是
 * 「移动端由目录两行提供锚点跳转」——桌面上两个锚点目标就在紧邻可见的右列
 * 里，点了几乎不动，纯属多余。jsdom 无布局，锚点一致性断言不受影响。
 */
export function ChartToc() {
  const t = useT();
  return (
    <nav
      aria-label={t("chart.tocAria")}
      className="mt-8 xl:hidden"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      {ROWS.map(({ href, key }) => (
        <a
          key={href}
          href={href}
          data-testid="chart-toc-row"
          className="group flex items-center justify-between py-4 transition-colors duration-200"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <span className="font-serif text-[19px]">{t(key)}</span>
          <span className="text-muted transition-colors group-hover:text-ink">→</span>
        </a>
      ))}
    </nav>
  );
}
