import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, getCurrentSolarHou, type DailyFortune } from "@sojan/core";

/**
 * UI v3 · Task 5：运势 `app/calendar/page.tsx` 按 8a 重建（桌面两栏 + 移动单列）。
 *
 * `page.tsx` 没有模块顶层的 `process.env.NEXT_PUBLIC_*` 门控常量（与
 * home/dream/fengshui 三处不同——那三处才需要 `vi.resetModules()` + 动态
 * import），所以本文件用普通静态 import + `renderCalendar()` 挂载即可。
 */

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

const fortune: DailyFortune = {
  date: "2026-08-26",
  dayGanZhi: "甲子",
  dayElement: "水",
  dayBranchElement: "水",
  masterElement: "木",
  relation: "印",
  scores: { overall: 7, career: 6, wealth: 5, love: 6, health: 7, travel: 5 },
  tone: "今日总评占位",
  auspicious: ["宜静心", "宜早睡", "宜读书"],
  caution: ["忌争执", "忌冲动消费"],
  almanacYi: ["祭祀", "祈福"],
  almanacJi: ["动土"],
  lunarDate: "六月初一",
  interactions: [],
  favorableToday: true,
};

vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
}));

vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => false,
  tgGetProfile: vi.fn(),
}));

const dailyFortuneActionMock = vi.fn(async (..._a: unknown[]) => fortune);
const dailyPolishActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
const dailyBehaviorActionMock = vi.fn(async (..._a: unknown[]): Promise<{ do: string[]; dont: string[] } | null> => null);
const ziweiHoroscopeActionMock = vi.fn(async (..._a: unknown[]) => null);
vi.mock("@/app/actions", () => ({
  dailyFortuneAction: (...a: unknown[]) => dailyFortuneActionMock(...a),
  dailyPolishAction: (...a: unknown[]) => dailyPolishActionMock(...a),
  dailyBehaviorAction: (...a: unknown[]) => dailyBehaviorActionMock(...a),
  ziweiHoroscopeAction: (...a: unknown[]) => ziweiHoroscopeActionMock(...a),
}));

async function renderCalendar(locale: "zh" | "en" = "zh") {
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
  // 每会话一次的测算过场（casting）与本文件的断言无关，且 2.1s setTimeout
  // 会在 act() 作用域外触发 setState 警告——直接标记「本会话已放过」跳过它。
  sessionStorage.setItem("zj.cast", "1");
  dailyFortuneActionMock.mockClear();
  dailyPolishActionMock.mockClear();
  dailyBehaviorActionMock.mockClear();
  ziweiHoroscopeActionMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("UI v3 运势（8a）", () => {
  it("桌面用 TwoColumn，左列 392px（列宽经 --two-col-left 传给断点类，组件不写内联 gridTemplateColumns——见 TwoColumn.test.tsx 同一条守卫）", async () => {
    await renderCalendar();
    const grid = await screen.findByTestId("two-col-grid");
    expect(grid.style.getPropertyValue("--two-col-left")).toBe("392px");
    expect(grid.className).toContain("xl:grid-cols-[var(--two-col-left)_1fr]");
  });

  it("今日卡与卷首是同一个组件（防两处各复制一份）", async () => {
    await renderCalendar();
    expect(await screen.findByTestId("today-card-left")).toBeInTheDocument();
  });

  it("宜忌是两栏 grid，不是 ul 散排", async () => {
    await renderCalendar();
    const yiji = await screen.findByTestId("yiji-grid");
    expect(yiji.style.gridTemplateColumns).toBe("1fr 1fr");
    expect(yiji.tagName).not.toBe("UL");
  });

  it("黄历只在移动端出（桌面容器带 xl:hidden）", async () => {
    await renderCalendar();
    expect((await screen.findByTestId("huangli")).className).toContain("xl:hidden");
  });

  it("候标尺的 index 来自 getCurrentSolarHou，不是硬编码", async () => {
    await renderCalendar();
    const label = (await screen.findByRole("img", { name: /候/ })).getAttribute("aria-label")!;
    expect(label).toContain(String(getCurrentSolarHou().index));
  });

  /**
   * 评审 Important：免责声明是合规文案（CLAUDE.md「心理占星 ≠ 临床心理…
   * 强制免责声明」），必须与 loading/fortune 状态无关地常显。此前重建时它被
   * 挪进了 `right`（`loading || !fortune ? null : (...)`），导致 loading 期间
   * 免责声明连同五维/宜忌/候标尺一起消失——纯回归，且此前 5 条测试都没让
   * `fortune` 停在 pending 态，红灯根本没机会亮。本条把 `dailyFortuneAction`
   * 停在 pending，钉住「loading 分支渲染时免责声明已经在场」。
   */
  it("loading 态下免责声明仍然可见（评审 Important：不得随 right 的 loading 门槛一起消失）", async () => {
    let resolveFortune!: (f: DailyFortune) => void;
    dailyFortuneActionMock.mockImplementationOnce(
      () => new Promise<DailyFortune>((resolve) => { resolveFortune = resolve; }),
    );
    await renderCalendar();
    // 先确认真的落在 loading 分支（fortune 还没到达）
    await screen.findByText("正在推算当日流日…");
    expect(screen.getByText("每日运势为流日命理的启发性参照，非吉凶预言。请结合现实理性判断。")).toBeInTheDocument();
    // 收尾：把挂起的 action 结算掉，避免污染后续测试（未被 act 包裹的 setState 警告）
    await act(async () => { resolveFortune(fortune); });
  });

  /**
   * 终审必修 4：判词强调块字号必须按 verdict 长度分档，否则英文长值
   * （`calendar.grade.*` 形如 "顺 (Smooth)"/"吉 (Auspicious)"，最长 14 字符）
   * 在桌面左列（392px）以 `text-[64px] leading-none` 渲染会溢出裁切——
   * `detectLocale()` 对非中文浏览器默认返回 en，英文是首发市场默认路径，
   * 不是边角情况。jsdom 测不了真实溢出/换行，这里断言字号/行高相关的类名
   * 随 verdict 长度切换到「小字号 + 允许换行」这一档。
   */
  it("英文判词（长值）用小字号 + 允许换行的类名档，不再是固定 64px/leading-none（必修 4）", async () => {
    await renderCalendar("en"); // fortune.scores.overall=7 → grade "smooth" → en 值 "顺 (Smooth)"，10 字符
    const emphasis = await screen.findByTestId("verdict-emphasis");
    expect(emphasis.textContent).toBe("顺 (Smooth)");
    expect(emphasis.className).toContain("break-words");
    expect(emphasis.className).not.toContain("leading-none");
    expect(emphasis.className).not.toContain("text-[64px]");
  });

  it("中文单字判词仍沿用原设计的大字号（不因必修 4 的修复被误伤）", async () => {
    await renderCalendar("zh"); // grade "smooth" → zh 值 "顺"，1 字符
    const emphasis = await screen.findByTestId("verdict-emphasis");
    expect(emphasis.textContent).toBe("顺");
    expect(emphasis.className).toContain("text-[40px]");
    expect(emphasis.className).toContain("leading-none");
    expect(emphasis.className).toContain("xl:text-[64px]");
  });
});
