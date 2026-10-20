import { z } from "zod";
import type { SpiritTurn } from "@sojan/llm";

/**
 * /api/spirit/{dream,jiao} 共用的请求体公共字段校验（review #6）。
 * 这些字段原先不设上限地一路进 prompt（还会计量扣额度），一个超大请求体就能烧光 token。
 * 校验必须在鉴权与 consumeLlm 之前：入参非法不扣额度。
 *
 * 12 条上限与客户端「只发最近 12 条」对齐（见 app/dream/page.tsx、app/chart/SpiritPanel.tsx）；
 * 超出由服务端显式 400，不再静默截断。
 */
import { SPIRIT_MAX_TURNS, SPIRIT_TURN_MAX_CHARS, SPIRIT_MEMORY_MAX_CHARS, SPIRIT_QUESTIONNAIRE_MAX_CHARS } from "./spirit-limits";
export { SPIRIT_MAX_TURNS, SPIRIT_TURN_MAX_CHARS, SPIRIT_MEMORY_MAX_CHARS, SPIRIT_QUESTIONNAIRE_MAX_CHARS };

const turnSchema = z.object({
  role: z.enum(["user", "spirit"]),
  content: z.string().max(SPIRIT_TURN_MAX_CHARS),
});

// null 与缺省一视同仁（客户端的 `memory ?? undefined` 经 JSON 序列化后即缺省）。
const commonSchema = z.object({
  priorTurns: z.array(turnSchema).max(SPIRIT_MAX_TURNS).nullish(),
  memory: z.string().max(SPIRIT_MEMORY_MAX_CHARS).nullish(),
  questionnaire: z.string().max(SPIRIT_QUESTIONNAIRE_MAX_CHARS).nullish(),
});

const FIELD_ERROR: Record<string, string> = {
  priorTurns: "对话记录非法或过长",
  memory: "记忆过长",
  questionnaire: "问卷过长",
};

export type SpiritCommon = { priorTurns: SpiritTurn[]; memory?: string; questionnaire?: string };

/** 校验 priorTurns / memory / questionnaire；失败返回可直接作 400 响应体的中文短信息。 */
export function parseSpiritCommon(body: unknown): { ok: true; data: SpiritCommon } | { ok: false; message: string } {
  const r = commonSchema.safeParse(body ?? {});
  if (!r.success) {
    const key = String(r.error.issues[0]?.path[0] ?? "");
    return { ok: false, message: FIELD_ERROR[key] ?? "请求体非法" };
  }
  const { priorTurns, memory, questionnaire } = r.data;
  return {
    ok: true,
    data: { priorTurns: priorTurns ?? [], memory: memory ?? undefined, questionnaire: questionnaire ?? undefined },
  };
}
