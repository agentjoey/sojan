import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ChartToc } from "../ChartToc";

describe("ChartToc", () => {
  it("两行锚点分别指向紫微棋盘与三段式解读", () => {
    // ⚠️ 防「误写成跨页路由」的守卫在 Task 5 的 `app/chart/__tests__/page.test.tsx`——
    // 那里校验每个 href 的锚点目标 id 在页面上真实存在，是跨组件的一致性检查；
    // 本文件只负责断言 href 的精确值。
    render(<I18nProvider locale="zh"><ChartToc /></I18nProvider>);
    const rows = screen.getAllByTestId("chart-toc-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("href")).toBe("#ziwei-board");
    expect(rows[1].getAttribute("href")).toBe("#reading-tabs");
    expect(rows[0].textContent).toContain("紫微十二宫");
    expect(rows[1].textContent).toContain("三段式解读");
  });

  it("<nav> 带 aria-label（M7：与 AppShell 侧栏 nav 并存时避免读屏报两个未命名 navigation）", () => {
    render(<I18nProvider locale="zh"><ChartToc /></I18nProvider>);
    expect(screen.getByRole("navigation", { name: "命盘页内导航" })).toBeInTheDocument();
  });
});
