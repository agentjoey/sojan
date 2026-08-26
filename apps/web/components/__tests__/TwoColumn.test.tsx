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
  it("两列各自独立滚动：overflow auto + min-height 0（缺后者会一起撑高页面）", () => {
    setup();
    for (const id of ["two-col-left", "two-col-right"]) {
      const el = screen.getByTestId(id);
      expect(el.style.overflow).toBe("auto");
      expect(el.style.minHeight).toBe("0px");
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

  it("列间 1px 细线，左列右内边距 32px、右列左内边距 40px", () => {
    setup();
    const left = screen.getByTestId("two-col-left");
    expect(left.style.borderRight).toContain("var(--color-line)");
    expect(left.style.paddingRight).toBe("32px");
    expect(screen.getByTestId("two-col-right").style.paddingLeft).toBe("40px");
  });

  it("页头在 grid 之上，不参与两列滚动", () => {
    setup();
    const header = screen.getByTestId("two-col-header");
    const grid = screen.getByTestId("two-col-grid");
    expect(header.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.contains(header)).toBe(false);
  });

  it("<1200px 用单列（断言 Tailwind 断点类，jsdom 测不了媒体查询）", () => {
    setup();
    const grid = screen.getByTestId("two-col-grid");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("xl:grid-cols-[var(--two-col-left)_1fr]");
  });
});
