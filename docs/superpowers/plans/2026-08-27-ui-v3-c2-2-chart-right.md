# UI v3 C2-2：命盘右列（三段式解读 + 紫微棋盘 + 三块归位）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/chart` 右列按设计包 `3c`（三段式解读）与 `6b`（紫微棋盘）重建，并把西方盘 / 自我画像 / 当下时序三块按新设计语言归位；顺带清掉 C2-1 终审的 8 条延后项。

**Architecture:** 改造两个既有组件（`ReadingTabs` / `ZiweiBoard`），重排页面右列三块，最后做一轮延后项清理。**不新建组件、不动数据流。**

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind 4（断点即 `@theme` 令牌，单位一律 rem）· vitest + @testing-library/react（jsdom，**无布局**）

**Spec:** `docs/superpowers/specs/2026-08-27-ui-v3-c2-chart-design.md`（§5 = `3c`，§6 = `6b`，§8 = 保留三块）

## Global Constraints

- **强调手法唯一**：全站只有 `Emphasis`（`components/ui.tsx:140`）。零阴影；无新增裸十六进制（一律 CSS 令牌）；圆角 ≤8px；朱砂是唯一强调色。
- **展示层零推算**：命理量一律来自 `@sojan/core`；**四化绝不许在展示层算**。
- **数据流逐字不动**：`generate`/`streaming`/`err`/`timeline`/`loadTimeline` 及按 (档案,年) 缓存、解读一次生成持久化、`getQuestionnaire`/`tgGetQuestionnaire` 的 TG 分支。
- **Telegram 冻结**：`TG_ENTRIES`、`{inTg && …}`/`{!inTg && …}`、`app/__tests__/page.test.tsx` 既有断言逐字不变。
- **响应式一律 Tailwind 断点类**，禁 `matchMedia`/`window.innerWidth`。**断点单位一律 rem**（`--breakpoint-xl` = `75rem`，**不许改回 px**——Tailwind 4 无法跨单位排序 media 块，混单位会让低断点反压高断点，且 class-name 断言抓不到）。桌面专有样式必须断点门控；`xl:` 与更低断点在同一属性上语义互斥处用 `max-xl:`。
- **hover 只允许改 `border-color` 与箭头颜色**，不得投影/位移/放大（`06-desktop` §4）。
- **命理术语保持中文**（`ELEMENT_LABEL`、干支、星曜、纳音、生肖）；UI chrome 走 `useT()`。
- i18n 文件多任务共用：**追加** key，不得整段覆写或改他人 key。
- **基线不许变差**：core **192** / llm **279** 不变；web **763** → 期望增加新增用例数；`pnpm exec tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` = **7**；lint **2 errors / 17 warnings**；`pnpm --filter @sojan/web build` 通过。
- **每条断言写之前先回答**：「如果这条实现被回退，它会不会变红？」

## 已核实的现状（写计划时逐个 grep 过，可直接依赖）

| 标识符 | 位置 | 状态 |
|---|---|---|
| `ReadingTabs` | `apps/web/components/ReadingTabs.tsx`（136 行） | **零 `data-testid`、零测试文件** |
| `ZiweiBoard` | `apps/web/components/charts/ZiweiBoard.tsx`（331 行） | 已有 `ziwei-grid` / `ziwei-center` / `palace-cell-{name}` / `ziwei-palace-{branch}` / `mutagen-legend` |
| `MutagenLegend`（四化图例） | 同文件 `:222-233` | **已存在**，`6b` 这一项无需新建 |
| `CenterCell` 的三项 facts | 同文件 `:238-243` | **已显示 命宫/身宫/五行局**——见 R-C2-2-1 |
| `PalaceCell` 格高 | 同文件 `:71` `minHeight: 78` | `6b` 要求 **≥84** |
| `.reading-prose` | `apps/web/app/globals.css:367` | `14.5px / 1.95`，**8 个消费方跨 6 文件**——见 R-C2-2-2 |
| 五行语义色令牌 | `globals.css:70-73` | `--color-fire/metal/water` 存在 |
| `Chip` / `Emphasis` / `Card` / `MutagenTag` | `components/ui.tsx:165 / 140 / 255 / 281` | 均存在 |
| `splitHead` / `splitSections` | `ReadingTabs.tsx:19` / `app/chart/page.tsx:27` | 均存在 |
| M8 hover 位移 | `app/chart/page.tsx:262` `group-hover:translate-x-1` | 待修 |
| 既有 i18n key | `zh.ts`/`en.ts` 的 `chart` 段 | `tabMingli`/`tabPsych`/`tabResonance`/`kickerMingli`/`kickerPsych`/`kickerResonance`/`resonanceNote`/`resonanceExampleChip`/`readingSaved`/`generating` 均存在 |

## 计划级裁定（动工前已定，实施者照做）

**R-C2-2-1（`6b` 页首行不做）**：设计稿 `6b` 要一条页首「紫微 / 十二宫棋盘 / 命宫在丑 · 身宫同度 · 水二局 · 中州派」。但 `CenterCell` **已经在棋盘中央显示了命宫/身宫/五行局这三项**，再加页首行是逐字重复；而且棋盘嵌在 `/chart` 的 `ChartBlock`（标签「紫微」）之下，再来一个标题是冗余 chrome。**裁定：不加页首行**，只补 `CenterCell` 表达不了的两项——**流派标注**（⚠️ 取自 `ziwei.school`，**不许硬编码「中州派」**）与 **「身宫同度」**（`bodyPalaceBranch === soulPalaceBranch` 时），做成 `ChartBlock` 标签下的一行副标题。

**R-C2-2-2（不动共用的 `.reading-prose`）**：`3c` 要求正文 15px/2.05，而 `.reading-prose` 现为 14.5px/1.95 且被 **8 处消费**（风水 3 处、解梦、掷筊、AskToday、时序、ReadingTabs）。改基类会把新排版推给尚未重建的 C3/C4 页面，产生半迁移的不一致。**裁定：新增修饰类 `.reading-prose-3c` 只作用于 `ReadingTabs`**，基类不动；C3/C4 重建那些页面时再统一。

**R-C2-2-3（摘要卡的五行色顶边必须去掉）**：`ReadingTabs.tsx:113` 的 `borderTop: 2px solid var(--color-fire|water|metal)` 是**第二种强调手法**——A 块当初正是以「与 `Emphasis` 冲突的第二种强调」为由删掉了 `Card.topAccent`，而这处同型写法被漏下了。**裁定：删除该顶边**，段落身份改由「眉标 + 文字 tab 的下划线」承担（`3c` 本来就是这么设计的）。

---

### Task 1: `ReadingTabs` 按 `3c` 重建（含从零建测试）

**Files:**
- Modify: `apps/web/components/ReadingTabs.tsx`
- Modify: `apps/web/app/globals.css`（新增 `.reading-prose-3c`）
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`en.ts`
- Create: `apps/web/components/__tests__/ReadingTabs.test.tsx`（**该文件不存在，从零建**）

**Interfaces:**
- Consumes: `ReadingSection`（同文件已导出的 `{ key, title, body, accent? }`）、`UnifiedChart`、`Chip`（`components/ui.tsx:165`）、`Markdown`
- Produces: `<ReadingTabs sections chart streaming />`——**props 签名不变**，`app/chart/page.tsx` 的调用处一字不改

**`3c` 的目标形态**（`design-guide/03-screens.md` 原文）：
> 顶部 2px 进度条（当前段 34%/67%/100%）→ 文字 tab（命理/心理/共振，当前 serif 700 + 2px 墨色下划线）→ 眉标 10.5px → **结论大字** serif 29px/1.42 → 三枚 chip（承重事实）→ 正文 15px/2.05 分段 → 「承重事实」说明块（上下细线）→ 下一段入口 → 保存提示。共振段固定附「※ 仅在内在世界高置信锚点谈共振，非硬等价」。

逐项对照现状：

| 项 | 现状 | 要改成 |
|---|---|---|
| 进度条 | `h-[3px]` | **2px** |
| tab | chip 式按钮（`--color-tint` 底 + 圆角 + 边框） | **文字 tab**：当前项 serif 700 + **2px 墨色下划线**；非当前项 muted、无底无框 |
| 眉标 | 11px | **10.5px** |
| 结论 | serif 21px | **serif 29px / 行高 1.42** |
| chip | 裸 `<span>` 手写样式 | 用 `Chip` 原语 |
| 正文 | `.reading-prose`（14.5/1.95） | `.reading-prose-3c`（**15px / 2.05**，见 R-C2-2-2） |
| 承重事实说明块 | **无** | 新增：上下 1px 细线 + 10.5px 说明文字 |
| 下一段入口 | **无** | 新增：命理→心理→共振，末段不渲染 |
| 五行色顶边 | 有（第二种强调） | **删除**（见 R-C2-2-3） |

- [ ] **Step 1: 加 i18n key**

`zh.ts` 的 `chart` 段追加：

```ts
    loadBearingTitle: "承重事实",
    loadBearingNote: "以上结论只依据下列已排定的盘面事实，不含模型自行推算。",
    nextSection: "下一段 · {name} →",
```

`en.ts` 同名 key：

```ts
    loadBearingTitle: "Load-Bearing Facts",
    loadBearingNote: "The reading above rests only on the chart facts listed here — nothing inferred by the model.",
    nextSection: "Next · {name} →",
```

⚠️ `t(key, vars)` 的插值实现是 `interpolate()`（`lib/i18n/I18nProvider.tsx:36-45`，`/\{([^}]+)\}/g` 替换，vars 为 `Record<string, string | number>`），`{name}` 可直接传字符串。

- [ ] **Step 2: 加 `.reading-prose-3c`**

`globals.css` 里紧跟 `.reading-prose` 之后加：

```css
/* 3c 三段式解读专用排版（15px / 2.05）。
   ⚠️ 刻意**不改** `.reading-prose` 基类——它有 8 个消费方（风水 3 处、解梦、掷筊、
   AskToday、当下时序、本组件），改基类会把新排版推给尚未按 UI v3 重建的
   C3/C4 页面，产生半迁移的不一致。C3/C4 重建那些页面时再统一到一处。 */
.reading-prose-3c {
  font-size: 15px;
  line-height: 2.05;
}
```

- [ ] **Step 3: 写失败测试（从零建文件）**

```tsx
// apps/web/components/__tests__/ReadingTabs.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
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

  it("摘要卡没有五行色顶边（第二种强调手法已删）", () => {
    renderTabs();
    const card = screen.getByTestId("reading-card");
    const style = card.getAttribute("style") ?? "";
    expect(style).not.toContain("--color-fire");
    expect(style).not.toContain("--color-water");
    expect(style).not.toContain("--color-metal");
  });

  it("正文用 3c 专用排版类，不是共用基类单独出现", () => {
    renderTabs();
    expect(screen.getByTestId("reading-body").className).toContain("reading-prose-3c");
  });

  it("streaming 且当前段无内容时给的是生成中提示，不是空白", () => {
    render(
      <I18nProvider locale="zh">
        <ReadingTabs sections={[]} chart={CHART} streaming />
      </I18nProvider>,
    );
    expect(screen.getByTestId("reading-head").textContent).not.toBe("");
  });
});
```

⚠️ 上面 `CHART` 这个 fixture 要能喂饱 `liChips()`/`xinChips()`（`ReadingTabs.tsx:29-50`）。**动手前先读那两个函数**，按它们实际访问的字段补齐 fixture；`western: null` 时 `xinChips` 返回空数组，是合法路径。

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test ReadingTabs`
Expected: FAIL —— 找不到 `reading-head` 等 testid（组件尚未加）

- [ ] **Step 5: 改造组件**

按上表逐项改。要点：

```tsx
// 文字 tab（3c）：当前项 serif 700 + 2px 墨色下划线；非当前项 muted、无底无框。
// ⚠️ 用类名表达状态（不用内联 style），断言才抓得住；且 hover 只改文字色。
<button
  key={item.k}
  data-testid={`reading-tab-${item.k}`}
  onClick={() => setTab(item.k)}
  className={cn(
    "px-1 pb-2 font-serif text-[15px] transition-colors duration-200",
    on ? "border-b-2 border-[var(--color-ink)] font-bold text-ink" : "text-muted hover:text-ink",
  )}
>
  {item.label}
</button>
```

```tsx
// 承重事实说明块（上下细线）
<div
  data-testid="load-bearing-block"
  className="mt-5 py-3"
  style={{ borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }}
>
  <div className="text-[10.5px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
    {t("chart.loadBearingTitle")}
  </div>
  <p className="mt-2 text-[12px] leading-[1.7]" style={{ color: "var(--color-muted)" }}>
    {t("chart.loadBearingNote")}
  </p>
</div>
```

```tsx
// 下一段入口：命理→心理→共振，末段不渲染
const ORDER = ["命理", "心理", "共振"] as const;
const nextTab = ORDER[ORDER.indexOf(tab) + 1];
…
{nextTab && (
  <button data-testid="reading-next" onClick={() => setTab(nextTab)}
    className="mt-4 text-[13px] text-muted transition-colors duration-200 hover:text-ink">
    {t("chart.nextSection", { name: TABS.find((x) => x.k === nextTab)!.label })}
  </button>
)}
```

⚠️ **删掉摘要卡的 `borderTop: 2px solid var(--color-…)`**（R-C2-2-3）。卡片保留 `1px solid var(--color-line)` 的细线描边即可。
⚠️ 结论大字加 `data-testid="reading-head"`，正文容器加 `data-testid="reading-body"` 与 `reading-prose-3c` 类，卡片加 `data-testid="reading-card"`，进度条填充加 `data-testid="reading-progress-fill"`，共振免责加 `data-testid="resonance-note"`。
⚠️ **`liChips`/`xinChips` 里的 `SIGN_CN`/`STRENGTH_CN` 是命理术语，两个 locale 都保持中文，不要「翻译」。**
⚠️ chip 改用 `Chip` 原语时注意它是 `Omit<…, "style">`——传 `style` 是编译错误。

- [ ] **Step 6: 跑测试 + mutation 复验**

Run: `pnpm --filter @sojan/web test ReadingTabs`
Expected: PASS（11 条）

Mutation 复验（逐条做，实际输出写进报告）：
- 把「下一段入口」的末段判断去掉（共振段也渲染入口）→ 第 6 条必红；
- 把下一段入口的 `onClick` 去掉 → 第 7 条必红（这条防的是「入口是个死链」）；
- 把五行色顶边加回去 → 第 9 条必红；
- 把 tab 的 `border-b-2` 去掉 → 第 3 条必红。

- [ ] **Step 7: 跑全量确认无回归**

`app/chart/__tests__/page.test.tsx` 里有断言依赖解读区块，确认仍绿。

```bash
pnpm --filter @sojan/core test && pnpm --filter @sojan/llm test && pnpm --filter @sojan/web test
pnpm exec tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -c "error TS"   # 期望 7
pnpm --filter @sojan/web lint                                                # 期望 2 errors / 17 warnings
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/ReadingTabs.tsx apps/web/components/__tests__/ReadingTabs.test.tsx apps/web/app/globals.css apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "feat(chart): 三段式解读按 3c 重建（文字 tab/结论大字/承重事实块/下一段入口）"
```

---

### Task 2: `ZiweiBoard` 按 `6b` 收尾

**Files:**
- Modify: `apps/web/components/charts/ZiweiBoard.tsx`
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`en.ts`
- Modify: `apps/web/components/charts/__tests__/ZiweiBoard.test.tsx`

**Interfaces:**
- Consumes: `ZiweiChart`（`@sojan/core`）
- Produces: `<ZiweiBoard ziwei={chart.ziwei} />`——**props 不变**

`6b` 还差三项（图例已存在，见「已核实的现状」）：

1. **格高 ≥84px**：`ZiweiBoard.tsx:71` 的 `minHeight: 78` → `84`。
2. **副标题一行**（R-C2-2-1）：流派 + 身宫同度标注。**不加页首行**——`CenterCell` 已显示命宫/身宫/五行局三项，再加是逐字重复。
   ⚠️ **流派不许硬编码「中州派」**：`ZiweiChartSchema` 有 `school: z.enum(["default","zhongzhou"]).default("zhongzhou")`（`types/chart.ts:63`，由 `ziwei/index.ts:53` 从 `algorithm` 写入），**必须从 `ziwei.school` 取**。硬编码会在 owner 日后切 `algorithm: "default"` 时静默说谎。**这条要有断言守**（见测试第一条的补充）。
3. **交互说明一句**：告诉用户可以点宫位看详情。

- [ ] **Step 1: 加 i18n key**

`zh.ts`：
```ts
    ziweiSchoolZhongzhou: "中州派",
    ziweiSchoolDefault: "全书派",
    bodyPalaceSame: "身宫同度",
    ziweiBoardHint: "点任一宫查看该宫详情；空宫显示借星。",
```
`en.ts`：
```ts
    ziweiSchoolZhongzhou: "Zhongzhou School",
    ziweiSchoolDefault: "Quanshu School",
    bodyPalaceSame: "Body palace conjunct",
    ziweiBoardHint: "Tap any palace for its detail; empty palaces show borrowed stars.",
```

- [ ] **Step 2: 写失败测试**

在既有 `ZiweiBoard.test.tsx` 追加（**先读该文件既有的 fixture 与 render 辅助，沿用它们**）：

```tsx
it("副标题标注流派；身宫与命宫同支时标「身宫同度」", () => {
  // ⚠️ renderBoard 的实际签名是 `renderBoard(chart: ZiweiChart = ziwei)`——吃整份 chart，
  // 不是 overrides 对象。用扩展既有 fixture 的写法。
  renderBoard({ ...ziwei, soulPalaceBranch: "丑", bodyPalaceBranch: "丑" });
  const sub = screen.getByTestId("ziwei-subtitle");
  expect(sub.textContent).toContain("中州派");
  expect(sub.textContent).toContain("身宫同度");
});

it("流派取自 chart.school，不是硬编码（切到 default 派要跟着变）", () => {
  renderBoard({ ...ziwei, school: "default" });
  const sub = screen.getByTestId("ziwei-subtitle");
  expect(sub.textContent).not.toContain("中州派");
  expect(sub.textContent).toContain("全书派");
});

it("身宫与命宫不同支时不标「身宫同度」（防无条件渲染）", () => {
  renderBoard({ ...ziwei, soulPalaceBranch: "丑", bodyPalaceBranch: "未" });
  expect(screen.getByTestId("ziwei-subtitle").textContent).not.toContain("身宫同度");
});

it("格高 ≥84px（6b 要求）", () => {
  renderBoard();
  const cell = screen.getByTestId("ziwei-palace-丑");
  const mh = (cell.getAttribute("style") ?? "").match(/min-height:\s*(\d+)px/);
  expect(mh).not.toBeNull();
  expect(Number(mh![1])).toBeGreaterThanOrEqual(84);
});

it("有交互说明一句", () => {
  renderBoard();
  expect(screen.getByTestId("ziwei-hint").textContent).toContain("点任一宫");
});
```

⚠️ 已核实：`ZiweiBoard.test.tsx` 里的辅助是 `renderBoard(chart: ZiweiChart = ziwei)`（**吃整份 chart，不是 overrides**），模块级 fixture 叫 `ziwei`，另有 `makePalace(name, branch, overrides)`。用 `{ ...ziwei, … }` 覆写即可，**别改这些辅助的签名**（其余既有用例依赖它们）。
⚠️ 第二条用例是必须的：只有第一条时，一个无条件渲染「身宫同度」的实现也能过。

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test ZiweiBoard`
Expected: FAIL —— 找不到 `ziwei-subtitle` / `ziwei-hint`

- [ ] **Step 4: 实现**

```tsx
// 在 ZiweiBoard 返回的最外层 <div className="flex flex-col gap-4"> 内、ziwei-grid 之前插入：
<p data-testid="ziwei-subtitle" className="text-[11px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
  {ziwei.bodyPalaceBranch === ziwei.soulPalaceBranch && <>{t("chart.bodyPalaceSame")} · </>}
  {t(ziwei.school === "zhongzhou" ? "chart.ziweiSchoolZhongzhou" : "chart.ziweiSchoolDefault")}
</p>
```

```tsx
// 在 <MutagenLegend /> 之后插入：
<p data-testid="ziwei-hint" className="text-[11px] leading-[1.7]" style={{ color: "var(--color-muted)" }}>
  {t("chart.ziweiBoardHint")}
</p>
```

`PalaceCell` 的 `minHeight: 78` → `minHeight: 84`。

⚠️ **不要改棋盘的落位逻辑**（`BRANCH_CELL` 按 `palace.branch` 落位是 B 块专门修的，改回数组顺序会让宫位错位）。
⚠️ **不要动 `PalaceDetail` 的确定性文案拼装**——不许引入 LLM，这是反幻觉红线。
⚠️ 不要新增第二种强调手法：选中态的 `inset box-shadow` 朱砂描边是既有的「细线格语言」变体，保持原样。

- [ ] **Step 5: 跑测试 + mutation 复验**

Run: `pnpm --filter @sojan/web test ZiweiBoard`
Expected: PASS

Mutation：把「身宫同度」改成无条件渲染 → 第二条必红；把 `minHeight` 改回 78 → 第三条必红。输出写进报告。

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/charts/ZiweiBoard.tsx apps/web/components/charts/__tests__/ZiweiBoard.test.tsx apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "feat(chart): 紫微棋盘按 6b 收尾（格高 84 + 流派/同度副标题 + 交互说明）"
```

---

### Task 3: 右列三块归位 + M8 hover 修正

**Files:**
- Modify: `apps/web/app/chart/page.tsx`
- Modify: `apps/web/app/chart/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: Task 1/2 改造后的 `ReadingTabs` / `ZiweiBoard`（**props 均未变**）
- Produces: 无（终端页面）

要做三件事：

1. **M8：修 hover 位移**。`app/chart/page.tsx:262` 的 `group-hover:translate-x-1` 违反「hover 只改 `border-color` 与箭头色，不得投影/位移/放大」（`06-desktop` §4）。改成只变色：把 `transition-transform … group-hover:translate-x-1` 换成 `transition-colors duration-200 group-hover:text-…`（箭头色）。
2. **M7：结构清理**。`<section id="reading-tabs">` 里直接套了 `ChartBlock` 的 `<section>`——把 id 直接给 `ChartBlock`（给它加 `id?: string` prop），去掉外层冗余 `<section>`；`ziwei-board` 同理。⚠️ **`reading-tabs-anchor` / `ziwei-board-anchor` 两个 testid 必须保留**，锚点一致性断言依赖它们。
3. **西方盘 / SelfPortrait / 时序按新语言重排**：三块继续用 `ChartBlock`（C2-1 已把它的 `borderTop` 从内联 style 改成类），检查在 528px 右列里的表现；**数据流一行不改**。

- [ ] **Step 1: 写失败测试**

在 `app/chart/__tests__/page.test.tsx` 追加：

```tsx
it("解读按钮 hover 只变色，不位移（06-desktop §4）", async () => {
  await renderChart();
  const arrow = screen.getByTestId("generate-arrow");
  expect(arrow.className).not.toContain("translate-x");
  expect(arrow.className).not.toContain("scale-");
});

it("锚点目标的 id 直接落在 ChartBlock 上，没有多余的外层 section", async () => {
  await renderChart();
  const el = document.getElementById("reading-tabs");
  expect(el).not.toBeNull();
  expect(el!.tagName.toLowerCase()).toBe("section");
  // 外层不该再套一个 section 只为挂 id
  expect(el!.parentElement?.tagName.toLowerCase()).not.toBe("section");
});
```

⚠️ `generate-arrow` 这个 testid **需要你在 page.tsx 里加**（现在那个 `<span>✦</span>` 没有 testid）。
⚠️ **先读 `page.test.tsx` 既有的 `renderChart` 辅助与 mock**，沿用，不要另造。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test app/chart`
Expected: FAIL

- [ ] **Step 3: 实现**

给 `ChartBlock` 加 `id?: string`：

```tsx
function ChartBlock({ id, label, children, className }: { id?: string; label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("mt-10 border-t border-[var(--color-line)] pt-8", className)}>
```

右列改成（去掉外层冗余 `<section>`，testid 挪到 `ChartBlock` 上——**给 `ChartBlock` 再加一个 `data-testid` 透传，或把 testid 放在其内层容器**，两种都行，但**锚点一致性断言必须仍能通过**）：

```tsx
<ChartBlock id="reading-tabs" data-testid="reading-tabs-anchor" label={t("chart.readingTitle")} className="xl:mt-0 xl:border-t-0 xl:pt-0">
  {/* 原有解读块逐字不变 */}
</ChartBlock>
<ChartBlock id="ziwei-board" data-testid="ziwei-board-anchor" label={t("chart.ziweiTitle")}>
  <ZiweiBoard ziwei={chart.ziwei} />
</ChartBlock>
```

箭头：
```tsx
<span data-testid="generate-arrow" className="text-[22px] transition-colors duration-200">✦</span>
```

⚠️ **`generate` / `streaming` / `err` / `timeline` / `loadTimeline` 及其缓存逻辑逐字不动。**
⚠️ **Telegram 分支逐字不动。**

- [ ] **Step 4: 跑全量 + 构建**

```bash
pnpm --filter @sojan/core test && pnpm --filter @sojan/llm test && pnpm --filter @sojan/web test
pnpm exec tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -c "error TS"   # 期望 7
pnpm --filter @sojan/web lint                                                 # 期望 2 errors / 17 warnings
pnpm --filter @sojan/web build                                                # 期望通过
```

- [ ] **Step 5: 三档断点自查（不许跳过）**

起本地服务（**端口 3030**——3000 被本机 Hermes WhatsApp bridge 长期占用），在 **402px / 900px / 1280px** 三个宽度各看一眼 `/chart`，确认：右列在 528px 下解读正文不溢出、紫微棋盘每格约 127px 不折行崩坏；<1200px 单列无桌面样式残留。

⚠️ **C2-1 的终审有四条 Important 是「jsdom 看不见、只有真实浏览器能发现」的版式缺陷**（免责句让整页多滚 116px、页头与日主行零间距、右列顶部多余横线、大运块被吸进四柱块）。这一档自查是它们唯一的拦截点。**把三档的实际观察写进报告，不要只写「看过了，没问题」。**

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/chart/page.tsx apps/web/app/chart/__tests__/page.test.tsx
git commit -m "fix(chart): 右列三块归位 + hover 位移改为只变色 + 锚点 id 落到 ChartBlock"
```

---

### Task 4: C2-1 延后项清理

**Files:**
- Modify: `apps/web/components/__tests__/primitives.test.tsx`（M3）
- Modify: `packages/core/src/bazi/nayin.ts`、`apps/web/components/chart/ChartIdentity.tsx`（M5）
- Modify: `apps/web/components/chart/ChartToc.tsx`（M7 的 aria-label）
- Modify: `apps/web/components/chart/__tests__/LuckPillars.test.tsx`（M9）
- Modify: `apps/web/app/chart/__tests__/page.test.tsx`（R9）

背景：这五条来自 C2-1 全分支终审，已记在 backlog `EP-uiv3-c2-1-defer`，判为「不阻塞、留到 C2-2」。

- [ ] **Step 1: M3 —— `PillChip.emphasis` 补真侧测试**

`primitives.test.tsx` 里 `PillChip` 目前只测默认（假）侧；同文件 `Chip` 用 `rerender` 测了真假两侧。照 `Chip` 那条补：

```tsx
it("PillChip emphasis 真侧：描边与文字都转朱砂", () => {
  const { getByTestId, rerender } = render(<PillChip data-testid="pc">2026</PillChip>);
  expect(getByTestId("pc").getAttribute("style")).not.toContain("--color-cinnabar");
  rerender(<PillChip data-testid="pc" emphasis>2026</PillChip>);
  expect(getByTestId("pc").getAttribute("style")).toContain("--color-cinnabar");
});
```

⚠️ **先读 `primitives.test.tsx` 里 `Chip` 那条的实际写法**，沿用同样的 import 与断言风格。

- [ ] **Step 2: M5 —— 三处不可达守卫加注释**

`LuckPillars.tsx` 已立了先例注释（「与下方 `idx<0` 守卫重复，为提前退出与可读性保留」）。照同样口径给这三处各加一行：

- `packages/core/src/bazi/nayin.ts` 的 `if (zhiIndex < 1) return null;` —— 能过 `LunarUtil.NAYIN[gz]` 的必是 60 甲子成员，其地支必合法，故此分支不可达；保留为防御。
- 同文件 `if (!zodiac) return null;` —— 同上。
- `apps/web/components/chart/ChartIdentity.tsx` 的 `Number.isFinite(birthYear)` 假侧 —— `normalizedSolarTime` 由 `packages/core/src/normalize.ts` 保证 `YYYY-MM-DD HH:mm` 前缀，故不可达；保留为防御。

⚠️ **只加注释，不要删守卫，也不要为它们硬凑测试用例**——注释的目的正是防止后人做这两件事之一。

- [ ] **Step 3: M7 —— `ChartToc` 的 `<nav>` 补 `aria-label`**

与 `AppShell` 的侧栏 `<nav>` 并存时，读屏会报两个未命名 navigation。加 `aria-label={t("chart.tocAria")}`，并在 `zh.ts`/`en.ts` 追加 `tocAria: "命盘页内导航"` / `tocAria: "Chart page sections"`。

- [ ] **Step 4: M9 —— `LuckPillars` 补 label 与 range 断言**

现有用例只断 `pillar` 干支；`luckPrev`/`luckCurrent`/`luckNext` 三个标签互换、或 `luckRange` 插值坏成字面 `{startAge}`，全部照绿。追加：

```tsx
it("三格的标签与年龄区间都正确（防标签互换与插值坏掉）", () => {
  renderAt(bazi({ currentLuckPillar: "丁卯" }));
  const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent ?? "");
  expect(rows[0]).toContain("前一运");
  expect(rows[1]).toContain("现行");
  expect(rows[2]).toContain("下一运");
  expect(rows[1]).toContain("23 岁起 · 2016");
  expect(rows.join("")).not.toContain("{startAge}");
});
```

⚠️ **先读该文件既有的 `renderAt`/`bazi` 辅助与 `PILLARS` fixture**，按实际值校对「23 岁起 · 2016」这串，**不要照抄我这里的数字**。

- [ ] **Step 5: R9 —— 时序缓存断言改为可独立证明**

`app/chart/__tests__/page.test.tsx` 的时序缓存用例里，`localStorage` 断言排在 `findByText` 之后——注释掉时序 JSX 会先让 `findByText` 变红、走不到缓存那行，**故该断言未被独立 mutation 证明**（它本身有区分力，只是证据没隔离它）。

**修法**：把 `localStorage` 断言移到 `findByText` **之前**，或拆成独立用例。改完做 mutation 复验：**只删 `localStorage.setItem` 那一行**（不动 JSX），确认缓存断言变红。

- [ ] **Step 6: 跑全量 + Commit**

```bash
pnpm --filter @sojan/core test && pnpm --filter @sojan/llm test && pnpm --filter @sojan/web test
git add -A && git commit -m "chore(chart): 清理 C2-1 终审延后项（M3/M5/M7/M9/R9）"
```

---

## Self-Review（已执行）

**Spec 覆盖**：spec §5（`3c`）→ Task 1 逐项对照表；§6（`6b`）→ Task 2（图例已存在，故只做剩余三项）；§8（保留三块）→ Task 3；§2.1/§2.2 的两栏与 DOM 顺序 → C2-1 已完成，Task 3 只做块内重排不动顺序。

**类型一致性**：Task 1/2 均**不改组件 props 签名**，故 Task 3 的调用处无需同步改动；`ChartBlock` 新增的 `id?` / `data-testid` 透传在 Task 3 内自洽。

**计划里引用的每一个外部标识符都已 grep 核实**（见「已核实的现状」表）——这是 C2-1 埋了三处不存在的字段/文件之后立的规矩。仍需实施者当场核实的只有三处**测试文件内部的辅助函数名**（`ZiweiBoard.test.tsx` 的 fixture 辅助、`page.test.tsx` 的 `renderChart`、`LuckPillars.test.tsx` 的 `renderAt`/`PILLARS`），已在对应 Step 里明确标注「先读再写、不要臆造」。
