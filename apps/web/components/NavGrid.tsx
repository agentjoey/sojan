"use client";

import Link from "next/link";
import { getCurrentSolarHou } from "@sojan/core";
import { useT } from "@/lib/i18n/I18nProvider";
import { enabled, isActive, GRID_ORDER } from "@/lib/nav";

/**
 * 九宫格全屏导航覆盖层（Task 5）。
 *
 * 边界（brief §边界划分）：本组件**只**画网格 + 七十二候一行。左上语境胶囊 /
 * 右上关闭键属于下一个任务的 `MobileShell`（层叠顺序更高、压在本组件之上），
 * 这里再画一套会重影；焦点管理（进入/归还）也留给外壳。
 *
 * 项集取 `GRID_ORDER`（= `RAIL_ORDER` 去掉「我的」——移动端由顶部语境胶囊进
 * 「我的」，见 `lib/nav.ts` 注释），已按 flag 过滤、保序。
 */
export function NavGrid({
  open,
  onClose,
  currentPath,
}: {
  open: boolean;
  onClose: () => void;
  currentPath: string;
}) {
  const t = useT();

  if (!open) return null;

  const items = enabled(GRID_ORDER);
  const { hou, wuHou } = getCurrentSolarHou();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="zj-fade"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        overflowY: "auto",
        background: "var(--color-paper)",
      }}
    >
      <div style={{ padding: "max(56px, env(safe-area-inset-top) + 12px) 16px 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
          }}
        >
          {items.map((item) => {
            const active = isActive(currentPath, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid="nav-grid-cell"
                aria-label={t(item.labelKey)}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1"
                style={{
                  padding: "16px 0",
                  borderRadius: "var(--radius-card)",
                  background: active ? "var(--color-ink)" : "var(--color-surface)",
                  color: active ? "var(--color-on-ink)" : "var(--color-ink)",
                  border: active ? "none" : "1px solid var(--color-line)",
                }}
              >
                <span className="font-serif" style={{ fontSize: 23 }}>
                  {item.char}
                </span>
                <span style={{ fontSize: 10.5 }}>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>

        <section data-testid="nav-grid-seasons" className="mt-6">
          <p className="font-serif" style={{ letterSpacing: "0.3em" }}>
            七 十 二 候
          </p>
          <p style={{ color: "var(--color-muted)" }}>
            {hou} · {wuHou}
          </p>
        </section>
      </div>
    </div>
  );
}
