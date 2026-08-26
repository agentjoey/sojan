import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** flag 在模块加载时求值，所以每个用例都要 resetModules + 动态 import。 */
async function loadNav(flags: { spirit?: string; fengshui?: string; dream?: string }) {
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", flags.spirit ?? "");
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", flags.fengshui ?? "");
  vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", flags.dream ?? "");
  return await import("../nav");
}

describe("lib/nav：导航目录与 flag 门控的单一事实源", () => {
  it("无 flag 门控的项恒可用", async () => {
    const nav = await loadNav({});
    expect(nav.isNavEnabled("calendar")).toBe(true);
    expect(nav.isNavEnabled("chart")).toBe(true);
    expect(nav.isNavEnabled("profiles")).toBe(true);
    expect(nav.isNavEnabled("reading")).toBe(true);
  });

  it("受门控的三项随 flag 开关", async () => {
    const off = await loadNav({});
    expect(off.isNavEnabled("spirit")).toBe(false);
    expect(off.isNavEnabled("fengshui")).toBe(false);
    expect(off.isNavEnabled("dream")).toBe(false);
    vi.resetModules();
    const on = await loadNav({ spirit: "1", fengshui: "1", dream: "1" });
    expect(on.isNavEnabled("spirit")).toBe(true);
    expect(on.isNavEnabled("fengshui")).toBe(true);
    expect(on.isNavEnabled("dream")).toBe(true);
  });

  it("flag 只认字面量 '1'（与全仓既有判据一致，'true'/'0' 都算关）", async () => {
    const nav = await loadNav({ spirit: "true", fengshui: "0", dream: "1" });
    expect(nav.isNavEnabled("spirit")).toBe(false);
    expect(nav.isNavEnabled("fengshui")).toBe(false);
    expect(nav.isNavEnabled("dream")).toBe(true);
  });

  it("enabled() 按给定顺序过滤，且保序", async () => {
    const nav = await loadNav({ fengshui: "1" });
    const ids = nav.enabled(["calendar", "spirit", "fengshui", "chart"]).map((i) => i.id);
    expect(ids).toEqual(["calendar", "fengshui", "chart"]);
  });

  it("目录里每一项都有 href / char / labelKey", async () => {
    const nav = await loadNav({});
    for (const [id, item] of Object.entries(nav.NAV_CATALOG)) {
      expect(item.href, id).toMatch(/^\//);
      expect(item.char, id).toHaveLength(1);
      expect(item.labelKey, id).toMatch(/^nav\./);
    }
  });
});
