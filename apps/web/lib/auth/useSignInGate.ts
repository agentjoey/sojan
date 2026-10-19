"use client";

import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { UnauthenticatedError } from "@/lib/errors";

/**
 * 页面级访客门控（D1）。配合 `components/SignInPrompt` 用：
 *
 * ```tsx
 * const gate = useSignInGate();
 * …（其余 hook）
 * if (gate.signedOut) return <SignInPrompt next="/chart" />;
 * if (gate.pending || profile === undefined) return <加载态 />;
 * ```
 *
 * - `pending`：会话还在判定中——页面保持原有加载态，不闪引导。
 * - `signedOut`：确认无会话，或某次 action 抛过 `UnauthenticatedError`（会话中途失效）。
 * - `handleAuthError(e)`：放进写操作的 catch；是 `UnauthenticatedError` 则切到引导并返回
 *   true，其余错误返回 false 交给调用方原有处理。
 */
export function useSignInGate() {
  const { data, isPending } = authClient.useSession();
  const [lost, setLost] = useState(false);
  const handleAuthError = useCallback((e: unknown): boolean => {
    if (!(e instanceof UnauthenticatedError)) return false;
    setLost(true);
    return true;
  }, []);
  return { pending: isPending && !lost, signedOut: lost || (!isPending && !data), handleAuthError };
}
