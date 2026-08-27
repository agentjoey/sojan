import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

const getWebUserMock = vi.fn(async (): Promise<{ id: string; email: string | null; isAnonymous: boolean } | null> => null);
const signInWithEmailMock = vi.fn(async (..._a: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
const upgradeAnonymousToEmailMock = vi.fn(async (..._a: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
const getSessionMock = vi.fn(async () => ({ data: { session: null as { access_token: string } | null } }));
vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ANON_MERGE_TOKEN_KEY: actual.ANON_MERGE_TOKEN_KEY,
    getWebUser: (...a: unknown[]) => getWebUserMock(...a),
    signInWithEmail: (...a: unknown[]) => signInWithEmailMock(...a),
    signOutWeb: vi.fn(),
    upgradeAnonymousToEmail: (...a: unknown[]) => upgradeAnonymousToEmailMock(...a),
    supabase: () => ({ auth: { getSession: getSessionMock } }),
  };
});
const hasTgSessionMock = vi.fn(() => true);
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => hasTgSessionMock(),
  tgLoginWithWidget: vi.fn(),
  tgLogout: vi.fn(),
}));
vi.mock("@/lib/tg/ui", () => ({ useIsTelegram: () => false }));
vi.mock("@/components/Paywall", () => ({ Paywall: () => null }));

const { ANON_MERGE_TOKEN_KEY } = await import("@/lib/supabase");

const fetchMock = vi.fn(async (url: string) => {
  if (url === "/api/tg/session") return new Response(JSON.stringify({ active: true, refreshed: false }), { status: 200 });
  if (url.startsWith("/api/account/identities")) return new Response(JSON.stringify({ email: null, telegram: { username: "u1" } }), { status: 200 });
  if (url.startsWith("/api/billing/status")) return new Response(JSON.stringify({ tier: "free", memberUntil: null, used: 0, free: 30 }), { status: 200 });
  return new Response("{}", { status: 200 });
});

async function renderAccountPage() {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider> });
  });
  return result;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  hasTgSessionMock.mockReturnValue(true);
  getWebUserMock.mockReset().mockResolvedValue(null);
  signInWithEmailMock.mockReset().mockResolvedValue({ ok: true });
  upgradeAnonymousToEmailMock.mockReset().mockResolvedValue({ ok: true });
  getSessionMock.mockReset().mockResolvedValue({ data: { session: null } });
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("EP-account2-03：/account 真正消费 /api/tg/session 的确认结果", () => {
  it("active=true → 保持已登录态（TG 视图渲染出来，不回退到匿名态）", async () => {
    await renderAccountPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/tg/session", expect.anything()));
    // TG 视图特征：账户危险区/登出按钮出现（既有 view.kind==="telegram" 分支才会渲染）
    expect(await screen.findByText("登出")).toBeInTheDocument();
  });

  it("active=false → 落到未登录态（不是继续假装已登录），且不再渲染登出按钮", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/tg/session") return new Response(JSON.stringify({ active: false, refreshed: false }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    await renderAccountPage();
    await waitFor(() => expect(screen.queryByText("登出")).toBeNull());
  });
});

describe("EP-account-login：换设备用已注册邮箱登录", () => {
  beforeEach(() => {
    hasTgSessionMock.mockReturnValue(false);
  });

  async function fillAndSubmit(email = "existing@example.com") {
    const input = await screen.findByLabelText("邮箱地址");
    fireEvent.change(input, { target: { value: email } });
    await act(async () => {
      fireEvent.click(screen.getByText("发送登录链接"));
    });
  }

  it("匿名设备 + upgrade 成功（全新邮箱）→ 不退回 signInWithEmail，不落匿名 token", async () => {
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(upgradeAnonymousToEmailMock).toHaveBeenCalledWith("existing@example.com", undefined));
    expect(signInWithEmailMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
    expect(await screen.findByText("已发送，请查收邮件中的登录链接")).toBeInTheDocument();
  });

  it("匿名设备 + upgrade 失败（邮箱已属于别的账号）→ 退回 signInWithEmail 真正登录，先存好匿名 token", async () => {
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: false, error: "A user with this email address has already been registered" });
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com", undefined, undefined));
    // 退回登录前已经存好匿名 token（不依赖 upgrade 报错文案，任何失败都退回）
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBe("anon-tok-1");
    expect(await screen.findByText("已发送，请查收邮件中的登录链接")).toBeInTheDocument();
  });

  it("匿名设备 + upgrade 失败 + 退回登录也失败 → 报错，清掉暂存的匿名 token（没有后续 callback 会用到它）", async () => {
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: false, error: "taken" });
    signInWithEmailMock.mockResolvedValue({ ok: false, error: "发送失败" });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(screen.getByText("发送失败")).toBeInTheDocument());
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
  });

  it("非匿名（无会话）→ 直接 signInWithEmail，不碰 upgradeAnonymousToEmail 或匿名 token", async () => {
    getWebUserMock.mockResolvedValue(null);
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com", undefined, undefined));
    expect(upgradeAnonymousToEmailMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
  });
});

describe("EP-auth-return：?next= 回跳参数透传", () => {
  beforeEach(() => {
    hasTgSessionMock.mockReturnValue(false);
  });

  function stubSearch(search: string) {
    Object.defineProperty(window, "location", { value: { ...window.location, search }, writable: true });
  }

  async function fillAndSubmit(email = "existing@example.com") {
    const input = await screen.findByLabelText("邮箱地址");
    fireEvent.change(input, { target: { value: email } });
    await act(async () => {
      fireEvent.click(screen.getByText("发送登录链接"));
    });
  }

  it("URL 带 ?next=/dream → signInWithEmail 收到 next，让 /auth/callback 能送回 /dream", async () => {
    stubSearch("?next=/dream");
    getWebUserMock.mockResolvedValue(null);
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com", undefined, "/dream"));
  });

  it("匿名设备退回登录分支同样带上 next", async () => {
    stubSearch("?next=/dream");
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: false, error: "taken" });
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(upgradeAnonymousToEmailMock).toHaveBeenCalledWith("existing@example.com", "/dream"));
    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com", undefined, "/dream"));
  });

  it("?next=//evil.com（协议相对地址）→ 拒绝，不当作合法回跳目标透传", async () => {
    stubSearch("?next=" + encodeURIComponent("//evil.com"));
    getWebUserMock.mockResolvedValue(null);
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com", undefined, undefined));
  });

  it("?next=https://evil.com（绝对地址）→ 拒绝，不透传", async () => {
    stubSearch("?next=" + encodeURIComponent("https://evil.com"));
    getWebUserMock.mockResolvedValue(null);
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com", undefined, undefined));
  });
});

/**
 * UI v3 C4-1（03-screens 我的+账号 6c）：版式断言。
 * 每条对应一个可独立回退的实现点（订阅等级字级 / 未绑定项朱砂 / 危险区 Emphasis），
 * 删掉对应实现即只有对应用例变红（mutation 复验输出见实施报告）。
 */
describe("UI v3 C4-1：6c 版式", () => {
  beforeEach(() => {
    // 测试间污染：文件首个 describe 的「active=false」用例用 mockImplementation 覆盖过
    // fetchMock，外层 afterEach 只 mockClear（清调用记录）不还原实现——不重置的话
    // /api/tg/session 在本组仍回 active:false，页面落匿名态，identity/danger-zone 全不渲染。
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/tg/session") return new Response(JSON.stringify({ active: true, refreshed: false }), { status: 200 });
      if (url.startsWith("/api/account/identities")) return new Response(JSON.stringify({ email: null, telegram: { username: "u1" } }), { status: 200 });
      if (url.startsWith("/api/billing/status")) return new Response(JSON.stringify({ tier: "free", memberUntil: null, used: 0, free: 30 }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
  });

  it("订阅等级用 serif 19px 呈现（6c：等级 serif 19px + 用量）", async () => {
    await renderAccountPage();
    const tier = (await screen.findByTestId("billing-tier")) as HTMLElement;
    expect(tier.className).toContain("font-serif");
    expect(tier.className).toContain("text-[19px]");
  });

  it("绑定与登录：未绑定项朱砂、已绑定项墨色（两侧都钉，不是只钉一侧）", async () => {
    await renderAccountPage();
    // fetchMock 的 identities：email=null（未绑定）/ telegram.username="u1"（已绑定）
    await waitFor(() => expect(screen.getByTestId("identity-telegram").textContent).toBe("u1"));
    expect((screen.getByTestId("identity-email") as HTMLElement).style.color).toBe("var(--color-cinnabar)");
    expect((screen.getByTestId("identity-telegram") as HTMLElement).style.color).toBe("var(--color-ink)");
  });

  it("危险区走强调手法（Emphasis 2px 朱砂左线 + 浅朱砂淡出底），不再是朱砂边框盒", async () => {
    await renderAccountPage();
    const dz = (await screen.findByTestId("danger-zone")) as HTMLElement;
    expect(dz).toHaveStyle({ borderLeft: "2px solid var(--color-cinnabar)" });
    // 整圈朱砂边框盒已被取代——border shorthand 不再存在（只剩 borderLeft）
    expect(dz.style.border).toBe("");
    // 不可逆警告仍在强调块内（版式重排没把警告弄丢）
    expect(dz.textContent).toContain("此操作不可逆");
  });
});
