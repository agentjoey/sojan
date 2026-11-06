import {
  FENGSHUI_GUARDRAILS, DIRECTION_LABEL, DIRECTION_LABEL_EN, STAR_LABEL_EN, STAR_GLOSS_EN,
  GUA_PINYIN, GROUP_EN, ELEMENT_EN, COLOR_EN, MATERIAL_EN, DIRECTIONS,
  type Direction, type Gua,
} from "@sojan/core";
import type { ObjectAdvice } from "@sojan/core";
import type { ReadingLanguage } from "../prompt";
import type { FengshuiFacts } from "./facts";

export const FENGSHUI_SECTION_KEYS = ["situation", "youAndSpace", "actions"] as const;
export type FengshuiSectionKey = (typeof FENGSHUI_SECTION_KEYS)[number];

const SECTION_HEADERS: Record<ReadingLanguage, Record<FengshuiSectionKey, string>> = {
  zh: { situation: "形势", youAndSpace: "境与你", actions: "可做的事" },
  en: { situation: "The Layout", youAndSpace: "You and Your Space", actions: "What You Can Do" },
};

/**
 * 主报告 system prompt。`language="en"` 是**整份英文撰写**的 prompt（EP-fs-en），不是
 * 「中文指令 + 末尾一句 answer in English」——与 {@link buildObjectAdviceSystemPrompt} 同一做法：
 * 只有 core 的 `FENGSHUI_GUARDRAILS` 保持中文原文（单一事实源，不翻译分叉）。
 *
 * 英文版额外要求两件事，都是为了让 guard 的英文路径对得上：
 * ① 星名一律写拼音（`STAR_LABEL_EN`）——对拍只认拼音；
 * ② 谈方位时显式写「personal directions」/「house directions」——英文归属判定只认这类强标记。
 */
export function buildFengshuiSystemPrompt(language: ReadingLanguage = "zh"): string {
  if (language === "en") return buildFengshuiSystemPromptEn();
  const H = SECTION_HEADERS[language];
  const langLine = "全文用简体中文。";
  return [
    "你是 Sojan 的「境」声部 —— 谈人与居住空间的关系。你的材料全部由确定性计算层给出。",
    "",
    "【硬规则】",
    ...FENGSHUI_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`),
    `${FENGSHUI_GUARDRAILS.length + 1}. 方位吉凶只能照用给定事实中的星名（生气/天医/延年/伏位/绝命/五鬼/六煞/祸害），不得自行推算、不得改写某方位对应的星。`,
    `${FENGSHUI_GUARDRAILS.length + 2}. 化解条目标注为「传统象征」的，只讲传统怎么说 + 这件事作为一种安顿自己的仪式意味着什么；禁止使用「研究表明」「科学证明」「临床」「实验显示」等措辞。`,
    `${FENGSHUI_GUARDRAILS.length + 3}. 「本命八方」由命卦定、「房屋八方」由宅卦定，是两套彼此独立的判语，**不得混用或互相推导**。谈某个方位时必须说清是哪一套。`,
    "",
    "【输出格式】严格三个 H2 分节，顺序固定，不加其他标题：",
    `## ${H.situation}`,
    "客观交代命卦、所属东西四命、八方各自的星与吉凶。像陈述地形，不下判词。",
    `## ${H.youAndSpace}`,
    "把上面的形势翻译成日常体验：哪些方位久待更容易松弛、哪些更容易紧绷，并给出对应的现代解释（仅限事实中标注了现代机制的条目）。",
    `## ${H.actions}`,
    "列 4–6 条可做的事，零成本的排前面。每条写成一句可执行的动作；候选化解里标注为「传统象征」的条目，必须在对应这一条的行内加注「（传统象征）」，一条都不能漏标——这是后置净化据以判断语境的强制标记，不是可选装饰。",
    "",
    langLine,
    "结尾用一句话说明：这些是关于自我觉察与居住体验的建议，不构成专业意见。",
  ].join("\n");
}

function buildFengshuiSystemPromptEn(): string {
  const H = SECTION_HEADERS.en;
  const n = FENGSHUI_GUARDRAILS.length;
  const stars = Object.values(STAR_LABEL_EN).join(", ");
  return [
    "You are the \"Space\" voice of Sojan, writing about the relationship between a person and the space they live in. Every fact you use comes from a deterministic calculation layer.",
    "",
    "Hard rules:",
    ...FENGSHUI_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`),
    `${n + 1}. Use only the star given for each direction in the facts (${stars}). Never work out a direction's star yourself and never change which star belongs to which direction.`,
    `${n + 2}. Always write star names in pinyin exactly as listed (e.g. "Sheng Qi"), optionally followed by a short gloss in parentheses. Do not replace them with English translations.`,
    `${n + 3}. Remedies marked as traditional symbolism: say only what the tradition holds and what the act can mean as a small ritual for settling yourself. Never use phrases like "studies show", "scientifically proven", "clinically", or "experiments show".`,
    `${n + 4}. The personal directions (set by your personal gua) and the house directions (set by the house gua) are two independent sets of readings. Never mix them or derive one from the other. Whenever you mention a direction's star, say which set it belongs to, using the words "personal directions" or "house directions".`,
    "",
    "Output format: exactly three H2 sections, in this order, with no other headings:",
    `## ${H.situation}`,
    "State the personal gua, its group (East Group or West Group), and each direction's star and whether it is favorable. Describe it like terrain; do not pass judgement.",
    `## ${H.youAndSpace}`,
    "Translate that layout into everyday experience: which directions make it easier to relax over long stretches and which make it easier to feel tense, with the modern explanation where one is given (only for remedies that list a modern mechanism).",
    `## ${H.actions}`,
    "List 4–6 things to do, zero-cost ones first, each as one actionable sentence. Every remedy marked [traditional symbolism] in the candidate list must carry the inline tag \"(traditional symbolism)\" on its line — no exceptions. The post-processing step relies on this tag; it is not decoration.",
    "",
    "The facts may be written in Chinese; translate them faithfully, but keep star names in pinyin.",
    "Write the whole answer in English.",
    "End with one sentence saying these are suggestions for self-awareness and how you live in your space, not professional advice.",
  ].join("\n");
}

/**
 * 把一组方位判语排成提示行：吉方在前、同吉凶内按 rank 升序。
 *
 * ⚠️ `[...sectors]` 的复制不能省。`Array.prototype.sort` 是**原地**排序，
 * 直接排会永久打乱调用方 `facts` 里那个数组的顺序——而 facts 在本项目是
 * 「算一次、下游只读」的东西。波 1 曾栽在这里，有专门测试锁定。
 *
 * 本命八方与房屋八方共用本函数，但它们是两套彼此独立的判语，
 * 只是**呈现格式**相同，语义上不可互推（见 system prompt 的硬规则）。
 */
function formatSectorLines(sectors: FengshuiFacts["directions"]): string[] {
  return [...sectors]
    .sort((a, b) => Number(b.auspicious) - Number(a.auspicious) || a.rank - b.rank)
    .map((d) => `- ${d.label}：${d.star}（${d.auspicious ? "吉" : "凶"}，第${d.rank}）`);
}

export function buildFengshuiUserPrompt(
  facts: FengshuiFacts,
  opts?: { nickname?: string; language?: ReadingLanguage },
): string {
  if (opts?.language === "en") return buildFengshuiUserPromptEn(facts, opts);
  const dirLines = formatSectorLines(facts.directions).join("\n");
  const remLines = facts.remedies
    .map((r) => `- [${r.effort}][${r.evidence}] ${r.action}｜传统依据：${r.traditional}｜现代机制：${r.modern ?? "无（不得编造）"}`)
    .join("\n");
  // Layer 1 专属：居所与宅八方。宅八方与上面的本命八方是两套独立判语（各自由命卦/宅卦定），
  // 不得混用，故标题里显式互相点名提醒。排序与格式化走 formatSectorLines（内含必要的复制）。
  const dwellingBlock = facts.dwelling ? [
    ``,
    `居所：${facts.dwelling.name}（${facts.dwelling.kind === "home" ? "住宅" : "办公"}，${facts.dwelling.tenancy === "rent" ? "租住" : "自有"}）`,
    `坐向：坐${facts.dwelling.sittingLabel}向${facts.dwelling.facingLabel} → ${facts.dwelling.guaName}宅（${facts.dwelling.group}）`,
    `与你：${facts.dwelling.matchWithPerson}`,
    `房屋八方判语（与上面的本命八方是两套，勿混用）：`,
    ...formatSectorLines(facts.dwelling.sectors),
  ] : [];

  const cohabBlock = facts.cohabitants.length ? [
    ``,
    `同住人（同一套房子对每个人吉凶不同，这是八宅的直接结论，不要说成"因人而异的感受"）：`,
    ...facts.cohabitants.map((c) =>
      `- ${c.name}：${c.mingGua}（${c.group}）｜对你吉但对 TA 凶：${c.conflicts.join("、") || "无"}｜双方皆吉：${c.sharedGood.join("、") || "无"}`),
  ] : [];
  return [
    `称呼：${opts?.nickname ?? "你"}`,
    `本命卦：${facts.mingGua}（${facts.guaGroup}）`,
    `本命八方判语：`,
    dirLines,
    ...dwellingBlock,
    ...cohabBlock,
    ``,
    `命局喜用五行：${facts.favorableElements.join("、") || "中和，无明显扶抑"}`,
    `命局所忌五行：${facts.unfavorableElements.join("、") || "无"}`,
    `有利方位：${facts.favorableDirections.join("、") || "无"}`,
    `宜用色：${facts.favorableColors.join("、") || "无"}｜宜用材：${facts.favorableMaterials.join("、") || "无"}｜宜少用色：${facts.unfavorableColors.join("、") || "无"}`,
    ``,
    `候选化解（只准从这些里挑，可合并同类，不得新增）：`,
    remLines,
  ].join("\n");
}

const DIRECTION_BY_ZH_LABEL = new Map<string, Direction>(DIRECTIONS.map((d) => [DIRECTION_LABEL[d], d]));
/** 中文方位名 → 英文；认不出的原样返回（不丢信息）。 */
const dirEn = (zh: string) => {
  const d = DIRECTION_BY_ZH_LABEL.get(zh);
  return d ? DIRECTION_LABEL_EN[d] : zh;
};
const mapEn = (xs: string[], table: Record<string, string>) => xs.map((x) => table[x] ?? x).join(", ");
/** facts 里命卦是「坎1」这样的拼接串：首字卦名 + 卦数。 */
const guaEn = (s: string) => `${GUA_PINYIN[s[0] as Gua] ?? s[0]} ${s.slice(1)}`.trim();
const groupEn = (g: string) => GROUP_EN[g as keyof typeof GROUP_EN] ?? g;

function formatSectorLinesEn(sectors: FengshuiFacts["directions"]): string[] {
  return [...sectors]
    .sort((a, b) => Number(b.auspicious) - Number(a.auspicious) || a.rank - b.rank)
    .map((d) =>
      `- ${DIRECTION_LABEL_EN[d.direction]}: ${STAR_LABEL_EN[d.star]} (${STAR_GLOSS_EN[d.star]}; ${d.auspicious ? "favorable" : "unfavorable"}, #${d.rank})`);
}

/**
 * 英文 user prompt：确定性标签（方位、星名、卦名、组别、五行、色、材）一律换成 core 英文词表，
 * 与英文对拍的词表同源；化解条目的自由文本仍是 core 产出的中文原文，交给模型忠实翻译
 * （③ 把这些文案本身做成双语是另一项工作）。
 */
function buildFengshuiUserPromptEn(facts: FengshuiFacts, opts?: { nickname?: string }): string {
  const remLines = facts.remedies
    .map((r) =>
      `- [${r.effort}][${r.evidence === "传统象征" ? "traditional symbolism" : "traditional + modern"}] ${r.action} | Tradition: ${r.traditional} | Modern mechanism: ${r.modern ?? "none (do not invent one)"}`)
    .join("\n");
  const dw = facts.dwelling;
  const dwellingBlock = dw ? [
    ``,
    `Dwelling: ${dw.name} (${dw.kind === "home" ? "home" : "office"}, ${dw.tenancy === "rent" ? "rented" : "owned"})`,
    `Orientation: sits ${dirEn(dw.sittingLabel)}, faces ${dirEn(dw.facingLabel)} → ${GUA_PINYIN[dw.guaName as Gua] ?? dw.guaName} house (${groupEn(dw.group)})`,
    `Fit with you: ${dw.matchWithPerson === "相配" ? "compatible (same group)" : dw.matchWithPerson === "相冲" ? "in tension (different groups)" : dw.matchWithPerson}`,
    `House directions (a separate set from the personal directions above — never mix them):`,
    ...formatSectorLinesEn(dw.sectors),
  ] : [];
  const cohabBlock = facts.cohabitants.length ? [
    ``,
    `Housemates (the same house is favorable or unfavorable differently for each person — a direct Eight Mansions conclusion, not "a matter of personal feeling"):`,
    ...facts.cohabitants.map((c) =>
      `- ${c.name}: ${guaEn(c.mingGua)} (${groupEn(c.group)}) | good for you but bad for them: ${c.conflicts.map(dirEn).join(", ") || "none"} | good for both: ${c.sharedGood.map(dirEn).join(", ") || "none"}`),
  ] : [];
  return [
    `Name: ${opts?.nickname ?? "you"}`,
    `Personal gua: ${guaEn(facts.mingGua)} (${groupEn(facts.guaGroup)})`,
    `Personal directions:`,
    ...formatSectorLinesEn(facts.directions),
    ...dwellingBlock,
    ...cohabBlock,
    ``,
    `Favorable elements: ${mapEn(facts.favorableElements, ELEMENT_EN) || "balanced, no clear lean"}`,
    `Unfavorable elements: ${mapEn(facts.unfavorableElements, ELEMENT_EN) || "none"}`,
    `Favorable directions (by element): ${facts.favorableDirections.map(dirEn).join(", ") || "none"}`,
    `Colors to favor: ${mapEn(facts.favorableColors, COLOR_EN) || "none"} | Materials to favor: ${mapEn(facts.favorableMaterials, MATERIAL_EN) || "none"} | Colors to use sparingly: ${mapEn(facts.unfavorableColors, COLOR_EN) || "none"}`,
    ``,
    `Candidate remedies (choose only from these; you may merge similar ones; do not add new ones; the text is in Chinese — translate it):`,
    remLines,
  ].join("\n");
}

/** 按三个 H2 切分节，缺节置空（容错，与 parseSections 同策略）。 */
export function parseFengshuiSections(
  markdown: string,
  language: ReadingLanguage = "zh",
): Record<FengshuiSectionKey, string> {
  const H = SECTION_HEADERS[language];
  const out: Record<FengshuiSectionKey, string> = { situation: "", youAndSpace: "", actions: "" };
  let current: FengshuiSectionKey | null = null;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      const title = m[1]!.trim();
      current = FENGSHUI_SECTION_KEYS.find((k) => title.includes(H[k]) || H[k].includes(title)) ?? null;
      continue;
    }
    if (current) out[current] += line + "\n";
  }
  // 与既有 parseSections 一致：逐节 trim，别把首尾空行推给渲染方
  for (const k of FENGSHUI_SECTION_KEYS) out[k] = out[k].trim();
  return out;
}

/**
 * 物件顾问说人话层（EP-fs-04）的 system prompt。与 {@link buildFengshuiSystemPrompt}
 * 同样做法：硬规则复用 core 的 {@link FENGSHUI_GUARDRAILS}（单一事实源，导入+展开，
 * 不手写删减版），在此基础上叠加物件建议特有的约束（只准用给定方位、不得新增方位、
 * 不得断言吉凶后果、短输出）。
 *
 * `language="en"` 分支**不是**「中文提示后面加一句 answer in English」——本模块自撰
 * 的框架句与物件专属约束本身就是用英文写的（Task 11 复审必修1）；只有 core 的
 * `FENGSHUI_GUARDRAILS` 原文保持中文，因为它是被复用的单一事实源，不在本模块翻译
 * 范围内（core 也没有对应的英文版本，翻译等于自建一份分叉，与"单一事实源"矛盾）。
 */
export function buildObjectAdviceSystemPrompt(language: ReadingLanguage = "zh"): string {
  const guardrails = FENGSHUI_GUARDRAILS.map((g, i) => `${i + 1}. ${g}`);
  const n = FENGSHUI_GUARDRAILS.length;

  if (language === "en") {
    return [
      "You are the \"Space\" voice of Sojan, giving brief, spoken-language placement advice for a single object.",
      "",
      "Hard rules:",
      ...guardrails,
      `${n + 1}. Only use the directions and rules given below — do not invent or add any direction beyond the given facts.`,
      `${n + 2}. Do not assert fated outcomes (e.g. "this will bring wealth" or "this will cause illness") — describe tendencies and everyday experience only.`,
      `${n + 3}. If a 宅局提示 (dwelling note) is given, it is a deterministic conclusion already shown to the user directly above your text. Stay consistent with it: do not contradict it, do not ignore it, and do not describe the recommended directions as good spots "in this house".`,
      "",
      "Write the given conclusion as 2–3 natural sentences, plain, actionable, and non-deterministic.",
      "Output ONLY those 2–3 sentences — no heading, prefix, or extra explanation.",
      "Write the whole answer in English.",
    ].join("\n");
  }

  return [
    "你是 Sojan 的「境」声部——为单件物件的摆放给出简短建议。",
    "",
    "【硬规则】",
    ...guardrails,
    `${n + 1}. 只准使用给定的方位与规则作答，不得自行推算或新增给定事实之外的方位。`,
    `${n + 2}. 不得断言吉凶后果（如「摆这里会招财/破财/生病」），只描述倾向与日常体验。`,
    `${n + 3}. 若给了「宅局提示」，那是已经原样展示在你这段话上方的确定性结论。你的措辞必须与它一致：不得反驳、不得忽略，也不得把推荐方位说成「这套房子里的好位置」。`,
    "",
    "把给定的结论写成 2–3 句自然中文，口吻平实、可执行、非决定论。",
    "只输出这 2–3 句本身，不加标题、前后缀或额外说明。",
    "全文用简体中文。",
  ].join("\n");
}

/**
 * 物件顾问说人话层的 user prompt：给定结论 + 称呼，不含 language —— 与 {@link buildFengshuiUserPrompt} 一致，
 * 事实数据本身不随目标语言变化，由 system prompt 里的语言指令统一控制输出语言。
 *
 * ⚠️ `dwellingNote` 必须喂进来。八宅的结构决定了「命卦吉方 ∩ 宅卦吉方」只可能是 4 或 0
 * （东四命的四吉方恰好就是四个东四方，同组则全留、异组则一个不留——枚举 8×8 全部命卦×宅卦
 * 组合验证过），所以 `usable` 恒等于 `good`：**强版与弱版的 recommendedDirections 逐字节相同**，
 * `dwellingNote` 是强版唯一多出来的可观察内容。漏掉它，说人话层就会在一句「此宅与你不合」
 * 旁边浑然不觉地照夸某个方位。
 */
export function buildObjectAdviceUserPrompt(advice: ObjectAdvice, opts?: { nickname?: string }): string {
  return [
    `称呼：${opts?.nickname ?? "你"}`,
    `物件：${advice.categoryLabel}`,
    `五行：${advice.elementOfObject ?? "未定"}`,
    `推荐方位：${advice.recommendedDirections.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `不宜方位：${advice.avoid.map((r) => `${r.label}（${r.reason}）`).join("；") || "无"}`,
    `品类规则：${advice.categoryRules.join("；")}`,
    `与命主关系：${advice.personalFit}`,
    advice.dwellingNote
      ? `宅局提示（确定性结论，用户界面上已原样展示在你这段话上方，你的措辞必须与它一致，不得反驳、不得忽略、不得把这些方位说成"这套房子里的好位置"）：${advice.dwellingNote}`
      : "",
    advice.intendedVerdict
      ? `用户想放在：${advice.intendedVerdict.direction}，该方为${advice.intendedVerdict.star}（${advice.intendedVerdict.auspicious ? "吉" : "凶"}）`
      : "",
  ].filter(Boolean).join("\n");
}
