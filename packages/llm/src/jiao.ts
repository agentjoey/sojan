import type { ReadingLanguage } from "./prompt";
import type { UnifiedChart, Omen } from "@sojan/core";
import { deriveSpirit } from "@sojan/core";
import { extractFacts } from "./facts";
import { sanitizeReading } from "./prompt";
import { correctMutagens } from "./correct";
import { chat, chatStream, type ChatMessage } from "./client";
import { resolveLlmConfig, isLlmConfigured } from "./provider";
import { buildSpiritSystemPrompt, stripSpiritScaffolding, type SpiritOptions, type SpiritTurn } from "./spirit";

// ─── 掷筊问事（EP-jiao）────────────────────────────────────────────
// 结构与 dream.ts 同构（buffered 一次性产出——后置校验需要完整文本）。
// 与解梦的唯一实质差异：多一道 correctOmen（筊象是客户端掷出的既成事实，
// 模型不得改写），且该校验是「替换」不是「删除」，见下方注释。

export const JIAO_MAX_CHARS = 500;

const ALL_OMENS: readonly Omen[] = ["圣筊", "笑筊", "阴筊"];

/**
 * 筊象后置机械校验（EP-jiao）——与 correctMutagens 同层，但策略相反。
 *
 * `correctMutagens` 对错配的四化是「只删不替」（删掉「化X」保留星名，不注入新声明）。
 * 筊象不能这么做：句子形如「你掷出了圣筊」，把「圣筊」删掉会切出病句。筊象是客户端
 * 掷出、随请求传入的**既成事实**，实际值唯一且已知，所以这里**替换**成实际筊象是安全的
 * ——不是在猜一个新事实，是在用已知事实覆盖模型的口误。
 *
 * 三词闭集，逐个扫，成本可忽略。
 */
export function correctOmen(text: string, actual: Omen): { text: string; fixed: string[] } {
  const fixed: string[] = [];
  let out = text;
  for (const o of ALL_OMENS) {
    if (o === actual) continue;
    if (out.includes(o)) {
      out = out.split(o).join(actual);
      fixed.push(o);
    }
  }
  return { text: out, fixed };
}

const JIAO_RULES_ZH = `

# 掷筊问事规则
**本节规则覆盖你在上文人格设定里读到的『正面回答，先给立场』——那是本命之灵在其他场景（日常对话/解梦）下的默认做法，问卦场景下不适用：不给立场、不下判断，只做投射引导。下面的规则以本节为准。**
- **你不是在回答「是」或「否」。** 筊象是一面镜子，不是答案——它的价值在于对方看到它时的第一反应。
- 按三拍走，一段自然口语走完，不用标题、不分节、不列表：
  ① **开口先复述掷出的是什么筊象**（一句，必须用给定的筊象名，不得改写成别的筊象），并带出这一筊象在传统里的基本含义——圣筊=允，阴筊=不允，笑筊=神明发笑、问得不清楚。这一句不是可省略的开场白，②必须扣着这个具体含义往下走。
  ② 把**这一具体筊象**（以及①里带出的那层含义）当投射面——请对方留意自己看到这个结果时最初的那一下反应（松了口气？失望？想再掷一次？），结合你已知的这个人（命盘倾向/记忆/自陈）判断该往哪个方向问，而不是替他决定该怎么做。这一拍必须是**换成另一个筊象就说不通**的具体反思——不得写成任何筊象通用的模板句（例如无论圣筊/阴筊都能套用的「留意你的感受」这类空话）。
  ③ 一个邀请（一句，具体可执行）。
- **绝不给方向性结论**：不说「应该/不应该」「适合/不适合」「时机对/不对」「可以放心去做」。对方问的事你不替他决定，也不暗示倾向。复述筊象的传统含义（允/不允/问得不清楚）是在陈述这一卦是什么，不是在替他做决定——不要把①里的传统含义延伸成②③里的行动建议。
- **回应里只能出现你被告知的那一个筊象名**（圣筊/笑筊/阴筊三选一）。不得提及另外两个筊象的名字，哪怕是用来做对比或排除——例如「不是圣筊那样的允，而是阴筊」这句话本身就提到了「圣筊」，同样不可以写。对你来说，另外两个筊象根本不存在，只有你被告知的这一个是真实发生的事。
- 不预测结果、不谈吉凶应期。涉及医疗、法律、财务、生死的问题一律转向：这类事需要专业人士，你能陪他看的是他自己怎么想。
- 长度：不超过 10 句、400 字。命盘事实至多引一处，且要真正融进②的判断依据里，不是贴标签。默认不以问句结尾。`;

const JIAO_RULES_EXHAUSTED_ZH = `

# 掷筊问事规则（连续三次笑筊）
**本节同样覆盖上文『正面回答，先给立场』——这里也不给立场、不下判断。**
- 对方连掷三次都是笑筊。传统里笑筊的意思是「问得不清楚」——**不要再解筊象**，改为帮对方**拆解这个问题本身**。
- 一段自然口语走完：这个问题里可能藏着几个不同的问题？他真正想知道的那一个是什么？给一到两句具体的重问方向。
- 同样**绝不给方向性结论**，不替他决定该怎么做。
- 全程只可能提到「笑筊」这一个筊象名——不要提圣筊或阴筊的名字，哪怕是做对比。
- 长度：不超过 8 句、300 字。`;

const JIAO_RULES_EN = `

# Divination-reading rules
**This section OVERRIDES the "answer directly, lead with your stance" instruction from your persona above — that is 本命之灵's default in other contexts (everyday chat / dream reading), not here: in this divination context you do not take a stance or render a verdict, you only guide reflection. The rules below govern.**
- **You are NOT answering yes or no.** The omen is a mirror, not an answer — its value lies in the asker's first reaction to it.
- Three beats in ONE natural spoken paragraph — no headings, no sections, no lists:
  ① **Open by restating exactly which omen was thrown** (one sentence, using EXACTLY the omen given; never substitute a different one), and name its traditional meaning — Sheng Jiao = assent, Yin Jiao = dissent, Xiao Jiao = laughter from the divine, the question is unclear. This sentence is not a skippable preamble — beat ② must build on this specific meaning.
  ② Read **this specific omen** (and the meaning named in ①) as a projection surface — invite them to notice their very first reaction to this result (relief? disappointment? an urge to throw again?), and use what you know of them (chart tendencies/memory/self-report) to judge WHICH direction to ask in, rather than deciding for them. This beat must be a reflection that would **stop making sense if you swapped in a different omen** — never a generic line that fits any omen interchangeably.
  ③ One invitation (one concrete sentence).
- **Never give a directional conclusion**: no "should"/"shouldn't", "suitable"/"unsuitable", "the timing is right/wrong", "go ahead with confidence". Naming the omen's traditional meaning (assent/dissent/unclear) states what the throw IS, not a decision on their behalf — do not stretch ①'s traditional meaning into an action recommendation in ②/③.
- **Mention only the ONE omen name you were told** (Sheng Jiao / Xiao Jiao / Yin Jiao). Never name either of the other two, even for contrast or exclusion — e.g. do not write "not the assent of Sheng Jiao, but Yin Jiao"; that sentence itself names Sheng Jiao and is not allowed. As far as you're concerned, the other two omens do not exist — only the one you were told actually happened.
- No predicting outcomes, no auspicious/inauspicious timing. For medical, legal, financial, or life-and-death questions, redirect: those need a professional; what you can sit with them on is how they themselves feel.
- Length: at most 10 sentences / 260 words. At most ONE chart fact, and it must actually drive beat ②. Do not end with a question by default.`;

const JIAO_RULES_EXHAUSTED_EN = `

# Divination-reading rules (three consecutive 笑筊)
**This section also overrides "answer directly, lead with your stance" above — no stance, no verdict here either.**
- They have thrown 笑筊 three times. Traditionally 笑筊 means the question itself is unclear — **stop reading the omen** and help them **take the question apart** instead.
- One natural spoken paragraph: how many different questions might be hiding inside this one? Which is the one they actually want answered? Give one or two concrete ways to re-ask.
- Still **never give a directional conclusion**; do not decide for them.
- The only omen name that can ever come up here is 笑筊 — never name 圣筊 or 阴筊, even for contrast.
- Length: at most 8 sentences / 200 words.`;

type JiaoOptions = SpiritOptions & {
  /** 连续三次笑筊：换一套规则（拆解问题本身，不解筊象）。 */
  exhausted?: boolean;
  /** 同一次问卦内追问时传入当轮筊象，让后置校验继续生效；续接历史时不传。 */
  omenForFollowUp?: Omen;
};

/**
 * system 提示 + 首轮 user 消息——generateJiaoReply 与 continueJiaoReply 共用。
 *
 * `question` 为 `undefined`：续接历史场景（历史表只存灵的回复全文与摘要，不存问题
 * 原文，见迁移 0019），没有问题原文可以重建首轮 user 消息，但命盘事实仍必须喂给
 * 模型，因此并进 system 尾部；`firstUser` 返回 `undefined`，调用方据此跳过那条消息。
 * 这套重载分流与 `dream.ts` 的 `buildDreamPrompt` 完全同构。
 */
function buildJiaoPrompt(
  chart: UnifiedChart,
  question: string,
  omen: Omen,
  opts: JiaoOptions,
): { system: string; firstUser: string; language: ReadingLanguage; zh: boolean };
function buildJiaoPrompt(
  chart: UnifiedChart,
  question: undefined,
  omen: Omen | undefined,
  opts: JiaoOptions,
): { system: string; firstUser: undefined; language: ReadingLanguage; zh: boolean };
function buildJiaoPrompt(chart: UnifiedChart, question: string | undefined, omen: Omen | undefined, opts: JiaoOptions) {
  const language = opts.language ?? "en";
  const zh = language === "zh";
  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const rules = opts.exhausted
    ? (zh ? JIAO_RULES_EXHAUSTED_ZH : JIAO_RULES_EXHAUSTED_EN)
    : (zh ? JIAO_RULES_ZH : JIAO_RULES_EN);
  const baseSystem = buildSpiritSystemPrompt(persona, chart, language, opts) + rules;
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;

  if (question === undefined) {
    const factsNote = zh
      ? `\n\n以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}`
      : `\n\nHere are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}`;
    return { system: baseSystem + factsNote, firstUser: undefined, language, zh };
  }

  const firstUser = zh
    ? `以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n对方为一件具体的事掷了筊。\n\n他问的是：「${question}」\n\n掷出的筊象是：**${omen}**（这是已经掷出的既成事实，不得改写成别的筊象）\n\n请以「本命之灵」的身份、用简体中文、按掷筊问事规则回应。`
    : `Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nThey threw the divination blocks about a specific matter.\n\nTheir question: "${question}"\n\nThe omen thrown: **${omen}** (this already happened — never substitute a different omen)\n\nRespond as their 本命之灵, following the divination-reading rules.`;
  return { system: baseSystem, firstUser, language, zh };
}

/** 后置链共用：脚手架护栏 → sanitizeReading → correctOmen → correctMutagens → fallback。 */
function finalizeJiaoOutput(
  raw: string,
  language: ReadingLanguage,
  chart: UnifiedChart,
  actualOmen: Omen | undefined,
  fallbackText: string,
): { text: string; fixedOmens: string[] } {
  let out = stripSpiritScaffolding(raw);
  out = sanitizeReading(out, language, chart.western !== null);
  let fixedOmens: string[] = [];
  if (actualOmen) {
    const c = correctOmen(out, actualOmen);
    out = c.text;
    fixedOmens = c.fixed;
  }
  out = correctMutagens(out, chart.ziwei.birthMutagens).text;
  if (out.length < 6) out = fallbackText;
  return { text: out, fixedOmens };
}

/** 掷筊解读完整管线。buffered（后置校验需要完整文本）。 */
export async function generateJiaoReply(
  chart: UnifiedChart,
  question: string,
  omen: Omen,
  opts: JiaoOptions = {},
): Promise<{ text: string; fixedOmens: string[] }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const q = question.trim();
  if (!q) throw new Error("问题内容为空");
  if (q.length > JIAO_MAX_CHARS) throw new Error(`问题过长（>${JIAO_MAX_CHARS} 字）`);

  const { system, firstUser, language, zh } = buildJiaoPrompt(chart, q, omen, opts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: firstUser },
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 900 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  const result = finalizeJiaoOutput(
    all,
    language,
    chart,
    opts.exhausted ? undefined : omen,
    zh ? "我在。这一卦先放着——把你想问的那件事再说得具体些？" : "I'm here. Let's set this throw aside — could you say the matter more concretely?",
  );
  console.info(`[jiao] model=${cfg.model} omen=${omen} chars=${result.text.length} fixedOmens=${result.fixedOmens.length}`);
  return result;
}

/**
 * 掷筊追问：两种场景共用（与 continueDreamReply 同构）。
 * 1. 同一次问卦内的多轮追问：`question` 传原问题（重建首轮 prompt），`priorTurns` 从灵的第一条回应开始。
 * 2. 续接历史：`question` 传 `undefined`，`priorTurns[0]` 就是历史里存的回复全文。
 * 两种场景下 `priorTurns` 都只活在浏览器会话内、随请求即用即弃，服务端不落库。
 */
export async function continueJiaoReply(
  chart: UnifiedChart,
  question: string | undefined,
  priorTurns: SpiritTurn[],
  followUp: string,
  opts: JiaoOptions = {},
): Promise<{ text: string; fixedOmens: string[] }> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const q = question?.trim();
  if (question !== undefined && !q) throw new Error("问题内容为空");
  if (question === undefined && priorTurns.length === 0) throw new Error("没有可续接的历史问卦");
  // 传了问题原文 = 同一次问卦内的追问，必须同时给出那一卦的筊象——首轮 prompt 会
  // 把筊象当既成事实写进去，缺了它就只能凭空编一个，那正是本功能反幻觉链要防的事。
  // 宁可抛错也不给默认值：一个错的筊象比一次失败的调用危险得多。
  if (q !== undefined && !opts.omenForFollowUp) throw new Error("同一次问卦的追问必须传入 omenForFollowUp");
  const f = followUp.trim();
  if (!f) throw new Error("追问内容为空");
  if (f.length > JIAO_MAX_CHARS) throw new Error(`追问内容过长（>${JIAO_MAX_CHARS} 字）`);

  // 三元而非直接传 `q`：buildJiaoPrompt 用重载对 question 是否 undefined 做了返回类型
  // 分流（firstUser 是 string 还是 undefined），三元的每个分支里 TS 才能把类型收窄到
  // 对应重载。与 dream.ts 的 continueDreamReply 同一处理，理由见那边注释。
  // `opts.omenForFollowUp!`：上面 204 行的复合条件 `q !== undefined && !opts.omenForFollowUp`
  // 在运行时已经保证「走到这个分支时 omenForFollowUp 必然有值」，但 TS 的控制流分析不会
  // 跨语句把一个 && 复合条件拆开去收窄其中某个属性访问，只能手动断言；断言的安全性由
  // 上面那行 throw 兜底。
  const { system, firstUser, language, zh } = q !== undefined
    ? buildJiaoPrompt(chart, q, opts.omenForFollowUp!, opts)
    : buildJiaoPrompt(chart, undefined, undefined, opts);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...(firstUser !== undefined ? [{ role: "user", content: firstUser } as ChatMessage] : []),
    ...priorTurns.map((t): ChatMessage => ({ role: t.role === "user" ? "user" : "assistant", content: t.content })),
    { role: "user", content: f },
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 900 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  const result = finalizeJiaoOutput(
    all,
    language,
    chart,
    opts.omenForFollowUp,
    zh ? "我在。想接着问哪一部分？" : "I'm here. Which part would you like to go into?",
  );
  console.info(`[jiao:follow-up] model=${cfg.model} chars=${result.text.length}`);
  return result;
}

/**
 * 问卦历史条目摘要（EP-jiao）——与 summarizeDreamEntry 同一条隐私红线：
 * 不逐字复述问题原文，只给第三人称的主题标签，供历史列表辨认。
 */
const JIAO_SUMMARY_MAX_CHARS = 160;

export async function summarizeJiaoEntry(
  question: string,
  replyText: string,
  opts: SpiritOptions = {},
): Promise<string> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const zh = (opts.language ?? "en") === "zh";

  const system = zh
    ? `你在为一次「掷筊问事」生成一句极简标签，供用户以后在历史列表里认出这是哪一卦。规则：不超过 30 字；只能是第三人称转述的主题（例如「一个关于职业选择的问卦」），绝不逐字复述用户问的原话或引用具体细节（不出现具体的人名、公司、地点、金额）；不含姓名、生日、坐标等个人信息；不做吉凶判断、不透露筊象结果；只输出这一句话，不要引号、不要前缀。`
    : `Write one ultra-short label (English, at most 15 words) so the user can later recognize this divination session in a history list. Rules: third-person paraphrase of the THEME only (e.g. "a question about a career choice") — never quote their question verbatim or repeat specifics (no names, companies, places, amounts); no personal identifiers; no fortune-telling verdict and do not reveal the omen; output only that one sentence — no quotes, no prefix.`;
  const user = zh
    ? `他问的事（仅供你概括主题，不要逐字复述）：${question.slice(0, 400)}\n\n灵的回应要点：${replyText.slice(0, 400)}`
    : `Their question (summarize the theme only, do not quote it back): ${question.slice(0, 400)}\n\nKey point from the reading: ${replyText.slice(0, 400)}`;

  const raw = await chat(cfg, [{ role: "system", content: system }, { role: "user", content: user }], { signal: opts.signal, maxTokens: 80 });
  return raw.trim().replace(/^["「『]|["」』]$/g, "").slice(0, JIAO_SUMMARY_MAX_CHARS);
}
