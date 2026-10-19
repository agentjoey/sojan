import * as data from "@/lib/data/fengshui-report";
import { unwrap } from "@/lib/errors";

export type FengshuiSections = { situation: string; youAndSpace: string; actions: string };

/** 报告读写与生成（EP-fs-16）。读写在服务端（`lib/data/fengshui-report.ts`，Neon），生成走 web 解读路由。 */

export type FingerprintInput = {
  profileId: string;
  locale: string;
  engineVersion: string;
  /** null = Layer 0 */
  dwelling: { id: string; facing: string; tenancy: "rent" | "own"; kind: "home" | "office" } | null;
  memberProfileIds: string[];
};

/**
 * 报告指纹（EP-fs-16）。与三段式解读不同：命盘冻结所以解读永久有效，
 * 而居所可变 —— 改朝向、增减同住人、切语言、升引擎版本都必须让旧报告失效。
 * 波1 用的 (档案,版本,locale) localStorage 键装不下居所与成员集合，故换成指纹。
 * 同住人按集合语义（排序后入参），避免顺序变动触发无谓重生成。
 */
export function fengshuiFingerprint(i: FingerprintInput): string {
  const canonical = JSON.stringify({
    p: i.profileId,
    l: i.locale,
    v: i.engineVersion,
    d: i.dwelling ? [i.dwelling.id, i.dwelling.facing, i.dwelling.tenancy, i.dwelling.kind] : null,
    m: [...i.memberProfileIds].sort(),
  });
  // djb2：确定性、无依赖、够用（这不是安全哈希，只用来做缓存键）
  let h = 5381;
  for (let k = 0; k < canonical.length; k++) h = ((h << 5) + h + canonical.charCodeAt(k)) | 0;
  return `fs${(h >>> 0).toString(36)}`;
}

export { readFengshuiReport } from "@/lib/data/fengshui-report";

export async function saveFengshuiReport(args: {
  fingerprint: string; profileId: string; dwellingId: string | null;
  layer: 0 | 1; locale: string; sections: FengshuiSections;
}): Promise<void> {
  unwrap(await data.saveFengshuiReport(args));
}

/**
 * 报告生成请求。`body` 与 /api/fengshui/reading 的请求体同一形态：
 * `{ ...BirthInput, dwelling?, cohabitants? }`。失败一律抛错（抛响应正文），
 * 调用方（page.tsx）只认「成功 / 抛错」两种结局。
 */
export async function requestFengshuiReading(
  body: Record<string, unknown>,
  locale: string,
): Promise<{ sections: FengshuiSections; degraded: boolean }> {
  const r = await fetch("/api/fengshui/reading", {
    method: "POST",
    headers: { "content-type": "application/json", "x-zj-locale": locale },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
