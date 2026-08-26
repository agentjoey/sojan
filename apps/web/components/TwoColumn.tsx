import type { CSSProperties, ReactNode } from "react";

/**
 * 桌面两栏骨架（UI v3 · 06-desktop §2/§3）：左定右动。
 * 左列（盘/日期等不动事实）与右列（解读/清单等可滚内容）各自独立滚动——
 * 关键在两列都要 min-height:0，否则 grid 子项默认 min-height:auto，
 * 两列会一起把页面撑高，右列滚动时左列的盘也会跟着跑，桌面版相对移动版
 * 的主要收益（滚动时盘不动）就没了。
 *
 * ⚠️ `min-height:0` 是**必要非充分**条件——终审揪出的第三个缺件是「grid 本身
 * 要有确定高度来源」：祖先链（html/body/AppShell/`<main>`）一路都是
 * `min-height`/auto，grid 的行高在这条链上永远等于内容高，`overflow:auto`
 * 因此永远不会触发，整页会一起滚。所以外层在 `xl:` 断点下改成
 * `display:flex; flex-direction:column` + `height:100dvh`，header 用
 * `flex:none` 占住自己的高度，grid 用 `flex:1; min-height:0` 吃掉剩余空间——
 * 这样 grid 才有一个「非内容撑出来」的高度，两列的 `overflow:auto` 才真正生效。
 * **必须 `xl:` 断点门控**：移动端仍要走正常文档流滚动，定高会直接毁掉它。
 *
 * 断点用 Tailwind `xl:`（globals.css @theme 覆写为 1200px，见 06-desktop §2），
 * 列宽只经 CSS 变量 `--two-col-left` 传递给该断点类，不写内联
 * gridTemplateColumns——内联 style 优先级恒高于类，写了就等于任何宽度都是
 * 两栏，<1200px 单列的要求当场失效（jsdom 无布局，这个错误测不出来）。
 *
 * 三档响应式（06-desktop §3.1）：
 * - `<768px`（默认，无前缀类）：正常文档流单列，小内边距。
 * - `768–1199px`（`md:`，Tailwind 默认断点未被覆写，仍是 768）：单列居中，
 *   宽度 `min(100% - 96px, 720px)`——桌面专有的分隔线/内边距（44/56/48、
 *   列间细线）在这一档同样不出现，此前这些是**无断点的内联 style**，
 *   在 <1200px 全量生效（终审 Important：390px 视口内容宽被压到 290px、
 *   单列态多出一条毫无意义的竖线、header 底线在移动端也回来了）。
 * - `≥1200px`（`xl:`）：两栏骨架 + 桌面专有的内边距/分隔线/页头底线。
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
    <div
      data-testid="two-col-outer"
      className="mx-auto w-full px-5 py-8 md:w-[min(100%-96px,720px)] md:px-0 md:py-10 xl:h-[100dvh] xl:w-full xl:max-w-[1120px] xl:flex xl:flex-col xl:px-14 xl:pt-11 xl:pb-12"
    >
      <header
        data-testid="two-col-header"
        className="xl:flex-none xl:border-b xl:border-[var(--color-line-strong)] xl:pb-6"
      >
        {header}
      </header>
      <div
        data-testid="two-col-grid"
        className="grid grid-cols-1 xl:min-h-0 xl:flex-1 xl:grid-cols-[var(--two-col-left)_1fr]"
        style={{ "--two-col-left": `${leftWidth}px` } as CSSProperties}
      >
        <div
          data-testid="two-col-left"
          className="xl:border-r xl:border-[var(--color-line)] xl:pr-8"
          style={{ overflow: "auto", minHeight: "0px" }}
        >
          {left}
        </div>
        <div
          data-testid="two-col-right"
          className="xl:pl-10"
          style={{ overflow: "auto", minHeight: "0px" }}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
