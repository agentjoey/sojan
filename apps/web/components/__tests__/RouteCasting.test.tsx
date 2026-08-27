import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";

/**
 * RouteCasting（owner 打磨批指令 7）：路由切换播 1.2s 短版过场。
 * 钉三条行为契约：首次挂载不播（防双播）、路径变化才播、1.2s 后自动撤下。
 */

let currentPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => currentPath }));

import { RouteCasting } from "../RouteCasting";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

function renderCasting() {
  return render(
    <I18nProvider locale="zh">
      <RouteCasting />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  currentPath = "/";
});

describe("RouteCasting 路由切换过场", () => {
  it("首次挂载不播（首屏等待由各页 pending 过场承担，再播是双播）", () => {
    renderCasting();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("路径变化时播 route 短版（品牌词标题），1.2s 后撤下", () => {
    vi.useFakeTimers();
    const { rerender } = renderCasting();
    expect(screen.queryByRole("status")).toBeNull();

    currentPath = "/calendar";
    rerender(
      <I18nProvider locale="zh">
        <RouteCasting />
      </I18nProvider>,
    );
    const overlay = screen.getByRole("status");
    expect(overlay).toHaveClass("zj-casting-overlay-route");
    expect(overlay).toHaveTextContent("照见");

    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("路径不变的重渲染不重播", () => {
    const { rerender } = renderCasting();
    rerender(
      <I18nProvider locale="zh">
        <RouteCasting />
      </I18nProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});
