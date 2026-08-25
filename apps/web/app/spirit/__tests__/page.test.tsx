import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@sojan/core";

/**
 * 最终评审 Blocking 2：/spirit 此前只认 `topic === "portrait"`，`?topic=fengshui:<id>`
 * 落地后 autoSend 恒为 undefined——remedyId 被解析出来即丢弃，用户落进空白通用聊天
 * （EP-fs-08 的验收「复用现有 topic 机制」只复用了 URL 形状，没复用机制本身）。
 * 这里改为 `?topic=fengshui&q=<动作文本>`：/spirit 据此拼出一句关于这条化解的提问，
 * 复用既有的 autoSend 机制（与 topic=portrait 同一套接线）。
 *
 * 全文件用 `SpiritPanel` 的桩组件截获 autoSend/seedTurns prop——真实 SpiritPanel 依赖
 * Supabase / fetch / Telegram 等一整套外部世界，这里只关心「page.tsx 算出的
 * autoSend/seedTurns 是什么」，与 SpiritPanel 内部如何消费它是两件事（后者的测试见
 * `app/chart/__tests__/SpiritPanel.test.tsx`——最终评审 I5 之前这句话曾经是失实的，
 * 全仓当时并不存在那个文件；I5 已补上，这里改成指向具体路径而不是一句空口承诺）。
 *
 * EP-jiao：/spirit 从「随便聊」收缩为「先对一件具体的事掷筊」，但 topic=portrait /
 * topic=fengshui 这两个深链入口（画像页「聊聊这个」、境页每条化解的「聊聊这条」）
 * 已经带着一件具体的事进来，语义上不需要再补一次掷筊仪式——保留旧行为，直接进对话。
 * 掷筊闸门只挡「冷启动」的默认入口（不带 topic）。
 *
 * 已知陷阱（与 app/__tests__/page.test.tsx、dream/fengshui 测试相同）：
 * page.tsx 顶层 `const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1"`
 * 在**模块加载时**求值，必须 `vi.resetModules()` 之后再动态 import；`I18nProvider`
 * 必须出自**同一次**动态 import，否则 `useT()` 拿到的 context 实例对不上 Wrapper
 * 提供的那个；supabase 会话用 `vi.hoisted` 共享可变量，不能直接摆弄 mock 实例
 * （resetModules 后会打到旧实例）。
 */
// SpiritPanel 的 autoSend prop 已随 EP-jiao Task 8 删除（产生它的旧 topic=portrait /
// topic=fengshui&q= bypass 机制已整体撤回，见下方 describe 块的说明）——桩组件只再
// 截获 seedTurns。
const spiritPanelPropsSpy = vi.fn();
vi.mock("@/app/chart/SpiritPanel", () => ({
  SpiritPanel: (props: { seedTurns?: { role: string; content: string }[] }) => {
    spiritPanelPropsSpy(props);
    return <div data-testid="spirit-panel-stub" />;
  },
}));

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

const getSpiritMemoryMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
const getQuestionnaireMock = vi.fn(async (..._a: unknown[]): Promise<null> => null);
vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
  getSpiritMemory: (...a: unknown[]) => getSpiritMemoryMock(...a),
  getQuestionnaire: (...a: unknown[]) => getQuestionnaireMock(...a),
}));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));

const throwJiaoMock = vi.fn();
vi.mock("@/lib/jiao", () => ({ throwJiao: (...a: unknown[]) => throwJiaoMock(...a) }));

const listJiaoHistoryMock = vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []);
const appendJiaoHistoryMock = vi.fn(async (..._a: unknown[]): Promise<void> => {});
vi.mock("@/lib/jiao-history", () => ({
  listJiaoHistory: (...a: unknown[]) => listJiaoHistoryMock(...a),
  appendJiaoHistory: (...a: unknown[]) => appendJiaoHistoryMock(...a),
}));

const jiaoSummaryActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
vi.mock("@/app/actions", () => ({
  jiaoSummaryAction: (...a: unknown[]) => jiaoSummaryActionMock(...a),
}));

/**
 * EP-jiao：page.tsx 直接 import `@/lib/supabase`（掷筊落定后调 /api/spirit/jiao 时
 * 读会话 access_token 附到请求头）。会话内容做成可按测试改写的共享可变量
 * （vi.hoisted）——renderSpiritPage() 每次 resetModules + 动态 import，mock 工厂
 * 可能重新执行，直接摆弄 mock 实例会打到旧实例（dream/fengshui 测试记过同一个坑）。
 */
const { supabaseSession } = vi.hoisted(() => ({
  supabaseSession: { current: { access_token: "test-access-token" } as { access_token: string } | null },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: supabaseSession.current } })) } }),
}));

/**
 * `render()` 包一层 `await act(async () => {...})`：page.tsx 挂载时
 * `getActiveProfile().then(setProfile)` 落在真实微任务里，同步 render 返回后
 * setState 可能落在 act 作用域之外（dream/fengshui 测试记过同一时序竞争，这里沿用
 * 同一解法）——本文件新增的掷筊闸门测试在 render 后立即同步断言（不经 findBy /
 * waitFor），必须保证 profile 加载在 render 返回前就已完成。
 */
async function renderSpiritPage(url: string = "/spirit") {
  window.history.pushState({}, "", url);
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale="zh">{children}</I18nProvider>;
  }
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: Wrapper });
  });
  return result;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
  spiritPanelPropsSpy.mockReset();
  getSpiritMemoryMock.mockClear();
  getQuestionnaireMock.mockClear();
  throwJiaoMock.mockReset();
  listJiaoHistoryMock.mockClear();
  listJiaoHistoryMock.mockResolvedValue([]);
  appendJiaoHistoryMock.mockClear();
  jiaoSummaryActionMock.mockClear();
  supabaseSession.current = { access_token: "test-access-token" };
});

describe("回归：/spirit 不消费 ?topic=fengshui&q=<动作文本>（该参数落入掷筊闸门，不再 bypass）", () => {
  // 修复轮（评审 Critical）：撤回 topic=portrait / topic=fengshui&q= 两条深链
  // autoSend bypass——它们曾经绕过掷筊闸门直接进对话，与 EP-jiao「/spirit 收缩为
  // 先对一件具体的事掷筊」的核心决策冲突。这两条 bypass 的最终归宿是计划
  // docs/superpowers/plans/2026-08-25-jiao-divination.md 的 Task 8：
  // topic=portrait 的产生方（画像页「聊聊这个」按钮）整个删除；
  // topic=fengshui&q= 改成 ?ask=<动作文本>，语义是预填输入框、仍需用户自己掷筊。
  // 原本钉住 bypass 行为的两条测试（topic=fengshui&q=、topic=portrait）随之删除；
  // 下面这条「畸形链接落回掷筊闸门」的测试反映的正是正确行为，予以保留。
  it("topic=fengshui 但没有 q（畸形链接）时，autoSend 仍是 undefined，不拼出一句空话——落回掷筊闸门而不是空白通用聊天", async () => {
    // EP-jiao 之前：autoSend undefined 时 SpiritPanel 仍会直接渲染（空白通用聊天）。
    // EP-jiao 之后：/spirit 默认（无有效 topic）入口统一收窄成掷筊闸门，畸形链接
    // 等价于「没有 topic」，同样落进闸门——好过把用户扔进一个没有上下文的空聊天。
    await renderSpiritPage("/spirit?topic=fengshui");
    await waitFor(() => expect(screen.getByPlaceholderText(/该不该/)).toBeInTheDocument());
    expect(spiritPanelPropsSpy).not.toHaveBeenCalled();
  });

  it("回归：不带 topic 时 autoSend 为 undefined（走掷筊闸门，而不是空白通用聊天）", async () => {
    await renderSpiritPage("/spirit");
    await waitFor(() => expect(screen.getByPlaceholderText(/该不该/)).toBeInTheDocument());
    expect(spiritPanelPropsSpy).not.toHaveBeenCalled();
  });
});

describe("回归：/spirit flag 关闭时显示未开启文案，不渲染 SpiritPanel", () => {
  it("NEXT_PUBLIC_SPIRIT_ENABLED 非 1 时不挂载 SpiritPanel", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    await renderSpiritPage("/spirit?topic=fengshui&q=x");
    expect(screen.getByText("本命之灵尚未开启。")).toBeInTheDocument();
    expect(screen.queryByTestId("spirit-panel-stub")).toBeNull();
  });
});

describe("EP-jiao 掷筊闸门", () => {
  // vi.stubGlobal 而非 vi.spyOn：globalThis.fetch 的重载签名会让 vi.spyOn 的返回类型
  // 推导出错（TS2344/TS2322），本仓其余测试文件（dream/fengshui）也一律用
  // vi.fn() + vi.stubGlobal 桩 fetch，这里保持同一约定。
  const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * UAT②：动画落定后不再直接分流——先进揭晓屏定格展示筊象结果，用户点「继续」
   * 才真正推进（笑筊→重掷提示 / 圣筊|阴筊→发起 /api/spirit/jiao）。下面各用例
   * 原先在 `fireEvent.animationEnd(...)` 之后就直接断言分流结果，现在统一改成
   * 这个 helper：animationEnd → 等揭晓屏「继续」按钮出现 → 点掉它，行为等价于
   * 「用户看完揭晓屏、确认继续」，之后再断言原本的分流结果。
   */
  async function settleThrow() {
    fireEvent.animationEnd(screen.getAllByTestId("jiao-block")[1]!);
    const continueBtn = await screen.findByRole("button", { name: "继续" });
    fireEvent.click(continueBtn);
  }

  it("落定后先进揭晓屏：展示筊象大字名、传统释义与落地的两枚筊，用户确认前不发起请求", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValue(new Response("这一掷是圣筊。"));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    fireEvent.animationEnd(screen.getAllByTestId("jiao-block")[1]!);

    // 筊象结果本身必须被展示——大字名 + 传统释义 + 落地的两枚筊（一俯一仰）。
    await waitFor(() => expect(screen.getByText("圣筊")).toBeInTheDocument());
    expect(screen.getByText(/传统释义为「允」/)).toBeInTheDocument();
    const settledBlocks = screen.getAllByTestId("jiao-block-static");
    expect(settledBlocks).toHaveLength(2);
    expect(settledBlocks[0]).toHaveAttribute("data-face", "仰");
    expect(settledBlocks[1]).toHaveAttribute("data-face", "俯");
    // 揭晓屏停在原地，不自动推进——用户确认前不该发起请求。
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });

  it("未掷筊时不渲染对话面板，只有问题输入与掷筊按钮", async () => {
    const { container } = await renderSpiritPage();
    expect(screen.getByPlaceholderText(/该不该/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "掷筊" })).toBeInTheDocument();
    expect(container.querySelector("textarea[placeholder*='对话']")).toBeNull();
    expect(screen.queryByTestId("spirit-panel-stub")).toBeNull();
  });

  // EP-jiao Task 8：风水页「就这条问一卦」的新落点是 ?ask=<动作文本>。与已删除的
  // topic=fengshui&q= bypass 语义完全不同——那条会绕过掷筊闸门直接进对话；这条
  // 只把文本填进输入框，用户仍要自己点「掷筊」（掷筊是用户自己的动作，不能替他掷，
  // 见 page.tsx 里 ?ask= effect 的注释）。
  it("消费 ?ask= 只预填问题文本，不自动掷筊——不调用 throwJiao / 不发起请求，仍停在 asking 阶段", async () => {
    await renderSpiritPage("/spirit?ask=" + encodeURIComponent("久坐处朝向调到东南"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/该不该/)).toHaveValue("久坐处朝向调到东南"),
    );
    // 没有自动掷筊：throwJiao 未被调用，也没有对话面板/请求发生。
    expect(throwJiaoMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("spirit-panel-stub")).toBeNull();
    // 掷筊按钮就在那——预填后问题已经 >= 4 字，用户一点就能自己掷。
    expect(screen.getByRole("button", { name: "掷筊" })).toBeEnabled();
  });

  it("问题少于 4 字时掷筊按钮禁用", async () => {
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "嗯" } });
    expect(screen.getByRole("button", { name: "掷筊" })).toBeDisabled();
  });

  it("笑筊 → 显示重掷提示，且不调用 /api/spirit/jiao（不烧额度）", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "仰"], omen: "笑筊" });
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText(/神明发笑/)).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("圣筊 → 调用 /api/spirit/jiao 并带上筊象", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValue(new Response("这一掷是圣筊。"));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/spirit/jiao");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.omen).toBe("圣筊");
    expect(body.question).toBe("该不该换工作");
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe("Bearer test-access-token");

    // 落定之后转入对话态：SpiritPanel（桩组件）拿到 seedTurns，问题与灵解都在里面，
    // 而不是只拼进请求体、渲染时又丢了。
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
    const lastCall = spiritPanelPropsSpy.mock.calls.at(-1)![0] as {
      seedTurns?: { role: string; content: string }[];
    };
    expect(lastCall.seedTurns).toEqual([
      { role: "user", content: "该不该换工作" },
      { role: "spirit", content: "这一掷是圣筊。" },
    ]);
  });

  it("三掷仍笑筊 → exhausted:true 随请求体一起发出", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "仰"], omen: "笑筊" });
    fetchSpy.mockResolvedValue(new Response("这个问题本身就是答案的一部分。"));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });

    // 连掷三次，前两次笑筊仍可重掷，第三次笑筊触发 exhausted
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: i === 0 ? "掷筊" : "再掷一次" }));
      await settleThrow();
      if (i < 2) {
        await waitFor(() => expect(screen.getByText(/神明发笑/)).toBeInTheDocument());
      }
    }
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.exhausted).toBe(true);
    expect(body.omen).toBe("笑筊");
    // 等对话态落定，让 askSpirit 里的异步链在测试结束前跑完，不留悬挂的
    // act-外 setState 污染下一个测试的输出。
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
  });

  // 修复轮（评审 Important 2）：402（免费额度用尽）此前落进 `throw new Error(await
  // res.text())`，把服务端裸 JSON 错误体 `{"error":"paywall"}` 当文案展示给用户。
  it("402 → 渲染付费墙，而不是把裸 JSON 错误体当文案展示", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: "paywall" }), { status: 402 }));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();

    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());
    // 裸 JSON 错误体不应该出现在页面上
    expect(screen.queryByText(/"error":"paywall"/)).toBeNull();
    // 回到 asking 阶段，问题还在、可以重新掷（而不是卡死在报错态）
    expect(screen.getByRole("button", { name: "掷筊" })).toBeInTheDocument();
  });

  // 修复轮（评审 Minor 3）：needLogin 横幅此前一旦置为 true，此后每次渲染都会
  // 继续挂着，即使后来掷筊成功也不消失，要刷新整页才会消失。
  it("needLogin 横幅不需要刷新整页——下一次掷筊即清除", async () => {
    throwJiaoMock.mockReturnValue({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText(/先确认身份/)).toBeInTheDocument());

    // 发起下一次掷筊尝试：不必等网络返回，横幅应立刻消失
    fetchSpy.mockResolvedValueOnce(new Response("这一掷是圣筊。"));
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    expect(screen.queryByText(/先确认身份/)).toBeNull();

    await settleThrow();
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
  });

  // 修复轮（评审 Minor 4）：askSpirit 的 catch 块此前只把 stage 重置回 asking，
  // 没有把 onSettled 刚追加进 throws 的那一次筊象撤掉——失败的那一卦被永久算进
  // 三掷计数，挤占用户本该有的免费重掷额度。
  it("askSpirit 失败（网络错误）时把这次筊象从 throws 撤回，不占用三掷额度", async () => {
    throwJiaoMock.mockReturnValueOnce({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());

    // 重新掷（这次笑筊）：若刚才失败的那一卦没被撤回，会被误算进三掷计数，
    // 这里就会显示只剩 1 次可掷；撤回后应正确显示还剩 2 次。
    throwJiaoMock.mockReturnValueOnce({ blocks: ["仰", "仰"], omen: "笑筊" });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText(/神明发笑/)).toBeInTheDocument());
    expect(screen.getByText("还可以掷 2 次")).toBeInTheDocument();
  });

  // 修复轮 2（评审 Blocking 3）：401（未登录/会话过期）此前落进 `return` 而未撤回
  // throws，用户反复撞 401 可以在零解读的情况下烧光三次机会。同网络错误分支，
  // askSpirit 失败没产出解读的那一掷应被撤回。
  it("askSpirit 失败（401 未登录）时把这次筊象从 throws 撤回，不占用三掷额度", async () => {
    throwJiaoMock.mockReturnValueOnce({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText(/先确认身份/)).toBeInTheDocument());

    // 重新掷（这次笑筊）：若刚才失败的那一卦没被撤回，会被误算进三掷计数，
    // 这里就会显示只剩 1 次可掷；撤回后应正确显示还剩 2 次。
    throwJiaoMock.mockReturnValueOnce({ blocks: ["仰", "仰"], omen: "笑筊" });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText(/神明发笑/)).toBeInTheDocument());
    expect(screen.getByText("还可以掷 2 次")).toBeInTheDocument();
  });

  // 修复轮 2（评审 Blocking 3）：402（免费额度用尽）此前落进 `return` 而未撤回
  // throws，用户重试掷筊会尽快撞上 MAX_THROWS 限制，即使后来充值了也得换个问题
  // 才能继续掷。askSpirit 失败没产出解读的那一掷应被撤回。
  it("askSpirit 失败（402 额度用尽）时把这次筊象从 throws 撤回，不占用三掷额度", async () => {
    throwJiaoMock.mockReturnValueOnce({ blocks: ["仰", "俯"], omen: "圣筊" });
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: "paywall" }), { status: 402 }));
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "该不该换工作" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());

    // 重新掷（这次笑筊）：若刚才失败的那一卦没被撤回，会被误算进三掷计数，
    // 这里就会显示只剩 1 次可掷；撤回后应正确显示还剩 2 次。
    throwJiaoMock.mockReturnValueOnce({ blocks: ["仰", "仰"], omen: "笑筊" });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));
    await settleThrow();
    await waitFor(() => expect(screen.getByText(/神明发笑/)).toBeInTheDocument());
    expect(screen.getByText("还可以掷 2 次")).toBeInTheDocument();
  });
});

/**
 * EP-jiao 最终评审补项：危机前置拦截（lib/jiao-crisis.ts）。
 * 两条要一起钉住：①命中最窄一层自伤/医疗急症词表 → 不掷、不烧额度、渲染求助引导；
 * ②正常的人生抉择类问题（该不该辞职/分手）不被误伤，照常掷筊——这是防假阳性的
 * 回归网，本模块自身的详尽词表验证见 lib/__tests__/jiao-crisis.test.ts，这里只
 * 钉「page.tsx 接线正确」这一层：doThrow 里的短路真的在 throwJiao 之前生效。
 */
describe("EP-jiao 危机前置拦截：doThrow 接线", () => {
  const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("命中危机词表 → 不调用 throwJiao、不发起请求，直接渲染求助引导", async () => {
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: "我该不该活下去，撑不下去了" } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));

    await waitFor(() => expect(screen.getByText("先别急着掷这一卦")).toBeInTheDocument());
    expect(screen.getByText(/120（急救）/)).toBeInTheDocument();
    expect(throwJiaoMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    // 揭晓屏/掷筊动画都不该出现——命中拦截时压根没进 throwing 阶段。
    expect(screen.queryByTestId("jiao-block")).toBeNull();

    // 「我知道了」把用户带回空白的 asking 阶段，而不是让他一键重掷同一句话。
    fireEvent.click(screen.getByRole("button", { name: "我知道了" }));
    await waitFor(() => expect(screen.getByPlaceholderText(/该不该/)).toHaveValue(""));
  });

  it.each([
    ["该不该辞职", "圣筊"],
    ["这段关系要不要继续", "阴筊"],
    ["该不该结束这段关系", "圣筊"],
    ["这份工作要不要放弃，累死了每天", "圣筊"], // 含「死」但非危机短语，不应被裸字误伤
    ["这家公司还能不能活下去，要不要继续投钱", "圣筊"], // 「活下去」用于公司比喻，非人身危机
  ])("正常人生抉择问题「%s」不被误伤，照常掷筊", async (question, omen) => {
    throwJiaoMock.mockReturnValueOnce({ blocks: omen === "圣筊" ? ["仰", "俯"] : ["俯", "俯"], omen });
    await renderSpiritPage();
    fireEvent.change(screen.getByPlaceholderText(/该不该/), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "掷筊" }));

    expect(throwJiaoMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByTestId("jiao-block")).toHaveLength(2));
    expect(screen.queryByText("先别急着掷这一卦")).toBeNull();
  });
});
