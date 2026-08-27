import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompassWatermark } from "../CompassWatermark";

afterEach(() => cleanup());

const LAYERS = [
  { id: "compass-ticks",   anim: "zjSpinSlow", dur: "150s" },
  { id: "compass-branches", anim: "zjSpinRev",  dur: "190s" },
  { id: "compass-trigrams", anim: "zjSpinSlow", dur: "110s" },
  { id: "compass-palaces",  anim: "zjSpinRev",  dur: "84s"  },
  { id: "compass-core",     anim: "zjSpinSlow", dur: "80s"  },
];

describe("CompassWatermark 五层异速正反转", () => {
  it("五层齐备，各自的动画名与时长正确", () => {
    render(<CompassWatermark />);
    for (const l of LAYERS) {
      const el = screen.getByTestId(l.id);
      expect(el.style.animationName, l.id).toBe(l.anim);
      expect(el.style.animationDuration, l.id).toBe(l.dur);
    }
  });

  it("正反两个方向都用上了（不是五层同向）", () => {
    render(<CompassWatermark />);
    const names = LAYERS.map((l) => screen.getByTestId(l.id).style.animationName);
    expect(new Set(names)).toEqual(new Set(["zjSpinSlow", "zjSpinRev"]));
  });

  it("是装饰：aria-hidden，不进无障碍树", () => {
    const { container } = render(<CompassWatermark />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("五个圆环一律用 line-strong（owner 打磨批指令 5：转盘线条加深）", () => {
    const { container } = render(<CompassWatermark />);
    const circles = container.querySelectorAll("circle[stroke]");
    expect(circles.length).toBe(5);
    for (const c of circles) {
      expect(c.getAttribute("stroke")).toBe("var(--color-line-strong)");
    }
  });
});
