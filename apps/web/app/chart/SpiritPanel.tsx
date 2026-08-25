"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Omen } from "@sojan/core";
import { deriveSpirit } from "@sojan/core";
import type { Profile } from "@/lib/profiles";
import { isTelegram } from "@/lib/tg/client";
import { useTgMainButton, haptics } from "@/lib/tg/ui";
import { supabase } from "@/lib/supabase";
import { Markdown } from "@/components/Markdown";
import { Paywall } from "@/components/Paywall";
import { Bubble } from "@/components/tg/native";
import { QuickPrompts } from "@/components/spirit/QuickPrompts";
import { useLocale, useT } from "@/lib/i18n/I18nProvider";

type Turn = { id: string; role: "user" | "spirit"; content: string };

/**
 * 掷筊问事的追问面板（EP-jiao 最终评审 C2 + I4 合并修复）。
 *
 * 这个组件此前叫「本命之灵通用聊天面板」，挂在 /chart 页做常驻多轮对话：读写
 * `spirit_messages`（`apps/web/lib/spirit.ts` 的 `listMessages`/`appendMessage`，
 * 该文件按 profile 存全量历史、不按会话切分），追问打通用 `/api/spirit/chat`。
 * EP-jiao 把它挪来 /spirit 承载「掷完筊之后的追问」，只加了 `seedTurns` 去渲染
 * 开场，但 `listMessages`/`appendMessage`/`/api/spirit/chat` 三处都原样留着，
 * 于是：
 *   1) 第二次问卦时，`listMessages` 拉出的是同一 profile 下**上一卦的全部追问
 *      记录**，倒序拼在新一卦的 seed 后面——时序错乱、旧对话污染新卦上下文
 *      （最终评审 C2，100% 复现于每个用户的第二次问卦）。
 *   2) 追问打通用 `/api/spirit/chat`，不带掷筊的 `JIAO_RULES_*` 与
 *      `correctOmen` 后置校验——掷筊守护栏在第二轮就消失（最终评审 I4）。
 *
 * 现在的形态：**整个组件一次性、不持久化，追问统一走 `/api/spirit/jiao` 的
 * `followUp` 分支（`continueJiaoReply`）**。本仓库唯一的挂载点就是掷筊后的对话
 * （`app/spirit/page.tsx`），不再有别的调用方需要「常驻可续、写库」的语义——
 * 历史续问走的是 `jiao_history` 的 `full_text` 锚点（见 spec §2），与这里的
 * `turns` state 完全无关，从不读写 `spirit_messages`。追问因此与首轮同一套
 * `JIAO_RULES_*`/`correctOmen`，掷筊守护栏覆盖整场对话，不再有「第一轮受管、
 * 第二轮起失控」的缺口。
 *
 * 若未来真要重新引入一条「常驻可续」的通用灵对话（非掷筊语境），请新开一个
 * 组件，不要把这两种持久化语义拧回同一个文件——历史已经证明它们的边界完全不同。
 */
export function SpiritPanel({
  profile,
  seedTurns,
  omen,
  exhausted,
  question,
  memory,
  questionnaire,
}: {
  profile: Profile;
  /** 这一卦（或续接的历史那一卦）的开场：用户问的 + 灵的解读。只用于渲染 + 拼历史，不持久化。 */
  seedTurns: { role: "user" | "spirit"; content: string }[];
  /** 这一卦的筊象——追问必须带上，见 `continueJiaoReply` 的 `omenForFollowUp` 契约。 */
  omen: Omen;
  /** 是否为「三笑筊拆解」那一卦；决定追问沿用哪一套掷筊规则（同一场对话保持一致）。 */
  exhausted: boolean;
  /**
   * 首轮问题原文。同一次问卦内追问时有值（服务端据此重建首轮 prompt）；
   * 从历史摘要续接时为 `undefined`——`jiao_history` 不存问题原文（迁移 0019），
   * 见 `continueJiaoReply` 的「续接历史」重载。
   */
  question?: string;
  memory?: string;
  questionnaire?: string;
}) {
  const { locale } = useLocale();
  const t = useT();
  const spirit = deriveSpirit(profile.chart);
  const [turns, setTurns] = useState<Turn[]>(() =>
    seedTurns.map((st, i) => ({ id: `seed-${i}`, role: st.role, content: st.content })),
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useTgMainButton({
    text: streaming ? t("jiao.reading") : t("jiao.followUpSubmit"),
    onClick: () => handleSubmit(),
    enabled: !streaming && !!input.trim(),
    visible: isTelegram(),
  });

  // 新消息到达时滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, streaming]);

  // 清空输入后重置 textarea 高度
  useEffect(() => {
    const el = textareaRef.current;
    if (el && !input) el.style.height = "auto";
  }, [input]);

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      setNeedLogin(false);
      // 追问续接锚点：question 有值 = 同一次问卦内追问——continueJiaoReply 会用
      // question+omen 重建首轮 prompt，priorTurns 因此要从「灵的第一条回应」算起
      // （跳过 turns[0] 那条用户原始提问，它会被重建，不能重复喂给模型）。
      // question 为 undefined = 续接历史：turns[0] 本身就是历史里存的回复全文，
      // priorTurns 就是 turns 原样。两种场景与 continueJiaoReply 的两个重载一一对应。
      const priorTurns = (question !== undefined ? turns.slice(1) : turns).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const userTurn: Turn = { id: `user-${Date.now()}`, role: "user", content: trimmed };
      setTurns((prev) => [...prev, userTurn]);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      try { haptics.light(); } catch {}

      setStreaming(true);
      try {
        const { data: sessionData } = await supabase().auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch("/api/spirit/jiao", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-zj-locale": locale, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            chart: profile.chart,
            followUp: trimmed,
            priorTurns,
            omen,
            exhausted,
            ...(question !== undefined ? { question } : {}),
            memory,
            questionnaire,
          }),
        });
        if (res.status === 401) {
          // 未登录/会话过期：连 LLM 都没调用，撤回刚追加的用户消息——不该孤零零挂在对话里。
          setTurns((prev) => prev.slice(0, -1));
          setNeedLogin(true);
          return;
        }
        if (res.status === 402) {
          // 匿名级免费额度烧完：走付费墙 UI，别把服务端裸 JSON 错误体当文案展示。
          setTurns((prev) => prev.slice(0, -1));
          setError("__paywall__");
          return;
        }
        if (!res.ok) throw new Error((await res.text()) || t("spirit.unavailable"));
        const reply = await res.text();
        setTurns((prev) => [...prev, { id: `spirit-${Date.now()}`, role: "spirit", content: reply }]);
        try { haptics.success(); } catch {}
      } catch (e) {
        setTurns((prev) => prev.slice(0, -1));
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStreaming(false);
      }
    },
    [streaming, turns, question, omen, exhausted, profile.chart, memory, questionnaire, locale, t],
  );

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    await submitText(input);
  }

  const accentVar = `var(--color-${spirit.dominantElement})`;
  const elementLabel = t(`chart.element${spirit.dominantElement.charAt(0).toUpperCase() + spirit.dominantElement.slice(1)}`);

  return (
    <div className="flex flex-1 flex-col">
      {/* compact hero */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-2">
        <div
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[var(--radius-card)]"
          style={{ background: "var(--color-ink)" }}
        >
          <span className="font-serif text-[32px] font-bold" style={{ color: accentVar }}>
            {elementLabel}
          </span>
        </div>
        <div className="min-w-0">
          <h2 className="font-serif text-[18px] font-bold leading-tight text-ink">{spirit.archetype}</h2>
          <p className="mt-0.5 text-[12px] text-muted">{elementLabel} · {t("spirit.online")}</p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-2">{spirit.coreTension || spirit.archetype}</p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        {turns.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <Bubble role={m.role === "user" ? "user" : "spirit"}>
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">
                  {/* 气泡本身只靠位置/配色区分角色——视觉上够用，但屏幕阅读器听到的
                      是无差别的一段段文本。补一个可视隐藏前缀区分「你问」/灵答。 */}
                  <span className="sr-only">{t("jiao.youAsked")}：</span>
                  {m.content}
                </p>
              ) : m.content ? (
                <div className="reading-prose"><Markdown text={m.content} /></div>
              ) : streaming ? (
                <span className="inline-block animate-pulse text-cinnabar">▋</span>
              ) : null}
            </Bubble>
          </div>
        ))}
      </div>

      {/* Error & Quick Prompts */}
      <div className="px-4 pb-2">
        {needLogin && (
          <div
            className="mb-3 px-3 py-2 text-[12px]"
            style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}
          >
            {t("jiao.needLogin")}
            <Link href="/account?next=/spirit" className="ml-2 underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
              {t("jiao.needLoginCta")} →
            </Link>
          </div>
        )}
        {error === "__paywall__" ? (
          <div className="mb-3">
            <Paywall reason="quota" onClose={() => setError(null)} />
          </div>
        ) : error ? (
          <div
            className="mb-3 px-3 py-2 text-[12px]"
            style={{
              borderRadius: "var(--radius-card)",
              background: "var(--color-error-bg)",
              color: "var(--color-seal)",
              border: "1px solid var(--color-error-line)",
            }}
          >
            {error}
          </div>
        ) : null}
        {!streaming && <QuickPrompts onSelect={(p) => void submitText(p)} />}
      </div>

      {/* Sticky Input */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 z-10 flex items-end gap-2 border-t border-[var(--color-line)] bg-paper px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={t("jiao.followUpPlaceholder")}
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-[var(--radius-button)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-[var(--color-cinnabar)] focus:outline-none disabled:opacity-60"
          style={{ minHeight: 44, maxHeight: 120 }}
        />
        {!isTelegram() && (
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="inline-flex h-[44px] shrink-0 items-center justify-center px-4 text-[14px] font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
          >
            {t("jiao.followUpSubmit")}
          </button>
        )}
      </form>
    </div>
  );
}
