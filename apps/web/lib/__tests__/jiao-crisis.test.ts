import { describe, it, expect } from "vitest";
import { detectJiaoCrisis } from "../jiao-crisis";

describe("detectJiaoCrisis：危机前置拦截词表——命中项（中文）", () => {
  it.each([
    "我该不该自杀",
    "想自杀算了",
    "有轻生的念头",
    "我不想活了",
    "真的不想活下去了",
    "感觉活不下去了",
    "我该不该活下去",
    "还要不要活下去我也不知道",
    "想结束自己的生命",
    "想结束生命",
    "了结自己的生命",
    "忍不住想自残",
    "有自伤的冲动",
    "割腕过好几次",
    // 假阳性修复轮（controller 对抗性用例）：真危机必须仍能命中。
    "我在想自杀",
  ])("命中：%s", (q) => {
    expect(detectJiaoCrisis(q)).toBe(true);
  });
});

/**
 * 假阳性修复轮：中文医疗急症词表（原 `ZH_MEDICAL`）已整组从 `jiao-crisis.ts` 移除——
 * 完整判断理由见该文件头部注释。这里把原本要求命中（true）的用例翻转为要求放行
 * （false），把这个设计决策也钉进回归网：以后如果有人想把这组词加回来，这里会红。
 */
describe("detectJiaoCrisis：中文医疗急症词表已整组下线——原命中用例现全部放行", () => {
  it.each(["感觉心脏病发作", "突然呼吸困难", "胸口剧痛", "大出血止不住", "他昏迷不醒", "怀疑是中风", "疑似心梗", "要不要叫救护车", "在打120求救"])(
    "放行：%s",
    (q) => {
      expect(detectJiaoCrisis(q)).toBe(false);
    },
  );
});

describe("detectJiaoCrisis：危机前置拦截词表——命中项（英文）", () => {
  it.each([
    "I've been thinking about suicide",
    "feeling suicidal lately",
    "I want to kill myself",
    "I want to end my life",
    "ending my life tonight",
    "I don't want to live anymore",
    "I do not want to live",
    "I can't go on living like this",
    "no reason to live",
    "everyone would be better off dead",
    "I keep wanting to hurt myself",
    "urge to harm myself",
    "thinking about self-harm",
    "cut myself again last night",
    // 假阳性修复轮（controller 对抗性用例）：真危机必须仍能命中，即便裸词
    // "suicide" 加了负向前瞻排除习语。
    "should I end my life",
    "I want to kill myself",
  ])("hits: %s", (q) => {
    expect(detectJiaoCrisis(q)).toBe(true);
  });
});

describe("detectJiaoCrisis：危机前置拦截词表——命中项（医疗急症，英文）", () => {
  it.each([
    "I think it's a heart attack",
    "having a stroke right now",
    "I can't breathe",
    "severe chest pain",
    "should I call 911",
    "losing consciousness",
    // 假阳性修复轮（controller 对抗性用例）：本人当下急症，必须仍能命中。
    "I'm having a stroke right now",
  ])("hits: %s", (q) => {
    expect(detectJiaoCrisis(q)).toBe(true);
  });
});

/**
 * 假阳性回归网——防拦太宽。每一条都是任务描述里点名或调研中翻出的高危陷阱：
 * - 正常人生抉择问题必须放行；
 * - 中文「死」出现在「死心/死板/累死了」这类日常修辞里不该被裸字误伤；
 * - 「自杀式/自杀性」是中文常见比喻（营销/定价），与真实自伤意图无关；
 * - 「活下去」用在公司/项目上是常见比喻，不是人身危机；
 * - 英文 "diet"（含 die 子串）、"stroke"（游泳/画笔/键盘等无关语境）不该被裸词误伤；
 * - 假阳性修复轮新增：中文病症词（中风/心梗/…）出现在「我爸/我妈/家人……既往病史」
 *   语境里是高频正常问题，不该被误伤（对应中文医疗急症词表整组下线的决策，见
 *   `jiao-crisis.ts` 文件头）；
 * - 假阳性修复轮新增：英文 "suicide mission"/"suicide squeeze"/"suicide pact" 是
 *   常见非字面习语（职场比喻/棒球战术/商业比喻），裸词 "suicide" 不该被这类搭配误伤。
 */
describe("detectJiaoCrisis：假阳性回归网——不得误伤", () => {
  it.each([
    "该不该辞职",
    "这段关系要不要继续",
    "该不该结束这段关系",
    "要不要跟他分手",
    "这份工作要不要放弃",
    "该不该换工作",
    "要不要买房",
    "这段婚姻还要不要维持",
    "他是不是死心眼，我该怎么办",
    "这套方案是不是太死板了",
    "赶due赶得累死了，该不该申请延期",
    "笑死了这也太离谱了，该不该跟他说",
    "该不该做一次自杀式定价冲一波销量",
    "这家公司还能不能活下去，要不要继续投钱",
    "该不该在这个项目上继续烧钱",
    "要不要去医院复查一下这个小毛病",
    "游泳的时候该练哪种 stroke 更快",
    "该不该换个 diet 计划减脂",
    "这个项目搞得我压力很大，该不该辞职",
    // controller 对抗性用例（原样并入，未改措辞）：
    "这个项目该不该砍掉",
    "累死了要不要请假",
    "这价格是不是自杀式定价",
    "我爸中风后要不要换个近点的房子",
    "该不该放弃这个机会",
    "要不要断了这条线",
    "这份工作快把我熬死了，要不要走",
    // 自扩：中文病症词的「他人/既往」语境，同 FP1 形状。
    "我妈心梗后要不要搬回去和她一起住",
    "爷爷中风住院期间要不要请假回去看看",
    "叔叔当年心脏病发作，我们要不要现在换个离医院近的小区",
    "奶奶以前中风留下后遗症，要不要请个护工",
  ])("放行：%s", (q) => {
    expect(detectJiaoCrisis(q)).toBe(false);
  });

  it.each([
    "should I quit my job",
    "should I end this relationship",
    "should I break up with my partner",
    "should I take this new offer",
    "should I go on a new diet",
    "this deadline is killing me, should I ask for an extension",
    "which swimming stroke should I practice more",
    "should I invest more in this failing startup",
    // controller 对抗性用例（原样并入，未改措辞）：
    "Should I quit my job",
    "Should I end this relationship",
    "Is this a suicide mission for my career",
    "I'm dying to know if I should move",
    "Should I kill this feature",
    "my grandmother had a stroke last year, should I move closer",
    // 自扩：英文习语，裸词 "suicide" 不应命中的非字面搭配。
    "bunting there would be a suicide squeeze with the winning run on third",
    "signing this deal is basically a suicide pact for the studio",
  ])("passes: %s", (q) => {
    expect(detectJiaoCrisis(q)).toBe(false);
  });
});
