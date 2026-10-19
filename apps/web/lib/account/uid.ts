import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * 全站唯一 uid 解析入口（EP-account2-02）。
 *
 * 只认 `Authorization: Bearer <access_token>`（TG session cookie 分支已随 TG 下线移除）。
 *
 * ⚠️ 故意只读 `req.headers`，不用 `next/headers` 的 `cookies()`：那个 API 依赖
 * Next 请求处理内部的 AsyncLocalStorage 上下文，只有真正经过 Next 路由分发时才会
 * 被填充。这个仓库的 route 测试统一是「直接 import handler、拿手搓 Request 调用」
 * （不经过 Next 开发/构建服务器），cookies() 在这种调用方式下不可靠。
 */
export async function resolveUid(
  req: Request,
): Promise<{ uid: string; via: "web" } | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await supabaseAdmin().auth.getUser(token);
    if (data.user) return { uid: data.user.id, via: "web" };
  }

  return null;
}
