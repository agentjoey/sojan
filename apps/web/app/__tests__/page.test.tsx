import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, type DailyFortune } from "@sojan/core";

/**
 * 首页（卷首）测试。TG 已下线：首页只剩 web 目录一支，不再有 TG 入口列表，
 * 也不再有任何 Telegram 宿主分流。
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => "/",
}));

// —— owner 打磨批指令 2：卷首今日卡复用运势数据流（lib/profiles + server actions）。
const homeBirth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const homeProfile = {
  id: "p1",
  nickname: "阿甲",
  birthInput: homeBirth,
  chart: computeUnifiedChart(homeBirth),
  createdAt: "",
  reading: null,
};
const homeFortune: DailyFortune = {
  date: "2026-08-28",
  dayGanZhi: "甲子",
  dayElement: "水",
  dayBranchElement: "水",
  masterElement: "木",
  relation: "印",
  scores: { overall: 7, career: 6, wealth: 5, love: 6, health: 7, travel: 5 },
  tone: "今日总评占位",
  auspicious: ["宜静心"],
  caution: ["忌争执"],
  almanacYi: [],
  almanacJi: [],
  lunarDate: "七月十六",
  interactions: [],
  favorableToday: true,
};
/** 候 fixture 刻意用真表里不可能出现的字符串，防止「断言碰巧命中真实值」的恒真。 */
const homeHou = { hou: "测试候", wuHou: "测试物候", index: 42, term: "测试节气" };
const activeProfileMock = vi.fn(async (): Promise<typeof homeProfile | null> => homeProfile);
vi.mock("@/lib/profiles", () => ({
  getActiveProfile: () => activeProfileMock(),
}));
vi.mock("@/app/actions", () => ({
  dailyFortuneAction: async () => homeFortune,
  dailyPolishAction: async (): Promise<string | null> => "风从东来，宜收敛",
  solarHouAction: async () => homeHou,
}));

/**
 * ⚠️ `page.tsx` 顶层 `const ENABLED = process.env.NEXT_PUBLIC_* === "1"` 在**模块加载时**
 * 求值，所以必须 `resetModules()` 之后再动态 import；而 `I18nProvider` 必须出自**同一次**
 * 动态 import，否则 `useT()` 拿到的 Context 实例与 Wrapper 提供的对不上、直接抛错。
 * 波1、波2 都栽过这个坑，spirit/fengshui 两处测试的注释里都记着。
 */
async function renderHome(locale: "zh" | "en" = "zh") {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale={locale}>{children}</I18nProvider>;
  }
  return render(<Page />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.resetModules();
  routerPush.mockReset();
  activeProfileMock.mockClear();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("TG 下线：首页不再有 TG 分支", () => {
  afterEach(() => {
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("首页不再渲染任何 Telegram 入口", async () => {
    const { container } = await renderHome();
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(container.textContent).not.toContain("Telegram");
    // 旧 TG 列表独有项（web 目录里没有对应项）
    expect(screen.queryByText("我的档案")).toBeNull();
  });

  it("即使 window.Telegram 存在，也照常渲染 web 目录（不再按宿主分流）", async () => {
    (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: { initData: "x" } };
    await renderHome();
    expect(await screen.findAllByTestId("toc-row")).not.toHaveLength(0);
    expect(screen.queryByText("我的档案")).toBeNull();
  });
});

describe("web 首页目录列表：解梦「梦」", () => {
  it("flag 开：「解梦」条目出现，且 Link href=\"/dream\"", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    await renderHome();
    // 先确认 web 目录列表本身渲染出来了，否则后面的断言会因整臂缺席而失真
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    // 条目是 <Link href>，href 必须钉死
    const link = (await screen.findByText("解梦")).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/dream");
  });

  it("flag 关：「解梦」条目不出现", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderHome();
    // 先确认列表渲染（防恒真），再断言缺席
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("解梦")).toBeNull();
  });
});

/**
 * Task 4：卷首 `app/page.tsx` 重建（UI v3，03-screens 5a）。
 *
 * 目录基线断言默认拿到 4 行：顶层 `beforeEach` 把 SPIRIT/FENGSHUI 两个 flag 都 stub 成
 * "1"、DREAM 未 stub（默认关闭）——卷首目录只消费 SPIRIT（灵）与 DREAM（梦，可选第 5 行）
 * 两个 flag，FENGSHUI 不在卷首目录范围内（境只在 AppShell 侧栏），所以默认态
 * 下卷首目录恰好是「盘/灵/运/候」4 行。
 */
describe("UI v3 卷首（5a）", () => {
  it("Hero 用 CompassWatermark 而非已删除的 HeroWheel", async () => {
    const { container } = await renderHome();
    expect(container.querySelector('[data-testid="compass-ticks"]')).not.toBeNull();
  });

  it("转盘水印整体不透明度已加深（owner 打磨批指令 5：0.14 → 0.22）", async () => {
    const { container } = await renderHome();
    const svg = container.querySelector<HTMLElement>('[data-testid="compass-ticks"]')!.closest("svg")!;
    expect(svg.style.opacity).toBe("0.22");
  });

  it("Hero 不再有独立 logo+「照见」行（owner 打磨批指令 3：品牌词已上移进胶囊）", async () => {
    await renderHome();
    // web 臂内「照见」只应剩页脚 footerBrand（带空格的「照 见 · 东 方 命 理」，精确匹配撞不上）。
    expect(screen.queryByText("照见")).toBeNull();
  });

  it("「卷 首」「目 录」两枚眉标已去除（owner 打磨批指令 5）", async () => {
    await renderHome();
    expect(screen.queryByText("卷 首")).toBeNull();
    expect(screen.queryByText("目 录")).toBeNull();
  });

  it("目录五入口印章统一朱文 zhu（纸底朱字，owner 打磨批指令 5）", async () => {
    await renderHome();
    const rows = screen.getAllByTestId("toc-row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const seal = row.querySelector<HTMLElement>("span[aria-hidden]")!;
      expect(seal.style.color).toBe("var(--color-seal)");
      expect(seal.style.background).toBe("var(--color-paper)");
    }
  });

  it("今日卡在页面上，且卡脚指向 /calendar", async () => {
    await renderHome();
    // owner 打磨批指令 2：今日卡改为有档案才渲染（数据经 server action 异步到达），
    // 所以这里用 findBy* 等它出现，不再是同步 getBy*。
    const card = await screen.findByTestId("today-card-left");
    expect(card).toBeInTheDocument();
    expect((await screen.findByText(/展开今日日签/)).closest("a")!.getAttribute("href")).toBe("/calendar");
  });

  it("七十二候标尺挂载后经 solarHouAction 覆盖为访客本地日期的候（不再是服务端 UTC 快照）", async () => {
    await renderHome();
    const label = screen.getByRole("img", { name: /候/ });
    // fixture 候名是真实候名表里不可能出现的字符串——断言变绿只能来自 action 覆盖。
    await waitFor(() => expect(label.getAttribute("aria-label")!).toContain("测试候"));
    expect(label.getAttribute("aria-label")!).toContain("42");
  });

  it("目录 4 行，各带朱文方印字符", async () => {
    await renderHome();
    expect(screen.getAllByTestId("toc-row")).toHaveLength(4);
  });

  it("en locale 下卡头/卡脚文案走 i18n，不是写死的中文（终审必修 5）", async () => {
    await renderHome("en");
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText(/Open today.s reading/)).toBeInTheDocument();
    expect(screen.queryByText("今 日")).toBeNull();
    expect(screen.queryByText(/展开今日日签/)).toBeNull();
  });

  /**
   * owner 打磨批指令 2：卷首今日卡与运势页同一数据流（dailyFortuneAction +
   * polish 缓存），dateNote 随之从「星期」变成与运势页一致的农历日——
   * 「两处今日卡内容不一致」的修复本体。
   */
  it("今日卡 dateNote 是农历日（与运势页一致），不再是星期", async () => {
    await renderHome("zh");
    expect(await screen.findByText(/七月十六/)).toBeInTheDocument();
  });

  it("今日卡正文来自运势数据流：meta 是「干支 · 十神」、polish 是 LLM 润色句", async () => {
    await renderHome("zh");
    expect(await screen.findByText("甲子 · 休整蓄力")).toBeInTheDocument();
    expect(screen.getByText("风从东来，宜收敛")).toBeInTheDocument();
  });

  /**
   * owner 打磨批指令 2：无档案访客不显示今日卡（原为静态文案卡 + 空态记号
   * 「—」，终审必修 8 的那条断言随之作废——卡都不在了，记号无从谈起）。
   * 判别信号：profile 落定后等待过场（role=status）撤下，卡仍不在场。
   */
  it("无档案时不渲染今日卡", async () => {
    activeProfileMock.mockResolvedValueOnce(null);
    await renderHome("zh");
    // 页面本体渲染完成 + 档案请求已落定（过场撤下），否则「卡不在」会因
    // 「数据还没到」而恒真。
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByTestId("today-card")).toBeNull();
  });
});
