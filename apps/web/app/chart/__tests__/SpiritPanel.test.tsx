import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@sojan/core";
import { SpiritPanel } from "../SpiritPanel";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

/**
 * SpiritPanel 回归测试（最终评审 I5）。
 *
 * 此前 `apps/web/app/spirit/__tests__/page.test.tsx` 的注释声称「SpiritPanel 已有
 * 自己的测试覆盖」——全仓当时并没有这个文件，是一句失实的注释（该文件已同步改正，
 * 指回这里）。`seedTurns` 的行为此前完全没有测试覆盖，C2（第二次问卦串台）正是从
 * 这个缺口漏出去的：SpiritPanel 曾经无条件调用 `listMessages(profile.id)` 拉取
 * `spirit_messages` 的全量历史、把上一卦的追问记录倒序拼进新一卦。
 *
 * 现在的 SpiritPanel 已经不读写 `spirit_messages`（该文件与 `lib/spirit.ts` 一并
 * 删除），追问改走 `/api/spirit/jiao` 的 `followUp` 分支——下面钉住这几件事：
 *   1. 有 seed 时不生成欢迎语、不产生 seed 之外的任何消息；
 *   2. 从不触碰任何 Supabase 表（`supabase().from` 全程不被调用）——
 *      这是「不读写 spirit_messages」最直接的回归网；
 *   3. 追问 historyForApi/priorTurns 正确包含 seed；
 *   4. 追问打 `/api/spirit/jiao`（不是 `/api/spirit/chat`）并带上 omen/exhausted/
 *      question，让掷筊守护栏覆盖整场对话（I4）；
 *   5. 401/402 的处理与首轮一致（撤回消息、needLogin/paywall）。
 */

const birth = BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false });
const chart = computeUnifiedChart(birth);
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart, createdAt: "", reading: null };

const fromSpy = vi.fn();
const getSessionMock = vi.fn(async () => ({ data: { session: { access_token: "test-token" } as { access_token: string } | null } }));
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({
    auth: { getSession: (...a: unknown[]) => getSessionMock(...(a as [])) },
    // 回归网：SpiritPanel 不该再触碰任何表（历史上的 bug 是无条件读 spirit_messages）。
    from: (...a: unknown[]) => fromSpy(...(a as [])),
  }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="zh">{children}</I18nProvider>;
}

const seedTurns = [
  { role: "user" as const, content: "该不该换工作" },
  { role: "spirit" as const, content: "这一掷是圣筊。留意你看到它时的第一反应。" },
];

function renderPanel(props: Partial<React.ComponentProps<typeof SpiritPanel>> = {}) {
  return render(
    <SpiritPanel
      profile={profile}
      seedTurns={seedTurns}
      omen="圣筊"
      exhausted={false}
      question="该不该换工作"
      {...props}
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => {
  fromSpy.mockClear();
  getSessionMock.mockClear();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SpiritPanel：只渲染 seed，不生成欢迎语，不触碰任何 Supabase 表", () => {
  it("渲染出的正是 seedTurns 的两条内容，没有多出一条通用欢迎语", () => {
    const { container } = renderPanel();
    // 消息列表本身有一个稳定的容器 class（overflow-y-auto），QuickPrompts 的
    // chip 按钮文案恰好与 seed 的用户提问重复（"该不该换工作"），必须把查询
    // 限定在消息列表容器内，否则会因为「找到两个匹配」而误判。
    const messageList = container.querySelector(".overflow-y-auto")!;
    const within = (text: string) => Array.from(messageList.querySelectorAll("*")).filter((n) => n.textContent === text);
    expect(messageList.textContent).toContain("该不该换工作");
    expect(messageList.textContent).toContain("这一掷是圣筊。留意你看到它时的第一反应。");
    // 旧版会在「无消息」时调用 sendToSpirit([]) 生成一条开场白——这里断言不存在
    // 任何额外的 spirit 气泡：消息列表里只有 seed 的这一条 spirit 内容出现一次
    // （用最内层的 <span> 精确计数，避免外层 div/p 的重复文本节点把计数撑大）。
    expect(within("这一掷是圣筊。留意你看到它时的第一反应。").filter((n) => n.tagName === "SPAN")).toHaveLength(1);
  });

  it("挂载阶段不触碰任何 Supabase 表——回归 C2（此前无条件读 spirit_messages）", () => {
    renderPanel();
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe("SpiritPanel：追问打 /api/spirit/jiao（I4），不再是通用 /api/spirit/chat", () => {
  const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response("那份犹豫本身也是答案的一部分。"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("同一次问卦内追问：priorTurns 从灵的第一条回应算起（跳过 seed 里的用户提问），带上 omen/exhausted/question", async () => {
    renderPanel();
    const textarea = screen.getByPlaceholderText("还想接着问点什么？");
    fireEvent.change(textarea, { target: { value: "那我现在该怎么想" } });
    fireEvent.click(screen.getByRole("button", { name: "接着问" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/spirit/jiao");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.followUp).toBe("那我现在该怎么想");
    expect(body.omen).toBe("圣筊");
    expect(body.exhausted).toBe(false);
    expect(body.question).toBe("该不该换工作");
    // priorTurns 不含 seed 里的用户提问（它会被服务端用 question+omen 重建），
    // 只含灵的第一条回应——与 continueJiaoReply 的「同一次问卦内追问」契约一致。
    expect(body.priorTurns).toEqual([{ role: "spirit", content: "这一掷是圣筊。留意你看到它时的第一反应。" }]);
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe("Bearer test-token");

    await waitFor(() => expect(screen.getByText("那份犹豫本身也是答案的一部分。")).toBeInTheDocument());
    // 追问全程也没有碰任何表——同上一组的回归点，这里换一个更贴近真实交互的路径再验一次。
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("续接历史（question=undefined）：priorTurns 就是 seed 原样，不带 question 字段", async () => {
    renderPanel({ seedTurns: [{ role: "spirit", content: "这一掷是阴筊。你当时松了口气还是失望？" }], question: undefined, omen: "阴筊" });
    fireEvent.change(screen.getByPlaceholderText("还想接着问点什么？"), { target: { value: "我好像松了口气" } });
    fireEvent.click(screen.getByRole("button", { name: "接着问" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.question).toBeUndefined();
    expect(body.omen).toBe("阴筊");
    expect(body.priorTurns).toEqual([{ role: "spirit", content: "这一掷是阴筊。你当时松了口气还是失望？" }]);
  });

  it("401 → 撤回刚追加的用户消息、显示 needLogin 引导，不留孤零零的一条用户发言", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("还想接着问点什么？"), { target: { value: "再问一句" } });
    fireEvent.click(screen.getByRole("button", { name: "接着问" }));

    await waitFor(() => expect(screen.getByText(/先确认身份/)).toBeInTheDocument());
    expect(screen.queryByText("再问一句")).toBeNull();
  });

  it("402 → 渲染付费墙，不把裸 JSON 错误体当文案展示，同样撤回用户消息", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: "paywall" }), { status: 402 }));
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("还想接着问点什么？"), { target: { value: "再问一句" } });
    fireEvent.click(screen.getByRole("button", { name: "接着问" }));

    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());
    expect(screen.queryByText(/"error":"paywall"/)).toBeNull();
    expect(screen.queryByText("再问一句")).toBeNull();
  });

  it("QuickPrompts 快捷追问同样打 /api/spirit/jiao", async () => {
    renderPanel();
    // QuickPrompts 渲染的按钮用的是 chip 样式（`rounded-[var(--radius-chip)]`），
    // 与「接着问」提交按钮、seed 里的文本内容都不会撞——用这个类名精确定位，
    // 不依赖某条 quickPrompt 文案恰好不与 seed 问题重复这种脆弱假设。
    const quickButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("rounded-[var(--radius-chip)]"));
    expect(quickButtons.length).toBeGreaterThan(0);
    fireEvent.click(quickButtons[0]!);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/spirit/jiao");
  });
});
