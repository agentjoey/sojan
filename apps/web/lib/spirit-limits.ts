/**
 * /api/spirit/{dream,jiao} 请求体的上限常量。独立成无依赖模块：客户端也要用
 * SPIRIT_MAX_TURNS 裁剪 priorTurns，不能为此把 zod 带进浏览器 bundle。
 * 服务端校验在 lib/spirit-request.ts（并从那里再导出，路由与测试统一从那边取）。
 */
export const SPIRIT_MAX_TURNS = 12;
export const SPIRIT_TURN_MAX_CHARS = 8000; // 英文 1200 token 回复可达 ~4800 字符，留足余量
export const SPIRIT_MEMORY_MAX_CHARS = 2000;
export const SPIRIT_QUESTIONNAIRE_MAX_CHARS = 2000;
