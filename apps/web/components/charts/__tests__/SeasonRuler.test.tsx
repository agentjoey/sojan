import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeasonRuler } from "../SeasonRuler";

afterEach(() => cleanup());

describe("SeasonRuler", () => {
  it("当前候的朱砂竖线按 index 在 1..72 间定位", () => {
    const { rerender } = render(<SeasonRuler index={1} label="立春 初候" />);
    expect(screen.getByTestId("season-marker").style.left).toBe("0%");
    rerender(<SeasonRuler index={72} label="大寒 三候" />);
    expect(screen.getByTestId("season-marker").style.left).toBe("100%");
  });

  it("两端标立春第 1 候与大寒第 72 候（查完整文本，不只查节气名）", () => {
    // 只查 /立春/、/大寒/ 锁不住序号：把两端对调成「立春·第72候」「大寒·第1候」
    // 照样能通过只查节气名的弱断言，这里改成查完整文本。
    render(<SeasonRuler index={40} label="处暑 初候" />);
    expect(screen.getByText("立春 · 第 1 候")).toBeInTheDocument();
    expect(screen.getByText("大寒 · 第 72 候")).toBeInTheDocument();
  });

  it("role=img，aria-label 含当前候序号与名称；刻度层对 AT 隐藏", () => {
    render(<SeasonRuler index={40} label="处暑 初候" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("40");
    expect(label).toContain("处暑 初候");
    expect(screen.getByTestId("season-ticks").getAttribute("aria-hidden")).toBe("true");
  });

  // I2：标尺两套坐标系。刻度层此前用绝对 px（`repeating-linear-gradient` 周期
  // 4.55px/8.6px 两档），marker 用百分比——只在容器恰好等于设计包假定的参考宽度
  // 时才对齐，任意宽度下都会错位，且刻度道数也不再稳定是 72。jsdom 没有布局，
  // 无法断言真实像素位置，所以钉在**样式字符串**上：刻度周期必须是百分比
  // `calc(100% / 71)`，与 marker 的 `(index-1)/71*100%` 同一坐标系、71 个间隔
  // 对应 72 道刻度。
  it("刻度层用百分比坐标系（calc(100%/71)），与 marker 同坐标系、72 道刻度", () => {
    render(<SeasonRuler index={40} label="处暑 初候" />);
    const ticks = screen.getByTestId("season-ticks");
    const bg = ticks.style.backgroundImage;
    expect(bg).toContain("calc(100% / 71)");
    // 不再残留任何绝对 px 周期值（此前的 4.55px / 8.6px 两档）。
    expect(bg).not.toMatch(/4\.55px|8\.6px/);
  });
});
