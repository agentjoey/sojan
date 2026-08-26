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
 * 左右两列自己的 `overflow:auto`/`min-height:0` 同样只在 `xl:` 生效（Tailwind
 * `xl:overflow-auto xl:min-h-0` 类，不是无断点的内联 style）——理由与下面「三档
 * 响应式」一致：这两条是桌面独立滚动专用的，移动端单列走正常文档流，若在
 * <1200px 也生效，会凭空多出两个滚动容器（影响 `position: sticky` 子元素、
 * 可能裁切绝对定位内容），且以前用内联 style 写还有个副作用——内联 style
 * 优先级恒高于类，没法只在 xl 断点关闭。
 *
 * 断点用 Tailwind `xl:`（globals.css @theme 覆写为 1200px，见 06-desktop §2），
 * 列宽只经 CSS 变量 `--two-col-left` 传递给该断点类，不写内联
 * gridTemplateColumns——内联 style 优先级恒高于类，写了就等于任何宽度都是
 * 两栏，<1200px 单列的要求当场失效（jsdom 无布局，这个错误测不出来）。
 *
 * 三档响应式（06-desktop §3.1）：
 * - `<768px`（默认，无前缀类）：正常文档流单列，小内边距。
 * - `768–1199px`（`md:max-xl:`，**不是裸 `md:`**——见下方 footgun 说明）：
 *   单列居中，宽度 `min(100% - 96px, 720px)`——桌面专有的分隔线/内边距
 *   （44/56/48、列间细线）在这一档同样不出现，此前这些是**无断点的内联
 *   style**，在 <1200px 全量生效（终审 Important：390px 视口内容宽被压到
 *   290px、单列态多出一条毫无意义的竖线、header 底线在移动端也回来了）。
 * - `≥1200px`（`xl:`）：两栏骨架 + 桌面专有的内边距/分隔线/页头底线。
 *
 * ⚠️ **`md:` vs `xl:` footgun（复审 Critical C1）**：本组件曾把上面这档写成裸
 * `md:`（Tailwind 默认 768px），与 `xl:`（本仓覆写为 1200px）在 768–1199px
 * 之外**本该**不重叠——但构建产物里 `xl:` 的 media 块排在 `md:` 前面，同
 * `@layer utilities`、同特异度下按源序层叠，于是 ≥1200px 视口下源序在后的
 * `md:` 类反而压过 `xl:` 类，桌面容器塌成 720px。**曾尝试在 `globals.css`
 * 把五个断点按 sm→md→lg→xl→2xl 升序显式声明来让 `xl:` 排到 `md:` 后面，
 * 但这个假设经构建产物实测证伪**（加前/加后分别 build + grep 产物，`xl` 的
 * media 块位置完全没变，见 `globals.css` 断点声明上方注释）——即声明顺序
 * 并不能可靠地控制 Tailwind 4 这里的媒体块输出顺序。所以本组件**不依赖任何
 * 源序假设**：这一档写 `md:max-xl:` 而不是裸 `md:`——`max-xl:` 是
 * `@media (width < 1200px)`，在 ≥1200px 根本不匹配，与 `xl:` 谁先谁后都
 * 不再重要，这是唯一经验证有效的修法。
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
      className="mx-auto w-full px-5 py-8 md:max-xl:w-[min(100%-96px,720px)] md:max-xl:px-0 md:max-xl:py-10 xl:h-[100dvh] xl:w-full xl:max-w-[1120px] xl:flex xl:flex-col xl:px-14 xl:pt-11 xl:pb-12"
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
          className="xl:overflow-auto xl:min-h-0 xl:border-r xl:border-[var(--color-line)] xl:pr-8 xl:pl-3.5 xl:-ml-3.5"
        >
          {left}
        </div>
        <div data-testid="two-col-right" className="xl:overflow-auto xl:min-h-0 xl:pl-10">
          {right}
        </div>
      </div>
    </div>
  );
}
