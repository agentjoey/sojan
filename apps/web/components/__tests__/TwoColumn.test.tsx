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

  it("<1200px 用单列（断言 Tailwind 断点类，jsdom 测不了媒体查询）", () => {
    setup();
    const grid = screen.getByTestId("two-col-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("xl:grid-cols-[var(--two-col-left)_1fr]");
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
  it("外层内边距/最大宽度只在 xl 生效，<1200px 走 md 单列居中公式（必修 3）", () => {
    setup();
    const outer = screen.getByTestId("two-col-outer");
    // 桌面（≥1200px）：44/56/48 内边距 + 1120px 最大宽度，全部挂在 xl: 前缀下
    expect(outer.className).toContain("xl:pt-11");
    expect(outer.className).toContain("xl:px-14");
    expect(outer.className).toContain("xl:pb-12");
    expect(outer.className).toContain("xl:max-w-[1120px]");
    // 768–1199px（md，未被覆写仍是 768）：单列居中 min(100% - 96px, 720px)
    expect(outer.className).toContain("md:w-[min(100%-96px,720px)]");
    // <768px（默认无前缀类）：不能带任何 xl:/md: 专属的大内边距/宽度限制
    expect(outer.className).toMatch(/(^|\s)px-5(\s|$)/);
    expect(outer.className).not.toMatch(/(^|\s)px-14(\s|$)/); // 无前缀的桌面内边距绝不能存在
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
});
