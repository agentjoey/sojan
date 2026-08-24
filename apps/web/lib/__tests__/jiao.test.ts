import { describe, it, expect } from "vitest";
import { throwJiao } from "../jiao";
import { omenOf } from "@sojan/core";

describe("throwJiao：真随机掷两枚筊", () => {
  it("返回的 omen 与 blocks 自洽（omen 必须由 blocks 推出，不能各算各的）", () => {
    for (let i = 0; i < 50; i++) {
      const r = throwJiao();
      expect(r.omen).toBe(omenOf(r.blocks));
    }
  });

  it("blocks 恰好两枚，每枚都是合法落地面", () => {
    const r = throwJiao();
    expect(r.blocks).toHaveLength(2);
    for (const f of r.blocks) expect(["仰", "俯"]).toContain(f);
  });

  it("确实是随机的：200 次里三种筊象都出现过（确定性实现会让这条红）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(throwJiao().omen);
    expect(seen.size).toBe(3);
  });

  it("圣筊出现率显著高于另两者（一俯一仰有两种组合，理论 50%）——200 次里圣筊应过 30%", () => {
    let sheng = 0;
    for (let i = 0; i < 200; i++) if (throwJiao().omen === "圣筊") sheng++;
    expect(sheng).toBeGreaterThan(60);
  });
});
