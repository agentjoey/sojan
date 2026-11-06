import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { deriveUsefulElements } from "../bazi/useful-elements";
import { elementDirections, type Direction, type ElementAffinity } from "./directions";
import { deriveMingGua, type MingGua } from "./ming-gua";
import { directionsFor, type DirectionVerdict } from "./eight-mansions";
import { dwellingGua, matchWithPerson, type DwellingInput, type DwellingGua } from "./dwelling";
import { buildPersonalRemedies, buildDwellingRemedies, sortRemedies, type Remedy } from "./remedy";
import { deriveCohabitants, type CohabitantInput, type Cohabitant } from "./cohabitants";
import type { FengshuiLanguage } from "./en";

export * from "./directions";
export * from "./ming-gua";
export * from "./eight-mansions";
export * from "./env-psych";
export * from "./remedy";
export * from "./object-advisor";
export * from "./dwelling";
export * from "./cohabitants";
export * from "./tagline";
export * from "./en";

/** 改动命卦公式 / 游年表 / 化解生成规则时**必须**递增——它进报告指纹，旧报告靠它失效。 */
export const FENGSHUI_ENGINE_VERSION = "fs-2";

/**
 * 叙述层修订号，按语言（进报告指纹，见 web `fengshuiFingerprint`）。与引擎版本分开：
 * 只有某一语言的叙述链改动到「该语言旧报告不该再被沿用」时才给它设/递增，
 * 其他语言的缓存不受牵连（重生成要花用户的 LLM 额度）。
 * - en `fs-en-1`：EP-fs-en，英文 prompt 重写 + 英文方位对拍/伪科学净化接上；此前的英文报告未经任何机械校验。
 * - en `fs-en-2`：EP-fs-en ③，候选化解改为 core 直出的英文（此前是中文原文交模型现翻），叙述与卡片用词对齐。
 */
export const FENGSHUI_NARRATIVE_REVISION: Partial<Record<"zh" | "en", string>> = { en: "fs-en-2" };

export type FengshuiInput = {
  birth: BirthInput;
  chart: UnifiedChart;
  /** 缺省或 facing 未知 = Layer 0 */
  dwelling?: DwellingInput;
  /** 同住人（EP-fs-13 合看）；仅在 Layer 1（有 dwelling）时产出结果 */
  cohabitants?: CohabitantInput[];
  /** 化解文案的语言（EP-fs-en ③）；只影响文字，结构与排序两种语言完全一致。缺省 zh。 */
  language?: FengshuiLanguage;
};

/** 居所视图 = 宅卦结果 + 用户填的元信息 + 与本人的配合判定 */
export type DwellingView = DwellingGua & {
  id: string;
  name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  matchWithPerson: "相配" | "相冲";
};

type FengshuiChartBase = {
  engineVersion: string;
  mingGua: MingGua;
  personalDirections: Record<Direction, DirectionVerdict>;
  elementAffinity: ElementAffinity;
  remedies: Remedy[];
};

/**
 * 判别联合：**`dwelling` 存在当且仅当 `layer === 1`**，由编译器强制。
 * 用 `layer: 0 | 1` + 可选 `dwelling?` 会放过 `{ layer: 1, dwelling: undefined }` 这种非法状态。
 * 与 `Remedy` / `EnvPsychAnchor` 同一手法。
 */
export type FengshuiChart =
  | (FengshuiChartBase & { layer: 0; dwelling?: undefined; cohabitants?: undefined })
  | (FengshuiChartBase & { layer: 1; dwelling: DwellingView; cohabitants: Cohabitant[] });

export function computeFengshui(input: FengshuiInput): FengshuiChart {
  const mingGua = deriveMingGua(input.birth, input.chart);
  const personalDirections = directionsFor(mingGua.guaName);
  const affinity = elementDirections(deriveUsefulElements(input.chart.bazi));
  const lang = input.language ?? "zh";
  const personal = buildPersonalRemedies(mingGua, personalDirections, affinity, lang);

  if (!input.dwelling) {
    return {
      layer: 0, engineVersion: FENGSHUI_ENGINE_VERSION,
      mingGua, personalDirections, elementAffinity: affinity,
      // buildPersonalRemedies 内部已排过一次，这里再排是 no-op；保留它是因为
      // 「产出的化解按什么顺序」应当由组装点负责（Layer 1 分支也在这一层排，
      // 且要带 tenancy 选项）。若哪天 buildPersonalRemedies 不再内部排序，
      // 这里不至于悄悄退化成乱序。
      remedies: sortRemedies(personal),
    };
  }

  const d = input.dwelling;
  const gua = dwellingGua(d.facing);
  const match = matchWithPerson(mingGua, gua);
  const view: DwellingView = {
    ...gua, id: d.id, name: d.name, kind: d.kind, tenancy: d.tenancy, matchWithPerson: match,
  };
  return {
    layer: 1, engineVersion: FENGSHUI_ENGINE_VERSION,
    mingGua, personalDirections, elementAffinity: affinity,
    dwelling: view,
    cohabitants: input.cohabitants?.length
      ? deriveCohabitants({ profileId: "main", name: "", birth: input.birth, chart: input.chart }, input.cohabitants)
      : [],
    remedies: sortRemedies([...personal, ...buildDwellingRemedies(gua, match, lang)], { tenancy: d.tenancy }),
  };
}
