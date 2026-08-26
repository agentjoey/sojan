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

  it("两端标立春第 1 候与大寒第 72 候", () => {
    render(<SeasonRuler index={40} label="处暑 初候" />);
    expect(screen.getByText(/立春/)).toBeInTheDocument();
    expect(screen.getByText(/大寒/)).toBeInTheDocument();
  });

  it("role=img，aria-label 含当前候序号与名称；刻度层对 AT 隐藏", () => {
    render(<SeasonRuler index={40} label="处暑 初候" />);
    const label = screen.getByRole("img").getAttribute("aria-label")!;
    expect(label).toContain("40");
    expect(label).toContain("处暑 初候");
    expect(screen.getByTestId("season-ticks").getAttribute("aria-hidden")).toBe("true");
  });
});
