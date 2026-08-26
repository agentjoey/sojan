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
 */
export function ChartToc() {
  const t = useT();
  return (
    <nav className="mt-8" style={{ borderTop: "1px solid var(--color-line)" }}>
      {ROWS.map(({ href, key }) => (
        <a
          key={href}
          href={href}
          data-testid="chart-toc-row"
          className="flex items-center justify-between py-4 transition-colors duration-200"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <span className="font-serif text-[19px]">{t(key)}</span>
          <span style={{ color: "var(--color-muted)" }}>→</span>
        </a>
      ))}
    </nav>
  );
}
