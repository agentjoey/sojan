import { DIRECTION_LABEL, type Direction, type Gua } from "./directions";
import type { Star } from "./eight-mansions";

/**
 * 风水确定性层的英文词表（EP-fs-en）——英文 prompt 与英文反幻觉校验的**单一事实源**。
 *
 * 星名刻意用**拼音**（Sheng Qi / Jue Ming …）而不是意译：英文八宅文献里意译五花八门
 * （生气 = "Life Generating" / "Prosperity" / "Vitality"…），没法做机械对拍；拼音是
 * 业内通行写法，又只有一种拼法。英文 prompt 要求模型一律写拼音星名，
 * `verifyDirectionConsistency` 的英文路径也只认拼音——意译写法不在对拍范围内（弃权）。
 * `STAR_GLOSS_EN` 只用于在 prompt 里给模型一个释义，不参与对拍。
 */

export const DIRECTION_LABEL_EN: Record<Direction, string> = {
  N: "North", NE: "Northeast", E: "East", SE: "Southeast",
  S: "South", SW: "Southwest", W: "West", NW: "Northwest",
};

export const STAR_LABEL_EN: Record<Star, string> = {
  生气: "Sheng Qi", 天医: "Tian Yi", 延年: "Yan Nian", 伏位: "Fu Wei",
  绝命: "Jue Ming", 五鬼: "Wu Gui", 六煞: "Liu Sha", 祸害: "Huo Hai",
};

export const STAR_GLOSS_EN: Record<Star, string> = {
  生气: "vitality", 天医: "health and rest", 延年: "harmony and longevity", 伏位: "stability",
  绝命: "deep depletion", 五鬼: "restlessness", 六煞: "entanglement", 祸害: "minor setbacks",
};

export const GUA_PINYIN: Record<Gua, string> = {
  坎: "Kan", 坤: "Kun", 震: "Zhen", 巽: "Xun", 乾: "Qian", 兑: "Dui", 艮: "Gen", 离: "Li",
};

/** 东四命/西四命（人）与东四宅/西四宅（屋）在英文里都叫 East/West Group，由上下文区分人与屋。 */
export const GROUP_EN: Record<"东四命" | "西四命" | "东四宅" | "西四宅", string> = {
  东四命: "East Group", 西四命: "West Group", 东四宅: "East Group", 西四宅: "West Group",
};

export const ELEMENT_EN: Record<string, string> = {
  木: "Wood", 火: "Fire", 土: "Earth", 金: "Metal", 水: "Water",
};

/** 与 `ELEMENT_COLORS` 一一对应。 */
export const COLOR_EN: Record<string, string> = {
  青: "teal", 绿: "green", 红: "red", 橙: "orange", 紫: "purple", 黄: "yellow", 褐: "brown", 米: "beige",
  白: "white", 金: "gold", 银灰: "silver gray", 黑: "black", 藏蓝: "navy",
};

/** 与 `ELEMENT_MATERIALS` 一一对应。 */
export const MATERIAL_EN: Record<string, string> = {
  原木: "natural wood", 棉麻: "cotton and linen", 绿植: "green plants",
  皮革: "leather", 暖光: "warm lighting", 烛火: "candlelight",
  陶瓷: "ceramics", 石材: "stone", 夯土质感: "rammed-earth textures",
  金属: "metal", 玻璃: "glass", 镜面: "mirrored surfaces",
  水景: "water features", 流线造型: "flowing shapes", 深色织物: "dark fabrics",
};

/** 风水文案的语言。与 web 的 `Locale`、llm 的 `ReadingLanguage` 同值域。 */
export type FengshuiLanguage = "zh" | "en";

/**
 * 英文文案术语表（EP-fs-en ③，页面确定性文案与英文 prompt 共用）：
 * - 命卦 → Life Gua；宅卦 → "<卦拼音> house"（如 Kan house）；东/西四命、东/西四宅 → East/West Group
 * - 八星 → 拼音（Sheng Qi …），首次出现处可带 `STAR_GLOSS_EN` 释义；吉/凶 → favorable/unfavorable
 * - 本命八方 → personal directions；房屋八方 → house directions；X 方 → "X direction"；宅 X 位 → "house X sector"
 * - 日主 → day master；喜用/忌 → favorable/unfavorable element(s)
 * - 「宜静宜压」→ "best kept quiet and anchored with heavy, still things"（固定译法，化解与物件规则同一说法）
 * - 方位名：作标签时首字母大写（Southeast），在句中按英文惯例小写（to the southeast）
 */

export function directionLabel(d: Direction, lang: FengshuiLanguage): string {
  return lang === "en" ? DIRECTION_LABEL_EN[d] : DIRECTION_LABEL[d];
}

export function starLabel(s: Star, lang: FengshuiLanguage): string {
  return lang === "en" ? STAR_LABEL_EN[s] : s;
}

export function guaLabel(g: Gua, lang: FengshuiLanguage): string {
  return lang === "en" ? GUA_PINYIN[g] : g;
}

export function groupLabel(g: keyof typeof GROUP_EN, lang: FengshuiLanguage): string {
  return lang === "en" ? GROUP_EN[g] : g;
}

/** 五行中文 → 英文；查不到原样返回（不应发生，兜底不抛错）。 */
export function elementLabel(el: string, lang: FengshuiLanguage): string {
  return lang === "en" ? (ELEMENT_EN[el] ?? el) : el;
}

/** 英文列表（美式，带 serial comma）：a and b / a, b, and c；否定句用 "or"。文案句中用，标签行仍用逗号分隔。 */
export function joinEn(items: string[], conj: "and" | "or" = "and"): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}
