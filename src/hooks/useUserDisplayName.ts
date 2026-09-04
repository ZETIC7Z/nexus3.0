import { useMemo } from "react";

import { useAuthStore } from "@/stores/auth";

/**
 * Display name for greetings: **only** the user's nickname (what they typed
 * when signing up / set in Settings). Never the device name — when there is
 * no nickname the caller falls back to the generic nameless greeting.
 */
export function useUserDisplayName(): string | null {
  const nickname = useAuthStore((s) => s.account?.nickname);
  return useMemo(() => {
    const nick = nickname?.trim();
    if (!nick) return null;
    return nick.charAt(0).toUpperCase() + nick.slice(1);
  }, [nickname]);
}
