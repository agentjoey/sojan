import { Solar } from "lunar-typescript";

/** 当前七十二候（候名 + 物候名）。 */
export type SolarHou = {
  /** 例如「处暑 初候」 */
  hou: string;
  /** 物候名，例如「鹰乃祭鸟」 */
  wuHou: string;
};

/**
 * 取给定日期（默认今天）所处的七十二候。纯包装 lunar-typescript，不做任何
 * 推算——本任务（NavGrid Task 5）只消费这一行文字；完整 72 候标尺是后续 B 块的活。
 */
export function getCurrentSolarHou(date: Date = new Date()): SolarHou {
  const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar();
  return { hou: lunar.getHou(), wuHou: lunar.getWuHou() };
}
