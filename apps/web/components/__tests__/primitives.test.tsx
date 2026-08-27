import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Emphasis, Chip, PillChip, GanzhiBadge, Button } from "../ui";

afterEach(() => cleanup());

describe("Emphasis：全站唯一的强调手法", () => {
  it("横向版＝2px 朱砂左线 + 向右淡出底", () => {
    render(<Emphasis data-testid="e">当前候</Emphasis>);
    const el = screen.getByTestId("e");
    expect(el.style.borderLeft).toContain("var(--color-cinnabar)");
    expect(el.style.backgroundImage).toContain("90deg");
  });

  it("竖向版改用上边线与 180deg（用于日柱、命宫这类竖排）", () => {
    render(<Emphasis axis="vertical" data-testid="e">日柱</Emphasis>);
    const el = screen.getByTestId("e");
    expect(el.style.borderTop).toContain("var(--color-cinnabar)");
    expect(el.style.borderLeft).toBe("");
    expect(el.style.backgroundImage).toContain("180deg");
  });
});

describe("Chip / PillChip", () => {
  it("Chip 默认 tint 底、ink-2 字；强调态换朱砂描边与朱砂字", () => {
    const { rerender } = render(<Chip data-testid="c">纳音</Chip>);
    expect(screen.getByTestId("c").style.background).toContain("--color-tint");
    rerender(<Chip data-testid="c" emphasis>纳音</Chip>);
    const el = screen.getByTestId("c");
    expect(el.style.border).toContain("var(--color-cinnabar)");
    expect(el.style.color).toContain("var(--color-cinnabar)");
  });

  it("PillChip 是全圆角细线小件", () => {
    render(<PillChip data-testid="p">属鸡</PillChip>);
    const el = screen.getByTestId("p");
    expect(el.style.borderRadius).toBe("9999px");
    expect(el.style.border).toBe("1px solid var(--color-line)");
    expect(el.style.color).toBe("var(--color-ink-2)");
  });

  it("PillChip emphasis 真侧：描边与文字都转朱砂", () => {
    const { rerender } = render(<PillChip data-testid="p">2026</PillChip>);
    expect(screen.getByTestId("p").style.border).toBe("1px solid var(--color-line)");
    rerender(<PillChip data-testid="p" emphasis>2026</PillChip>);
    const el = screen.getByTestId("p");
    expect(el.style.border).toContain("var(--color-cinnabar)");
    expect(el.style.color).toContain("var(--color-cinnabar)");
  });
});

describe("GanzhiBadge 三档尺寸", () => {
  it("sm/md/lg 分别是 26/34/46px，默认 md", () => {
    const { rerender } = render(<GanzhiBadge char="庚" />);
    expect(screen.getByText("庚").style.width).toBe("34px");
    rerender(<GanzhiBadge char="庚" size="sm" />);
    expect(screen.getByText("庚").style.width).toBe("26px");
    rerender(<GanzhiBadge char="庚" size="lg" />);
    expect(screen.getByText("庚").style.width).toBe("46px");
  });
});

describe("Button variant=action：一屏最多一个的唯一动作", () => {
  it("满宽、朱砂底、纸色字、带字距", () => {
    render(<Button variant="action">解 这 个 梦</Button>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("w-full");
    expect(el.className).toContain("bg-[var(--color-cinnabar)]");
    expect(el.className).toContain("text-[var(--color-paper)]");
    expect(el.style.letterSpacing).toBe("0.16em");
  });
});
