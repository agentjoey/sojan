import type { Direction, Gua } from "./directions";
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
  绝命: "total loss", 五鬼: "five ghosts", 六煞: "six killings", 祸害: "mishaps",
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
  白: "white", 金: "gold", 银灰: "silver grey", 黑: "black", 藏蓝: "navy",
};

/** 与 `ELEMENT_MATERIALS` 一一对应。 */
export const MATERIAL_EN: Record<string, string> = {
  原木: "natural wood", 棉麻: "cotton and linen", 绿植: "green plants",
  皮革: "leather", 暖光: "warm lighting", 烛火: "candlelight",
  陶瓷: "ceramics", 石材: "stone", 夯土质感: "rammed-earth textures",
  金属: "metal", 玻璃: "glass", 镜面: "mirrored surfaces",
  水景: "water features", 流线造型: "flowing shapes", 深色织物: "dark fabrics",
};
