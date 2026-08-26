import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.resetModules(); });

async function renderGrid(flags: Record<string, string>, path = "/calendar", onClose = vi.fn()) {
  for (const [k, v] of Object.entries(flags)) vi.stubEnv(k, v);
  const { NavGrid } = await import("../NavGrid");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  render(<NavGrid open onClose={onClose} currentPath={path} />, {
    wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
  });
  return onClose;
}

describe("NavGrid 九宫格导航", () => {
  it("全 flag 开启时 6 格，且**不含**「我的」（移动端由顶部胶囊进）", async () => {
    await renderGrid({
      NEXT_PUBLIC_SPIRIT_ENABLED: "1",
      NEXT_PUBLIC_FENGSHUI_ENABLED: "1",
      NEXT_PUBLIC_DREAM_ENABLED: "1",
    });
    expect(screen.getAllByTestId("nav-grid-cell")).toHaveLength(6);
    expect(screen.queryByLabelText("我的")).toBeNull();
  });

  it("全 flag 关闭时 3 格（运/盘/起）", async () => {
    await renderGrid({
      NEXT_PUBLIC_SPIRIT_ENABLED: "",
      NEXT_PUBLIC_FENGSHUI_ENABLED: "",
      NEXT_PUBLIC_DREAM_ENABLED: "",
    });
    const cells = screen.getAllByTestId("nav-grid-cell");
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.getAttribute("href"))).toEqual(["/calendar", "/chart", "/reading"]);
  });

  it("当前项标 aria-current=page", async () => {
    await renderGrid({ NEXT_PUBLIC_FENGSHUI_ENABLED: "1" }, "/fengshui");
    const current = screen.getByLabelText("风水");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(screen.getByLabelText("运势").getAttribute("aria-current")).toBeNull();
  });

  it("是模态对话框，Esc 关闭", async () => {
    const onClose = await renderGrid({});
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open=false 时不渲染任何格子", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    const { NavGrid } = await import("../NavGrid");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    render(<NavGrid open={false} onClose={vi.fn()} currentPath="/" />, {
      wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider>,
    });
    expect(screen.queryAllByTestId("nav-grid-cell")).toHaveLength(0);
  });
});
