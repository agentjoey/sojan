import type { UnifiedChart, BirthInput, QuestionnaireAnswers } from "@sojan/core";
import * as data from "@/lib/data/profiles";
import { unwrap } from "@/lib/errors";

/**
 * 档案客户端门面：本体在服务端（`lib/data/profiles.ts`，Neon + 会话 uid 隔离），
 * 这里只做两件事——把写操作的 `ActionResult` 解包成迁移前的签名
 * （未登录 → `UnauthenticatedError`，`profile_limit` 等 → `new Error(code)`），
 * 以及维护「当前档案」指针（localStorage，仅 id，非敏感）。
 * 无指令：客户端组件直接 import；服务端只取 `Profile` 类型。
 */
export type Profile = {
  id: string;
  nickname: string;
  birthInput: BirthInput;
  chart: UnifiedChart;
  createdAt: string;
  reading: string | null; // 已生成的解读 markdown（一次生成后保存）
};

// localStorage 键保留 `zhaojian.*` 旧前缀（见 CLAUDE.md 命名沿革）。
const ACTIVE_KEY = "zhaojian.activeProfileId";

export { listProfiles, getProfile, getSpiritMemory, getQuestionnaire } from "@/lib/data/profiles";

export function getActiveProfileId(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
}
export function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** 当前档案：localStorage 指针优先，否则取最近一条；无档案（含未登录）返回 null。 */
export async function getActiveProfile(): Promise<Profile | null> {
  const list = await data.listProfiles();
  if (list.length === 0) return null;
  const id = getActiveProfileId();
  return (id && list.find((p) => p.id === id)) || list[0]!;
}

/** 建档：命盘已在外部一次算好并传入，服务端冻结写入；成功后设为当前档案。 */
export async function createProfile(input: {
  nickname?: string;
  birthInput: BirthInput;
  chart: UnifiedChart;
}): Promise<Profile> {
  const profile = unwrap(await data.createProfile(input));
  setActiveProfile(profile.id);
  return profile;
}

export async function saveReading(profileId: string, markdown: string, model?: string): Promise<void> {
  unwrap(await data.saveReading(profileId, markdown, model));
}

export async function deleteProfile(id: string): Promise<void> {
  unwrap(await data.deleteProfile(id));
  if (getActiveProfileId() === id) localStorage.removeItem(ACTIVE_KEY);
}

export async function renameProfile(id: string, nickname: string): Promise<void> {
  unwrap(await data.renameProfile(id, nickname));
}

export async function saveSpiritMemory(profileId: string, memory: string): Promise<void> {
  unwrap(await data.saveSpiritMemory(profileId, memory));
}

export async function saveQuestionnaire(profileId: string, answers: QuestionnaireAnswers): Promise<void> {
  unwrap(await data.saveQuestionnaire(profileId, answers));
}
