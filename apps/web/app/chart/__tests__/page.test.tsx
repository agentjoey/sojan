import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, within, waitFor } from "@testing-library/react";
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

  // I6：spec §8 的保留三块是「西方星盘 / SelfPortrait / 当下时序」——紫微已经在
  // 上面第一条用例里断言过两次（左列不存在 + 右列存在），这里不重复。原用例断的
  // 是「紫微/西方/自我画像」，与 spec 点名的三块对不上，且完全没覆盖时序块。
  // 时序块默认 `timelineActionMock` 恒返回 null（`{timeline && …}` 从未渲染过），
  // 故这里显式 mock 一次 resolved value，让时序块真正出现在断言里。
  it("保留的三块都还在（防静默失踪回归网：西方星盘/SelfPortrait/当下时序）", async () => {
    timelineActionMock.mockResolvedValueOnce("## 本年时序\n流年上下文占位内容");
    await renderChart();
    const right = screen.getByTestId("two-col-right");
    expect(within(right).getAllByText(/西方|Western/).length).toBeGreaterThan(0);
    // SelfPortrait 组件内部自己也渲染一次同名标题（见 SelfPortrait.test.tsx），
    // 与 ChartBlock 的 h2 标签重复，因此用 getAllByText 而非 getByText。
    expect(within(right).getAllByText(/自我画像|Self/).length).toBeGreaterThan(0);
    expect(await within(right).findByText(/流年上下文占位内容/)).toBeInTheDocument();
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
    // I5：用例名承诺「四柱」，此前断言只覆盖了 luck-row——把 page.tsx 里四柱那个
    // ChartBlock 整段删掉，760 条测试原本全绿（已 mutation 复验，报告见
    // final-fix-report.md）。补上对 bazi-pillars-grid 的正/负断言堵住这个口子。
    expect(within(left).getByTestId("bazi-pillars-grid")).toBeInTheDocument();
    expect(within(right).queryByTestId("bazi-pillars-grid")).toBeNull();
    expect(within(left).getAllByTestId("luck-row").length).toBeGreaterThan(0);
    expect(within(right).queryAllByTestId("luck-row")).toHaveLength(0);
  });

  // I6：当下时序缓存策略（spec §8「缓存策略与 LLM 调用逐字不动」）此前零覆盖——
  // 时序块能不能出现、算出的结果有没有按 (档案,年) 落盘缓存，全仓没有一条断言。
  it("当下时序：mock LLM 结果渲染", async () => {
    timelineActionMock.mockResolvedValueOnce("## 本年时序\n流年上下文占位内容");
    await renderChart();
    const right = screen.getByTestId("two-col-right");
    expect(await within(right).findByText(/流年上下文占位内容/)).toBeInTheDocument();
  });

  // R9：与上一条拆成独立用例——若断言排在上一条的 findByText 之后，注释掉时序
  // JSX 会先让 findByText 变红、走不到这里，缓存断言就没被独立 mutation 证明过。
  // 这里用 waitFor 单独等 localStorage 落盘，不依赖任何 JSX/文本断言先行通过。
  it("当下时序：结果按 (档案,年) 写入 localStorage 缓存", async () => {
    timelineActionMock.mockResolvedValueOnce("## 本年时序\n流年上下文占位内容");
    await renderChart();
    const key = `zhaojian.timeline.${profile.id}.${new Date().getFullYear()}`;
    await waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
  });

  // M2：`renderChart(locale)` 的 locale 参数此前从未被传入过（死参数），spec §9
  // 明文要求补一条 locale="en" 渲染断言。
  it("locale=\"en\" 时目录行以英文渲染（M2：renderChart(locale) 曾是死参数）", async () => {
    await renderChart("en");
    const rows = screen.getAllByTestId("chart-toc-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Twelve Palaces"),
      expect.stringContaining("Three-Part Reading"),
    ]);
  });

  // M8：解读按钮的箭头 hover 此前用 `group-hover:translate-x-1`，违反
  // 06-desktop §4「hover 只改 border-color 与文字/箭头颜色，不得投影/位移/放大」。
  it("解读按钮 hover 只变色，不位移（06-desktop §4）", async () => {
    await renderChart();
    const arrow = screen.getByTestId("generate-arrow");
    expect(arrow.className).not.toContain("translate-x");
    expect(arrow.className).not.toContain("scale-");
  });

  // M7：`<section id="reading-tabs">` 里直接套 `ChartBlock` 的 `<section>`是多余
  // 外层——id 应直接落在 ChartBlock 上，没有为了挂 id 而多包一层 section。
  it("锚点目标的 id 直接落在 ChartBlock 上，没有多余的外层 section", async () => {
    await renderChart();
    const el = document.getElementById("reading-tabs");
    expect(el).not.toBeNull();
    expect(el!.tagName.toLowerCase()).toBe("section");
    // 外层不该再套一个 section 只为挂 id（此断言本身在改前也恒真——右列的直接
    // 父容器是 TwoColumn 的 <div data-testid="two-col-right">，不是 section，
    // 挪 id 前后都成立，不能靠它单独判定；下两条才是真正的差异点）。
    expect(el!.parentElement?.tagName.toLowerCase()).not.toBe("section");
    // 真正的差异点 1：id 所在元素本身必须是 ChartBlock 的本体（带它的结构类），
    // 而不是一个空壳 <section id="reading-tabs"> 之外再套一层 ChartBlock。
    expect(el!.className).toContain("border-t");
    // 真正的差异点 2：ChartBlock 自己也是 <section>——如果 id 挂在外层空壳上，
    // 内部还会再嵌一层 ChartBlock 的 <section>；id 直接落在 ChartBlock 本体后，
    // 内部不应再出现第二层 section。
    expect(el!.querySelector("section")).toBeNull();
  });
});
