import type { GeoResult } from "@/app/actions";

/**
 * 起盘表单草稿（D1：未登录不能建档）。提交时发现没登录 → 草稿存进 sessionStorage、
 * 跳去登录；回到 /reading 挂载时取出回填（不自动提交）。只在本标签页内有效。
 * 键名保留 `zhaojian.*` 旧前缀（见 CLAUDE.md 命名沿革）。
 */
export type ReadingDraft = {
  nickname: string;
  date: string;
  isLunar: boolean;
  time: string;
  timeUnknown: boolean;
  gender: "male" | "female" | "";
  geo: GeoResult | null;
};

const KEY = "zhaojian.readingDraft";

export function saveReadingDraft(d: ReadingDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* 存储不可用（隐私模式等）：丢草稿，不挡跳转 */
  }
}

/** 取出并删除草稿；没有或内容损坏返回 null。 */
export function takeReadingDraft(): ReadingDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as ReadingDraft;
  } catch {
    return null;
  }
}
