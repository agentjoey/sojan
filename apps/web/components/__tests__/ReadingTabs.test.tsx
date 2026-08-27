import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ReadingTabs, type ReadingSection } from "../ReadingTabs";
import type { UnifiedChart } from "@sojan/core";

const SECTIONS: ReadingSection[] = [
  { key: "0-概览", title: "概览", body: "总起一句。" },
  { key: "1-命理", title: "命理", body: "命理结论一句。\n命理正文段落。", accent: "fire" },
  { key: "2-心理", title: "心理", body: "心理结论一句。\n心理正文段落。", accent: "water" },
  { key: "3-共振", title: "共振", body: "共振结论一句。\n共振正文段落。", accent: "metal" },
];

const CHART = {
  bazi: { dayMaster: "庚", dayMasterStrength: "weak" },
  ziwei: { palaces: [{ name: "命宫", majorStars: [{ name: "紫微" }], minorStars: [], adjectiveStars: [] }], birthMutagens: { 禄: "巨门", 权: "天梁", 科: "天同", 忌: "太阳" } },
  western: null,
} as unknown as UnifiedChart;

function renderTabs(streaming = false, locale: "zh" | "en" = "zh") {
  return render(
    <I18nProvider locale={locale}>
      <ReadingTabs sections={SECTIONS} chart={CHART} streaming={streaming} />
    </I18nProvider>,
  );
}

describe("ReadingTabs（3c）", () => {
  it("默认落在命理段，结论走大字（serif 29px / 1.42）", () => {
    renderTabs();
    const head = screen.getByTestId("reading-head");
    expect(head.textContent).toBe("命理结论一句。");
    expect(head.className).toContain("text-[29px]");
    expect(head.className).toContain("leading-[1.42]");
  });

  it("切 tab 后结论与正文都换了（不是只有高亮变）", () => {
    renderTabs();
    fireEvent.click(screen.getByTestId("reading-tab-心理"));
    expect(screen.getByTestId("reading-head").textContent).toBe("心理结论一句。");
    expect(screen.getByTestId("reading-body").textContent).toContain("心理正文段落");
  });

  it("当前 tab 有 2px 墨色下划线且 serif 700，非当前 tab 两者都没有", () => {
    renderTabs();
    const on = screen.getByTestId("reading-tab-命理");
    const off = screen.getByTestId("reading-tab-心理");
    expect(on.className).toContain("border-b-2");
    expect(on.className).toContain("font-bold");
    expect(off.className).not.toContain("border-b-2");
    expect(off.className).not.toContain("font-bold");
  });

  it("进度条按当前段推进 34/67/100", () => {
    renderTabs();
    const bar = screen.getByTestId("reading-progress-fill");
    expect(bar.getAttribute("style")).toContain("34%");
    fireEvent.click(screen.getByTestId("reading-tab-心理"));
    expect(screen.getByTestId("reading-progress-fill").getAttribute("style")).toContain("67%");
    fireEvent.click(screen.getByTestId("reading-tab-共振"));
    expect(screen.getByTestId("reading-progress-fill").getAttribute("style")).toContain("100%");
  });

  it("承重事实说明块存在，且上下都是细线", () => {
    renderTabs();
    const block = screen.getByTestId("load-bearing-block");
    expect(block.textContent).toContain("承重事实");
    const style = block.getAttribute("style") ?? "";
    expect(style).toContain("border-top");
    expect(style).toContain("border-bottom");
  });

  it("下一段入口：命理→心理，共振段（末段）不渲染入口", () => {
    renderTabs();
    expect(screen.getByTestId("reading-next").textContent).toContain("心理");
    fireEvent.click(screen.getByTestId("reading-tab-共振"));
    expect(screen.queryByTestId("reading-next")).toBeNull();
  });

  it("点下一段入口真的会切段（不是个死链）", () => {
    renderTabs();
    fireEvent.click(screen.getByTestId("reading-next"));
    expect(screen.getByTestId("reading-head").textContent).toBe("心理结论一句。");
  });

  it("共振段固定附「非硬等价」免责，其余段没有", () => {
    renderTabs();
    expect(screen.queryByTestId("resonance-note")).toBeNull();
    fireEvent.click(screen.getByTestId("reading-tab-共振"));
    expect(screen.getByTestId("resonance-note").textContent).toContain("非硬等价");
  });

  // C2-2 终审 C1：共振 tab 的 chips 是常量示例（"福德宫 ↔ 月亮 · 土星"），不是这份 chart
  // 真正排出的盘面事实——CHART fixture 的 western 就是 null，福德宫从没被读过。之前的
  // 条件只看 `cur.chips.length > 0`，会让「以上结论只依据下列已排定的盘面事实」这句断言
  // 在共振段把示例字符串当成本人盘面事实展示，构成反幻觉红线。共振段只留 resonance-note
  // 的「非硬等价」免责句诚实框定，不渲染 load-bearing-block。
  it("共振段不渲染承重事实块（示例 chip 不是本人盘面事实），但非硬等价免责句仍在", () => {
    renderTabs();
    fireEvent.click(screen.getByTestId("reading-tab-共振"));
    expect(screen.queryByTestId("load-bearing-block")).toBeNull();
    expect(screen.getByTestId("resonance-note").textContent).toContain("非硬等价");
  });

  it("摘要卡没有五行色顶边（第二种强调手法已删）", () => {
    renderTabs();
    const card = screen.getByTestId("reading-card");
    const style = card.getAttribute("style") ?? "";
    expect(style).not.toContain("--color-fire");
    expect(style).not.toContain("--color-water");
    expect(style).not.toContain("--color-metal");
  });

  it("正文同时带基类与 3c 修饰类（不是只剩 3c 类、基类被替换掉）", () => {
    renderTabs();
    const classes = screen.getByTestId("reading-body").className.split(/\s+/);
    expect(classes).toContain("reading-prose");
    expect(classes).toContain("reading-prose-3c");
  });

  // I1：此前断言只查 `not.toBe("")`，把三元 `{streaming ? t("chart.generating") : "—"}`
  // 整段挖成 `{"—"}`（streaming 语义完全消失）也照样全绿——用例名承诺的「给的是生成中
  // 提示」一个字没被测到。改断实际文案，并补一条对侧（非 streaming → "—"）钉死两侧。
  it("streaming 且当前段无内容时给的是生成中提示，不是空白", () => {
    render(
      <I18nProvider locale="zh">
        <ReadingTabs sections={[]} chart={CHART} streaming />
      </I18nProvider>,
    );
    expect(screen.getByTestId("reading-head").textContent).toBe("正在为你照见…");
  });

  it("非 streaming 且当前段无内容时给的是「—」占位，不是生成中提示", () => {
    render(
      <I18nProvider locale="zh">
        <ReadingTabs sections={[]} chart={CHART} streaming={false} />
      </I18nProvider>,
    );
    expect(screen.getByTestId("reading-head").textContent).toBe("—");
  });

  it("心理段在 western 为 null（不知时辰/缺出生地降级路径）时：chip 列表与承重事实块都不渲染，但结论与正文仍在", () => {
    // CHART fixture 的 western 本就是 null——xinChips() 对此返回 []，
    // 使得 chip 列表与 load-bearing-block 共用的 `cur.chips.length > 0` 双双为假。
    renderTabs();
    fireEvent.click(screen.getByTestId("reading-tab-心理"));
    expect(screen.queryByTestId("reading-chips")).toBeNull();
    expect(screen.queryByTestId("load-bearing-block")).toBeNull();
    expect(screen.getByTestId("reading-head").textContent).toBe("心理结论一句。");
    expect(screen.getByTestId("reading-body").textContent).toContain("心理正文段落");
  });
});
