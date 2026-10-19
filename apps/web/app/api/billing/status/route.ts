import { NextResponse } from "next/server";
import { getUid } from "@/lib/account/uid";
import { getEntitlement, getLlmUsed, isMember } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const userId = await getUid();

  const free = Number(process.env.FREE_LLM_MONTHLY ?? 30);

  if (!userId) {
    return NextResponse.json({ tier: "free", memberUntil: null, used: 0, free });
  }

  const ent = await getEntitlement(userId);
  const member = isMember(ent);
  const used = await getLlmUsed(userId);

  return NextResponse.json({
    tier: member ? "member" : ent.tier,
    memberUntil: ent.memberUntil,
    used,
    free,
  });
}
