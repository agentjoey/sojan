import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, within } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@sojan/core";

/**
 * UI v3 · C2-1 Task 5：命盘 `app/chart/page.tsx` 接入 `TwoColumn`（桌面两栏）+
 * 左列按 5b 组装（`ChartIdentity` / `WuxingWheel` / `BaziPillars` / `LuckPillars` /
 * `ChartToc`），右列本波只重排（`ChartBlock` 版式不变）。
 *
 * 本文件不存在，以 `app/calendar/__tests__/page.test.tsx`（同形状页面，mock
 * 同样三个模块：`@/lib/profiles`、`@/lib/tg/client`、`@/app/actions`）为先例
 * 照搬结构；`/chart` 额外用了 `useIsTelegram`/`useTgMainButton`/`haptics`
 * （`@/lib/tg/ui`），多 mock 这一个模块。
 */

const birth = BirthInputSchema.parse({
  date: "1991-03-15",
  time: "14:30",
  gender: "male",
  latitude: 31.23,
  longitude: 121.47,
});
const profile = {
  id: "p1",
  nickname: "阿甲",
  birthInput: birth,
  chart: computeUnifiedChart(birth),
  createdAt: "",
  reading: null,
};

vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
  getQuestionnaire: vi.fn(async () => null),
  saveReading: vi.fn(async () => {}),
}));

vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => false,
  isTelegram: () => false,
  tgGetProfile: vi.fn(),
  tgGetQuestionnaire: vi.fn(async () => null),
}));

vi.mock("@/lib/tg/ui", () => ({
  useIsTelegram: () => false,
  useTgMainButton: () => {},
  haptics: { light: vi.fn(), medium: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const timelineActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
vi.mock("@/app/actions", () => ({
  timelineAction: (...a: unknown[]) => timelineActionMock(...a),
}));

async function renderChart(locale: "zh" | "en" = "zh") {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale={locale}>{children}</I18nProvider>;
  }
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: Wrapper });
  });
  return result;
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  timelineActionMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("UI v3 命盘（5b 左列 + TwoColumn 两栏）", () => {
  it("桌面两栏：左列是盘与事实，右列是解读与其余（共用一份 DOM 顺序）", async () => {
    await renderChart();
    const left = await screen.findByTestId("two-col-left");
    const right = screen.getByTestId("two-col-right");

    expect(within(left).getByTestId("day-master-line")).toBeInTheDocument();
    expect(within(left).getByTestId("wuxing-wheel")).toBeInTheDocument();
    expect(within(left).getAllByTestId("chart-toc-row")).toHaveLength(2);

    expect(within(right).getByTestId("reading-tabs-anchor")).toBeInTheDocument();
    expect(within(right).getByTestId("ziwei-board-anchor")).toBeInTheDocument();

    // 交叉否定：左列里不该出现右列的东西，反之亦然
    expect(within(left).queryByTestId("ziwei-board-anchor")).toBeNull();
    expect(within(left).queryByTestId("reading-tabs-anchor")).toBeNull();
    expect(within(right).queryByTestId("day-master-line")).toBeNull();
    expect(within(right).queryByTestId("wuxing-wheel")).toBeNull();
  });

  it("目录锚点的 href 与右列区块的 id 对得上（防锚点静默失效，本任务唯一守卫）", async () => {
    await renderChart();
    const rows = screen.getAllByTestId("chart-toc-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const id = (row.getAttribute("href") ?? "").slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("保留的三块都还在（防静默失踪回归网：紫微棋盘/西方盘/自我画像）", async () => {
    await renderChart();
    const right = screen.getByTestId("two-col-right");
    expect(within(right).getByTestId("ziwei-board-anchor")).toBeInTheDocument();
    expect(within(right).getAllByText(/西方|Western/).length).toBeGreaterThan(0);
    // SelfPortrait 组件内部自己也渲染一次同名标题（见 SelfPortrait.test.tsx），
    // 与 ChartBlock 的 h2 标签重复，因此用 getAllByText 而非 getByText。
    expect(within(right).getAllByText(/自我画像|Self/).length).toBeGreaterThan(0);
  });

  it("PageHeader 在 TwoColumn 里不再嵌套 <header>", async () => {
    await renderChart();
    expect(document.querySelectorAll("header header")).toHaveLength(0);
  });

  it("左列还渲染了四柱与大运（BaziPillars / LuckPillars 均在左列，而非右列）", async () => {
    await renderChart();
    const left = screen.getByTestId("two-col-left");
    const right = screen.getByTestId("two-col-right");
    // BaziPillars 渲染四柱标题；LuckPillars 有数据时渲染 luck-row。
    expect(within(left).getAllByTestId("luck-row").length).toBeGreaterThan(0);
    expect(within(right).queryAllByTestId("luck-row")).toHaveLength(0);
  });
});
