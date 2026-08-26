import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TodayCard } from "../TodayCard";

afterEach(() => cleanup());

const props = {
  label: "今 日",
  date: "2026.08.25",
  dateNote: "七月初三",
  term: "处暑 · 初候",
  wuHou: "鹰乃祭鸟",
  polish: "鹰知秋气而肃，今日不必急着出手。",
  meta: "庚申 · 官杀当值　五维 3/10",
  href: "/calendar",
  expandLabel: "展开今日日签 →",
  bellAlt: "风铃图，幡面刻「谨」字（固定字样，非当日判词）；今日判词另见右栏：谨",
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

  it("风铃真实素材已接入（非占位），alt 原样取自 bellAlt prop", () => {
    render(<TodayCard {...props} />);
    const bell = screen.getByTestId("wind-bell");
    expect(bell.getAttribute("data-placeholder")).toBeNull();
    const img = bell.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("windbell-jin.png");
    // 组件本身不拼句子（终审必修 5：alt 由调用方经 i18n 翻译好整句传入）——
    // 这里只需钉住「原样透传」，句子本身是否诚实由调用方/i18n 消息负责。
    expect(img!.getAttribute("alt")).toBe(props.bellAlt);
  });

  it("不把任何文字当可见大字叠在风铃图上（mutation 靶点）", () => {
    render(<TodayCard {...props} />);
    const bell = screen.getByTestId("wind-bell");
    // bellAlt 只应出现在 img 的 alt 属性里，不应作为独立可见文本节点出现——
    // 否则说明组件把它当可见大字叠加渲染了（08-25 之前的占位实现就是这么干的）。
    const visibleNodes = Array.from(bell.querySelectorAll("span, div, p")).filter(
      (el) => el.textContent === props.bellAlt && el.children.length === 0,
    );
    expect(visibleNodes.length).toBe(0);
  });

  it("卡脚链接由 href 给出，文案由 expandLabel 给出", () => {
    render(<TodayCard {...props} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/calendar");
    expect(link.textContent).toBe(props.expandLabel);
  });

  // ===== 终审必修 7：href 可选，运势页复用时不传 href，卡脚整体不渲染 =====
  it("不传 href 时不渲染卡脚（避免运势页出现指向自身的死链）", () => {
    const { href: _href, expandLabel: _expandLabel, ...rest } = props;
    render(<TodayCard {...rest} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  // ===== 终审必修 5：卡头/卡脚文案必须来自 props（走 i18n），不是组件内写死 =====
  it("卡头 label 完全由 props 决定，换一个值就换一个值（不是写死的「今 日」）", () => {
    render(<TodayCard {...props} label="TODAY" />);
    expect(screen.getByText("TODAY")).toBeInTheDocument();
    expect(screen.queryByText("今 日")).toBeNull();
  });

  it("卡脚 expandLabel 完全由 props 决定，换一个值就换一个值（不是写死的中文）", () => {
    render(<TodayCard {...props} expandLabel="Open today's reading →" />);
    expect(screen.getByText("Open today's reading →")).toBeInTheDocument();
    expect(screen.queryByText(/展开今日日签/)).toBeNull();
  });

  // ===== 终审必修 6：dateNote 不含糊——卷首传星期、运势页传农历，组件本身
  // 只负责原样显示在日期后面，不对语义做任何假设 =====
  it("dateNote 原样显示在 date 之后（调用方决定它是星期还是农历）", () => {
    render(<TodayCard {...props} date="2026.08.26" dateNote="周三" />);
    expect(screen.getByText((_, node) => node?.textContent === "2026.08.26 · 周三")).toBeInTheDocument();
  });
});
