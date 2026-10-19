/**
 * 清空浏览器里属于当前账号的本地缓存：登出 / 注销时调用，避免换账号后读到上一位用户的
 * 命盘、时序、每日解读等缓存（共用设备场景）。
 * 键前缀 `zhaojian.*` 是刻意保留的旧品牌名（见 CLAUDE.md 命名沿革）。
 * 存储不可用（隐私模式等）时静默跳过，不挡登出/注销流程。
 */
const PREFIX = "zhaojian.";
const READING_DRAFT_KEY = "zhaojian.readingDraft";

export function clearLocalCaches(): void {
  try {
    // 先收集再删：边遍历边删会让 key(i) 错位。
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* localStorage 不可用：跳过 */
  }
  try {
    sessionStorage.removeItem(READING_DRAFT_KEY);
  } catch {
    /* sessionStorage 不可用：跳过 */
  }
}
