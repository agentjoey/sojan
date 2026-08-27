import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@sojan/core";
import type { Profile } from "@/lib/profiles";

const birth1 = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const birth2 = BirthInputSchema.parse({ date: "1985-03-02", time: "09:15", gender: "female", trueSolarTime: false });

// 两个名字刻意选不同首字——SealIcon 只取昵称首字符渲染，若两个 fixture 首字
// 相同（比如都叫「阿X」），screen.getByText(首字) 会同时命中两个档案的图标，
// 测试写起来就已经在自证了。
const active: Profile = { id: "p1", nickname: "甲一", birthInput: birth1, chart: computeUnifiedChart(birth1), createdAt: "", reading: null };
const inactive: Profile = { id: "p2", nickname: "乙二", birthInput: birth2, chart: computeUnifiedChart(birth2), createdAt: "", reading: null };

const listProfiles = vi.fn(async () => [active, inactive]);
const getActiveProfileId = vi.fn(() => "p1");
const setActiveProfile = vi.fn();
const deleteProfile = vi.fn(async () => {});

vi.mock("@/lib/profiles", () => ({
  listProfiles: (...a: unknown[]) => listProfiles(...(a as [])),
  getActiveProfileId: (...a: unknown[]) => getActiveProfileId(...(a as [])),
  setActiveProfile: (...a: unknown[]) => setActiveProfile(...(a as [])),
  deleteProfile: (...a: unknown[]) => deleteProfile(...(a as [])),
}));

vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => false,
  tgListProfiles: vi.fn(async () => []),
  tgDeleteProfile: vi.fn(),
}));

vi.mock("@/lib/tg/ui", () => ({ useIsTelegram: () => false }));

vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

async function renderPage() {
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
  listProfiles.mockClear();
  getActiveProfileId.mockClear();
  setActiveProfile.mockClear();
  deleteProfile.mockClear();
  push.mockClear();
});

/**
 * 对照设计稿（frontend-harness 审查，2026-08-18）：档案列表副标题、SealIcon
 * ink variant、首尾细线、底部「新建档案」入口——这四处此前零测试覆盖
 * （profiles/page.tsx 在这次改动前一直没有专属测试文件）。
 */
describe("档案列表：对照设计稿", () => {
  it("副标题是「阳历 出生日期 · 时辰」，不是命理结论（日主/五行）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲一")).toBeInTheDocument());
    // 文本被 JSX 表达式拆成多个文本节点（"阳历" + 日期 + " · " + 时辰各自一段），
    // getByText 精确字符串匹配不到——用函数匹配器比对拼接后的 textContent。
    const row1 = screen.getByText("甲一").closest("button")!;
    expect(row1.textContent).toContain("阳历 1990-06-15 · 未时");
    const row2 = screen.getByText("乙二").closest("button")!;
    expect(row2.textContent).toContain("阳历 1985-03-02 · 巳时");
    // 反向锁定：不再显示日主/五行这类命理结论
    expect(screen.queryByText(active.chart.bazi.dayMaster)).toBeNull();
  });

  it("当前档案用 SealIcon 实心朱底（bai），其余档案用实心墨底（ink）——两者都不是浅底描边（zhu）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲一")).toBeInTheDocument());
    // SealIcon 把首字符渲染成自身的文本节点，父级 span 上带着变体决定的背景色。
    const activeSeal = screen.getByText("甲").closest("span")!;
    const inactiveSeal = screen.getByText("乙").closest("span")!;
    expect(activeSeal.style.background).toContain("var(--color-seal)");
    expect(inactiveSeal.style.background).toContain("var(--color-ink)");
    // zhu variant 的特征是 boxShadow 描边而非 background 实底——两者都不该有它。
    expect(activeSeal.style.boxShadow).toBe("");
    expect(inactiveSeal.style.boxShadow).toBe("");
  });

  it("列表首尾都有细线（不只是行间线）", async () => {
    const { container } = await renderPage();
    await waitFor(() => expect(screen.getByText("甲一")).toBeInTheDocument());
    const list = container.querySelector('[style*="border-top: 1px solid var(--color-line)"]');
    expect(list, "列表容器本身应带顶部细线").not.toBeNull();
    // 每一行自己也带底部细线（包括第一行——此前只有 i>0 的行才有上边线，
    // 首行完全没有线；现在首尾都要有）。
    const firstRow = screen.getByText("甲一").closest("button")!.parentElement!;
    expect(firstRow.style.borderBottom).toBe("1px solid var(--color-line)");
    const lastRow = screen.getByText("乙二").closest("button")!.parentElement!;
    expect(lastRow.style.borderBottom).toBe("1px solid var(--color-line)");
  });

  it("列表下方是纯文字「＋ 新建档案」入口，指向 /reading（不是页头的实心按钮）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲一")).toBeInTheDocument());
    const addLink = screen.getByText("＋ 新建档案");
    expect(addLink.tagName).toBe("A");
    expect(addLink.getAttribute("href")).toBe("/reading");
  });

  it("加载中/空列表时不渲染「新建档案」入口（避免点一个还没准备好的东西）", async () => {
    listProfiles.mockResolvedValueOnce([]);
    await renderPage();
    await waitFor(() => expect(screen.getByText(/尚无档案/)).toBeInTheDocument());
    expect(screen.queryByText("＋ 新建档案")).toBeNull();
  });
});

describe("UI v3：账号入口（Task 2 移除常驻「账」项后，这里是唯一路径）", () => {
  it("有一条独立的账号分节行，指向 /account", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("account-entry")).toBeInTheDocument());
    const entry = screen.getByTestId("account-entry");
    expect(entry.getAttribute("href")).toBe("/account");
  });

  it("页头 action 槽里不再重复一个账号按钮（同页只留一个入口）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("account-entry")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: /账号/ })).toHaveLength(1);
  });
});

/**
 * UI v3 C4-1（03-screens 我的+账号 6c）：版式断言。
 * 每条对应一个可独立回退的实现点（当前档案 Emphasis / 页首档案信息行），
 * 删掉对应实现即只有对应用例变红（mutation 复验输出见实施报告）。
 */
describe("UI v3 C4-1：6c 版式", () => {
  it("当前档案走强调手法（Emphasis 2px 朱砂左线）且只有当前档案走，其余档案无强调", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲一")).toBeInTheDocument());
    const emphs = screen.getAllByTestId("profile-active-emphasis");
    expect(emphs).toHaveLength(1);
    expect(emphs[0]).toHaveStyle({ borderLeft: "2px solid var(--color-cinnabar)" });
    // 强调手法包的是当前档案（甲一）那一行，不是别的行
    expect(emphs[0]!.textContent).toContain("甲一");
    expect(emphs[0]!.textContent).not.toContain("乙二");
  });

  it("页首说明行展示当前档案的昵称与出生信息（6c：我 的 / 昵称 / 出生信息一行）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲一")).toBeInTheDocument());
    // 说明行是一个 <p>，文本恰为「昵称 · 阳历 日期 · 时辰」——列表行按钮的
    // textContent 也含这些片段，但它是 BUTTON 不是 P，matcher 已用两侧验证能区分。
    const annotation = screen.getByText(
      (_, el) => el?.tagName === "P" && el.textContent === "甲一 · 阳历 1990-06-15 · 未时",
    );
    expect(annotation).toBeInTheDocument();
  });
});
