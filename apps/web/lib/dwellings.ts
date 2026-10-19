import type { Direction } from "@sojan/core";
import * as data from "@/lib/data/dwellings";
import { unwrap } from "@/lib/errors";

/**
 * 居所客户端门面：本体在服务端（`lib/data/dwellings.ts`，Neon + 会话 uid 隔离），
 * 这里把写操作的 `ActionResult` 解包回迁移前的签名（未登录 → `UnauthenticatedError`）。
 * 无指令：客户端组件直接 import；服务端只取 `Dwelling` 类型。
 */

export type Dwelling = {
  id: string; name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  /** null = 用户选了「不确定」→ 页面降级回 Layer 0 */
  facing: Direction | null;
  memberProfileIds: string[];
};

export { listDwellings } from "@/lib/data/dwellings";

export async function createDwelling(d: Omit<Dwelling, "id">): Promise<Dwelling> {
  return unwrap(await data.createDwelling(d));
}

export async function updateDwelling(id: string, patch: Partial<Omit<Dwelling, "id">>): Promise<void> {
  unwrap(await data.updateDwelling(id, patch));
}

export async function deleteDwelling(id: string): Promise<void> {
  unwrap(await data.deleteDwelling(id));
}
