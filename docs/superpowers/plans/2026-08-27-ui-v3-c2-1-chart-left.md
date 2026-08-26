# UI v3 C2-1：命盘页骨架 + 桌面两栏 + 左列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/chart` 按设计包 `5b` 重建左半边——日主行、三枚 chip、五行盘接线、四柱、大运三格、流年 chip、目录锚点——并接入 C1 已建的 `TwoColumn` 桌面两栏骨架。

**Architecture:** 新增一个 core 派生事实（纳音/生肖，**不进冻结命盘**），三个纯展示组件（日主行+chip / 大运三格 / 目录锚点），最后在 `app/chart/page.tsx` 组装成两栏。右列本波**保持现状版式**只做重排，由 C2-2 重建。

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind 4（断点即 `@theme` 令牌）· vitest + @testing-library/react（jsdom，**无布局**）· lunar-typescript（core 已依赖）

**Spec:** `docs/superpowers/specs/2026-08-27-ui-v3-c2-chart-design.md`

## Global Constraints

- **强调手法唯一**：只用 `Emphasis`（`components/ui.tsx`）。零阴影（`--shadow-*` 全 `none`）；无新增裸十六进制（一律用令牌）；圆角 ≤8px；朱砂是唯一强调色。
- **展示层零推算**：命理量（旺衰/四化/星曜/纳音）一律来自 `@sojan/core`，展示层只做字号、排版、纯算术（如年份序列）。
- **响应式一律 Tailwind 断点类**，禁 `matchMedia`/`window.innerWidth`。
- **断点单位**：自定义断点一律 rem。`--breakpoint-xl` 现为 `75rem`，**不许改回 px**（Tailwind 4 无法跨单位排序 media 块，混单位会让低断点反压高断点，且 class-name 断言抓不到 —— C1 踩过，见 CLAUDE.md）。
- **桌面专有样式必须断点门控**；凡 `xl:` 与更低断点在同一属性上语义互斥，用 `max-xl:`，不要裸 `md:`/`lg:`。
- **Telegram 冻结**：`TG_ENTRIES`、`{inTg && …}` / `{!inTg && …}` 分支、`app/__tests__/page.test.tsx` 既有断言**逐字不变**。
- **数据流不动**：`loadTimeline` 的按 (档案,年) 缓存、解读的一次生成持久化、`getQuestionnaire`/`tgGetQuestionnaire` 的 TG 分支，**逐字不变**。
- **命理术语保持中文**（`ELEMENT_LABEL`、生肖、纳音、干支），UI chrome 全部走 `useT()`。
- **基线不许变差**：web **738** / core **188** / llm **279** 全绿；`pnpm exec tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` = **7**；lint **2 errors / 17 warnings**；`pnpm --filter @sojan/web build` 通过。
- **每条断言写之前先回答**：「如果这条实现被回退，它会不会变红？」答不上来就别写。关键改动做 mutation 复验，实际输出写进报告。

---

### Task 1: core 派生事实——纳音 / 生肖

**Files:**
- Create: `packages/core/src/bazi/nayin.ts`
- Modify: `packages/core/src/index.ts`（barrel 导出）
- Test: `packages/core/test/bazi-nayin.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，只吃一个干支字符串）
- Produces: `deriveNayinZodiac(yearPillar: string): { nayin: string; zodiac: string } | null`

**背景（必读）：** 设计包 `5b` 要三枚 chip「纳音 / 生肖 / 年龄」，但**纳音和生肖都不在冻结命盘 schema 里**（`ZiweiChartSchema` 那个 `zodiac` 字段是西洋盘的 tropical/sidereal 设置，**无关**，别误用）。按 CLAUDE.md 的既定约定——「引擎深化派生事实在 facts 层算、不进冻结命盘…新旧冻结命盘通吃、零迁移」——本任务把它做成**从已存的年柱字符串反查**的纯函数，因此对任何时期冻结的命盘都成立，零迁移。

数据源已核（在 `packages/core` 目录下实测）：`LunarUtil.NAYIN['癸酉'] === '剑锋金'`；`LunarUtil.ZHI` 是 1-indexed（`[0]` 是空串），`LunarUtil.SHENGXIAO` 同形，`ZHI.indexOf('酉') === 10` → `SHENGXIAO[10] === '鸡'`。与设计包示例档案（1993-12-22 → 剑锋金 / 属鸡）逐字对上。

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/test/bazi-nayin.test.ts
import { describe, it, expect } from "vitest";
import { deriveNayinZodiac } from "../src/bazi/nayin";

describe("deriveNayinZodiac", () => {
  it("从年柱反查纳音与生肖（对上设计包示例档案 1993-12-22 → 癸酉）", () => {
    expect(deriveNayinZodiac("癸酉")).toEqual({ nayin: "剑锋金", zodiac: "鸡" });
  });

  it("换一个年柱得到不同结果（防写死返回示例值）", () => {
    expect(deriveNayinZodiac("庚申")).toEqual({ nayin: "石榴木", zodiac: "猴" });
  });

  it("非法输入返回 null，不抛", () => {
    expect(deriveNayinZodiac("")).toBeNull();
    expect(deriveNayinZodiac("不是干支")).toBeNull();
    expect(deriveNayinZodiac("癸")).toBeNull();
  });
});
```

⚠️ 第二条用例是必须的：只有第一条时，一个 `return { nayin: "剑锋金", zodiac: "鸡" }` 的假实现也能过——那正是本波要防的「零区分力断言」。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/core test bazi-nayin`
Expected: FAIL —— `Cannot find module '../src/bazi/nayin'`

- [ ] **Step 3: 写实现**

```ts
// packages/core/src/bazi/nayin.ts
import { LunarUtil } from "lunar-typescript";

/**
 * 纳音 + 生肖：**派生事实，不进冻结命盘**。
 *
 * 设计包 5b 的三枚 chip 要「纳音 / 生肖 / 年龄」，而这两项都不在
 * `BaziChartSchema` 里。按 CLAUDE.md 的既定约定，派生事实在 facts 层从既有
 * `UnifiedChart` 算，**不改冻结结构**——因此这里只吃一个已经存在于任何时期
 * 冻结命盘里的年柱字符串（`chart.bazi.pillars.year.ganzhi`），新旧命盘通吃、零迁移。
 *
 * ⚠️ `ZiweiChartSchema` 里那个 `zodiac` 字段是**西洋盘的 tropical/sidereal 设置**，
 * 与生肖无关，别误用。
 */
export function deriveNayinZodiac(yearPillar: string): { nayin: string; zodiac: string } | null {
  const gz = (yearPillar ?? "").trim();
  if (gz.length !== 2) return null;
  const nayin = LunarUtil.NAYIN[gz];
  if (!nayin) return null;
  // LunarUtil.ZHI / SHENGXIAO 都是 1-indexed（[0] 为空串），indexOf 找不到时返回 -1
  const zhiIndex = LunarUtil.ZHI.indexOf(gz[1]);
  if (zhiIndex < 1) return null;
  const zodiac = LunarUtil.SHENGXIAO[zhiIndex];
  if (!zodiac) return null;
  return { nayin, zodiac };
}
```

- [ ] **Step 4: 加进 barrel**

在 `packages/core/src/index.ts` 里 `deriveUsefulElements` 那一组附近加：

```ts
export { deriveNayinZodiac } from "./bazi/nayin";
```

- [ ] **Step 5: 跑三个包的测试**

Run: `pnpm --filter @sojan/core test && pnpm --filter @sojan/llm test && pnpm --filter @sojan/web test`
Expected: core **191**（188 + 3 新增）、llm 279、web 738，全绿

⚠️ `packages/core/tsconfig.json` 的 `include` 只有 `["src"]`——**写在 `core/test/` 里的类型断言是惰性的、不过类型检查**。所以本任务的正确性靠运行时断言保证，别指望 tsc 兜底。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bazi/nayin.ts packages/core/src/index.ts packages/core/test/bazi-nayin.test.ts
git commit -m "feat(core): 纳音/生肖派生事实，从年柱反查、不进冻结命盘"
```

---

### Task 2: 日主行 + 三枚胶囊 chip

**Files:**
- Create: `apps/web/components/chart/ChartIdentity.tsx`
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`apps/web/lib/i18n/messages/en.ts`
- Test: `apps/web/components/chart/__tests__/ChartIdentity.test.tsx`

**Interfaces:**
- Consumes: `deriveNayinZodiac`（Task 1）；`PillChip`（`components/ui.tsx`，签名 `Omit<React.HTMLAttributes<HTMLSpanElement>, "style">`，**不接受 `style`**）
- Produces: `<ChartIdentity chart={chart} />`，`chart: UnifiedChart`

**设计要求（`5b` 第 1–2 条）：** 居中一行 `庚金日主 ·【偏弱型】`，serif 17px，**日主字朱砂**；下接三枚胶囊 chip（纳音 / 生肖 / 年龄）。

⚠️ **年龄用简单年差（当前年 − 出生年），不是周岁。** 依据：设计包自洽示例是「1993-12-22 生 · 33 岁」，而 2026-08 时其生日未到、周岁应为 32——稿子取的就是年差。

- [ ] **Step 1: 加 i18n key**

`zh.ts` 的 `chart` 段里加（放在 `strengthUnknown` 之后）：

```ts
    dayMasterLine: "{stem}{element}日主",
    strengthTagStrong: "【偏强型】",
    strengthTagWeak: "【偏弱型】",
    strengthTagBalanced: "【中和型】",
    zodiacChip: "属{animal}",
    ageChip: "{age} 岁",
```

`en.ts` 同名 key：

```ts
    dayMasterLine: "Day Master {stem}{element}",
    strengthTagStrong: "[Strong]",
    strengthTagWeak: "[Weak]",
    strengthTagBalanced: "[Balanced]",
    zodiacChip: "Year of the {animal}",
    ageChip: "Age {age}",
```

⚠️ `dayMasterLine` 的 `{stem}`/`{element}`、`zodiacChip` 的 `{animal}` 插进去的都是**命理术语（庚 / 金 / 鸡），两个 locale 都保持中文字符**——只有包裹它们的 chrome 才翻译。`strengthUnknown` 那档**不渲染 tag**（没有对应 `strengthTagUnknown`，这是有意的）。

- [ ] **Step 2: 写失败测试**

```tsx
// apps/web/components/chart/__tests__/ChartIdentity.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ChartIdentity } from "../ChartIdentity";
import type { UnifiedChart } from "@sojan/core";

// 生日未到的 fixture：出生 12-22，而「当前」设为 08-27 —— 周岁是 32、年差是 33。
// 这个 fixture 是本用例的关键：若取周岁，下面 33 岁那条断言必红。
function fixture(over: Partial<UnifiedChart["bazi"]> = {}): UnifiedChart {
  return {
    bazi: {
      pillars: { year: { ganzhi: "癸酉" }, month: {}, day: {}, hour: {} },
      dayMaster: "庚",
      dayMasterElement: "金",
      dayMasterStrength: "weak",
      fiveElementCounts: {},
      luckPillars: [],
      ...over,
    },
    birth: { date: "1993-12-22" },
  } as unknown as UnifiedChart;
}

function renderAt(chart: UnifiedChart, isoNow = "2026-08-27T10:00:00Z", locale: "zh" | "en" = "zh") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoNow));
  const r = render(<I18nProvider locale={locale}><ChartIdentity chart={chart} /></I18nProvider>);
  vi.useRealTimers();
  return r;
}

describe("ChartIdentity", () => {
  it("日主行 = 日主干 + 五行 + 旺衰 tag", () => {
    renderAt(fixture());
    expect(screen.getByTestId("day-master-line").textContent).toBe("庚金日主 ·【偏弱型】");
  });

  it("旺衰 unknown 时不渲染 tag（不是渲染一个空【】）", () => {
    renderAt(fixture({ dayMasterStrength: "unknown" }));
    expect(screen.getByTestId("day-master-line").textContent).toBe("庚金日主");
  });

  it("三枚 chip = 纳音 / 生肖 / 年龄，年龄用年差不是周岁", () => {
    renderAt(fixture());
    const chips = screen.getAllByTestId("identity-chip").map((e) => e.textContent);
    // 1993 出生、2026-08-27「当前」，生日（12-22）未到：周岁 32、年差 33。取 33。
    expect(chips).toEqual(["剑锋金", "属鸡", "33 岁"]);
  });

  it("换一个年柱，纳音与生肖跟着变（防写死示例值）", () => {
    renderAt(fixture({ pillars: { year: { ganzhi: "庚申" }, month: {}, day: {}, hour: {} } as never }));
    const chips = screen.getAllByTestId("identity-chip").map((e) => e.textContent);
    expect(chips.slice(0, 2)).toEqual(["石榴木", "属猴"]);
  });

  it("en locale 下 chrome 翻译、命理术语仍是中文", () => {
    renderAt(fixture(), "2026-08-27T10:00:00Z", "en");
    expect(screen.getByTestId("day-master-line").textContent).toBe("Day Master 庚金 ·[Weak]");
    expect(screen.getAllByTestId("identity-chip")[1].textContent).toBe("Year of the 鸡");
  });
});
```

⚠️ 记得在文件顶部 `import { vi } from "vitest"`。

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test ChartIdentity`
Expected: FAIL —— 找不到模块 `../ChartIdentity`

- [ ] **Step 4: 写实现**

```tsx
// apps/web/components/chart/ChartIdentity.tsx
"use client";

import { deriveNayinZodiac, type UnifiedChart } from "@sojan/core";
import { PillChip } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

const STRENGTH_TAG_KEY = {
  strong: "chart.strengthTagStrong",
  weak: "chart.strengthTagWeak",
  balanced: "chart.strengthTagBalanced",
} as const;

/**
 * 命盘身份行（设计包 5b 第 1–2 条）：居中日主行 + 三枚胶囊 chip。
 *
 * ⚠️ 年龄用**简单年差**（当前年 − 出生年），不是周岁——依据设计包自洽示例
 * 「1993-12-22 生 · 33 岁」，而 2026-08 其生日未到、周岁应为 32。稿子取的就是年差。
 * ⚠️ 纳音/生肖来自 core 的 `deriveNayinZodiac`（派生事实、不进冻结命盘），
 * **不在这里查表**——展示层零推算。
 */
export function ChartIdentity({ chart }: { chart: UnifiedChart }) {
  const t = useT();
  const { dayMaster, dayMasterElement, dayMasterStrength } = chart.bazi;

  const tagKey = STRENGTH_TAG_KEY[dayMasterStrength as keyof typeof STRENGTH_TAG_KEY];
  const line = t("chart.dayMasterLine", { stem: dayMaster, element: dayMasterElement });

  const nz = deriveNayinZodiac(chart.bazi.pillars.year.ganzhi);
  const birthYear = Number(String(chart.birth.date).slice(0, 4));
  const age = Number.isFinite(birthYear) ? new Date().getFullYear() - birthYear : null;

  const chips: string[] = [];
  if (nz) chips.push(nz.nayin, t("chart.zodiacChip", { animal: nz.zodiac }));
  if (age !== null) chips.push(t("chart.ageChip", { age: String(age) }));

  return (
    <div className="text-center">
      <p data-testid="day-master-line" className="font-serif text-[17px]">
        <span style={{ color: "var(--color-cinnabar)" }}>{line}</span>
        {tagKey && <> ·{t(tagKey)}</>}
      </p>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {chips.map((c, i) => (
            <PillChip key={i} data-testid="identity-chip">{c}</PillChip>
          ))}
        </div>
      )}
    </div>
  );
}
```

⚠️ 若 `t()` 的插值实现不支持 `{stem}` 这种占位，**先去 `lib/i18n/I18nProvider` 看它实际怎么插值**（`app/chart/page.tsx` 里已有 `t("chart.timelineDisclaimer", { year: YEAR })` 的先例），按实际签名调整，不要臆造。

- [ ] **Step 5: 跑测试确认通过 + mutation 复验**

Run: `pnpm --filter @sojan/web test ChartIdentity`
Expected: PASS（5 条）

Mutation 复验（逐条做，实际输出写进报告）：把年龄改成周岁实现 → 第 3 条必红；把 `deriveNayinZodiac` 的返回写死成示例值 → 第 4 条必红。复验完还原。

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/chart/ChartIdentity.tsx apps/web/components/chart/__tests__/ChartIdentity.test.tsx apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "feat(chart): 日主行 + 纳音/生肖/年龄三枚 chip（5b 第 1-2 条）"
```

---

### Task 3: 大运三格 + 流年 chip 行

**Files:**
- Create: `apps/web/components/chart/LuckPillars.tsx`
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`en.ts`
- Test: `apps/web/components/chart/__tests__/LuckPillars.test.tsx`

**Interfaces:**
- Consumes: `Emphasis`、`PillChip`（`components/ui.tsx`）
- Produces: `<LuckPillars bazi={chart.bazi} />`，`bazi: UnifiedChart["bazi"]`

**设计要求（`5b` 第 5 条）：** 大运列表三行（前一运 / 现行 / 下一运），**现行走强调手法**；下接流年 chip 行，**当前流年朱砂描边**。

**⚠️ 数据风险（必须先处理）：** `packages/core/src/types/chart.ts` 里 `luckPillars` 的 zod 定义是 `.default([])`——**早期冻结的命盘可能压根没有这个字段，解析后是空数组**，三格会渲染成空白。

- [ ] **Step 1: 先抽查生产库，把实际覆盖率写进报告**

用 Supabase MCP（`execute_sql`）对生产库跑一次，**不要靠推断**：

```sql
select
  count(*) as total,
  count(*) filter (where jsonb_array_length(coalesce(chart->'bazi'->'luckPillars','[]'::jsonb)) > 0) as has_luck
from profiles;
```

把 `total` / `has_luck` 两个实际数字写进报告。**无论结果如何都要做 Step 3 的空态兜底**——抽查只是为了知道影响面，不是为了决定做不做。

- [ ] **Step 2: 加 i18n key**

`zh.ts` 的 `chart` 段：

```ts
    luckTitle: "大运",
    luckPrev: "前一运",
    luckCurrent: "现行",
    luckNext: "下一运",
    luckRange: "{startAge} 岁起 · {startYear}",
    flowYearTitle: "流年",
```

`en.ts`：

```ts
    luckTitle: "Luck Cycles",
    luckPrev: "Previous",
    luckCurrent: "Current",
    luckNext: "Next",
    luckRange: "from age {startAge} · {startYear}",
    flowYearTitle: "Annual",
```

- [ ] **Step 3: 写失败测试**

```tsx
// apps/web/components/chart/__tests__/LuckPillars.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { LuckPillars } from "../LuckPillars";

type Bazi = Parameters<typeof LuckPillars>[0]["bazi"];

const PILLARS = [
  { startAge: 3, startYear: 1996, pillar: "乙丑" },
  { startAge: 13, startYear: 2006, pillar: "丙寅" },
  { startAge: 23, startYear: 2016, pillar: "丁卯" },
  { startAge: 33, startYear: 2026, pillar: "丙申" },
  { startAge: 43, startYear: 2036, pillar: "己巳" },
];

function bazi(over: Record<string, unknown> = {}): Bazi {
  return { luckPillars: PILLARS, ...over } as unknown as Bazi;
}

function renderAt(b: Bazi, isoNow = "2026-08-27T10:00:00Z") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoNow));
  const r = render(<I18nProvider locale="zh"><LuckPillars bazi={b} /></I18nProvider>);
  vi.useRealTimers();
  return r;
}

describe("LuckPillars", () => {
  it("currentLuckPillar 存在时按它定位现行运，取出前/现/后三格", () => {
    renderAt(bazi({ currentLuckPillar: "丁卯" }));
    const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("丙寅");
    expect(rows[1]).toContain("丁卯");
    expect(rows[2]).toContain("丙申");
  });

  it("currentLuckPillar 缺失时按 startYear 与当前年比对推出现行运", () => {
    renderAt(bazi()); // 无 currentLuckPillar，当前 2026 → 命中 startYear 2026 那格
    const rows = screen.getAllByTestId("luck-row").map((e) => e.textContent);
    expect(rows[1]).toContain("丙申");
    expect(rows[0]).toContain("丁卯");
    expect(rows[2]).toContain("己巳");
  });

  it("只有现行运走强调手法，另两行不走", () => {
    renderAt(bazi({ currentLuckPillar: "丁卯" }));
    const rows = screen.getAllByTestId("luck-row");
    // Emphasis 的判别特征是 border-left 2px 朱砂（horizontal 轴），落在元素自身 style 上
    const emphasized = rows.filter((r) => (r.getAttribute("style") ?? "").includes("border-left"));
    expect(emphasized).toHaveLength(1);
    expect(emphasized[0].textContent).toContain("丁卯");
  });

  it("luckPillars 为空时整块不渲染（不是渲染三个空格）", () => {
    const { container } = renderAt(bazi({ luckPillars: [] }));
    expect(container.textContent).toBe("");
    expect(screen.queryByTestId("luck-row")).toBeNull();
    expect(screen.queryByTestId("flow-year-chip")).toBeNull();
  });

  it("流年 chip 覆盖现行运 10 年，当前流年朱砂描边且只有一个", () => {
    renderAt(bazi()); // 现行运 startYear 2026
    const chips = screen.getAllByTestId("flow-year-chip");
    expect(chips.map((c) => c.textContent)).toEqual(
      ["2026","2027","2028","2029","2030","2031","2032","2033","2034","2035"],
    );
    const marked = chips.filter((c) => (c.getAttribute("style") ?? "").includes("var(--color-cinnabar)"));
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toBe("2026");
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test LuckPillars`
Expected: FAIL —— 找不到模块 `../LuckPillars`

- [ ] **Step 5: 写实现**

```tsx
// apps/web/components/chart/LuckPillars.tsx
"use client";

import type { UnifiedChart } from "@sojan/core";
import { Emphasis, PillChip } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

type Luck = { startAge: number; startYear: number; pillar: string };

/**
 * 大运三格 + 流年 chip 行（设计包 5b 第 5 条）。
 *
 * ⚠️ `luckPillars` 在 `BaziChartSchema` 里是 `.default([])`——**早期冻结的命盘
 * 可能没有这个字段，解析后是空数组**。为空时整块不渲染，而不是渲染三个空格
 * （渲染空格会让用户以为数据坏了，且看不出是历史命盘的结构差异）。
 * ⚠️ 流年年份序列是**展示层算术**（现行运的 10 年跨度），不是命理推算，可以在这里算；
 * 但**四化不许在展示层算**——那是 `computeZiweiHoroscope` 的活，本组件不碰。
 */
export function LuckPillars({ bazi }: { bazi: UnifiedChart["bazi"] }) {
  const t = useT();
  const list = (bazi.luckPillars ?? []) as Luck[];
  if (list.length === 0) return null;

  const thisYear = new Date().getFullYear();
  let idx = bazi.currentLuckPillar ? list.findIndex((l) => l.pillar === bazi.currentLuckPillar) : -1;
  if (idx < 0) {
    // 退路：最后一个 startYear <= 今年的那格
    for (let i = 0; i < list.length; i++) if (list[i].startYear <= thisYear) idx = i;
  }
  if (idx < 0) return null;

  const rows: Array<{ luck: Luck; label: string; current: boolean }> = [];
  if (list[idx - 1]) rows.push({ luck: list[idx - 1], label: t("chart.luckPrev"), current: false });
  rows.push({ luck: list[idx], label: t("chart.luckCurrent"), current: true });
  if (list[idx + 1]) rows.push({ luck: list[idx + 1], label: t("chart.luckNext"), current: false });

  const start = list[idx].startYear;
  const years = Array.from({ length: 10 }, (_, i) => start + i);

  return (
    <div>
      <h3 className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("chart.luckTitle")}</h3>
      <div className="mt-4 flex flex-col gap-2">
        {rows.map(({ luck, label, current }) => {
          const body = (
            <div className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-serif text-[19px]">{luck.pillar}</span>
              <span className="text-[11.5px]" style={{ color: "var(--color-muted)" }}>
                {label} · {t("chart.luckRange", { startAge: String(luck.startAge), startYear: String(luck.startYear) })}
              </span>
            </div>
          );
          return current
            ? <Emphasis key={luck.pillar} data-testid="luck-row">{body}</Emphasis>
            : <div key={luck.pillar} data-testid="luck-row">{body}</div>;
        })}
      </div>

      <h3 className="mt-6 text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("chart.flowYearTitle")}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {years.map((y) => (
          <PillChip
            key={y}
            data-testid="flow-year-chip"
            className={y === thisYear ? "zj-flow-year-current" : undefined}
          >
            {y}
          </PillChip>
        ))}
      </div>
    </div>
  );
}
```

⚠️ **`PillChip` 的 props 是 `Omit<…, "style">`，传 `style` 是编译错误**（A 块刻意加的护栏）。当前流年的朱砂描边因此不能用内联 style。两条路，**任选其一并说明理由**：
 (a) 在 `globals.css` 加一个 `.zj-flow-year-current { border-color: var(--color-cinnabar); color: var(--color-cinnabar); }`（上面代码走的是这条）；
 (b) 给 `PillChip` 加一个 `emphasis?: boolean` prop（与 `Chip` 的既有写法对齐）。
若选 (b)，把上面测试里 `getAttribute("style")` 的判据同步改成按类名或 `emphasis` 的实际渲染结果断言——**别留下一条永远不红的断言**。

- [ ] **Step 6: 跑测试确认通过 + mutation 复验**

Run: `pnpm --filter @sojan/web test LuckPillars`
Expected: PASS（5 条）

Mutation 复验：把「为空则 return null」改成照常渲染 → 第 4 条必红；把 `Emphasis` 换成普通 `div` → 第 3 条必红。实际输出写进报告。

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/chart/LuckPillars.tsx apps/web/components/chart/__tests__/LuckPillars.test.tsx apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts apps/web/app/globals.css
git commit -m "feat(chart): 大运三格 + 流年 chip 行，含空冻结命盘兜底（5b 第 5 条）"
```

---

### Task 4: 目录锚点两行

**Files:**
- Create: `apps/web/components/chart/ChartToc.tsx`
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`en.ts`
- Test: `apps/web/components/chart/__tests__/ChartToc.test.tsx`

**Interfaces:**
- Consumes: 无（纯锚点链接）
- Produces: `<ChartToc />`，内部硬编码两个锚点 `#ziwei-board`、`#reading-tabs`

**背景：** 设计包 `5b` 第 6 条是一条入口条「紫微十二宫 · 三段式解读 →」。**owner 2026-08-26 裁定紫微留在页内**，故这条入口条改成**页内锚点**，版式复用卷首已建的目录行（`data-testid="toc-row"`，见 `app/HomeClient.tsx`）。

- [ ] **Step 1: 加 i18n key**

`zh.ts`：`tocZiwei: "紫微十二宫"`、`tocReading: "三段式解读"`
`en.ts`：`tocZiwei: "Twelve Palaces"`、`tocReading: "Three-Part Reading"`

- [ ] **Step 2: 写失败测试**

```tsx
// apps/web/components/chart/__tests__/ChartToc.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ChartToc } from "../ChartToc";

describe("ChartToc", () => {
  it("两行锚点分别指向紫微棋盘与三段式解读", () => {
    render(<I18nProvider locale="zh"><ChartToc /></I18nProvider>);
    const rows = screen.getAllByTestId("chart-toc-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("href")).toBe("#ziwei-board");
    expect(rows[1].getAttribute("href")).toBe("#reading-tabs");
    expect(rows[0].textContent).toContain("紫微十二宫");
    expect(rows[1].textContent).toContain("三段式解读");
  });

  it("是页内锚点，不是跨页跳转（防误写成 /chart/ziwei 之类的路由）", () => {
    render(<I18nProvider locale="zh"><ChartToc /></I18nProvider>);
    for (const r of screen.getAllByTestId("chart-toc-row")) {
      expect(r.getAttribute("href")).toMatch(/^#/);
    }
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test ChartToc`
Expected: FAIL —— 找不到模块

- [ ] **Step 4: 写实现**

```tsx
// apps/web/components/chart/ChartToc.tsx
"use client";

import { useT } from "@/lib/i18n/I18nProvider";

const ROWS = [
  { href: "#ziwei-board", key: "chart.tocZiwei" },
  { href: "#reading-tabs", key: "chart.tocReading" },
] as const;

/**
 * 命盘页目录（设计包 5b 第 6 条）。稿子原本是一条跳转入口条
 * 「紫微十二宫 · 三段式解读 →」，**owner 2026-08-26 裁定紫微留在 /chart 页内**，
 * 故改为页内锚点两行，版式复用卷首目录行。
 * ⚠️ 目标区块的 id（`ziwei-board` / `reading-tabs`）由 `app/chart/page.tsx` 提供，
 * 改这里的 href 必须同步改那边的 id，否则锚点静默失效。
 */
export function ChartToc() {
  const t = useT();
  return (
    <nav className="mt-8" style={{ borderTop: "1px solid var(--color-line)" }}>
      {ROWS.map(({ href, key }) => (
        <a
          key={href}
          href={href}
          data-testid="chart-toc-row"
          className="flex items-center justify-between py-4 transition-colors duration-200"
          style={{ borderBottom: "1px solid var(--color-line)" }}
        >
          <span className="font-serif text-[19px]">{t(key)}</span>
          <span style={{ color: "var(--color-muted)" }}>→</span>
        </a>
      ))}
    </nav>
  );
}
```

⚠️ hover 只允许改 `border-color` 与箭头色，**不得加投影/位移/放大**（`06-desktop` §4）。如需 hover，用 Tailwind 的 `hover:` 类改这两项即可。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @sojan/web test ChartToc`
Expected: PASS（2 条）

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/chart/ChartToc.tsx apps/web/components/chart/__tests__/ChartToc.test.tsx apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "feat(chart): 目录锚点两行，取代 5b 的跳转入口条"
```

---

### Task 5: 页面组装——TwoColumn 接入 + 左列 + 五行盘换新

**Files:**
- Modify: `apps/web/app/chart/page.tsx:170-283`（渲染体）
- Modify: `apps/web/components/PageHeader.tsx`（加 `as` prop，修 `<header>` 嵌套）
- Modify: `apps/web/app/calendar/page.tsx:195`（同一处嵌套，顺手修）
- Test: `apps/web/app/chart/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `TwoColumn`（`{ leftWidth: number; header: ReactNode; left: ReactNode; right: ReactNode }`）、`ChartIdentity`（Task 2）、`LuckPillars`（Task 3）、`ChartToc`（Task 4）、`WuxingWheel`（`{ counts, dayMasterStem, dayMasterElement, size? }`）
- Produces: 无（终端页面）

**要做四件事：**

1. **`WuxingRadar` → `WuxingWheel`**：B 块建了 `WuxingWheel` 但没接进 `/chart`，页面至今还在用旧的 `WuxingRadar`。换掉后 **grep 全仓确认 `WuxingRadar` 是否还有别的消费方**：无则删除该组件及其测试，有则保留并在报告里说明是谁在用（**别静默留着**）。
2. **接入 `TwoColumn`**，`leftWidth={440}`（`06-desktop` §3 的 `8b` 规格）。
3. **两栏共用一份 DOM 顺序**（spec §2.2）：
   - 左：`ChartIdentity` → `WuxingWheel` + 11.5px 说明 → `BaziPillars` → `LuckPillars` → `ChartToc`
   - 右：三段式解读（`id="reading-tabs"`）→ 紫微棋盘（`id="ziwei-board"`）→ 西方盘 → `SelfPortrait` → 时序
   ⚠️ 右列本波**保持现状版式**（继续用 `ChartBlock`），只调顺序与加 id。C2-2 才重建。
   ⚠️ 右栈里解读排在紫微之前，与 `5b` 入口条字面顺序相反，这是 spec §2.2 的刻意裁定，别「顺手改回来」。
4. **修 `<header>` 嵌套**：`TwoColumn` 自己渲染 `<header>`，而 `PageHeader` 也渲染 `<header>`，塞进去就成了 `<header><header>`。给 `PageHeader` 加 `as?: "header" | "div"`（默认 `"header"`，保持既有页面不变），两个 `TwoColumn` 消费方传 `as="div"`。

- [ ] **Step 1: 写失败测试**

在 `apps/web/app/chart/__tests__/page.test.tsx` 里补（沿用该文件既有的 mock 与 render 辅助，**先读一遍再写**）：

```tsx
it("桌面两栏：左列是盘与事实，右列是解读与其余（共用一份 DOM 顺序）", async () => {
  await renderChart(); // 该文件既有的辅助；若名字不同按实际的来
  const left = screen.getByTestId("two-col-left");
  const right = screen.getByTestId("two-col-right");

  expect(within(left).getByTestId("day-master-line")).toBeInTheDocument();
  expect(within(left).getByTestId("wuxing-wheel")).toBeInTheDocument();
  expect(within(left).getAllByTestId("chart-toc-row")).toHaveLength(2);

  expect(within(right).getByTestId("reading-tabs-anchor")).toBeInTheDocument();
  expect(within(right).getByTestId("ziwei-board-anchor")).toBeInTheDocument();
  // 左列里不该出现右列的东西，反之亦然
  expect(within(left).queryByTestId("ziwei-board-anchor")).toBeNull();
  expect(within(right).queryByTestId("day-master-line")).toBeNull();
});

it("目录锚点的 href 与右列区块的 id 对得上（防锚点静默失效）", async () => {
  await renderChart();
  for (const row of screen.getAllByTestId("chart-toc-row")) {
    const id = (row.getAttribute("href") ?? "").slice(1);
    expect(document.getElementById(id)).not.toBeNull();
  }
});

it("保留的三块都还在（防静默失踪回归网）", async () => {
  await renderChart();
  const right = screen.getByTestId("two-col-right");
  expect(within(right).getByTestId("ziwei-board-anchor")).toBeInTheDocument();
  expect(within(right).getByText(/西方|Western/)).toBeInTheDocument();
  expect(within(right).getByText(/自我画像|Self/)).toBeInTheDocument();
});

it("PageHeader 在 TwoColumn 里不再嵌套 <header>", async () => {
  await renderChart();
  expect(document.querySelectorAll("header header")).toHaveLength(0);
});
```

⚠️ 第二条（锚点 id 对得上）是本任务**最有价值**的断言——锚点失效是静默的，没有它谁都发现不了。
⚠️ `wuxing-wheel` / `reading-tabs-anchor` / `ziwei-board-anchor` 这几个 testid **若组件里还没有就要加上**；`WuxingWheel` 现有的 testid 名以实际为准，**先 grep 再写断言**，别臆造一个恒不匹配的 matcher（C1 踩过这个坑）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @sojan/web test app/chart`
Expected: FAIL —— 找不到 `two-col-left`（页面还没接 TwoColumn）

- [ ] **Step 3: 给 PageHeader 加 `as` prop**

```tsx
export function PageHeader({
  kicker, title, annotation, action, as: Tag = "header",
}: {
  kicker: string;
  title: ReactNode;
  annotation?: ReactNode;
  action?: ReactNode;
  /** 放进 `TwoColumn` 的 header 槽时传 "div"——那边已经有一层 <header>，
   *  嵌套 <header> 是无效 HTML 且对读屏是两个 banner。 */
  as?: "header" | "div";
}) {
  return <Tag>{/* 原有内容逐字不变 */}</Tag>;
}
```

`app/calendar/page.tsx:195` 的 `<PageHeader` 加 `as="div"`。

- [ ] **Step 4: 改 `app/chart/page.tsx` 渲染体**

把 `return (<main …>…</main>)` 换成：左右两个片段 + `TwoColumn`。骨架：

```tsx
const header = (
  <PageHeader as="div" kicker={t("chart.kicker")} title={<>{profile.nickname} · {t("chart.title")}</>}
    annotation={chart.normalizedSolarTime} action={/* 原有 action 逐字不变 */} />
);

const left = (
  <>
    <ChartIdentity chart={chart} />
    <ChartBlock label={t("chart.wuxingTitle")}>
      <WuxingWheel counts={chart.bazi.fiveElementCounts}
        dayMasterStem={chart.bazi.dayMaster} dayMasterElement={chart.bazi.dayMasterElement} />
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-muted)" }}>{t("chart.wuxingCaption")}</p>
    </ChartBlock>
    <ChartBlock label={t("chart.baziTitle")}><BaziPillars bazi={chart.bazi} /></ChartBlock>
    <LuckPillars bazi={chart.bazi} />
    <ChartToc />
  </>
);

const right = (
  <>
    <section id="reading-tabs" data-testid="reading-tabs-anchor">
      <ChartBlock label={t("chart.readingTitle")}>{/* 原有解读块逐字不变 */}</ChartBlock>
    </section>
    <section id="ziwei-board" data-testid="ziwei-board-anchor">
      <ChartBlock label={t("chart.ziweiTitle")}><ZiweiBoard ziwei={chart.ziwei} /></ChartBlock>
    </section>
    {/* 西方盘 / SelfPortrait / 时序：原有三块逐字搬过来，顺序如上 */}
  </>
);

return (
  <main>
    <TwoColumn leftWidth={440} header={header} left={left} right={right} />
    <p className="mt-10 text-[12px] leading-relaxed text-muted">{t("chart.pageDisclaimer")}</p>
  </main>
);
```

新 i18n key：`chart.wuxingCaption`（zh「五行分布见盘，日主居中」/ en「Element distribution; day master at center」）。

⚠️ **`generate` / `streaming` / `err` / `timeline` / `loadTimeline` 及其缓存逻辑逐字不动**，只是位置搬家。
⚠️ 免责句放在 `TwoColumn` **之外**——它在两栏里会被塞进某一列，而它是整页的。

- [ ] **Step 5: 换掉 WuxingRadar 并处置旧组件**

```bash
grep -rn --include='*.tsx' "WuxingRadar" apps/web | grep -v __tests__
```

无其它消费方 → 删 `components/charts/WuxingRadar.tsx` 及其测试；有 → 保留，并在报告里写明消费方。**两种情况都要在报告里给出结论，不许静默留着。**

- [ ] **Step 6: 跑全量 + 构建**

```bash
pnpm --filter @sojan/core test && pnpm --filter @sojan/llm test && pnpm --filter @sojan/web test
pnpm exec tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -c "error TS"   # 期望 7
pnpm --filter @sojan/web lint                                                 # 期望 2 errors / 17 warnings
pnpm --filter @sojan/web build                                                # 期望通过
```

- [ ] **Step 7: 三档断点自查**

起本地服务（**端口 3030**，3000 被本机 Hermes WhatsApp bridge 长期占用），在 **402px / 900px / 1280px** 三个宽度各看一眼 `/chart`，确认：<1200px 单列且无桌面内边距/竖线残留；≥1200px 两栏且右列滚动时左列不动。把结论写进报告。**运势页移动端此前从没人看过就漏了一整档，别重蹈覆辙。**

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/chart/page.tsx apps/web/components/PageHeader.tsx apps/web/app/calendar/page.tsx apps/web/app/chart/__tests__/page.test.tsx
git commit -m "feat(chart): 接入 TwoColumn 两栏 + 左列按 5b 组装 + 五行盘换 WuxingWheel"
```

---

## Self-Review（已执行）

**Spec 覆盖：** §4 左列五条 → Task 2（1–2）、Task 5（3–4）、Task 3（5）；§2.2 DOM 顺序 → Task 5 Step 4；§3 断点 → Task 5 Step 7；§7 大运数据风险 → Task 3 Step 1+5；§8 保留三块 → Task 5 Step 4 + 回归断言。§5（`3c`）、§6（`6b`）**属 C2-2，本计划不覆盖**，符合分波约定。

**类型一致性：** `deriveNayinZodiac` 在 Task 1 定义、Task 2 消费，签名一致；`LuckPillars` 的 `bazi` prop 类型在 Task 3 定义、Task 5 传 `chart.bazi`，一致；`TwoColumn` 四个 prop 与 C1 实现一致（已核）。

**已知待实施时确认的两点**（不是占位，是要求实施者当场核实而非臆造）：
1. `t()` 的插值占位语法——Task 2 Step 4 已要求先读 `I18nProvider` 实际签名。
2. `WuxingWheel` 与 `app/chart/__tests__/page.test.tsx` 里既有的 testid / render 辅助名——Task 5 Step 1 已要求先 grep 再写断言。
