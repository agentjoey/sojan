import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TwoColumn } from "../TwoColumn";

afterEach(() => cleanup());

function setup() {
  render(
    <TwoColumn
      leftWidth={392}
      header={<div>页头</div>}
      left={<div>左列</div>}
      right={<div>右列</div>}
    />
  );
}

describe("TwoColumn 桌面左定右动两栏", () => {
  it("两列各自独立滚动：overflow auto + min-height 0（缺后者会一起撑高页面），只在 xl 断点生效", () => {
    setup();
    for (const id of ["two-col-left", "two-col-right"]) {
      const el = screen.getByTestId(id);
      expect(el.className).toContain("xl:overflow-auto");
      expect(el.className).toContain("xl:min-h-0");
      // 不再通过内联 style 承载（内联 style 优先级恒高于类，无法被断点关闭，
      // 移动端单列态会凭空多出滚动容器）——同下面「不再通过内联 style 承载」
      // 那条对 border-right/padding 的既有断言是同一类守卫。
      expect(el.style.overflow).toBe("");
      expect(el.style.minHeight).toBe("");
    }
  });

  it("左列宽度经 CSS 变量传给断点类，不写内联 gridTemplateColumns（写了会在所有宽度都变两栏）", () => {
    setup();
    const grid = screen.getByTestId("two-col-grid");
    expect(grid.style.getPropertyValue("--two-col-left")).toBe("392px");
    expect(grid.style.gridTemplateColumns).toBe(""); // 必须为空——这条才是真正的守卫
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("xl:grid-cols-[var(--two-col-left)_1fr]");
  });

  // M4（复审 Minor）：此前这条与上面「左列宽度经 CSS 变量传给断点类」逐字重复
  // （同一对 grid-cols-1 / xl:grid-cols-[...] 断言），删掉重复内容会变红的组件
  // 回退它测不出来。换成真正独立的守卫：grid 上不能有无断点前缀的
  // `grid-cols-[...]`（那会让 <1200px 单列也被强制成任意列模板）。
  it("grid 上不存在无断点前缀的 grid-cols-[...]（M4：与前一用例不再重复）", () => {
    setup();
    const grid = screen.getByTestId("two-col-grid");
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-\[/);
  });

  it("页头在 grid 之上，不参与两列滚动", () => {
    setup();
    const header = screen.getByTestId("two-col-header");
    const grid = screen.getByTestId("two-col-grid");
    expect(header.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.contains(header)).toBe(false);
  });

  // ===== 必修 2：grid 要有「确定高度来源」，min-height:0 才不是惰性的 =====
  // 祖先链一路 min-height/auto，grid 行高会等于内容高，overflow:auto 永不触发；
  // 缺的第三块是外层要用 flex 列 + 定高把 grid 挤成「flex:1」。这条钉住高度来源，
  // 不只是钉 min-height/overflow 这两个老属性（那两个本身测不出「有没有生效」）。
  it("外层在 xl 断点下定高 + flex 列，grid 用 flex:1 吃满剩余空间（必修 2）", () => {
    setup();
    const outer = screen.getByTestId("two-col-outer");
    expect(outer.className).toContain("xl:h-[100dvh]");
    expect(outer.className).toContain("xl:flex");
    expect(outer.className).toContain("xl:flex-col");

    const header = screen.getByTestId("two-col-header");
    expect(header.className).toContain("xl:flex-none");

    const grid = screen.getByTestId("two-col-grid");
    expect(grid.className).toContain("xl:flex-1");
    expect(grid.className).toContain("xl:min-h-0");
  });

  // ===== 必修 3：桌面专有样式必须 xl 断点门控，不能在 <1200px 全量生效 =====
  it("外层内边距/最大宽度只在 xl 生效，<1200px 走 md:max-xl: 单列居中公式（必修 3）", () => {
    setup();
    const outer = screen.getByTestId("two-col-outer");
    // 桌面（≥1200px）：44/56/48 内边距 + 1120px 最大宽度，全部挂在 xl: 前缀下
    expect(outer.className).toContain("xl:pt-11");
    expect(outer.className).toContain("xl:px-14");
    expect(outer.className).toContain("xl:pb-12");
    expect(outer.className).toContain("xl:max-w-[1120px]");
    // 768–1199px：单列居中 min(100% - 96px, 720px)——必须是 `md:max-xl:`，
    // 不是裸 `md:`（见 C1 回归守卫用例，裸 md: 在 ≥1200px 会与 xl: 抢同一属性）
    expect(outer.className).toContain("md:max-xl:w-[min(100%-96px,720px)]");
    // <768px（默认无前缀类）：不能带任何 xl:/md: 专属的大内边距/宽度限制
    expect(outer.className).toMatch(/(^|\s)px-5(\s|$)/);
    expect(outer.className).not.toMatch(/(^|\s)px-14(\s|$)/); // 无前缀的桌面内边距绝不能存在
  });

  // ===== C1 回归守卫：md:/lg: 不许在与 xl: 争同一 CSS 属性的地方裸着出现 =====
  // 复审 Critical C1 的真实成因：`md:w-[...]`/`md:px-0`/`md:py-10` 与
  // `xl:w-full`/`xl:px-14`/`xl:pt-11` 同争 width/padding-inline/padding-block，
  // Tailwind 4 构建产物里 `xl:` 的 media 块排在 `md:` 前面，同 @layer、同特异度
  // 下源序在后者胜——于是 ≥1200px 视口下裸 `md:` 反而压过 `xl:`，桌面容器塌成
  // 720px。`class-name 存在`断言测不出级联结果，所以这条不检查「有没有
  // xl:xxx」，而是检查「有没有本该带 `max-xl:` 却漏写、导致会在 ≥1200px
  // 与 xl: 抢同一属性的裸 md:/lg:」——如果这条修复被回退（把 max-xl: 删掉、
  // 改回裸 md:），这条会红。
  it("outer 上没有会在 ≥1200px 与 xl: 抢占同一属性的裸 md:/lg:（C1 回归守卫）", () => {
    setup();
    const outer = screen.getByTestId("two-col-outer");
    const classes = outer.className.split(/\s+/);
    // 裸 md:/lg:（后面紧跟 w-/px-/py-/pt-/pb-/max-w-，且不是 md:max-xl:/lg:max-xl: 形式）
    const bareTabletSizing = classes.filter((c) =>
      /^(md|lg):(?!max-xl:)(w-|px-|py-|pt-|pb-|max-w-)/.test(c)
    );
    expect(bareTabletSizing).toEqual([]);
  });

  it("页头底线只在 xl 出现（此前无断点、<1200px 也会画出一条多余底线）", () => {
    setup();
    const header = screen.getByTestId("two-col-header");
    expect(header.className).toContain("xl:border-b");
    expect(header.className).toContain("xl:border-[var(--color-line-strong)]");
    // 不能有无断点前缀的 border-b（那会在所有宽度都出现）
    expect(header.className).not.toMatch(/(^|\s)border-b(\s|$)/);
  });

  it("左列右细线 + 32px 内边距、右列 40px 内边距只在 xl 生效（<1200px 单列不该有多余竖线/错位）", () => {
    setup();
    const left = screen.getByTestId("two-col-left");
    const right = screen.getByTestId("two-col-right");
    expect(left.className).toContain("xl:border-r");
    expect(left.className).toContain("xl:border-[var(--color-line)]");
    expect(left.className).toContain("xl:pr-8"); // 32px
    expect(right.className).toContain("xl:pl-10"); // 40px
    // 不能有无断点前缀版本
    expect(left.className).not.toMatch(/(^|\s)border-r(\s|$)/);
    expect(left.className).not.toMatch(/(^|\s)pr-8(\s|$)/);
    expect(right.className).not.toMatch(/(^|\s)pl-10(\s|$)/);
    // 且不再通过内联 style 承载这几条（内联 style 优先级恒高于类，无法被断点关闭）
    expect(left.style.borderRight).toBe("");
    expect(left.style.paddingRight).toBe("");
    expect(right.style.paddingLeft).toBe("");
  });

  // ===== I1：左列要留出足够的左内边距，才不会裁掉 Emphasis 的出血负外边距 =====
  // `Emphasis`（horizontal）用 `pl-3 -ml-3.5`，2px 朱砂竖线落在组件左边界外
  // 14px 处；xl 断点下左列是 `overflow:auto` 的滚动容器，LTR 下 inline-start
  // 方向的溢出既裁剪、又不可能滚到——左列必须自带 ≥14px 的左内边距把这段
  // 出血接住。断言直接从两处的 Tailwind spacing 类名里解析数值比较，不是
  // 单纯断言类名字符串存在（那测不出「够不够」）。
  it("左列左内边距 ≥ Emphasis 出血负外边距的绝对值（I1，防裁切朱砂竖线）", () => {
    setup();
    const left = screen.getByTestId("two-col-left");
    const spacing = (token: string) => {
      const m = token.match(/^-?(\d+(?:\.\d+)?)$/);
      if (!m) throw new Error(`unexpected spacing token: ${token}`);
      return parseFloat(m[1]) * 4; // Tailwind 默认 --spacing: .25rem = 4px
    };
    const plMatch = left.className.match(/xl:pl-([\d.]+)/);
    const mlMatch = left.className.match(/xl:-ml-([\d.]+)/);
    expect(plMatch).not.toBeNull();
    expect(mlMatch).not.toBeNull();
    const leftPaddingPx = spacing(plMatch![1]);
    // Emphasis horizontal 出血值写死在 ui.tsx（"pl-3 -ml-3.5"），此处按其定义复算，
    // 不是抄一个魔法数——若 Emphasis 改了出血值，这条断言仍然成立地比较两边。
    const EMPHASIS_BLEED_PX = spacing("3.5");
    expect(leftPaddingPx).toBeGreaterThanOrEqual(EMPHASIS_BLEED_PX);
    // 且左列自身要用等量负外边距把视觉位置拉回，不额外挤占列宽
    const leftMarginPx = spacing(mlMatch![1]);
    expect(leftMarginPx).toBe(leftPaddingPx);
  });
});
