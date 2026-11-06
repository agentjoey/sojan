import { DIRECTION_LABEL, ELEMENT_DIRECTIONS, type Direction, type ElementAffinity } from "./directions";
import type { DirectionVerdict } from "./eight-mansions";
import { DIRECTION_LABEL_EN, ELEMENT_EN, STAR_LABEL_EN, type FengshuiLanguage } from "./en";

/**
 * 物件顾问（EP-fs-04）。三层叠加：物件五行 × 品类硬规则 × 与命主的关系。
 * 全部确定性计算 —— LLM 只负责把结果说成人话。
 */

export const OBJECT_CATEGORIES = [
  "bed", "desk", "sofa", "mirror", "plant", "aquarium", "storage", "lamp", "art", "other",
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ObjectCategory, string> = {
  bed: "床", desk: "书桌", sofa: "沙发", mirror: "镜子", plant: "绿植",
  aquarium: "鱼缸", storage: "储物柜", lamp: "灯具", art: "装饰画/摆件", other: "其他",
};

/** 品类英文名（EP-fs-en ③）。 */
export const OBJECT_CATEGORY_EN: Record<ObjectCategory, string> = {
  bed: "Bed", desk: "Desk", sofa: "Sofa", mirror: "Mirror", plant: "Plant",
  aquarium: "Aquarium", storage: "Storage cabinet", lamp: "Lamp", art: "Artwork or ornament", other: "Other",
};

/** 品类硬规则（查表，非模型生成）。 */
const CATEGORY_RULES: Record<ObjectCategory, string[]> = {
  bed: ["床头贴实墙，头顶避开横梁与吊柜", "床不正对房门"],
  desk: ["坐位背靠实墙，不背对门与通道", "桌面留出可见的空白区"],
  sofa: ["沙发背后宜有实墙或高柜依托", "不正对入户门形成穿堂"],
  mirror: ["镜面不正对床，避免半醒时的突发反射", "不正对入户门"],
  plant: ["选好养的品种，枯萎及时更换", "不遮挡主要动线与光源"],
  aquarium: ["忌置于卧室，水声与光影影响睡眠", "需稳定维护，久置浑浊反成负担"],
  storage: ["宜置于凶方，宜静宜压", "高柜勿压床头与坐位"],
  lamp: ["卧室避免顶部强直射光", "夜间照明选低色温"],
  art: ["尖锐造型避开床与坐位正对方向", "内容宜静不宜躁"],
  other: ["避开主要动线，勿阻挡光源与通行"],
};

/** 品类硬规则英文版，与中文逐条对应（条数由测试锁定）。 */
const CATEGORY_RULES_EN: Record<ObjectCategory, string[]> = {
  bed: ["Set the headboard against a solid wall, with no beam or overhead cabinet above it", "Keep the bed out of direct line with the bedroom door"],
  desk: ["Sit with a solid wall behind you, not with your back to a door or walkway", "Leave some clear space on the desktop"],
  sofa: ["Back the sofa against a solid wall or a tall cabinet", "Don't line it up directly with the front door, where it would sit in a straight path through the room"],
  mirror: ["Don't let the mirror face the bed, so you aren't startled by a sudden reflection when half-awake", "Don't let it face the front door directly"],
  plant: ["Choose easy-care varieties, and replace any that wither", "Don't let it block main walkways or light"],
  aquarium: ["Keep it out of the bedroom, where the sound of water and moving light can disturb sleep", "It needs steady upkeep; a tank left to turn murky becomes a burden instead"],
  storage: ["Suits an unfavorable direction, which is best kept quiet and anchored with heavy, still things", "Don't let tall cabinets loom over the bed or your seat"],
  lamp: ["Avoid strong, direct overhead light in the bedroom", "Use warm, low color-temperature light at night"],
  art: ["Keep sharp shapes from pointing straight at the bed or your seat", "Choose calm rather than agitated subjects"],
  other: ["Keep it out of main walkways, and don't let it block light or passage"],
};

const MATERIAL_ELEMENT = {
  原木: "木", 实木: "木", 竹: "木", 藤: "木", 棉麻: "木", 纸: "木",
  皮革: "火", 塑料: "火",
  陶瓷: "土", 石材: "土", 大理石: "土", 水泥: "土",
  金属: "金", 不锈钢: "金", 铜: "金", 玻璃: "金", 镜面: "金",
  水: "水", 织物: "水",
} as const satisfies Record<string, string>;
export type ObjectMaterial = keyof typeof MATERIAL_ELEMENT;

const SHAPE_ELEMENT = {
  长条: "木", 竖高: "木", 尖锐: "火", 三角: "火",
  方: "土", 扁平: "土", 圆: "金", 弧形: "金", 波浪: "水", 不规则: "水",
} as const satisfies Record<string, string>;
export type ObjectShape = keyof typeof SHAPE_ELEMENT;

/** 材质/形状的英文显示名。键必须与上面两张五行表一致——表单的 value 仍传中文键（五行按它查）。 */
export const OBJECT_MATERIAL_EN: Record<ObjectMaterial, string> = {
  原木: "Natural wood", 实木: "Solid wood", 竹: "Bamboo", 藤: "Rattan", 棉麻: "Cotton and linen", 纸: "Paper",
  皮革: "Leather", 塑料: "Plastic",
  陶瓷: "Ceramic", 石材: "Stone", 大理石: "Marble", 水泥: "Concrete",
  金属: "Metal", 不锈钢: "Stainless steel", 铜: "Copper or brass", 玻璃: "Glass", 镜面: "Mirrored surface",
  水: "Water", 织物: "Fabric",
};

export const OBJECT_SHAPE_EN: Record<ObjectShape, string> = {
  长条: "Long and narrow", 竖高: "Tall", 尖锐: "Pointed", 三角: "Triangular",
  方: "Square", 扁平: "Low and flat", 圆: "Round", 弧形: "Curved", 波浪: "Wavy", 不规则: "Irregular",
};

// EP-fs-debt：`color?` 曾经在这里，全链路（表单/顾问逻辑/i18n）都没有任何一处
// 真正读它——不是"顾问逻辑漏读"，是从没有任何东西写过它，纯粹的死字段，删掉
// （连同 i18n 里 `fengshui.object.color` 一起，见 zh.ts/en.ts）。
export type ObjectQuery = {
  category: ObjectCategory;
  material?: string;
  shape?: string;
  intendedDirection?: Direction;
};

export type ObjectAdvice = {
  category: ObjectCategory;
  categoryLabel: string;
  elementOfObject: string | null;
  recommendedDirections: { direction: Direction; label: string; reason: string }[];
  avoid: { direction: Direction; label: string; reason: string }[];
  categoryRules: string[];
  personalFit: string;
  /** 用户指定了摆放方位时，该方位的八宅判语 */
  intendedVerdict: DirectionVerdict | null;
  /** 命宅异组、交集为空时的说明；没话说则为 null */
  dwellingNote: string | null;
};

export type ObjectAdviceInput = {
  verdicts: Record<Direction, DirectionVerdict>;
  affinity: ElementAffinity;
  /** Layer 1 起可选传入宅卦八方；不传 = 波1 弱版行为，逐字节不变 */
  dwellingSectors?: Record<Direction, DirectionVerdict>;
};

function elementOf(q: ObjectQuery): string | null {
  if (q.material && q.material in MATERIAL_ELEMENT) return MATERIAL_ELEMENT[q.material as ObjectMaterial];
  if (q.shape && q.shape in SHAPE_ELEMENT) return SHAPE_ELEMENT[q.shape as ObjectShape];
  return null;
}

/** 顾问结论的文字（EP-fs-en ③）。结构由 `adviseObject` 统一算，这里只管措辞。 */
const ADVICE_COPY = {
  zh: {
    category: (c: ObjectCategory) => CATEGORY_LABEL[c],
    rules: (c: ObjectCategory) => CATEGORY_RULES[c],
    label: (d: Direction) => DIRECTION_LABEL[d],
    reasonMatch: (v: DirectionVerdict, el: string) => `${v.star}方，且与物件五行${el}同气`,
    reason: (v: DirectionVerdict) => `${v.star}方`,
    avoid: (v: DirectionVerdict) => `${v.star}方，久待或重器不宜`,
    dwellingNote: "这套房子的吉方与你的命卦吉方不重合，以下按你自己的吉方给建议——人比房子要紧，先顾好你久待的那几处。",
    fitUnknown: "材质与造型未定，先按四吉方摆放即可；定下来后可再看五行是否顺你的喜用。",
    fitFavorable: (el: string) => `物件五行为${el}，正是你命局喜用，可放心多用。`,
    fitUnfavorable: (el: string) => `物件五行为${el}，属你命局所忌，宜节制体量与面积，少作主色。`,
    fitNeutral: (el: string) => `物件五行为${el}，对你不偏不倚，按方位与用途安排即可。`,
  },
  en: {
    category: (c: ObjectCategory) => OBJECT_CATEGORY_EN[c],
    rules: (c: ObjectCategory) => CATEGORY_RULES_EN[c],
    label: (d: Direction) => DIRECTION_LABEL_EN[d],
    reasonMatch: (v: DirectionVerdict, el: string) => `${STAR_LABEL_EN[v.star]} direction; shares the piece's ${ELEMENT_EN[el] ?? el} element`,
    reason: (v: DirectionVerdict) => `${STAR_LABEL_EN[v.star]} direction`,
    avoid: (v: DirectionVerdict) => `${STAR_LABEL_EN[v.star]} direction; not for spots where you linger or for your key furniture`,
    dwellingNote: "This home's favorable directions don't overlap with those of your Life Gua, so the suggestions below follow your own favorable directions. You matter more than the house: start with the spots where you spend the most time.",
    fitUnknown: "The material and shape aren't settled yet, so start with your four favorable directions. Once they are, you can check whether its element suits you.",
    fitFavorable: (el: string) => `This piece belongs to ${ELEMENT_EN[el] ?? el}, one of your favorable elements, so feel free to use it generously.`,
    fitUnfavorable: (el: string) => `This piece belongs to ${ELEMENT_EN[el] ?? el}, an element your chart doesn't favor — keep its size and surface area modest, and don't let it set the room's main color.`,
    fitNeutral: (el: string) => `This piece belongs to ${ELEMENT_EN[el] ?? el}, which is neutral for you — place it according to direction and use.`,
  },
} satisfies Record<FengshuiLanguage, unknown>;

export function adviseObject(input: ObjectAdviceInput, q: ObjectQuery, lang: FengshuiLanguage = "zh"): ObjectAdvice {
  const { verdicts, affinity, dwellingSectors } = input;
  const c = ADVICE_COPY[lang];
  const el = elementOf(q);
  const all = Object.values(verdicts);
  const good = all.filter((v) => v.auspicious).sort((a, b) => a.rank - b.rank);
  const bad = all.filter((v) => !v.auspicious).sort((a, b) => a.rank - b.rank);

  // Layer 1：推荐位需同时是命卦吉方与宅卦吉方。交集为空说明这套房子在这件物件上
  // 帮不上忙——此时退回命卦吉方（人比房子更要紧），并显式说明，而不是给空数组。
  // ⚠️ 结构事实：八宅里「命卦四吉方 ∩ 宅卦四吉方」只可能是 **4 或 0**（同组则四吉方
  //    完全重合、异组则一格不留；8×8 全组合枚举验证过），所以下面这个过滤要么全留、
  //    要么全空退回 `good`——`usable` 恒等于 `good`，**过滤本身是空操作**，强版相对
  //    弱版唯一多出来的可观察产物是 `dwellingNote`。改这段前先想清楚这一点，别把它
  //    当成一个真的会筛掉部分方位的交集。（下游 ObjectAdvisorForm.tsx、object/page.tsx、
  //    packages/llm 的 prompt.ts 各自都带了同一条更正，此处是源头。）
  const houseGood = dwellingSectors ? good.filter((v) => dwellingSectors[v.direction].auspicious) : good;
  const usable = houseGood.length ? houseGood : good;
  const dwellingNote = dwellingSectors && houseGood.length === 0 ? c.dwellingNote : null;

  // 物件五行自身的方位（若可判），与四吉方取交集优先
  const elDirs = el ? (ELEMENT_DIRECTIONS[el] ?? []) : [];
  const preferred = usable.filter((v) => elDirs.includes(v.direction));
  const picked = (preferred.length ? preferred : usable).slice(0, 3);

  const isFavorable = el ? affinity.favorableElements.includes(el) : false;
  const isUnfavorable = el ? affinity.unfavorableElements.includes(el) : false;

  return {
    category: q.category,
    categoryLabel: c.category(q.category),
    elementOfObject: el,
    recommendedDirections: picked.map((v) => ({
      direction: v.direction,
      label: c.label(v.direction),
      reason: el !== null && elDirs.includes(v.direction) ? c.reasonMatch(v, el) : c.reason(v),
    })),
    avoid: bad.slice(0, 2).map((v) => ({
      direction: v.direction,
      label: c.label(v.direction),
      reason: c.avoid(v),
    })),
    categoryRules: c.rules(q.category),
    personalFit: el === null
      ? c.fitUnknown
      : isFavorable
        ? c.fitFavorable(el)
        : isUnfavorable
          ? c.fitUnfavorable(el)
          : c.fitNeutral(el),
    intendedVerdict: q.intendedDirection ? verdicts[q.intendedDirection] : null,
    dwellingNote,
  };
}
