import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { SimklUser } from "@/utils/services/simklTypes";

export type SimklStatus = "idle" | "syncing";

export interface SimklAuthStore {
  accessToken: string | null;
  user: SimklUser | null;
  status: SimklStatus;
  error: string | null;
  lastSync: string | null; 

  setAccessToken(token: string): void;
  setUser(user: SimklUser): void;
  setStatus(status: SimklStatus): void;
  setError(error: string | null): void;
  setLastSync(ts: string | null): void;
  clear(): void;
}

export const useSimklAuthStore = create(
  persist(
    immer<SimklAuthStore>((set) => ({
      accessToken: null,
      user: null,
      status: "idle",
      error: null,
      lastSync: null,

      setAccessToken(token) {
        set((s) => {
          s.accessToken = token;
        });
      },
      setUser(user) {
        set((s) => {
          s.user = user;
        });
      },
      setStatus(status) {
        set((s) => {
          s.status = status;
        });
      },
      setError(error) {
        set((s) => {
          s.error = error;
        });
      },
      setLastSync(ts) {
        set((s) => {
          s.lastSync = ts;
        });
      },
      clear() {
        set((s) => {
          s.accessToken = null;
          s.user = null;
          s.status = "idle";
          s.error = null;
          s.lastSync = null;
        });
      },
    })),
    {
      name: "__MW::simkl_auth",
    },
  ),
);

export function useSimklStore() {
  const user = useSimklAuthStore((s) => s.user);
  const status = useSimklAuthStore((s) => s.status);
  const error = useSimklAuthStore((s) => s.error);
  const logout = useSimklAuthStore((s) => s.clear);
  return { user, status, logout, error };
}
