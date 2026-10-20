import { resolveLlmConfig, isLlmConfigured, generateJiaoReply, continueJiaoReply, JIAO_MAX_CHARS } from "@sojan/llm";
import type { UnifiedChart, Omen } from "@sojan/core";
import { consumeLlm } from "@/lib/entitlements";
import { resolveAccess } from "@/lib/access";
import { getUid, getViewer } from "@/lib/account/uid";
import { localeFromRequest } from "@/lib/i18n/server";
import { parseSpiritCommon } from "@/lib/spirit-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_OMENS: readonly string[] = ["圣筊", "笑筊", "阴筊"];

/**
 * POST /api/spirit/jiao —— 掷筊问事。chart 与问题随 body 传来，回复不落库
 * （落库的只有 jiao_history 的摘要/回复全文，由客户端经 server action 写）。
 *
 * ⚠️ `omen` 由**客户端**掷出后传入（掷是即时物理动作，服务端往返会毁掉手感，
 * 见 apps/web/lib/jiao.ts 的注释）。服务端只校验它在三词闭集内——不重新掷、
 * 也不替用户掷。筊象随后作为既成事实进 prompt，并由 correctOmen 后置兜底。
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_SPIRIT_ENABLED !== "1") return new Response("未开启", { status: 404 });
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });

  const body = await req.json().catch(() => ({}));
  const chart = body?.chart as UnifiedChart | undefined;
  const question = typeof body?.question === "string" ? body.question.trim() : undefined;
  const omenRaw = typeof body?.omen === "string" ? body.omen : undefined;
  const exhausted = body?.exhausted === true;
  const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";

  if (!chart) return new Response("缺少命盘 chart", { status: 400 });
  // priorTurns / memory / questionnaire 限长与 role 校验：先于鉴权与计量，非法入参不扣额度。
  const common = parseSpiritCommon(body);
  if (!common.ok) return new Response(common.message, { status: 400 });
  const { priorTurns, memory, questionnaire } = common.data;
  if (!followUp) {
    // 首次问卦：问题与筊象都必需。追问（含续接历史）时两者都可省。
    if (!question) return new Response("缺少问题 question", { status: 400 });
    if (!omenRaw) return new Response("缺少筊象 omen", { status: 400 });
  }
  if (omenRaw !== undefined && !VALID_OMENS.includes(omenRaw)) {
    return new Response("筊象非法", { status: 400 });
  }
  const omen = omenRaw as Omen | undefined;
  if (question && question.length > JIAO_MAX_CHARS) return new Response("问题过长", { status: 400 });
  if (followUp && followUp.length > JIAO_MAX_CHARS) return new Response("追问过长", { status: 400 });

  // 鉴权闸门与 /api/spirit/dream 完全一致：必须解析出身份，且不能是 anonymous 级。
  // 顺序上先鉴权再计量——鉴权失败不该扣额度。
  // 身份只取会话 cookie（getUid），不再读 Authorization 头。
  const userId = await getUid();
  if (!userId) return new Response("未登录", { status: 401 });
  const access = await resolveAccess(await getViewer());
  if (access.level === "anonymous") return new Response("未登录", { status: 401 });
  const gate = await consumeLlm(userId);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const language = localeFromRequest(req);
  const opts = {
    language,
    exhausted,
    memory,
    questionnaire,
    ...(omen ? { omenForFollowUp: omen } : {}),
  };
  try {
    const out = followUp
      ? (await continueJiaoReply(chart, question, priorTurns, followUp, opts)).text
      : (await generateJiaoReply(chart, question as string, omen as Omen, opts)).text;
    return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
