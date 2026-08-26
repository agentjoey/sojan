import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ChartToc } from "../ChartToc";

describe("ChartToc", () => {
  it("两行锚点分别指向紫微棋盘与三段式解读", () => {
    render(<I18nProvider locale="zh"><ChartToc /></I18nProvider>);
    const rows = screen.getAllByTestId("chart-toc-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("href")).toBe("#ziwei-board");
    expect(rows[1].getAttribute("href")).toBe("#reading-tabs");
    expect(rows[0].textContent).toContain("紫微十二宫");
    expect(rows[1].textContent).toContain("三段式解读");
  });

  it("是页内锚点，不是跨页跳转（防误写成 /chart/ziwei 之类的路由）", () => {
    render(<I18nProvider locale="zh"><ChartToc /></I18nProvider>);
    for (const r of screen.getAllByTestId("chart-toc-row")) {
      expect(r.getAttribute("href")).toMatch(/^#/);
    }
  });
});
