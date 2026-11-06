import { describe, it, expect } from "vitest";
import {
  BirthInputSchema, computeUnifiedChart, computeFengshui, adviseObject, deriveFengshuiTagline,
  directionsFor, elementDirections, DIRECTIONS, DIRECTION_LABEL_EN, STAR_LABEL_EN,
  CATEGORY_LABEL, OBJECT_CATEGORIES, OBJECT_CATEGORY_EN, OBJECT_MATERIAL_EN, OBJECT_SHAPE_EN,
  directionLabel, starLabel, guaLabel, groupLabel, joinEn,
  type BirthInput, type Direction, type FengshuiChart,
} from "../src/index";

/**
 * EP-fs-en ③：英文页面上的确定性文案（化解、基调句、物件顾问结论）由 core 直接产出英文，
 * 而不是把中文原文交给页面或模型去翻。
 *
 * 判别力：
 * - 「无汉字」断言跑遍 8 种命卦 × 8 个朝向 × 租/自有 × 相配/相冲，任何一个分支漏翻都会红；
 * - 「结构逐项相同」断言保证翻译层只换文字、不动 id/成本/证据/方位——排序、过滤、
 *   诚实标注（传统象征 ⇒ modern 为 null）在两种语言下完全一致；
 * - 中文路径用「不传 language」与「显式传 zh」深度相等守住：中文用户逐字节不变。
 */

const CJK = /[　-〿㐀-鿿＀-￯]/;

const mk = (over: Partial<BirthInput> = {}): BirthInput =>
  BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

/** 覆盖全部 8 种命卦：1984–1992 男女各一轮足够（男女公式不同，九年一循环）。 */
const BIRTHS: BirthInput[] = [];
for (let y = 1984; y <= 1992; y++) for (const gender of ["male", "female"] as const) BIRTHS.push(mk({ date: `${y}-06-15`, gender }));

function chartsFor(language: "zh" | "en"): FengshuiChart[] {
  const out: FengshuiChart[] = [];
  for (const birth of BIRTHS) {
    const chart = computeUnifiedChart(birth);
    out.push(computeFengshui({ birth, chart, language }));
    for (const facing of DIRECTIONS) {
      for (const tenancy of ["rent", "own"] as const) {
        out.push(computeFengshui({
          birth, chart, language,
          dwelling: { id: "d1", name: "Home", kind: "home", tenancy, facing },
        }));
      }
    }
  }
  return out;
}

describe("EP-fs-en ③ 化解文案：英文", () => {
  const en = chartsFor("en");
  const zh = chartsFor("zh");

  it("前提：夹具确实覆盖 8 种命卦、相配与相冲两种情形", () => {
    expect(new Set(en.map((f) => f.mingGua.guaName)).size).toBe(8);
    const matches = new Set(en.flatMap((f) => (f.layer === 1 ? [f.dwelling.matchWithPerson] : [])));
    expect(matches).toEqual(new Set(["相配", "相冲"]));
  });

  it("英文化解的 target/action/traditional/modern 一个汉字都没有", () => {
    for (const f of en) {
      for (const r of f.remedies) {
        for (const field of [r.target, r.action, r.traditional, r.modern ?? ""]) {
          expect(field, `${r.id}: ${field}`).not.toMatch(CJK);
          expect(field).not.toMatch(/undefined|null|NaN/);
        }
      }
    }
  });

  it("结构与中文逐项相同：id、成本、证据、租住、方位、顺序，且传统象征 ⇒ modern 为 null", () => {
    en.forEach((f, i) => {
      const proj = (x: FengshuiChart) => x.remedies.map((r) => ({
        id: r.id, effort: r.effort, evidence: r.evidence, tenancy: r.tenancy, direction: r.direction, hasModern: r.modern !== null,
      }));
      expect(proj(f)).toEqual(proj(zh[i]!));
      for (const r of f.remedies) if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    });
  });

  it("带方位的化解：英文 target 以方位英文名开头、写出星名拼音", () => {
    const f = en[0]!; // 1984 男 = 兑7：生气西北、天医西南、绝命东
    expect(f.mingGua.guaName).toBe("兑");
    const desk = f.remedies.find((r) => r.id === "fs-desk-sheng")!;
    expect(desk.direction).toBe("NW");
    expect(desk.target).toBe("Northwest (Sheng Qi direction)");
    expect(desk.traditional).toContain("Dui");
    const worst = f.remedies.find((r) => r.id === "fs-worst-static")!;
    expect(worst.target).toBe(`${DIRECTION_LABEL_EN[worst.direction!]} (${STAR_LABEL_EN.绝命} direction)`);
  });

  it("中文化解全文字面量快照（评审 nit：守住「中文用户逐字节不变」，快照与改动前 HEAD 对拍一致）", () => {
    const birth = mk();
    const chart = computeUnifiedChart(birth);
    const pick = (f: FengshuiChart) => f.remedies.map(({ id, target, action, traditional, modern }) => ({ id, target, action, traditional, modern }));
    expect(pick(computeFengshui({ birth, chart }))).toMatchSnapshot("layer0-坎1");
    expect(pick(computeFengshui({
      birth, chart, dwelling: { id: "d", name: "家", kind: "home", tenancy: "rent", facing: "N" },
    }))).toMatchSnapshot("layer1-离宅-相配");
    expect(pick(computeFengshui({
      birth, chart, dwelling: { id: "d", name: "家", kind: "home", tenancy: "own", facing: "E" },
    }))).toMatchSnapshot("layer1-兑宅-相冲");
  });

  it("不传 language 与显式 zh 完全相同（中文用户逐字节不变）", () => {
    const birth = mk();
    const chart = computeUnifiedChart(birth);
    const dwelling = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as Direction };
    expect(computeFengshui({ birth, chart, dwelling })).toEqual(computeFengshui({ birth, chart, dwelling, language: "zh" }));
  });
});

describe("EP-fs-en ③ 化解的 direction 字段（替代从 target 文案反解方位）", () => {
  it("中文：带方位的化解 direction 与 target 开头的方位一致；其余为 null", () => {
    const birth = mk(); // 坎1：生气东南、天医东、绝命西南
    const f = computeFengshui({ birth, chart: computeUnifiedChart(birth) });
    const byId = Object.fromEntries(f.remedies.map((r) => [r.id, r.direction]));
    expect(byId["fs-desk-sheng"]).toBe("SE");
    expect(byId["fs-bed-tianyi"]).toBe("E");
    expect(byId["fs-worst-static"]).toBe("SW");
    for (const r of f.remedies.filter((x) => !["fs-desk-sheng", "fs-bed-tianyi", "fs-worst-static"].includes(x.id))) {
      expect(r.direction, r.id).toBeNull();
    }
  });

  it("宅层化解的 direction 指向宅卦的最吉/最凶位", () => {
    const birth = mk();
    const f = computeFengshui({
      birth, chart: computeUnifiedChart(birth),
      dwelling: { id: "d", name: "家", kind: "home", tenancy: "own", facing: "S" }, // 坐北 = 坎宅：生气东南、绝命西南
    });
    const byId = Object.fromEntries(f.remedies.map((r) => [r.id, r.direction]));
    expect(byId["fs-dw-best"]).toBe("SE");
    expect(byId["fs-dw-worst"]).toBe("SW");
  });
});

describe("EP-fs-en ③ 基调句：英文", () => {
  const kan = directionsFor("坎"); // 生气东南
  it("有喜用五行", () => {
    const aff = elementDirections({ favorable: ["木", "水"], unfavorable: ["金"], method: "扶抑", note: "" });
    expect(deriveFengshuiTagline(kan, aff, "水", "en"))
      .toBe("With a Water day master, you tend to do well with Wood — your Sheng Qi direction is the southeast.");
  });
  it("喜用为空时不编造五行", () => {
    const aff = elementDirections({ favorable: [], unfavorable: [], method: "中和", note: "" });
    expect(deriveFengshuiTagline(kan, aff, "水", "en"))
      .toBe("Your Sheng Qi direction is the southeast — give it a little extra care.");
  });
  it("默认仍是中文原句", () => {
    const aff = elementDirections({ favorable: ["木"], unfavorable: [], method: "扶抑", note: "" });
    expect(deriveFengshuiTagline(kan, aff, "水")).toBe("水命之人，宜近木——你的生气在东南。");
  });
});

describe("EP-fs-en ③ 物件顾问：英文", () => {
  const verdicts = directionsFor("坎");
  const affinity = elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火"], method: "扶抑", note: "" });
  const dwellingMismatch = directionsFor("乾"); // 西四宅，与坎命异组 → 有 dwellingNote

  const queries = OBJECT_CATEGORIES.flatMap((category) => [
    { category },
    { category, material: "原木" }, // 喜用
    { category, material: "金属" }, // 忌
    { category, shape: "方" },      // 土：中性
    { category, material: "玻璃", intendedDirection: "W" as Direction },
  ]);

  it("所有散文字段无汉字，结构字段与中文一致", () => {
    for (const q of queries) {
      for (const dwellingSectors of [undefined, dwellingMismatch]) {
        const en = adviseObject({ verdicts, affinity, dwellingSectors }, q, "en");
        const zh = adviseObject({ verdicts, affinity, dwellingSectors }, q);
        const prose = [
          en.categoryLabel, en.personalFit, en.dwellingNote ?? "",
          ...en.categoryRules,
          ...en.recommendedDirections.flatMap((r) => [r.label, r.reason]),
          ...en.avoid.flatMap((r) => [r.label, r.reason]),
        ];
        for (const s of prose) expect(s, `${q.category}: ${s}`).not.toMatch(CJK);
        const struct = (a: typeof en) => ({
          category: a.category, el: a.elementOfObject, intended: a.intendedVerdict,
          rec: a.recommendedDirections.map((r) => r.direction), avoid: a.avoid.map((r) => r.direction),
          rules: a.categoryRules.length, note: a.dwellingNote === null,
        });
        expect(struct(en)).toEqual(struct(zh));
      }
    }
  });

  it("理由里写星名拼音与五行英文名", () => {
    const a = adviseObject({ verdicts, affinity }, { category: "desk", material: "原木" }, "en");
    expect(a.recommendedDirections.map((r) => r.reason)).toContain("Sheng Qi direction; shares the piece's Wood element");
    expect(a.personalFit).toBe("This piece belongs to Wood, one of your favorable elements, so feel free to use it generously.");
  });

  it("词表齐全：品类、材质、形状都有英文", () => {
    for (const c of OBJECT_CATEGORIES) {
      expect(OBJECT_CATEGORY_EN[c], c).toBeTruthy();
      expect(CATEGORY_LABEL[c]).toBeTruthy();
    }
    for (const m of ["原木", "金属", "玻璃", "陶瓷", "皮革", "棉麻", "石材"]) expect(OBJECT_MATERIAL_EN[m as keyof typeof OBJECT_MATERIAL_EN], m).toBeTruthy();
    for (const s of ["长条", "方", "圆", "尖锐", "波浪"]) expect(OBJECT_SHAPE_EN[s as keyof typeof OBJECT_SHAPE_EN], s).toBeTruthy();
  });
});

describe("EP-fs-en ③ joinEn", () => {
  it("美式 serial comma；否定句可用 or", () => {
    expect(joinEn(["Wood"])).toBe("Wood");
    expect(joinEn(["Wood", "Fire"])).toBe("Wood and Fire");
    expect(joinEn(["Wood", "Fire"], "or")).toBe("Wood or Fire");
    expect(joinEn(["teal", "green", "red"])).toBe("teal, green, and red");
  });
  it("「命局忌」两种五行时英文写 or（does not favor Wood or Fire）", () => {
    const f = computeFengshui({ birth: mk(), chart: computeUnifiedChart(mk()), language: "en" });
    const avoid = f.remedies.find((r) => r.id === "fs-color-avoid");
    if (avoid && f.elementAffinity.unfavorableElements.length > 1) expect(avoid.traditional).toMatch(/ or /);
  });
});

describe("EP-fs-en ③ 标签函数", () => {
  it("方位/星/卦/组别按语言给出", () => {
    expect(directionLabel("SE", "zh")).toBe("东南");
    expect(directionLabel("SE", "en")).toBe("Southeast");
    expect(starLabel("生气", "en")).toBe("Sheng Qi");
    expect(starLabel("生气", "zh")).toBe("生气");
    expect(guaLabel("坎", "en")).toBe("Kan");
    expect(groupLabel("东四命", "en")).toBe("East Group");
    expect(groupLabel("西四宅", "zh")).toBe("西四宅");
  });
});
