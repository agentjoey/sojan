import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearLocalCaches } from "../local-cache";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("clearLocalCaches", () => {
  it("清掉所有 zhaojian.* localStorage 键，保留其他键", () => {
    localStorage.setItem("zhaojian.activeProfileId", "p1");
    localStorage.setItem("zhaojian.timeline.p1.2026", "{}");
    localStorage.setItem("zhaojian.polish.p1.2026-08-28", "x");
    localStorage.setItem("other.key", "keep");
    localStorage.setItem("xzhaojian.nope", "keep");
    clearLocalCaches();
    expect(localStorage.length).toBe(2);
    expect(localStorage.getItem("other.key")).toBe("keep");
    expect(localStorage.getItem("xzhaojian.nope")).toBe("keep");
  });

  it("清掉 sessionStorage 的 zhaojian.readingDraft，保留其他键", () => {
    sessionStorage.setItem("zhaojian.readingDraft", "{}");
    sessionStorage.setItem("other", "keep");
    clearLocalCaches();
    expect(sessionStorage.getItem("zhaojian.readingDraft")).toBeNull();
    expect(sessionStorage.getItem("other")).toBe("keep");
  });

  it("存储访问抛异常时不外抛", () => {
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    localStorage.setItem("zhaojian.a", "1");
    expect(() => clearLocalCaches()).not.toThrow();
    spy.mockRestore();
  });
});
