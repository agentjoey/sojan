import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TodayCard } from "../TodayCard";

afterEach(() => cleanup());

const props = {
  date: "2026.08.25", lunar: "七月初三", verdict: "谨",
  term: "处暑 · 初候", wuHou: "鹰乃祭鸟",
  polish: "鹰知秋气而肃，今日不必急着出手。",
  meta: "庚申 · 官杀当值　五维 3/10", href: "/calendar",
};

describe("TodayCard", () => {
  it("渲染候名、物候名、润色句与元数据", () => {
    render(<TodayCard {...props} />);
    expect(screen.getByText("处暑 · 初候")).toBeInTheDocument();
    expect(screen.getByText("鹰乃祭鸟")).toBeInTheDocument();
    expect(screen.getByText(props.polish)).toBeInTheDocument();
    // meta 含全角空格（U+3000）：testing-library 的字符串匹配只对「元素文本」做
    // trim+collapse 归一化、不对传入的匹配串本身归一化（见 @testing-library/dom
    // matches.js: `normalizedText === String(matcher)`），归一化会把全角空格
    // 折叠成半角，导致原始 props.meta 永远等不上归一化后的结果——与实现无关，
    // 换成函数匹配器直接比对 textContent（原始未归一化）即可稳定通过。
    expect(screen.getByText((_, node) => node?.textContent === props.meta)).toBeInTheDocument();
  });

  it("物候名是朱砂 serif（设计包给死的强调位）", () => {
    render(<TodayCard {...props} />);
    expect(screen.getByText("鹰乃祭鸟").style.color).toBe("var(--color-cinnabar)");
  });

  it("左栏 124px 且带右细线", () => {
    render(<TodayCard {...props} />);
    const left = screen.getByTestId("today-card-left");
    expect(left.style.width).toBe("124px");
    expect(left.style.borderRight).toContain("var(--color-line)");
  });

  it("风幡是占位（素材未到位，必须一眼可辨）", () => {
    render(<TodayCard {...props} />);
    const banner = screen.getByTestId("wind-banner");
    expect(banner.getAttribute("data-placeholder")).toBe("wind-banner");
    expect(banner).toHaveTextContent("谨");
  });

  it("卡脚链接由 href 给出", () => {
    render(<TodayCard {...props} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/calendar");
  });
});
