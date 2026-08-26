import { Solar } from "lunar-typescript";

/** 24 节气自立春定序——七十二候的序号基准。顺序固定，不随年份变。 */
const TERMS_FROM_LICHUN = [
  "立春","雨水","惊蛰","春分","清明","谷雨",
  "立夏","小满","芒种","夏至","小暑","大暑",
  "立秋","处暑","白露","秋分","寒露","霜降",
  "立冬","小雪","大雪","冬至","小寒","大寒",
] as const;

const HOU_ORDINAL: Record<string, number> = { 初候: 1, 二候: 2, 三候: 3 };

/** 当前七十二候（候名 + 物候名 + 1–72 序号）。 */
export type SolarHou = {
  /** 例如「处暑 初候」 */
  hou: string;
  /** 物候名，例如「鹰乃祭鸟」 */
  wuHou: string;
  /** 1–72，自立春初候起算（index = 节气序(0-based) × 3 + 候序(1..3)）。 */
  index: number;
  /** 节气名，例如「处暑」。 */
  term: string;
};

/**
 * 解析 lunar-typescript `getHou()` 的原始输出（如「处暑 初候」）为 `{ index, term }`。
 * 单独导出便于直接单测「解析防脆」路径，不必靠 mock 第三方库来触发异常分支。
 *
 * lunar-typescript 不直接提供 1–72 序号，只给「<节气> <初候|二候|三候>」这样的字符串。
 * 若格式与预期不符（空串、换了措辞、节气名不在 24 节气表里等），不静默给出错误序号，
 * 而是抛出可诊断的错误——一个悄悄算错的候序号比报错难查得多。
 */
export function parseSolarHouIndex(hou: string): { index: number; term: string } {
  const parts = hou.split(" ");
  const term = parts[0];
  const houWord = parts[1];
  const termIndex = term !== undefined ? TERMS_FROM_LICHUN.indexOf(term as (typeof TERMS_FROM_LICHUN)[number]) : -1;
  const houOrdinal = houWord !== undefined ? HOU_ORDINAL[houWord] : undefined;

  if (parts.length !== 2 || termIndex === -1 || houOrdinal === undefined) {
    throw new Error(
      `parseSolarHouIndex：无法解析候序号——lunar-typescript getHou() 返回「${hou}」，` +
        `期望「<节气> <初候|二候|三候>」格式（节气须在 24 节气表内），未能匹配。`,
    );
  }

  return { index: termIndex * 3 + houOrdinal, term };
}

/**
 * 取给定日期（默认今天）所处的七十二候。纯包装 lunar-typescript 的候/物候文字，
 * 1–72 序号由 `parseSolarHouIndex` 从 24 节气定序表确定性推导（详见该函数注释）。
 */
export function getCurrentSolarHou(date: Date = new Date()): SolarHou {
  const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar();
  const hou = lunar.getHou();
  const wuHou = lunar.getWuHou();
  const { index, term } = parseSolarHouIndex(hou);
  return { hou, wuHou, index, term };
}
