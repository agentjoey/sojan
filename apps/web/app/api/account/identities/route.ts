import { NextResponse } from "next/server";
import { getViewer, resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SYNTHETIC_EMAIL_DOMAIN, resolveAccess } from "@/lib/access";
import { recordConsentOnce, TERMS_VERSION } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const resolved = await resolveUid(req);
  if (!resolved) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { uid } = resolved;

  const access = await resolveAccess(await getViewer());
  if (access.level !== "anonymous") {
    void recordConsentOnce(uid, "terms", TERMS_VERSION); // best-effort，幂等，不 await
  }

  const { data: u } = await supabaseAdmin().auth.admin.getUserById(uid);
  const rawEmail = u.user?.email ?? null;
  const email =
    rawEmail && !rawEmail.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`) ? rawEmail : null;

  // TG 绑定已随 TG 下线移除——只返回 email。过渡路由：Neon 迁移 Task 5 删除。
  return NextResponse.json({ email });
}
