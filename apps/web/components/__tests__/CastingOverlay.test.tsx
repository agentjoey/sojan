import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CastingOverlay } from "../CastingOverlay";

afterEach(() => cleanup());

describe("CastingOverlay 风铃主角过场", () => {
  it("只以完整版风铃和状态文字构成过场", () => {
    const { container } = render(<CastingOverlay title="正在起盘" hint="请稍候" mode="brief" />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveClass("zj-casting-overlay-brief");
    expect(screen.getByText("正在起盘")).toBeInTheDocument();
    expect(screen.getByText("请稍候")).toBeInTheDocument();
    expect(container.querySelector(".zj-casting-bell-stage .zj-bell-cast")).toBeInTheDocument();
    expect(container.querySelectorAll(".zj-bell-detail").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("庚")).toBeNull();
    expect(screen.queryByText("申")).toBeNull();
    expect(screen.queryByText("今")).toBeNull();
  });

  it("route 模式（owner 打磨批指令 7：路由切换 1.2s 短版）", () => {
    render(<CastingOverlay title="照见" mode="route" />);
    expect(screen.getByRole("status")).toHaveClass("zj-casting-overlay-route");
    expect(screen.getByText("照见")).toBeInTheDocument();
  });
});
