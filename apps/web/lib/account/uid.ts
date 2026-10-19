import { auth } from "@/lib/auth/server";
import { UnauthenticatedError } from "@/lib/errors";

export type Viewer = { uid: string; email: string; emailVerified: boolean };

/**
 * 全站唯一身份入口：Neon Auth 会话（cookie）→ Viewer。
 * 无会话、会话出错、或会话里没有 user 一律返回 null（匿名）。
 * 仅服务端使用（Server Component / Server Action / Route Handler）。
 */
export async function getViewer(): Promise<Viewer | null> {
  try {
    const { data, error } = await auth.getSession();
    if (error || !data?.user) return null;
    const { id, email, emailVerified } = data.user;
    return { uid: id, email, emailVerified: !!emailVerified };
  } catch {
    // SDK 的 getSession 可能直接 throw（上游非传输类错误会 rethrow；
    // Server Component 渲染期写 Set-Cookie 也会抛）。统一降级为匿名，而不是 500。
    return null;
  }
}

export async function getUid(): Promise<string | null> {
  return (await getViewer())?.uid ?? null;
}

/** 无会话抛 UnauthenticatedError。只在服务端内部使用，别把异常直接抛给客户端。 */
export async function requireUid(): Promise<string> {
  const uid = await getUid();
  if (!uid) throw new UnauthenticatedError();
  return uid;
}
