import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { OTP_RESEND_COOLDOWN_S, OTP_SEND_TIMEOUT_MS } from "@/lib/auth/otp";

type AuthErr = { status?: number; message?: string } | null;
const sendOtpMock = vi.fn(async (..._a: unknown[]): Promise<{ data: unknown; error: AuthErr }> => ({ data: { success: true }, error: null }));
const signInOtpMock = vi.fn(async (..._a: unknown[]): Promise<{ data: unknown; error: AuthErr }> => ({ data: { user: {} }, error: null }));
const signOutMock = vi.fn(async (..._a: unknown[]) => ({ data: { success: true }, error: null }));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: (...a: unknown[]) => sendOtpMock(...a) },
    signIn: { emailOtp: (...a: unknown[]) => signInOtpMock(...a) },
    signOut: (...a: unknown[]) => signOutMock(...a),
  },
}));

type Summary = { email: string; access: { level: "identified" | "member" | "anonymous"; hasVerifiedEmail: boolean } } | null;
const getAccountSummaryMock = vi.fn(async (): Promise<Summary> => null);
const acceptTermsOnceMock = vi.fn(async () => {});
vi.mock("@/lib/data/account", () => ({
  getAccountSummary: () => getAccountSummaryMock(),
  acceptTermsOnce: () => acceptTermsOnceMock(),
}));

const replaceMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock, refresh: refreshMock }) }));
vi.mock("@/components/Paywall", () => ({ Paywall: () => null }));
const clearLocalCachesMock = vi.fn();
vi.mock("@/lib/local-cache", () => ({ clearLocalCaches: () => clearLocalCachesMock() }));

const signedInSummary: Summary = { email: "me@example.com", access: { level: "identified", hasVerifiedEmail: true } };

const defaultFetch = async (url: string) => {
  if (url.startsWith("/api/billing/status")) return new Response(JSON.stringify({ tier: "free", memberUntil: null, used: 0, free: 30 }), { status: 200 });
  return new Response("{}", { status: 200 });
};
const fetchMock = vi.fn(defaultFetch);

function stubSearch(search: string) {
  Object.defineProperty(window, "location", { value: { ...window.location, search }, writable: true });
}

/** 注销成功后页面会 `location.href = "/"`；jsdom 对赋值只报 not-implemented，这里吞掉。 */
function stubLocationHref() {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search: "", set href(_v: string) {} },
    writable: true,
  });
}

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
  sendOtpMock.mockReset().mockResolvedValue({ data: { success: true }, error: null });
  signInOtpMock.mockReset().mockResolvedValue({ data: { user: {} }, error: null });
  signOutMock.mockClear();
  getAccountSummaryMock.mockReset().mockResolvedValue(null);
  acceptTermsOnceMock.mockClear();
  replaceMock.mockClear();
  refreshMock.mockClear();
  clearLocalCachesMock.mockClear();
  stubSearch("");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

async function submitEmail(email = "me@example.com") {
  fireEvent.change(await screen.findByLabelText("邮箱地址"), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByText("发送验证码"));
  });
}

async function enterCodeAndVerify(code = "123456") {
  fireEvent.change(await screen.findByLabelText("验证码"), { target: { value: code } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
  });
}

describe("未登录：邮箱 → 验证码", () => {
  beforeEach(() => {
    // 挂载时未登录；验证码通过后服务端能读到会话。
    getAccountSummaryMock.mockReset().mockResolvedValueOnce(null).mockResolvedValue(signedInSummary);
  });

  it("显示邮箱输入，没有登出按钮与危险区", async () => {
    await renderAccountPage();
    expect(await screen.findByLabelText("邮箱地址")).toBeInTheDocument();
    expect(screen.queryByText("登出")).toBeNull();
    expect(screen.queryByTestId("danger-zone")).toBeNull();
  });

  it("提交邮箱 → sendVerificationOtp({ email, type: 'sign-in' })，并切到验证码输入", async () => {
    await renderAccountPage();
    await submitEmail();
    expect(sendOtpMock).toHaveBeenCalledWith(expect.objectContaining({ email: "me@example.com", type: "sign-in" }));
    expect(await screen.findByLabelText("验证码")).toBeInTheDocument();
    expect(screen.getByText(/me@example\.com/)).toBeInTheDocument();
  });

  it("邮箱格式不对 → 提示，不发请求", async () => {
    await renderAccountPage();
    await submitEmail("not-an-email");
    expect(sendOtpMock).not.toHaveBeenCalled();
    expect(await screen.findByText("请输入有效的邮箱地址")).toBeInTheDocument();
  });

  it("sendVerificationOtp 返回 429 → 显示「发送过于频繁」，停留在邮箱步骤", async () => {
    sendOtpMock.mockResolvedValue({ data: null, error: { status: 429, message: "Too many requests" } });
    await renderAccountPage();
    await submitEmail();
    expect(await screen.findByText("发送过于频繁，请稍后再试")).toBeInTheDocument();
    expect(screen.queryByLabelText("验证码")).toBeNull();
  });

  it("sendVerificationOtp 其他错误 → 通用发送失败文案", async () => {
    sendOtpMock.mockResolvedValue({ data: null, error: { status: 500, message: "boom" } });
    await renderAccountPage();
    await submitEmail();
    expect(await screen.findByText("发送失败，请稍后重试")).toBeInTheDocument();
  });

  it("输入 6 位码 → signIn.emailOtp({ email, otp })；成功后 acceptTermsOnce 并 router.replace 到默认 /account", async () => {
    await renderAccountPage();
    await submitEmail();
    await enterCodeAndVerify("123456");
    expect(signInOtpMock).toHaveBeenCalledWith({ email: "me@example.com", otp: "123456" });
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(acceptTermsOnceMock).toHaveBeenCalledTimes(1);
  });

  it("不足 6 位时验证按钮禁用，不发请求", async () => {
    await renderAccountPage();
    await submitEmail();
    fireEvent.change(await screen.findByLabelText("验证码"), { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "验证并登录" })).toBeDisabled();
    expect(signInOtpMock).not.toHaveBeenCalled();
  });

  it("?next=/dream → 登录成功后 replace 到 /dream", async () => {
    stubSearch("?next=/dream");
    await renderAccountPage();
    await submitEmail();
    await enterCodeAndVerify();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dream"));
  });

  it("?next=//evil.com → 回落 /account，不跳外域", async () => {
    stubSearch("?next=" + encodeURIComponent("//evil.com"));
    await renderAccountPage();
    await submitEmail();
    await enterCodeAndVerify();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(replaceMock).not.toHaveBeenCalledWith("//evil.com");
  });

  it("验证码错误 → 显示错误文案，输入框保留原值，「重新发送」可点，且不 acceptTermsOnce / 不跳转", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signInOtpMock.mockResolvedValue({ data: null, error: { status: 400, message: "Invalid OTP" } });
    await renderAccountPage();
    await submitEmail();
    await enterCodeAndVerify("654321");
    expect(await screen.findByText("验证码不正确或已过期，请重试")).toBeInTheDocument();
    expect((screen.getByLabelText("验证码") as HTMLInputElement).value).toBe("654321");
    // 发码后有冷却；冷却结束「重新发送」可点
    await act(async () => { await vi.advanceTimersByTimeAsync(OTP_RESEND_COOLDOWN_S * 1000); });
    const resend = screen.getByRole("button", { name: "重新发送" });
    expect(resend).toBeEnabled();
    expect(acceptTermsOnceMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();

    // 重新发送：再调一次 sendVerificationOtp
    sendOtpMock.mockClear();
    await act(async () => {
      fireEvent.click(resend);
    });
    expect(sendOtpMock).toHaveBeenCalledWith(expect.objectContaining({ email: "me@example.com", type: "sign-in" }));
  });

  it("验证码通过但读不到会话（cookie 没落地）→ 显示 sessionMissing 错误，保留输入，不跳转", async () => {
    getAccountSummaryMock.mockReset().mockResolvedValue(null);
    await renderAccountPage();
    await submitEmail();
    await enterCodeAndVerify("123456");
    expect(await screen.findByText(/登录状态没有保存成功/)).toBeInTheDocument();
    expect((screen.getByLabelText("验证码") as HTMLInputElement).value).toBe("123456");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(acceptTermsOnceMock).not.toHaveBeenCalled();
  });

  it("邮箱输入框连按两次 Enter：第一次发送未返回前，sendVerificationOtp 只调用一次", async () => {
    let release!: (v: { data: unknown; error: AuthErr }) => void;
    sendOtpMock.mockImplementation(() => new Promise((r) => { release = r; }));
    await renderAccountPage();
    const input = await screen.findByLabelText("邮箱地址");
    fireEvent.change(input, { target: { value: "me@example.com" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(sendOtpMock).toHaveBeenCalledTimes(1);
    await act(async () => { release({ data: { success: true }, error: null }); });
    expect(await screen.findByLabelText("验证码")).toBeInTheDocument();
  });

  it("验证码输入框连按两次 Enter：第一次验证未返回前，signIn.emailOtp 只调用一次", async () => {
    await renderAccountPage();
    await submitEmail();
    let release!: (v: { data: unknown; error: AuthErr }) => void;
    signInOtpMock.mockImplementation(() => new Promise((r) => { release = r; }));
    const input = await screen.findByLabelText("验证码");
    fireEvent.change(input, { target: { value: "123456" } });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(signInOtpMock).toHaveBeenCalledTimes(1);
    await act(async () => { release({ data: { user: {} }, error: null }); });
  });

  it("「更换邮箱」回到邮箱步骤", async () => {
    await renderAccountPage();
    await submitEmail();
    fireEvent.click(await screen.findByRole("button", { name: "更换邮箱" }));
    expect(await screen.findByLabelText("邮箱地址")).toBeInTheDocument();
  });
});

describe("发码超时与重发（EP-otp-send-timeout）", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  /** 一个永不返回的发码请求，记录它收到的 abort signal。 */
  function hangingSend() {
    const signals: AbortSignal[] = [];
    sendOtpMock.mockImplementation((...a: unknown[]) => {
      const opts = a[0] as { fetchOptions?: { signal?: AbortSignal } };
      if (opts.fetchOptions?.signal) signals.push(opts.fetchOptions.signal);
      return new Promise(() => {});
    });
    return signals;
  }

  it("首次发码一直不返回 → 超时后解锁、进入验证码步骤、提示邮件可能已发出，并中止请求", async () => {
    const signals = hangingSend();
    await renderAccountPage();
    await submitEmail();
    expect(screen.getByRole("button", { name: "发送中…" })).toBeDisabled();

    await act(async () => { await vi.advanceTimersByTimeAsync(OTP_SEND_TIMEOUT_MS); });

    expect(await screen.findByLabelText("验证码")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("以最新一封为准");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
  });

  it("发码返回 504 → 同样按「可能已发出」处理，进入验证码步骤", async () => {
    sendOtpMock.mockResolvedValue({ data: null, error: { status: 504, message: "Gateway Timeout" } });
    await renderAccountPage();
    await submitEmail();
    expect(await screen.findByLabelText("验证码")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("以最新一封为准");
  });

  it("重发一直不返回 → 超时后「验证并登录」恢复可用，不再卡住", async () => {
    await renderAccountPage();
    await submitEmail();
    await act(async () => { await vi.advanceTimersByTimeAsync(OTP_RESEND_COOLDOWN_S * 1000); });
    fireEvent.change(screen.getByLabelText("验证码"), { target: { value: "123456" } });

    hangingSend();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重新发送" })); });
    expect(screen.getByRole("button", { name: "验证并登录" })).toBeDisabled();

    await act(async () => { await vi.advanceTimersByTimeAsync(OTP_SEND_TIMEOUT_MS); });
    expect(screen.getByRole("button", { name: "验证并登录" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("以最新一封为准");
  });

  it("发码成功后「重新发送」进入冷却（显示倒计时、禁用），冷却结束恢复", async () => {
    await renderAccountPage();
    await submitEmail();
    const cooling = screen.getByRole("button", { name: `重新发送（${OTP_RESEND_COOLDOWN_S} 秒）` });
    expect(cooling).toBeDisabled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByRole("button", { name: `重新发送（${OTP_RESEND_COOLDOWN_S - 1} 秒）` })).toBeDisabled();

    await act(async () => { await vi.advanceTimersByTimeAsync((OTP_RESEND_COOLDOWN_S - 1) * 1000); });
    expect(screen.getByRole("button", { name: "重新发送" })).toBeEnabled();
  });

  it("重发成功 → 提示旧邮件里的码已失效、以最新一封为准，并重新进入冷却", async () => {
    await renderAccountPage();
    await submitEmail();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(OTP_RESEND_COOLDOWN_S * 1000); });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重新发送" })); });
    expect(sendOtpMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("之前邮件里的验证码已失效");
    expect(screen.getByRole("button", { name: `重新发送（${OTP_RESEND_COOLDOWN_S} 秒）` })).toBeDisabled();
  });

  it("重发失败（非超时）→ 显示发送失败，不进入冷却", async () => {
    await renderAccountPage();
    await submitEmail();
    await act(async () => { await vi.advanceTimersByTimeAsync(OTP_RESEND_COOLDOWN_S * 1000); });

    sendOtpMock.mockResolvedValue({ data: null, error: { status: 500, message: "boom" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重新发送" })); });
    expect(await screen.findByText("发送失败，请稍后重试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新发送" })).toBeEnabled();
  });
});

describe("已登录视图", () => {
  beforeEach(() => {
    getAccountSummaryMock.mockResolvedValue(signedInSummary);
  });

  it("显示邮箱、会员与额度区、登出按钮、注销区；不再出现邮箱输入", async () => {
    await renderAccountPage();
    expect(await screen.findByText("me@example.com")).toBeInTheDocument();
    expect(await screen.findByTestId("billing-tier")).toHaveTextContent("免费");
    expect(screen.getByText("本月已用 0/30")).toBeInTheDocument();
    expect(await screen.findByText("登出")).toBeInTheDocument();
    expect(await screen.findByTestId("danger-zone")).toBeInTheDocument();
    expect(screen.queryByLabelText("邮箱地址")).toBeNull();
  });

  it("billing 状态走同源 fetch，不带 Authorization 头", async () => {
    await renderAccountPage();
    await screen.findByTestId("billing-tier");
    const call = fetchMock.mock.calls.find((c) => String(c[0]).startsWith("/api/billing/status"));
    expect(call).toBeTruthy();
    const init = (call as unknown[])[1] as { headers?: Record<string, string> } | undefined;
    expect(init?.headers?.Authorization).toBeUndefined();
  });

  it("登出 → authClient.signOut()，回到登录视图", async () => {
    await renderAccountPage();
    await act(async () => {
      fireEvent.click(await screen.findByText("登出"));
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(clearLocalCachesMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("邮箱地址")).toBeInTheDocument();
  });

  it("注销成功 → 清本地缓存并 signOut", async () => {
    stubLocationHref();
    await renderAccountPage();
    fireEvent.click(await screen.findByText("注销账号"));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByText("确认注销"));
    });
    expect(clearLocalCachesMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("注销：勾选确认后 POST /api/account/delete（无 Authorization 头）", async () => {
    await renderAccountPage();
    fireEvent.click(await screen.findByText("注销账号"));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByText("确认注销"));
    });
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === "/api/account/delete");
    expect(call).toBeTruthy();
    const init = (call as unknown[])[1] as { method: string; headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("注销失败 → 不清本地缓存", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/account/delete") return new Response(JSON.stringify({}), { status: 500 });
      return defaultFetch(url);
    });
    await renderAccountPage();
    fireEvent.click(await screen.findByText("注销账号"));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByText("确认注销"));
    });
    expect(clearLocalCachesMock).not.toHaveBeenCalled();
  });

  it("注销失败 → 显示服务端错误或通用失败文案", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/account/delete") return new Response(JSON.stringify({}), { status: 500 });
      return defaultFetch(url);
    });
    await renderAccountPage();
    fireEvent.click(await screen.findByText("注销账号"));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByText("确认注销"));
    });
    expect(await screen.findByText("注销失败，请重试")).toBeInTheDocument();
  });
});

/**
 * UI v3 C4-1（03-screens 我的+账号 6c）：版式断言（订阅等级字级 / 危险区 Emphasis）。
 */
describe("UI v3 C4-1：6c 版式", () => {
  beforeEach(() => {
    getAccountSummaryMock.mockResolvedValue(signedInSummary);
  });

  it("订阅等级用 serif 19px 呈现（6c：等级 serif 19px + 用量）", async () => {
    await renderAccountPage();
    const tier = (await screen.findByTestId("billing-tier")) as HTMLElement;
    expect(tier.className).toContain("font-serif");
    expect(tier.className).toContain("text-[19px]");
  });

  it("危险区走强调手法（Emphasis 2px 朱砂左线 + 浅朱砂淡出底），不再是朱砂边框盒", async () => {
    await renderAccountPage();
    const dz = (await screen.findByTestId("danger-zone")) as HTMLElement;
    expect(dz).toHaveStyle({ borderLeft: "2px solid var(--color-cinnabar)" });
    expect(dz.style.border).toBe("");
    expect(dz.textContent).toContain("此操作不可逆");
  });
});
