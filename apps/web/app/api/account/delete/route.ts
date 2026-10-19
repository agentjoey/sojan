import { NextResponse } from "next/server";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "缺少确认标志" },
      { status: 400 },
    );
  }

  const who = await resolveUid(req);
  if (!who) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { error } = await supabaseAdmin().auth.admin.deleteUser(who.uid);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
