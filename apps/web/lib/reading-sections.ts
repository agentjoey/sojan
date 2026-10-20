import type { ReadingSection } from "@/components/ReadingTabs";

/**
 * 解读 markdown 的分节规则：`/api/reading`（判断是否完整、决定落库）与命盘页（渲染页签）
 * 共用这一份，保证「服务端认为齐全」与「页面切出来的分节」是同一个口径。
 * 无指令：服务端路由与客户端组件都能 import。
 */

/** 输出契约（packages/llm/src/prompt.ts）：恰好四个 H2 分节——概览 / 命理 / 心理 / 成长。 */
export const READING_SECTION_COUNT = 4;

/**
 * 流式响应的失败结尾标记。服务端在「没有落库」时（流中出错、缺分节、写库失败）以它收尾，
 * 客户端读到即丢弃已收到的正文并提示重新生成——错误文案不再拼进正文。
 */
export const READING_ERROR_MARKER = "\n\n[[SOJAN_READING_ERROR]]";

/**
 * 流式响应的成功结尾标记：服务端落库成功后才发。客户端**只认它**为成功——
 * 两个标记都没有（函数被中途杀掉、连接断开）同样按失败处理（final review M1）。
 */
export const READING_SAVED_MARKER = "\n\n[[SOJAN_READING_SAVED]]";

/** 流未结束时客户端要扣住不展示的尾部长度：任一标记都可能正在半截到达。 */
export const READING_MARKER_HOLDBACK = Math.max(READING_ERROR_MARKER.length, READING_SAVED_MARKER.length);

const H2 = /^##\s+/m;

function toSection(p: string, i: number): ReadingSection {
  const nl = p.indexOf("\n");
  const title = (nl === -1 ? p : p.slice(0, nl)).trim();
  const body = (nl === -1 ? "" : p.slice(nl + 1)).trim();
  const accent = title.includes("命理") ? "fire" : title.includes("心理") ? "water" : /成长|建议|共振/.test(title) ? "metal" : undefined;
  return { key: `${i}-${title}`, title, body, accent };
}

/** 按 `##` 切节（命盘页沿用的规则：首个 `##` 之前若有内容，也作为一节展示）。 */
export function splitSections(md: string): ReadingSection[] {
  return md.split(H2).filter(Boolean).map(toSection);
}

/**
 * 「完整」= 由 `##` 标题起头、标题与正文都非空的分节数达到契约要求的四节。
 * 首个 `##` 之前的前言不算一节；末节只有标题没有正文（截断在标题处）也不算。
 * western=null 的降级路径由 sanitizeReading 保留全部标题、只替换心理节正文，仍算完整。
 */
export function isCompleteReading(md: string): boolean {
  const headed = md.split(H2).slice(1).map(toSection);
  return headed.filter((s) => s.title && s.body).length >= READING_SECTION_COUNT;
}
