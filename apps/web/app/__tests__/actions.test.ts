import { describe, it, expect } from "vitest";
import { getCurrentSolarHou } from "@sojan/core";
import { solarHouAction } from "@/app/actions";

/**
 * `solarHouAction`（owner 打磨批指令 2）：七十二候的 server action——首页今日卡/
 * 候标尺需要按**访客本地日期**算候，但 `getCurrentSolarHou` 依赖 lunar-typescript，
 * 不能进 `/` 的客户端 chunk（app/page.tsx 顶部注释记的 bundle 教训），所以走
 * 服务端算。这里钉住它确实按入参日期算，而不是忽略入参返回服务端「当下」。
 */
describe("solarHouAction：按访客本地日期算七十二候", () => {
  it("返回与同日 getCurrentSolarHou(new Date(...)) 逐字段一致", async () => {
    const hou = await solarHouAction("2026-02-04");
    expect(hou).toEqual(getCurrentSolarHou(new Date(2026, 1, 4)));
  });

  it("不同日期给出不同结果（防恒真/防忽略入参）", async () => {
    const a = await solarHouAction("2026-02-04");
    const b = await solarHouAction("2026-08-28");
    expect(a).not.toEqual(b);
  });
});
