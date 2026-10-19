import { NextResponse } from "next/server";
import { getUid } from "@/lib/account/uid";
import { purgeUserData } from "@/lib/data/delete-account";
import { NEON_AUTH_COOKIE_NAMES, NEON_AUTH_COOKIE_PREFIX } from "@/lib/account/neon-auth-cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 请求里带着的、以 Neon Auth 前缀开头的 cookie 名（兜住 SDK 将来新增的 cookie）。 */
function neonAuthCookieNamesIn(req: Request): string[] {
  const header = req.headers.get("cookie") ?? "";
  return header
    .split(";")
    .map((p) => p.split("=")[0].trim())
    .filter((n) => n.startsWith(NEON_AUTH_COOKIE_PREFIX));
}

/**
 * 同源校验：带了 Origin 头且 host 与请求 Host 不一致 → 跨站发起，拒绝。
 * 没有 Origin（服务端到服务端、测试）放行；SameSite=Lax cookie 不会随跨站 POST 发送，这是第二道闸。
 */
function isCrossOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (isCrossOrigin(req)) {
    return NextResponse.json({ error: "跨站请求被拒绝" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ error: "缺少确认标志" }, { status: 400 });
  }

  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    await purgeUserData(uid);
  } catch (e) {
    console.error("[account/delete] purgeUserData failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "注销失败，请重试" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  for (const name of new Set([...NEON_AUTH_COOKIE_NAMES, ...neonAuthCookieNamesIn(req)])) {
    res.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return res;
}
