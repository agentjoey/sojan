import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent, cleanup } from "@testing-library/react";

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
vi.mock("@/components/Paywall", () => ({ Paywall: () => null }));

const { ANON_MERGE_TOKEN_KEY } = await import("@/lib/supabase");

const defaultFetch = async (url: string) => {
  if (url.startsWith("/api/account/identities")) return new Response(JSON.stringify({ email: "me@example.com" }), { status: 200 });
  if (url.startsWith("/api/billing/status")) return new Response(JSON.stringify({ tier: "free", memberUntil: null, used: 0, free: 30 }), { status: 200 });
  return new Response("{}", { status: 200 });
};
const fetchMock = vi.fn(defaultFetch);

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
  fetchMock.mockImplementation(defaultFetch);
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

describe("已登录（邮箱）与未登录视图", () => {
  it("邮箱用户：渲染登出按钮与危险区", async () => {
    getWebUserMock.mockResolvedValue({ id: "u1", email: "me@example.com", isAnonymous: false });
    await renderAccountPage();
    expect(await screen.findByText("登出")).toBeInTheDocument();
    expect(await screen.findByTestId("danger-zone")).toBeInTheDocument();
  });

  it("未登录：落匿名态，没有登出按钮", async () => {
    getWebUserMock.mockResolvedValue(null);
    await renderAccountPage();
    expect(await screen.findByLabelText("邮箱地址")).toBeInTheDocument();
    expect(screen.queryByText("登出")).toBeNull();
  });

  it("不再有任何 Telegram 元素：没有 Telegram 登录 widget、没有 Telegram 绑定行", async () => {
    getWebUserMock.mockResolvedValue({ id: "u1", email: "me@example.com", isAnonymous: false });
    const { container } = await renderAccountPage();
    await screen.findByTestId("identity-email");
    expect(container.textContent).not.toContain("Telegram");
    expect(screen.queryByTestId("identity-telegram")).toBeNull();
    expect(container.querySelector("script[data-telegram-login]")).toBeNull();
  });
});

describe("EP-account-login：换设备用已注册邮箱登录", () => {
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
    getWebUserMock.mockResolvedValue({ id: "u1", email: "me@example.com", isAnonymous: false });
  });

  it("订阅等级用 serif 19px 呈现（6c：等级 serif 19px + 用量）", async () => {
    await renderAccountPage();
    const tier = (await screen.findByTestId("billing-tier")) as HTMLElement;
    expect(tier.className).toContain("font-serif");
    expect(tier.className).toContain("text-[19px]");
  });

  it("绑定与登录：已绑定项墨色、未绑定项朱砂（两侧都钉，不是只钉一侧）", async () => {
    await renderAccountPage();
    await waitFor(() => expect(screen.getByTestId("identity-email").textContent).toBe("me@example.com"));
    expect((screen.getByTestId("identity-email") as HTMLElement).style.color).toBe("var(--color-ink)");
    cleanup();

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/account/identities")) return new Response(JSON.stringify({ email: null }), { status: 200 });
      return defaultFetch(url);
    });
    await renderAccountPage();
    await waitFor(() => expect(screen.getByTestId("identity-email").textContent).toBe("未绑定"));
    expect((screen.getByTestId("identity-email") as HTMLElement).style.color).toBe("var(--color-cinnabar)");
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
