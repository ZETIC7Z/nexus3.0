import { useRef } from "react";
import { useAsync, useInterval } from "react-use";

import { useAuth } from "@/hooks/auth/useAuth";
import { AccountWithToken, useAuthStore } from "@/stores/auth";
import { useProfileStore } from "@/stores/profiles";

const AUTH_CHECK_INTERVAL = 12 * 60 * 60 * 1000;

export function useAuthRestore() {
  const { account } = useAuthStore();
  const { restore } = useAuth();
  const hasRestored = useRef(false);

  // After every backend restore, re-apply the locally selected profile
  // (name + Conflix image avatar). The backend strips the extra `image`
  // field, so the local profile store is the only place it survives —
  // without this, a refresh would revert the avatar to the Nexus icon.
  const restoreWithProfile = async (acc: AccountWithToken) => {
    await restore(acc).finally(() => {
      hasRestored.current = true;
    });
    useProfileStore
      .getState()
      .restoreActiveProfile(useAuthStore.getState().account);
  };

  useInterval(() => {
    if (account) restoreWithProfile(account);
  }, AUTH_CHECK_INTERVAL);

  const result = useAsync(async () => {
    if (hasRestored.current || !account) return;
    await restoreWithProfile(account);
  }, []); // no deps because we don't want to it ever rerun after the first time

  return result;
}
