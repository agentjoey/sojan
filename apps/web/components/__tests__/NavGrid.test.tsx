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

  it("是模态对话框，Esc 关闭（即使焦点已不在覆盖层子树内）", async () => {
    // 最终评审 C3：此前 Esc 挂在 dialog 根 `onKeyDown` 上、全靠事件冒泡——
    // dialog 根节点没有 `tabIndex`，一旦焦点不在其子树内（七十二候文字、格子
    // 间空隙、或 MobileShell 里作为 dialog 兄弟节点的 ✕），Esc 就静默失效。
    // 旧用例直接 `fireEvent.keyDown(dialog, …)`，事件仍会从 dialog 冒泡到
    // document，所以无论监听器挂在哪里都测得过——测不出真实路径。这里改成
    // 显式把焦点挪到 dialog 子树之外再对 `document` 派发 Escape，才是真实场景：
    // 焦点不在覆盖层内、监听器却仍是 document 级的。
    //
    // 复审二轮 C5：挪到 `NavGrid` 自己挂载 effect 里的「打开时聚焦第一格」会
    // 让 `document.body.focus()` 这个旧写法失真——`<body>` 默认不可聚焦，
    // `.focus()` 是空操作，而挂载 effect 已经把焦点放到了第一个格子上，
    // `document.activeElement` 不会变成 `body`。改成一个真实存在、且在
    // 覆盖层子树之外的可聚焦元素，才是「焦点确实不在子树内」的真实场景。
    const onClose = await renderGrid({});
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    expect(dialog.contains(outside)).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    outside.remove();
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

  it("内层顶距让开 MobileShell 顶栏（C2：不再是与顶栏同一个 56px 基准）", async () => {
    // 最终评审 C2：`MobileShell` 顶栏 padding-top 是 `max(56px, safearea+12px)`、
    // 高 44px、z-index 60；`NavGrid` 内层此前用同一个 56px 基准起排，被顶栏正好
    // 盖住网格第一行。参考稿里两者是兄弟节点，网格应在顶栏下方再留 26px——
    // 即 `max(56+44+26, safearea+12+44+26)` = `max(126px, safearea+82px)`。
    await renderGrid({});
    const content = screen.getByTestId("nav-grid-content");
    // jsdom 的 CSSOM 序列化对 CSS `max()`/`calc()` 里的逗号处理有怪癖（会插入
    // 多余空格记号），逐段 `toContain` 断言实质数值，不追求跟源码逐字节相同。
    const padding = content.style.padding;
    expect(padding).toContain("max(126px");
    expect(padding).toContain("calc(env(safe-area-inset-top) + 82px)");
    expect(padding).toContain("20px");
    // 回归判据：不再是 C2 修复前与顶栏同一个 56px 基准。
    expect(padding).not.toContain("56px");
  });

  it("九宫格格子挂 zj-wheel-focus（C4：键盘用户看得见焦点在哪）", async () => {
    await renderGrid({});
    const cells = screen.getAllByTestId("nav-grid-cell");
    for (const cell of cells) {
      expect(cell.className.split(/\s+/)).toContain("zj-wheel-focus");
    }
  });
});
