import { supabase, ensureSession } from "@/lib/supabase";

export type FengshuiSections = { situation: string; youAndSpace: string; actions: string };

/** 报告读写与生成（EP-fs-16）。走 Supabase 客户端 + RLS / web 解读路由。 */

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

export async function readFengshuiReport(fingerprint: string): Promise<FengshuiSections | null> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("fengshui_reports").select("sections")
    .eq("input_fingerprint", fingerprint).maybeSingle();
  if (error) throw error;
  return (data?.sections as FengshuiSections) ?? null;
}

export async function saveFengshuiReport(args: {
  fingerprint: string; profileId: string; dwellingId: string | null;
  layer: 0 | 1; locale: string; sections: FengshuiSections;
}): Promise<void> {
  const uid = await ensureSession();
  const { error } = await supabase().from("fengshui_reports").upsert({
    uid, input_fingerprint: args.fingerprint, profile_id: args.profileId,
    dwelling_id: args.dwellingId, layer: args.layer, locale: args.locale, sections: args.sections,
  }, { onConflict: "uid,input_fingerprint" });
  if (error) throw error;
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
  // Authorization：本地匿名/邮箱登录靠这个头让服务端识别会员。
  // 与 page.tsx 的 fengshuiAuthHeader、DwellingForm 的探测同一手法。
  let authHeader: Record<string, string> = {};
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  } catch {
    // 取不到会话 = 真正匿名，服务端按「未登录」处理，等价非会员——本就是正确结果。
  }
  const r = await fetch("/api/fengshui/reading", {
    method: "POST",
    headers: { "content-type": "application/json", "x-zj-locale": locale, ...authHeader },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
