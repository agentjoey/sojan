/**
 * 掷筊问事——危机前置拦截（EP-jiao 最终评审补项）。
 *
 * 背景：spec `docs/superpowers/specs/2026-08-25-jiao-divination-design.md` §4 写了两条
 * 必须同时满足的约束：
 *   1.「只机械前置拦最危险的」：自伤/轻生意图、医疗急症 → 不掷，直接转向求助资源。
 *   2.「不做宽泛关键词拦截」：拦太宽会把「该不该辞职」「这段关系要不要继续」这类正常
 *      人生抉择问题误伤成危机、毁掉产品体验；灵对任何问题不给方向性结论主要靠 prompt
 *      硬规则兜底（见 `packages/llm/src/jiao.ts` 的 `JIAO_RULES_ZH/EN`），本模块只截最窄
 *      的一层——因为不拦这一层的代价是：真随机掷出「阴筊」后，大字定格揭晓屏会把
 *      「不允」两个字放大展示给一个正在讲「我该不该活下去」的人，这发生在 LLM 介入
 *      之前，prompt 层的兜底完全来不及生效。
 *
 * 词表设计原则（同 `packages/llm/src/dream.ts` 的 `sanitizeDream` 一节注释，同等谨慎）：
 * - zh 用子串匹配（CJK 无词边界），但**不匹配裸单字**（「死」出现在「死心」「死板」
 *   「累死了」里，裸字匹配必炸假阳性）；一律用多字词/短语，短语越长越具体、越不容易
 *   被日常修辞误伤。
 * - en 用词边界正则（`\b…\b`），避免裸词子串误伤（例如不把 "stroke" 裸词放进医疗急症
 *   表——它在英文里绝大多数出现在游泳/画笔/键盘/幸运等无关语境，必须用
 *   "having a stroke" 这样的短语兜住词义）。
 * - 中英文词表**始终一起扫**（不按 UI locale 二选一）：用户完全可能在中文界面下用英文
 *   打字，或反之；只扫一种语言会留下盲区（同 `sanitizeDream` 注释里的理由）。
 * - 对已知的惯用比喻用法显式排除：「自杀式/自杀性」是常见的中文比喻（自杀式营销/
 *   自杀性开采），跟真实的自伤意图无关，用负向前瞻 `(?!式|性)` 排掉，否则会把「该不该
 *   做一次自杀式定价」这类正常商业问题误判成危机。英文侧同理排掉裸词 "suicide" 在
 *   "suicide mission"/"suicide squeeze"/"suicide pact" 这类非字面习语搭配下的命中
 *   （见下方 `EN_SELF_HARM_PATTERNS`）。
 *
 * 命中后的行为（见 `apps/web/app/spirit/page.tsx` 的 `doThrow`）：不调用 `throwJiao`
 * （全仓唯一随机点，`apps/web/lib/jiao.ts`）、不进入 `throwing` 阶段、不触发任何消耗
 * 额度的 `fetch`——检查发生在真正掷筊之前，命中即短路。
 *
 * 中文医疗急症词表：**整组已移除**（原 `ZH_MEDICAL`，含「中风」「心梗」等）。对抗性
 * 测试实测命中「我爸中风后要不要换个近点的房子」——这不是本人当下急症，是在问一件
 * 关于家人既往病史的正常居住决策。深挖之后判断这不是孤立个案而是整个类目的结构性缺陷：
 * - **行为不对称**：真正正在中风/心梗发作的人不会打开占卜 App 输入问题掷筊——中文
 *   医疗急症词表要拦的场景在现实里基本不发生，召回收益趋近于零。这跟自伤/轻生意图
 *   不同——后者恰恰存在「在危机中仍会向占卜类 App 提问」的真实用户行为（这正是这个
 *   拦截器最初要接住的场景），两者不能类比，不能因为医疗急症下线就顺带质疑自伤类目。
 * - **假阳性有结构性根源、不是孤立漏洞**：中文缺乏时态标记，「中风」「心梗」这类疾病
 *   名词裸词出现在「我爸/我妈/家人……后要不要……」这类既往/他人语境里的频率，在真实
 *   产品里只会比「自杀式定价」更高——控制方追加的「心梗康复期该不该换工作」「要不要
 *   给爸妈买呼吸机」等例子印证了同一形状会反复出现。给「中风」单独打负向前瞻改不完：
 *   「我爸」「我妈」「他」「她」「朋友」「同事」……关系词组合会爆炸，且违背本文件一直
 *   坚持的「窄、可审计的词表」而非语法引擎的设计原则。
 * - **成本不对称**：真实医疗急症场景里这个 App 从来不是求助的第一入口（用户会打
 *   120，不会先来问卦），错过的召回代价趋近于零；而假阳性直接命中 spec §4 第二条
 *   约束点名警告的场景——把正常人生抉择误伤成危机，是真实的产品伤害。
 * 三点合起来的结论：整组下线优于逐词打补丁。
 *
 * 英文医疗急症词表（`EN_MEDICAL`）**保留、不受此次决策影响**：现有短语本来就走
 * 「短语＋现在进行时」路线（如 "having a stroke" 而非裸词 "stroke"），已经天然排除
 * "my grandmother had a stroke last year"（过去时/第三人称叙述）这类语境——对抗测试
 * 也验证了这条不误伤。英文侧不存在中文侧那种「裸疾病名词 + 无时态标记」的结构性
 * 问题，没有理由连带下线。
 */

/**
 * 自伤/轻生意图（中文）。全部为多字短语，刻意不含裸「死」字。
 * 「自杀」单独保留但排除「自杀式/自杀性」这两个高频比喻用法。
 */
const ZH_SELF_HARM: RegExp[] = [
  /自杀(?!式|性)/,
  /轻生/,
  /自残(?!式)/,
  /自伤(?!式)/,
  /割腕/,
  /不想活了/,
  /不想活下去/,
  /活不下去了/,
  /该不该活下去/,
  /还要不要活下去/,
  /结束自己的生命/,
  /结束生命/,
  /了结自己的生命/,
];

/**
 * 自伤/轻生意图（英文）。以短语为主，避免裸 "die"/"kill" 这类会被夸张修辞
 * （"I could die of embarrassment"）误伤的词；全部经 `\b…\b` 词边界匹配。
 */
const EN_SELF_HARM: readonly string[] = [
  "suicidal",
  "kill myself",
  "end my life",
  "ending my life",
  "don't want to live",
  "do not want to live",
  "can't go on living",
  "cannot go on living",
  "no reason to live",
  "better off dead",
  "hurt myself",
  "harm myself",
  "self-harm",
  "self harm",
  "cut myself",
];

/**
 * 自伤/轻生意图（英文，需要负向前瞻的情形）。裸词 "suicide" 会误伤 "suicide mission"
 * "suicide squeeze"（棒球战术）"suicide pact"（常用于非字面语境，如「这笔交易简直是
 * 自杀式协议」）这类惯用比喻搭配；仿照上面中文「自杀(?!式|性)」的处理方式，用负向
 * 前瞻排掉已知的非字面搭配，而不是删掉整个词——"thinking about suicide" / "commit
 * suicide" / "suicide note" 等真实意图表达仍要命中，靠的正是这里只排除三个具体名词、
 * 不改变裸词本身的召回面。
 */
const EN_SELF_HARM_PATTERNS: RegExp[] = [/\bsuicide\b(?!\s+(?:mission|squeeze|pact))/i];

/**
 * 医疗急症（英文）。裸词 "stroke" 故意不收（在英文里绝大多数语境与中风无关，见文件头
 * 注释），改用 "having a stroke" 这类不易被无关语境命中的短语。
 */
const EN_MEDICAL: readonly string[] = [
  "heart attack",
  "having a stroke",
  "can't breathe",
  "cannot breathe",
  "chest pain",
  "call 911",
  "call an ambulance",
  "losing consciousness",
  "severe bleeding",
];

/** 通用正则命中——中文子串词表和英文负向前瞻词表都用这个（后者见 `EN_SELF_HARM_PATTERNS`）。 */
const hitPatterns = (patterns: RegExp[], text: string): boolean => patterns.some((re) => re.test(text));
const hitEn = (phrases: readonly string[], text: string): boolean =>
  phrases.some((p) => new RegExp(`\\b${p}\\b`, "i").test(text));

/**
 * 危机前置检查——命中即代表这个问题不该走掷筊流程，应直接转向求助资源。
 * 中英文词表始终一起扫，理由见文件头注释。
 */
export function detectJiaoCrisis(text: string): boolean {
  return (
    hitPatterns(ZH_SELF_HARM, text) ||
    hitEn(EN_SELF_HARM, text) ||
    hitPatterns(EN_SELF_HARM_PATTERNS, text) ||
    hitEn(EN_MEDICAL, text)
  );
}
