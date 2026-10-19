import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/errors";

const data = vi.hoisted(() => ({
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
  renameProfile: vi.fn(),
  saveReading: vi.fn(),
  listProfiles: vi.fn(),
  getProfile: vi.fn(),
  getSpiritMemory: vi.fn(),
  getQuestionnaire: vi.fn(),
  saveSpiritMemory: vi.fn(),
  saveQuestionnaire: vi.fn(),
}));
vi.mock("@/lib/data/profiles", () => data);

const profiles = await import("../profiles");

const ACTIVE_KEY = "zhaojian.activeProfileId";
const input = { nickname: "阿甲", birthInput: {} as never, chart: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("lib/profiles 客户端门面", () => {
  it("createProfile 收到 unauthenticated → reject 为 UnauthenticatedError，且不写当前档案指针", async () => {
    data.createProfile.mockResolvedValue({ ok: false, code: "unauthenticated" });
    await expect(profiles.createProfile(input)).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("createProfile 收到 profile_limit → reject 为 message=profile_limit 的 Error", async () => {
    data.createProfile.mockResolvedValue({ ok: false, code: "profile_limit" });
    await expect(profiles.createProfile(input)).rejects.toThrow(/^profile_limit$/);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("createProfile 成功 → 返回档案并设为当前档案", async () => {
    data.createProfile.mockResolvedValue({ ok: true, value: { id: "p9" } });
    await expect(profiles.createProfile(input)).resolves.toEqual({ id: "p9" });
    expect(data.createProfile).toHaveBeenCalledWith(input);
    expect(profiles.getActiveProfileId()).toBe("p9");
  });

  it("deleteProfile 成功 → 删的是当前档案时清掉指针", async () => {
    profiles.setActiveProfile("p1");
    data.deleteProfile.mockResolvedValue({ ok: true, value: undefined });
    await profiles.deleteProfile("p2");
    expect(profiles.getActiveProfileId()).toBe("p1");
    await profiles.deleteProfile("p1");
    expect(profiles.getActiveProfileId()).toBeNull();
  });

  it("deleteProfile 未登录 → reject 为 UnauthenticatedError，指针不动", async () => {
    profiles.setActiveProfile("p1");
    data.deleteProfile.mockResolvedValue({ ok: false, code: "unauthenticated" });
    await expect(profiles.deleteProfile("p1")).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(profiles.getActiveProfileId()).toBe("p1");
  });

  it("renameProfile / saveReading 解包 ActionResult", async () => {
    data.renameProfile.mockResolvedValue({ ok: true, value: undefined });
    await expect(profiles.renameProfile("p1", "新名")).resolves.toBeUndefined();
    expect(data.renameProfile).toHaveBeenCalledWith("p1", "新名");
    data.saveReading.mockResolvedValue({ ok: false, code: "unauthenticated" });
    await expect(profiles.saveReading("p1", "# x")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("getActiveProfile：指针优先，否则取最近一条；无档案返回 null", async () => {
    const a = { id: "a" };
    const b = { id: "b" };
    data.listProfiles.mockResolvedValue([a, b]);
    expect(await profiles.getActiveProfile()).toBe(a);
    profiles.setActiveProfile("b");
    expect(await profiles.getActiveProfile()).toBe(b);
    data.listProfiles.mockResolvedValue([]);
    expect(await profiles.getActiveProfile()).toBeNull();
  });
});
