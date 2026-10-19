import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { UnauthenticatedError } from "@/lib/errors";
import type { ReadingDraft } from "@/lib/reading-draft";
import { ReadingForm } from "../ReadingForm";

const m = vi.hoisted(() => ({
  push: vi.fn(),
  createProfile: vi.fn(),
  computeChartAction: vi.fn(),
  saveReadingDraft: vi.fn(),
  takeReadingDraft: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/lib/profiles", () => ({ createProfile: m.createProfile }));
vi.mock("@/app/actions", () => ({ computeChartAction: m.computeChartAction, geocodeAction: vi.fn() }));
vi.mock("@/lib/reading-draft", () => ({ saveReadingDraft: m.saveReadingDraft, takeReadingDraft: m.takeReadingDraft }));

beforeEach(() => {
  vi.clearAllMocks();
  m.takeReadingDraft.mockReturnValue(null);
  m.computeChartAction.mockResolvedValue({ ok: true, chart: { fake: true } });
  m.createProfile.mockResolvedValue({ id: "p1" });
});

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="zh">{children}</I18nProvider>
);

function render_() {
  return render(<ReadingForm />, { wrapper: Wrapper });
}

/**
 * 对照设计稿（frontend-harness 审查，2026-08-18）：ReadingForm 是全站唯一
 * 还留着方框输入的页面，这次改成「细线下划」的纯文字字段 + 文字型性别切换——
 * 此前这个文件零测试覆盖，真实行为改动交独立评审前必须补上。
 */
describe("ReadingForm：对照设计稿", () => {
  it("字段是细线下划，不是方框——无背景色、无边框圆角，只有底部一条线", () => {
    render_();
    const nickname = screen.getByPlaceholderText(/称呼|昵称|nickname/i) as HTMLInputElement;
    expect(nickname.style.background).not.toBe("var(--color-surface)");
    expect(nickname.style.borderRadius).toBe("");
    expect(nickname.style.borderBottom).toBe("1px solid var(--color-line)");
    // 反向锁定：不再是旧的四边框方框（border: 1px solid var(--color-line) 全边）
    expect(nickname.style.border).toBe("");
  });

  it("性别切换是文字下划选中，不是实心药丸按钮", () => {
    render_();
    const maleBtn = screen.getByText("乾 · 男");
    const femaleBtn = screen.getByText("坤 · 女");
    // 未选中：无背景色差异，只用文字色 + 透明底线区分
    expect(maleBtn.style.background).toBe("");
    expect(femaleBtn.style.background).toBe("");
    expect(maleBtn.style.borderBottom).toBe("2px solid transparent");
    expect(femaleBtn.style.borderBottom).toBe("2px solid transparent");

    fireEvent.click(maleBtn);
    expect(maleBtn.style.color).toBe("var(--color-cinnabar)");
    expect(maleBtn.style.borderBottom).toBe("2px solid var(--color-cinnabar)");
    expect(maleBtn.style.fontWeight).toBe("600");
    // 另一个仍未选中
    expect(femaleBtn.style.color).toBe("var(--color-muted)");
    expect(femaleBtn.style.borderBottom).toBe("2px solid transparent");

    // 隐藏字段同步写入表单值（提交时靠它，不是靠按钮本身）
    const hidden = document.querySelector('input[name="gender"]') as HTMLInputElement;
    expect(hidden.value).toBe("male");

    fireEvent.click(femaleBtn);
    expect(hidden.value).toBe("female");
    expect(maleBtn.style.color).toBe("var(--color-muted)");
    expect(femaleBtn.style.color).toBe("var(--color-cinnabar)");
  });

  it("填了时辰后，时辰名（如「未时」）显示在时间输入前面；勾选「时辰不确定」后隐藏", () => {
    render_();
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(screen.queryByText(/时$/)).toBeNull();

    fireEvent.change(timeInput, { target: { value: "14:30" } });
    expect(screen.getByText("未时")).toBeInTheDocument();
    // 时辰名节点先于时间输入出现（对齐设计稿「未时 · [时间]」的顺序）
    const hint = screen.getByText("未时");
    expect(hint.compareDocumentPosition(timeInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const unknownCheckbox = screen.getByRole("checkbox", { name: /不知道出生时辰/ });
    fireEvent.click(unknownCheckbox);
    expect(screen.queryByText("未时")).toBeNull();
    expect(timeInput).toBeDisabled();
  });
});

const draft: ReadingDraft = {
  nickname: "阿甲",
  date: "1991-03-15",
  isLunar: true,
  time: "14:30",
  timeUnknown: false,
  gender: "female",
  geo: { label: "Shanghai, China", lat: 31.23, lon: 121.47, timezone: "Asia/Shanghai" },
};

describe("ReadingForm：未登录起盘（D1）", () => {
  function fillAndSubmit() {
    render_();
    fireEvent.change(screen.getByPlaceholderText(/称呼|昵称|nickname/i), { target: { value: "阿甲" } });
    fireEvent.change(document.querySelector('input[name="date"]')!, { target: { value: "1991-03-15" } });
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: "14:30" } });
    fireEvent.click(screen.getByText("乾 · 男"));
    fireEvent.click(screen.getByRole("button", { name: "排我的盘" }));
  }

  it("createProfile 抛 UnauthenticatedError → 存草稿并跳去登录（next=/reading）", async () => {
    m.createProfile.mockRejectedValue(new UnauthenticatedError());
    fillAndSubmit();
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/account?next=/reading"));
    expect(m.saveReadingDraft).toHaveBeenCalledWith({
      nickname: "阿甲",
      date: "1991-03-15",
      isLunar: false,
      time: "14:30",
      timeUnknown: false,
      gender: "male",
      geo: null,
    });
    expect(m.push).not.toHaveBeenCalledWith("/chart");
  });

  it("建档成功 → 跳 /chart，不存草稿", async () => {
    fillAndSubmit();
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/chart"));
    expect(m.saveReadingDraft).not.toHaveBeenCalled();
  });

  it("其它错误 → 显示错误，不跳登录、不存草稿", async () => {
    m.createProfile.mockRejectedValue(new Error("profile_limit"));
    fillAndSubmit();
    expect(await screen.findByText(/profile_limit/)).toBeInTheDocument();
    expect(m.push).not.toHaveBeenCalled();
    expect(m.saveReadingDraft).not.toHaveBeenCalled();
  });

  it("挂载时有草稿 → 回填各字段，不自动提交", async () => {
    m.takeReadingDraft.mockReturnValue(draft);
    render_();
    await waitFor(() =>
      expect((screen.getByPlaceholderText(/称呼|昵称|nickname/i) as HTMLInputElement).value).toBe("阿甲"),
    );
    expect((document.querySelector('input[name="date"]') as HTMLInputElement).value).toBe("1991-03-15");
    expect((document.querySelector('input[name="isLunar"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[type="time"]') as HTMLInputElement).value).toBe("14:30");
    expect((document.querySelector('input[name="gender"]') as HTMLInputElement).value).toBe("female");
    expect(screen.getByText("Shanghai、 China")).toBeInTheDocument();
    expect(m.takeReadingDraft).toHaveBeenCalled();
    expect(m.computeChartAction).not.toHaveBeenCalled();
    expect(m.createProfile).not.toHaveBeenCalled();
  });
});
