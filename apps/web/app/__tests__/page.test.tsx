import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, type DailyFortune } from "@sojan/core";

/**
 * 首页 TG 入口列表（`TG_ENTRIES`）的回归测试。
 *
 * 为什么这个文件此前不存在、而它必须存在：
 * `AppShell.tsx:40` 用 `{!tg && (…)}` 把桌面侧栏与移动底栏**整个**包住——Telegram 里
 * 不渲染任何 web 导航（既有的 TG 原生化设计）。于是 TG 内唯一的导航就是本页的
 * `TG_ENTRIES`，一份**硬编码**列表。任何新功能只往 `AppShell.NAV` 里加入口，
 * 在 TG 里就是**零入口**——风水「境」正是这么静默失踪的（flag 已开、页面已上线、
 * 但 TG 用户走不到），而全套测试当时是绿的，因为没有任何测试覆盖 `TG_ENTRIES`。
 *
 * 本文件把「web 有入口 ⇒ TG 也要有入口」变成可失败的断言。
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => "/",
}));

const tgEnv = { inTg: true };
vi.mock("@/lib/tg/client", () => ({
  isTelegram: () => tgEnv.inTg,
  hasTgSession: () => false,
  tgGetProfile: vi.fn(),
}));

vi.mock("@/components/DarkImage", () => ({
  DarkImage: () => null,
  default: () => null,
}));

// —— owner 打磨批指令 2：卷首今日卡复用运势数据流（lib/profiles + server actions）。
// 以下 mock 只影响 web 臂新引入的取数；TG 臂不消费它们，TG 断言逐字未动。
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
  getActiveProfile: (...a: unknown[]) => activeProfileMock(...a),
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
  tgEnv.inTg = true;
  routerPush.mockReset();
  activeProfileMock.mockClear();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  // EP-fs-debt：「灵」此前无条件显示（TG_ENTRIES 里没有 flag 门控，AppShell.NAV
  // 却有），默认开着让既有用例（假设「本命之灵」在场）继续成立，专门的开关测试见
  // 下面新增的 describe 块。
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("TG 首页入口列表：风水「境」", () => {
  it("TG 内 + flag 开：「境」入口出现，且点击后真的导向 /fengshui", async () => {
    await renderHome();
    // 钉住标题文本而不是图标字「境」——图标字是单字，容易与其它文案里的字撞；
    // 而 title 是这一行的语义身份。
    const cell = await screen.findByText("居家风水");
    fireEvent.click(cell);
    // 只断言「入口存在」抓不到「入口存在但点了没反应/指错地方」。
    expect(routerPush).toHaveBeenCalledWith("/fengshui");
  });

  it("TG 内 + flag 关：「境」入口不出现（与 AppShell.NAV 的门控保持一致）", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderHome();
    // 先确认列表本身渲染出来了，否则下面的「不出现」会因为整页没渲染而恒真。
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("居家风水")).toBeNull();
    // 同时确认没有任何一行会把用户带去 /fengshui
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("既有四项不受影响（防止加入口时挤掉别人）", async () => {
    // EP-jiao 最终评审 C1：「本命之灵」已从这份列表摘除（内测期 TG 不上掷筊），
    // 不再断言它在场——见下面新增的「TG 首页入口列表：本命之灵」describe 块。
    await renderHome();
    for (const label of ["今日运势", "我的命盘", "起盘建档", "我的档案"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it("非 TG（普通 web）：不渲染 TG 入口列表——那里的入口是 AppShell 的底部导航", async () => {
    tgEnv.inTg = false;
    await renderHome();
    // ⚠️ 判别依据不能用「今日运势」：web 版首页的入口卡片（`home.entries.calendar`）
    // 用的是同一个词，两个宿主都渲染它，拿它当判据会恒真。必须用 TG 列表**独有**的项——
    // `home.tg.entries.profiles`「我的档案」在 web 版 `home.entries.*`（calendar/annual/
    // chart/reading）里没有对应项。第一次写这条测试时就是踩了这个坑，它自己红了出来。
    await waitFor(() => expect(screen.queryByText("我的档案")).toBeNull());
    expect(screen.queryByText("居家风水")).toBeNull();
  });
});

describe("web 首页目录列表：解梦「梦」（inTg=false 臂）", () => {
  it("web 臂 + flag 开：「解梦」条目出现，且 Link href=\"/dream\"", async () => {
    tgEnv.inTg = false;
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    await renderHome();
    // 先确认 web 目录列表本身渲染出来了，否则后面的断言会因整臂缺席而失真
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    // web 臂的条目是 <Link href>（不是 TG 臂的 onClick Cell），href 必须钉死
    const link = (await screen.findByText("解梦")).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/dream");
  });

  it("web 臂 + flag 关：「解梦」条目不出现", async () => {
    tgEnv.inTg = false;
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderHome();
    // 先确认列表渲染（防恒真），再断言缺席
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("解梦")).toBeNull();
  });
});

describe("TG 首页入口列表：本命之灵「灵」——EP-jiao 最终评审 C1：TG 内测期摘除入口", () => {
  // 根因：`/spirit` 的追问链路（`SpiritPanel`/`askSpirit`）一律走浏览器侧
  // `supabase().auth.getSession()` 取 Bearer token，Telegram Mini App webview 里
  // 没有这份浏览器侧 Supabase 会话，token 恒为 undefined → 每次掷筊必然撞 401，
  // 对 TG 用户是死胡同。owner 决定内测期直接摘掉 TG 首页入口（见 `.agent/BACKLOG.md`
  // 的 EP-jiao-tg：正式上线前再决定是补 `api/tg/jiao` 中介臂还是维持不上）。
  // 这条测试钉住「摘干净」——不管 flag 开关，TG 首页都不该再出现「灵」这一行，
  // 也不该有任何一次点击把用户导向 /spirit。
  it("TG 内 + flag 开（beforeEach 默认）：「灵」入口不出现、不可能导向 /spirit", async () => {
    await renderHome();
    // 先确认列表本身渲染出来了，否则「不出现」会因为整页没渲染而恒真。
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("本命之灵")).toBeNull();
    expect(routerPush).not.toHaveBeenCalledWith("/spirit");
  });

  it("TG 内 + flag 关：「灵」入口同样不出现——摘除是无条件的，不是又套了一层门控", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    await renderHome();
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("本命之灵")).toBeNull();
    expect(routerPush).not.toHaveBeenCalledWith("/spirit");
  });

  // 反向钉住「只摘了 TG 这一处，没有连带误删 web 侧的入口」：AppShell 的 NAV 数组
  // 是模块私有常量（未导出），`components/__tests__/AppShell.test.tsx` 已经独立
  // 覆盖 NEXT_PUBLIC_SPIRIT_ENABLED 开/关两种情况下侧栏/底栏「灵」入口的显隐
  // （见该文件 104/116/128 行），这里不重复造一份、只留这条指针注释。
});

describe("TG 首页入口列表：解梦「梦」", () => {
  it("TG 内 + flag 开：「解梦」入口出现，点击导向 /dream", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    await renderHome();
    const cell = await screen.findByText("解梦");
    fireEvent.click(cell);
    expect(routerPush).toHaveBeenCalledWith("/dream");
  });

  it("TG 内 + flag 关：「解梦」入口不出现", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderHome();
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("解梦")).toBeNull();
  });
});

describe("TG 首页页头改用 PageHeader（EP-tg-parity）", () => {
  it("头部渲染为 PageHeader（宋体 h1 + 眉标 + 副标注），不是手写 div", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    tgEnv.inTg = true;
    const { container } = await renderHome();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("照见");
    // UI v3 页首范式（Task 4）：kicker 不再用「— X —」破折号包裹，改为裸字。
    expect(screen.getByText("卷 首")).toBeInTheDocument();
    expect(screen.getByText("你的命盘，是一面镜子")).toBeInTheDocument();
    // 结构性断言：PageHeader 渲染的 <header> 标签本身作为判别依据——
    // 文本断言在实现前就可能碰巧通过，只有这条能真正验证「改用了 PageHeader」。
    expect(container.querySelector("header")).not.toBeNull();
  });
});

/**
 * Task 4：卷首 `app/page.tsx` 重建（UI v3，03-screens 5a）——只覆盖 `{!inTg && (…)}`
 * 那一支。`renderHome()` 是全文件共用的 helper（既服务 TG 分支也服务 web 分支，见上面
 * 「web 首页目录列表：解梦「梦」（inTg=false 臂）」那组已有测试），本组只需在渲染前把
 * `tgEnv.inTg` 拨回 `false`（顶层 `beforeEach` 默认 `true`，服务 TG 相关分组）。
 *
 * 目录基线断言默认拿到 4 行：顶层 `beforeEach` 把 SPIRIT/FENGSHUI 两个 flag 都 stub 成
 * "1"、DREAM 未 stub（默认关闭）——卷首目录只消费 SPIRIT（灵）与 DREAM（梦，可选第 5 行）
 * 两个 flag，FENGSHUI 不在卷首目录范围内（境仍只在 AppShell 侧栏/TG 首页），所以默认态
 * 下卷首目录恰好是「盘/灵/运/候」4 行。
 */
describe("UI v3 卷首（5a）", () => {
  beforeEach(() => {
    tgEnv.inTg = false;
  });

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
