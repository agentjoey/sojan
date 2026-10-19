import { streamReading, resolveLlmConfig, isLlmConfigured } from "@sojan/llm";
import { getViewer } from "@/lib/account/uid";
import { resolveAccess } from "@/lib/access";
import { consumeLlm } from "@/lib/entitlements";
import { loadReadingTarget, storeReading } from "@/lib/data/reading";
import { READING_ERROR_MARKER, isCompleteReading } from "@/lib/reading-sections";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reading `{ profileId }` —— 为本人档案流式生成双声部解读（text/plain，逐块），
 * 并由服务端落库（review #1 #4）。
 *
 * 顺序：LLM 未配置 503 → 无会话 401 → anonymous 401 → 入参 400 → 非本人档案 404 →
 * 已有解读 409（不重复生成、不扣额度）→ 额度 402 → 流式。
 * 命盘取自库里冻结的档案，不信任客户端传来的出生信息/命盘。
 * 流正常结束且四分节齐全才写库；流中出错、缺分节、写库失败都不存，响应以
 * `READING_ERROR_MARKER` 收尾，错误细节只进服务端日志、不拼进正文。
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) {
    return new Response("LLM 未配置：请在环境变量设置 LLM_API_KEY（默认 provider=minimax, model=MiniMax-M3）。", {
      status: 503,
    });
  }

  // 身份只认会话；getViewer 一次拿到 uid 与验证状态（等价于 getUid + getViewer，少一次会话查询）
  const viewer = await getViewer();
  if (!viewer) return new Response("未登录", { status: 401 });
  if ((await resolveAccess(viewer)).level === "anonymous") return new Response("未登录", { status: 401 });
  const uid = viewer.uid;

  const body = await req.json().catch(() => ({}));
  const profileId = body?.profileId;
  if (typeof profileId !== "string" || !profileId) return new Response("缺少 profileId", { status: 400 });

  const profile = await loadReadingTarget(uid, profileId);
  if (!profile) return new Response("档案不存在", { status: 404 });
  if (profile.reading) return new Response("该档案已有解读", { status: 409 });

  const gate = await consumeLlm(uid);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const language = localeFromRequest(req);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 客户端断开后 enqueue 会抛，吞掉即可：上游已经由 req.signal 中止
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* 流已关闭 */
        }
      };
      let full = "";
      let saved = false;
      try {
        for await (const chunk of streamReading(profile.chart, { nickname: profile.nickname, language, signal: req.signal })) {
          full += chunk;
          send(chunk);
        }
        if (isCompleteReading(full)) {
          // false = 期间已有别的请求写入（或档案已删）：本次不算保存，客户端重试会走 409 读回已存的那份
          saved = await storeReading(uid, profile.id, full, cfg.model);
        } else {
          console.warn(`[reading] incomplete, not saved: sections<4 chars=${full.length}`);
        }
      } catch (e) {
        console.error("[reading] stream/save failed, not saved:", e);
      } finally {
        if (!saved) send(READING_ERROR_MARKER);
        try {
          controller.close();
        } catch {
          /* 流已关闭 */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Model": cfg.model },
  });
}
