import type { CSSProperties, ReactNode } from "react";

/**
 * 桌面两栏骨架（UI v3 · 06-desktop §2/§3）：左定右动。
 * 左列（盘/日期等不动事实）与右列（解读/清单等可滚内容）各自独立滚动——
 * 关键在两列都要 min-height:0，否则 grid 子项默认 min-height:auto，
 * 两列会一起把页面撑高，右列滚动时左列的盘也会跟着跑，桌面版相对移动版
 * 的主要收益（滚动时盘不动）就没了。
 *
 * 断点用 Tailwind `xl:`（globals.css @theme 覆写为 1200px，见 06-desktop §2），
 * 列宽只经 CSS 变量 `--two-col-left` 传递给该断点类，不写内联
 * gridTemplateColumns——内联 style 优先级恒高于类，写了就等于任何宽度都是
 * 两栏，<1200px 单列的要求当场失效（jsdom 无布局，这个错误测不出来）。
 */
export function TwoColumn({
  leftWidth,
  header,
  left,
  right,
}: {
  leftWidth: number;
  header: ReactNode;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "44px 56px 48px" }}>
      <header
        data-testid="two-col-header"
        style={{ borderBottom: "1px solid var(--color-line-strong)" }}
      >
        {header}
      </header>
      <div
        data-testid="two-col-grid"
        className="grid grid-cols-1 xl:grid-cols-[var(--two-col-left)_1fr]"
        style={{ "--two-col-left": `${leftWidth}px` } as CSSProperties}
      >
        <div
          data-testid="two-col-left"
          style={{
            overflow: "auto",
            minHeight: "0px",
            borderRight: "1px solid var(--color-line)",
            paddingRight: 32,
          }}
        >
          {left}
        </div>
        <div
          data-testid="two-col-right"
          style={{ overflow: "auto", minHeight: "0px", paddingLeft: 40 }}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
