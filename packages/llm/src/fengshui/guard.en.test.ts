import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@sojan/core";
import { extractFengshuiFacts } from "./facts";
import { sanitizeFengshui, verifyDirectionConsistency } from "./guard";

// EP-fs-en：英文输出此前完全不过两道机械校验。本文件只测 language="en" 路径；
// 中文路径的全部既有用例在 guard.test.ts，默认参数下行为不得变化。

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const facts = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
// 1990 男 = 坎1：Sheng Qi SE · Tian Yi E · Yan Nian S · Fu Wei N
//               Jue Ming SW · Wu Gui NE · Liu Sha NW · Huo Hai W
const DWELLING_N = { id: "d1", name: "Home", kind: "home" as const, tenancy: "rent" as const, facing: "N" as const };
// 向北 → 坐南 → 离宅：Sheng Qi E · Tian Yi SE · Yan Nian N · Fu Wei S
//                     Jue Ming NW · Wu Gui W · Liu Sha SW · Huo Hai NE
const l1 = extractFengshuiFacts(
  computeFengshui({ birth, chart: computeUnifiedChart(birth), dwelling: DWELLING_N }),
);

const en = (md: string, f = facts) => verifyDirectionConsistency(md, f, "en");

describe("EP-fs-en verifyDirectionConsistency（英文）", () => {
  it("前置：本文件字面量假定 1990 男 = 坎1", () => {
    const t = Object.fromEntries(facts.directions.map((d) => [d.direction, d.star]));
    expect(t).toEqual({ SE: "生气", E: "天医", S: "延年", N: "伏位", SW: "绝命", NE: "五鬼", NW: "六煞", W: "祸害" });
  });

  it("方位在前、星名写错 → 纠回查表值（拼音），correction 用英文记", () => {
    const { text, corrections } = en("The Southeast is your Jue Ming direction.");
    expect(text).toBe("The Southeast is your Sheng Qi direction.");
    expect(corrections).toEqual([{ direction: "SE", label: "Southeast", wrote: "Jue Ming", correct: "Sheng Qi" }]);
  });

  it("写对时零改动", () => {
    const md = "The Southeast is your Sheng Qi direction. East is Tian Yi.";
    expect(en(md)).toEqual({ text: md, corrections: [] });
  });

  it("覆盖常见排版：列表冒号、括号、加粗、表格", () => {
    const cases: [string, string][] = [
      ["- Southeast: Wu Gui (auspicious)", "- Southeast: Sheng Qi (auspicious)"],
      ["Southeast (Wu Gui)", "Southeast (Sheng Qi)"],
      ["- **Southeast**: **Wu Gui**", "- **Southeast**: **Sheng Qi**"],
      ["| Southeast | Wu Gui | good |", "| Southeast | Sheng Qi | good |"],
      ["Southeast — Wu Gui", "Southeast — Sheng Qi"],
    ];
    for (const [wrong, right] of cases) expect(en(wrong).text).toBe(right);
  });

  it("星名在前：「Jue Ming lies in the Southwest」类方位断言", () => {
    expect(en("Your Wu Gui direction is in the Southwest.").text).toBe("Your Jue Ming direction is in the Southwest.");
    expect(en("Sheng Qi lies in the North.").text).toBe("Fu Wei lies in the North.");
    expect(en("Tian Yi sits in the East.").corrections).toEqual([]);
  });

  it("大小写与连字符变体都认，改写时统一成标准拼音", () => {
    expect(en("north-east is your sheng qi direction").text).toBe("north-east is your Wu Gui direction");
    expect(en("Northeast: Shengqi").text).toBe("Northeast: Wu Gui");
    expect(en("Northeast: Sheng-Qi").text).toBe("Northeast: Wu Gui");
  });

  it("空格分写的 North west 整体认作 Northwest，不被拆成 west（否则按西方查表）", () => {
    const md = "North west is your Liu Sha direction.";
    expect(en(md)).toEqual({ text: md, corrections: [] });
    expect(en("North west is your Huo Hai direction.").text).toBe("North west is your Liu Sha direction.");
  });

  it("长方位名优先：Northeast 不被当成 North（嵌套方位名必须精确）", () => {
    const { text, corrections } = en("Northeast is Wu Gui; North is Fu Wei.");
    expect(corrections).toEqual([]);
    expect(text).toBe("Northeast is Wu Gui; North is Fu Wei.");
  });

  it("同一行多个方位各自独立纠正", () => {
    const { text, corrections } = en("- Southeast: Fu Wei · North: Sheng Qi");
    expect(text).toBe("- Southeast: Sheng Qi · North: Fu Wei");
    expect(corrections).toHaveLength(2);
  });

  it("不跨分句/跨行配对：逗号、句号、换行是边界", () => {
    for (const md of [
      "Face the Southeast, Jue Ming is the one to keep quiet.",
      "Face the Southeast. Jue Ming is the quiet one.",
      "Southeast\nJue Ming",
    ]) {
      expect(en(md)).toEqual({ text: md, corrections: [] });
    }
  });

  it("「East Group」不是方位名：不与后面的星名配对", () => {
    for (const md of ["You belong to the East Group: Sheng Qi is your best direction.", "Sheng Qi is East Group's anchor."]) {
      expect(en(md)).toEqual({ text: md, corrections: [] });
    }
  });

  it("单词边界：Eastern / Westerner 等不当方位名", () => {
    const md = "Eastern Sheng Qi traditions say so.";
    expect(en(md)).toEqual({ text: md, corrections: [] });
  });

  it("意译星名（Life Generating 等）不在对拍范围：弃权、不改写", () => {
    const md = "The Southeast is your Total Loss direction.";
    expect(en(md)).toEqual({ text: md, corrections: [] });
  });

  it("默认语言仍是中文：英文文本走中文路径时零改动（中文行为不变）", () => {
    const md = "The Southeast is your Jue Ming direction.";
    expect(verifyDirectionConsistency(md, facts)).toEqual({ text: md, corrections: [] });
  });
});

describe("EP-fs-en 英文：本命八方 / 房屋八方归属", () => {
  it("房屋八方说对 → 零改动（不拿命卦表去纠）", () => {
    const md = "In the house directions, East is Sheng Qi.";
    expect(en(md, l1)).toEqual({ text: md, corrections: [] });
  });

  it("房屋八方说错 → 按宅卦表纠回", () => {
    expect(en("In the house directions, East is Tian Yi.", l1).text).toBe("In the house directions, East is Sheng Qi.");
  });

  it("本命八方在 Layer 1 下仍按命卦表校验", () => {
    expect(en("In your personal directions, East is Sheng Qi.", l1).text).toBe("In your personal directions, East is Tian Yi.");
  });

  it("同一句两套对照、分句各判各的", () => {
    const md = "In your personal directions East is Tian Yi, while in the house directions East is Sheng Qi.";
    expect(en(md, l1)).toEqual({ text: md, corrections: [] });
  });

  it("逗号是分句边界：同句两套各自说错，按各自的表朝相反方向纠回", () => {
    const md = "In your personal directions East is Sheng Qi, while in the house directions East is Tian Yi.";
    expect(en(md, l1).text).toBe(
      "In your personal directions East is Tian Yi, while in the house directions East is Sheng Qi.",
    );
  });

  it("「your home / the house」这类弱词不算房屋八方标记（谈本命八方时常出现）", () => {
    const md = "In your home, the Southeast is Sheng Qi.";
    // 归属不明 + 两表在东南不同（命=Sheng Qi，宅=Tian Yi）→ 弃权；若把 home 当宅标记会被错改成 Tian Yi
    expect(en(md, l1)).toEqual({ text: md, corrections: [] });
  });

  it("归属不明且两表不同 → 弃权", () => {
    const md = "East is Huo Hai.";
    expect(en(md, l1)).toEqual({ text: md, corrections: [] });
  });

  it("列表行继承表头的归属", () => {
    const md = "House directions (Li house):\n- East: Tian Yi\n- North: Yan Nian";
    expect(en(md, l1).text).toBe("House directions (Li house):\n- East: Sheng Qi\n- North: Yan Nian");
  });
});

describe("EP-fs-en 整篇英文三分节对拍", () => {
  const CORRECT_DOC = `## The Layout

Your personal gua is Kan 1, in the East Group. Your four favorable directions are Southeast, East, South and North: Sheng Qi is in the Southeast, Tian Yi is in the East, Yan Nian is in the South, and Fu Wei is in the North. Jue Ming lies in the Southwest and Wu Gui lies in the Northeast.

| Direction | Star | |
| --- | --- | --- |
| Southeast | Sheng Qi | favorable |
| Southwest | Jue Ming | unfavorable |

## You and Your Space

- **Southeast**: **Sheng Qi** (favorable). Easier to feel energized here.
- **West**: **Huo Hai** (unfavorable). Better for storage.
Northwest is your Liu Sha direction, so avoid long hours there.

## What You Can Do

1. Turn your desk to face the Southeast (Sheng Qi).
2. Move rarely used storage to the Southwest, your Jue Ming direction (traditional symbolism).

These are suggestions for self-awareness and how you live in your space, not professional advice.
`;

  it("逐条正确：零 correction、零改动", () => {
    expect(en(CORRECT_DOC)).toEqual({ text: CORRECT_DOC, corrections: [] });
  });

  it("逐处注入错误：全部抓回并还原", () => {
    const injected: [string, string][] = [
      ["Sheng Qi is in the Southeast", "Wu Gui is in the Southeast"],
      ["Jue Ming lies in the Southwest", "Sheng Qi lies in the Southwest"],
      ["| Southeast | Sheng Qi |", "| Southeast | Liu Sha |"],
      ["**West**: **Huo Hai**", "**West**: **Tian Yi**"],
      ["Northwest is your Liu Sha", "Northwest is your Yan Nian"],
      ["Southeast (Sheng Qi)", "Southeast (Fu Wei)"],
    ];
    let wrong = CORRECT_DOC;
    for (const [ok, bad] of injected) {
      expect(wrong).toContain(ok);
      wrong = wrong.replace(ok, bad);
    }
    const { text, corrections } = en(wrong);
    expect(corrections).toHaveLength(injected.length);
    expect(text).toBe(CORRECT_DOC);
  });
});

describe("EP-fs-en sanitizeFengshui（英文）", () => {
  const s = (md: string) => sanitizeFengshui(md, facts, "en");

  it("传统象征行里删掉伪科学措辞，并把句首补回大写", () => {
    expect(s("- Keep storage in the Southwest (traditional symbolism). Studies show that this lowers stress."))
      .toBe("- Keep storage in the Southwest (traditional symbolism). This lowers stress.");
  });

  it("多种措辞一并清除", () => {
    const out = s("- A metal bowl (traditional symbolism) is scientifically proven to help; research shows it works, and clinical trials confirm it.");
    for (const w of ["scientifically proven", "research shows", "clinical trials confirm"]) {
      expect(out.toLowerCase()).not.toContain(w);
    }
  });

  it("非传统象征语境原样保留（判别力用例）", () => {
    const md = "- Put the bed against a solid wall; research shows this reduces night-time vigilance.";
    expect(s(md)).toBe(md);
  });

  it("中文默认路径不处理英文措辞（中文行为不变）", () => {
    const md = "- Bowl (traditional symbolism). Studies show it helps.";
    expect(sanitizeFengshui(md, facts)).toBe(md);
  });
});
