import { DIRECTION_LABEL, type Direction, type ElementAffinity, type Gua } from "./directions";
import type { DirectionVerdict, Star } from "./eight-mansions";
import {
  COLOR_EN, DIRECTION_LABEL_EN, ELEMENT_EN, GROUP_EN, GUA_PINYIN, MATERIAL_EN, STAR_LABEL_EN, joinEn,
  type FengshuiLanguage,
} from "./en";
import type { MingGua } from "./ming-gua";
import { ENV_PSYCH_ANCHORS, type Effort } from "./env-psych";
import type { DwellingGua } from "./dwelling";

/**
 * 化解方案（EP-fs-03）。两条硬约束：
 *  1) 成本分级 —— 首发市场租房比例高，「零成本」条目必须排在前面；
 *  2) 诚实标注 —— evidence='传统象征' 的条目 modern 恒为 null。
 */

/** 定义在 env-psych.ts（remedy 依赖它，反向会成环）；此处重新导出保持公开 API 不变。 */
export type { Effort };

type RemedyBase = {
  id: string;
  /**
   * 这条化解针对的方位；与方位无关（配色、环境心理锚点、命宅不配）为 null。
   * 页面「盘即导航」按它过滤——此前是从 `target` 文案反解方位名，文案一换语言就失效。
   */
  direction: Direction | null;
  target: string;
  action: string;
  effort: Effort;
  tenancy: "租房可做" | "需自有";
  traditional: string;
};

/**
 * 与 EnvPsychAnchor 同构的判别联合：「传统象征 ⇒ modern 恒为 null」由编译器强制。
 * 这是产品的诚实标注约束，不能只靠运行期测试守。
 */
export type Remedy =
  | (RemedyBase & { evidence: "双重支撑"; modern: string })
  | (RemedyBase & { evidence: "传统象征"; modern: null });

const EFFORT_ORDER: Record<Effort, number> = { 零成本: 0, 挪动: 1, 添置: 2, 装修: 3 };

/**
 * 零成本优先；同级内双重支撑先于传统象征；再按 id 稳定排序。
 * 传入 `{ tenancy: "rent" }` 时，「需自有」条目整体降到最后 —— 首发市场租房比例高，
 * 「把卧室换到东南方」对租客是废话，但**折叠不等于删除**（用户可能将来买房）。
 */
export function sortRemedies(list: Remedy[], opts?: { tenancy: "rent" | "own" }): Remedy[] {
  const demote = (r: Remedy) => (opts?.tenancy === "rent" && r.tenancy === "需自有" ? 1 : 0);
  return [...list].sort((a, b) =>
    demote(a) - demote(b) ||
    EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort] ||
    (a.evidence === b.evidence ? 0 : a.evidence === "双重支撑" ? -1 : 1) ||
    a.id.localeCompare(b.id),
  );
}

/**
 * 化解文案（EP-fs-en ③）。中英两套模板逐条并排：结构（id/成本/证据/租住/方位）只写一次，
 * 只有文字随语言变——排序、过滤、诚实标注在两种语言下必然一致。中文模板与改动前逐字相同。
 * 英文术语见 `en.ts` 顶部术语表。
 */
type Lang = FengshuiLanguage;
const lower = (d: Direction) => DIRECTION_LABEL_EN[d].toLowerCase();

const PERSONAL_COPY = {
  zh: {
    deskTarget: (d: Direction) => `${DIRECTION_LABEL[d]}（生气方）`,
    deskAction: (d: Direction) => `久坐处朝向调到${DIRECTION_LABEL[d]}——书桌坐位面朝生气方，笔电与常用物也顺这个朝向摆`,
    deskTraditional: (g: Gua, d: Direction) => `${g}命生气方在${DIRECTION_LABEL[d]}，主振作与进取`,
    deskModern: "固定一个稳定的工作朝向能减少每次落座时的环境重新定位成本",
    bedTarget: (d: Direction) => `${DIRECTION_LABEL[d]}（天医方）`,
    bedAction: (d: Direction) => `床头靠${DIRECTION_LABEL[d]}一侧的实墙，头顶避开横梁与吊柜`,
    bedTraditional: (g: Gua, d: Direction) => `${g}命天医方在${DIRECTION_LABEL[d]}，主安稳休养`,
    bedModern: "床头贴实墙可降低睡眠中对背后空间的低度警觉",
    worstTarget: (d: Direction, s: Star) => `${DIRECTION_LABEL[d]}（${s}方）`,
    worstAction: (d: Direction) => `把储物柜、少用的杂物挪到${DIRECTION_LABEL[d]}，别把每天久待的位置放在这里`,
    worstTraditional: (g: Gua, d: Direction, s: Star) => `${DIRECTION_LABEL[d]}为${g}命的${s}方，宜静宜压`,
    colorTarget: "常用物件配色",
    colorAction: (colors: string[], materials: string[]) => `寝具、窗帘、桌面小物往${colors.join("、")}靠，材质可选${materials.join("、")}`,
    colorTraditional: (els: string[]) => `命局喜用${els.join("、")}，色与材同气相求`,
    avoidTarget: "配色减法",
    avoidAction: (colors: string[]) => `大面积的${colors.join("、")}少用，尤其是卧室主色`,
    avoidTraditional: (els: string[]) => `命局忌${els.join("、")}`,
  },
  en: {
    deskTarget: (d: Direction) => `${DIRECTION_LABEL_EN[d]} (Sheng Qi direction)`,
    deskAction: (d: Direction) => `Face the ${lower(d)} where you sit for long stretches: sit at your desk facing your Sheng Qi direction, and arrange your laptop and everyday items to face the same way`,
    deskTraditional: (g: Gua, d: Direction) => `For a ${GUA_PINYIN[g]} Life Gua, the Sheng Qi direction is the ${lower(d)}, associated with drive and forward momentum`,
    deskModern: "Keeping one stable working orientation can cut down on re-orienting yourself to the room each time you sit down",
    bedTarget: (d: Direction) => `${DIRECTION_LABEL_EN[d]} (Tian Yi direction)`,
    bedAction: (d: Direction) => `Set the head of your bed against a solid wall on the ${lower(d)} side, with no beam or overhead cabinet above it`,
    bedTraditional: (g: Gua, d: Direction) => `For a ${GUA_PINYIN[g]} Life Gua, the Tian Yi direction is the ${lower(d)}, associated with rest and recovery`,
    bedModern: "A headboard against a solid wall can ease the background alertness you keep toward the space behind you while you sleep",
    worstTarget: (d: Direction, s: Star) => `${DIRECTION_LABEL_EN[d]} (${STAR_LABEL_EN[s]} direction)`,
    worstAction: (d: Direction) => `Move storage cabinets and rarely used things to the ${lower(d)}, and avoid making it the place where you spend most of your day`,
    worstTraditional: (g: Gua, d: Direction, s: Star) => `The ${lower(d)} is the ${STAR_LABEL_EN[s]} direction for a ${GUA_PINYIN[g]} Life Gua, best kept quiet and anchored with heavy, still things`,
    colorTarget: "Colors for everyday things",
    colorAction: (colors: string[], materials: string[]) => `Lean bedding, curtains and desk accessories toward ${joinEn(colors.map((c) => COLOR_EN[c] ?? c))}; for materials, consider ${joinEn(materials.map((m) => MATERIAL_EN[m] ?? m))}`,
    colorTraditional: (els: string[]) => `Your chart favors ${joinEn(els.map((e) => ELEMENT_EN[e] ?? e))}; colors and materials of the same element are said to resonate with it`,
    avoidTarget: "Colors to scale back",
    avoidAction: (colors: string[]) => `Go easy on large areas of ${joinEn(colors.map((c) => COLOR_EN[c] ?? c))}, especially as the main color of the bedroom`,
    avoidTraditional: (els: string[]) => `Your chart does not favor ${joinEn(els.map((e) => ELEMENT_EN[e] ?? e), "or")}`,
  },
} satisfies Record<Lang, unknown>;

/**
 * Layer 0 个人层面化解：只依赖命卦四吉四凶 + 用神喜忌，不需要居所。
 * 宅层面化解属波 2（EP-fs-12）。
 */
export function buildPersonalRemedies(
  mingGua: MingGua,
  verdicts: Record<Direction, DirectionVerdict>,
  affinity: ElementAffinity,
  lang: Lang = "zh",
): Remedy[] {
  const c = PERSONAL_COPY[lang];
  const all = Object.values(verdicts);
  const good = all.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank);
  const bad = all.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank);
  const sheng = good.find((v) => v.star === "生气") ?? good[0]!;
  const tianyi = good.find((v) => v.star === "天医") ?? good[1] ?? sheng;
  const worst = bad[0]!;
  const g = mingGua.guaName;

  const out: Remedy[] = [
    {
      id: "fs-desk-sheng",
      direction: sheng.direction,
      target: c.deskTarget(sheng.direction),
      action: c.deskAction(sheng.direction),
      effort: "零成本",
      tenancy: "租房可做",
      traditional: c.deskTraditional(g, sheng.direction),
      modern: c.deskModern,
      evidence: "双重支撑",
    },
    {
      id: "fs-bed-tianyi",
      direction: tianyi.direction,
      target: c.bedTarget(tianyi.direction),
      action: c.bedAction(tianyi.direction),
      effort: "挪动",
      tenancy: "租房可做",
      traditional: c.bedTraditional(g, tianyi.direction),
      modern: c.bedModern,
      evidence: "双重支撑",
    },
    {
      id: "fs-worst-static",
      direction: worst.direction,
      target: c.worstTarget(worst.direction, worst.star),
      action: c.worstAction(worst.direction),
      effort: "挪动",
      tenancy: "租房可做",
      traditional: c.worstTraditional(g, worst.direction, worst.star),
      modern: null,
      evidence: "传统象征",
    },
  ];

  if (affinity.favorableDirections.length) {
    out.push({
      id: "fs-color-favorable",
      direction: null,
      target: c.colorTarget,
      action: c.colorAction(affinity.favorableColors.slice(0, 3), affinity.favorableMaterials.slice(0, 3)),
      effort: "添置",
      tenancy: "租房可做",
      traditional: c.colorTraditional(affinity.favorableElements),
      modern: null,
      evidence: "传统象征",
    });
  }

  if (affinity.unfavorableColors.length) {
    out.push({
      id: "fs-color-avoid",
      direction: null,
      target: c.avoidTarget,
      action: c.avoidAction(affinity.unfavorableColors.slice(0, 2)),
      effort: "零成本",
      tenancy: "租房可做",
      traditional: c.avoidTraditional(affinity.unfavorableElements),
      modern: null,
      evidence: "传统象征",
    });
  }

  // 注意：用 continue 收窄而非 .filter —— TS 不会通过 .filter 收窄判别联合，
  // 那样 a.modern 仍是 string|null，无法匹配 Remedy 的「双重支撑 ⇒ modern: string」分支。
  let picked = 0;
  for (const [i, a] of ENV_PSYCH_ANCHORS.entries()) {
    if (a.evidence !== "双重支撑") continue;
    if (picked >= 4) break;
    picked += 1;
    const text = lang === "en" ? a.en : a;
    out.push({
      id: `fs-anchor-${i}`,
      direction: null,
      target: text.traditional,
      action: text.action,
      effort: a.effort, // 显式取自锚点，不从文案猜（见 env-psych.ts 的 effort 注释）
      tenancy: "租房可做",
      traditional: text.traditional,
      modern: text.modern,
      evidence: a.evidence,
    });
  }

  return sortRemedies(out);
}

const DWELLING_COPY = {
  zh: {
    bestTarget: (d: Direction, s: Star) => `${DIRECTION_LABEL[d]}（宅${s}位）`,
    bestAction: (d: Direction) => `把每天久待的活动放到${DIRECTION_LABEL[d]}那一块——工作、阅读、会客都算`,
    bestTraditional: (g: Gua, d: Direction, s: Star) => `${g}宅的${s}位在${DIRECTION_LABEL[d]}`,
    bestModern: "把高频活动集中到采光与动线最好的区域，减少一天里的无谓走动与环境切换",
    worstTarget: (d: Direction, s: Star) => `${DIRECTION_LABEL[d]}（宅${s}位）`,
    worstAction: (d: Direction) => `${DIRECTION_LABEL[d]}那一块用作储物或过道，别安排长时间停留`,
    worstTraditional: (g: Gua, d: Direction, s: Star) => `${g}宅的${s}位在${DIRECTION_LABEL[d]}，宜静宜压`,
    mismatchTarget: "命宅不相配",
    mismatchAction: "房子整体与你不同组时，重点放在你自己的四吉方——床头与常坐位对准这几个方位即可，不必推翻整套布局",
    mismatchTraditional: (group: DwellingGua["group"]) => `${group}与你的命卦不同组`,
    mismatchModern: "能改的先改：睡眠与久坐这两件事占掉一天多数时间，调它们的性价比高于重排全屋",
  },
  en: {
    bestTarget: (d: Direction, s: Star) => `${DIRECTION_LABEL_EN[d]} (house ${STAR_LABEL_EN[s]} sector)`,
    bestAction: (d: Direction) => `Move the things you do for long stretches each day into the ${lower(d)} area of your home: working, reading and having people over all count`,
    bestTraditional: (g: Gua, d: Direction, s: Star) => `In a ${GUA_PINYIN[g]} house, the ${STAR_LABEL_EN[s]} sector is in the ${lower(d)}`,
    bestModern: "Concentrating your most frequent activities in the area with the best light and flow cuts down on needless walking and switching between spaces over the day",
    worstTarget: (d: Direction, s: Star) => `${DIRECTION_LABEL_EN[d]} (house ${STAR_LABEL_EN[s]} sector)`,
    worstAction: (d: Direction) => `Use the ${lower(d)} area of your home for storage or as a passageway, rather than somewhere you linger`,
    worstTraditional: (g: Gua, d: Direction, s: Star) => `In a ${GUA_PINYIN[g]} house, the ${STAR_LABEL_EN[s]} sector is in the ${lower(d)}, best kept quiet and anchored with heavy, still things`,
    mismatchTarget: "Home and Life Gua in different groups",
    mismatchAction: "When the home as a whole belongs to a different group from you, focus on your own four favorable directions: line up your bed and your usual seat with them, without overhauling the whole layout",
    mismatchTraditional: (group: DwellingGua["group"]) => `This home belongs to the ${GROUP_EN[group]}, a different group from your Life Gua`,
    mismatchModern: "Change what you can first: sleep and long hours of sitting take up most of the day, so adjusting those two pays off more than rearranging the whole home",
  },
} satisfies Record<Lang, unknown>;

/**
 * 宅层化解（EP-fs-12）：依据宅卦八方，而非命卦。与个人层化解并存 ——
 * 个人层说「你自己该朝哪坐」，宅层说「这套房子的哪块地方该怎么用」。
 */
export function buildDwellingRemedies(dwelling: DwellingGua, match: "相配" | "相冲", lang: Lang = "zh"): Remedy[] {
  const c = DWELLING_COPY[lang];
  const sectors = Object.values(dwelling.sectors);
  const bestSector = sectors.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank)[0]!;
  const worstSector = sectors.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank)[0]!;
  const g = dwelling.guaName;
  const out: Remedy[] = [
    {
      id: "fs-dw-best",
      direction: bestSector.direction,
      target: c.bestTarget(bestSector.direction, bestSector.star),
      action: c.bestAction(bestSector.direction),
      effort: "挪动",
      tenancy: "租房可做",
      traditional: c.bestTraditional(g, bestSector.direction, bestSector.star),
      modern: c.bestModern,
      evidence: "双重支撑",
    },
    {
      id: "fs-dw-worst",
      direction: worstSector.direction,
      target: c.worstTarget(worstSector.direction, worstSector.star),
      action: c.worstAction(worstSector.direction),
      effort: "挪动",
      tenancy: "租房可做",
      traditional: c.worstTraditional(g, worstSector.direction, worstSector.star),
      modern: null,
      evidence: "传统象征",
    },
  ];
  if (match === "相冲") {
    out.push({
      id: "fs-dw-mismatch",
      direction: null,
      target: c.mismatchTarget,
      action: c.mismatchAction,
      effort: "零成本",
      tenancy: "租房可做",
      traditional: c.mismatchTraditional(dwelling.group),
      modern: c.mismatchModern,
      evidence: "双重支撑",
    });
  }
  return out;
}
