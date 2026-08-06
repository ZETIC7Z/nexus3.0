import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useAuthStore, type Account, type AccountWithToken } from "@/stores/auth";
import { KIDS_DEFAULT_ICON } from "./iconCatalog";

export interface NexusProfile {
  id: string;
  name: string;
  profile: Account["profile"];
  isKids: boolean;
}

const LAST_PROFILE_KEY = "nexus_last_profile";
const NEW_USER_FLAG_KEY = "nexus_new_user";

export function getLastSelectedProfileId(): string | null {
  try {
    return localStorage.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
}

/** True when the current browser session just registered a brand-new account. */
export function isNewSignup(): boolean {
  try {
    return localStorage.getItem(NEW_USER_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Set right after a successful registration; cleared when the user creates
 * their own profile (so only the Kids profile is pre-created for new users). */
export function markNewSignup(): void {
  try {
    localStorage.setItem(NEW_USER_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearNewSignup(): void {
  try {
    localStorage.removeItem(NEW_USER_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

interface ProfileStore {
  ownerUserId: string | null;
  profiles: NexusProfile[];
  activeProfileId: string | null;
  ensureAccountProfile: (account: AccountWithToken | null) => void;
  selectProfile: (id: string) => NexusProfile | undefined;
  /**
   * Restore the previously-selected profile on app boot: sets the active
   * profile id AND applies its name+avatar (incl. the Conflix image icon) to
   * the auth account, so a page refresh never loses the selected icon.
   */
  restoreActiveProfile: (account: AccountWithToken | null) => void;
  addProfile: (profile: Omit<NexusProfile, "id"> & { id?: string }) => NexusProfile;
  updateProfile: (id: string, patch: Partial<Omit<NexusProfile, "id">>) => void;
  updateActiveProfile: (
    name: string,
    profile: Account["profile"] | undefined,
  ) => void;
  removeProfile: (id: string) => void;
}

export const DEFAULT_PROFILE: Account["profile"] = {
  colorA: "#E50914",
  colorB: "#B81D24",
  icon: "user_group",
};

export const KIDS_PROFILE: Account["profile"] = {
  colorA: "#00D2FF",
  colorB: "#3A7BD5",
  icon: "rising_star",
  image: KIDS_DEFAULT_ICON,
};

function buildDefaults(account: AccountWithToken | null): NexusProfile[] {
  const kids: NexusProfile = {
    id: "kids",
    name: "Kids",
    profile: KIDS_PROFILE,
    isKids: true,
  };

  // New signups get ONLY the Kids profile pre-created — the user creates
  // their own profile (with a Conflix icon) from the profile selection screen.
  // Returning users always get their main profile back.
  if (isNewSignup()) {
    return [kids];
  }

  return [
    {
      id: "main",
      name: account?.nickname?.trim() || "NEXUS",
      profile: account?.profile ?? DEFAULT_PROFILE,
      isKids: false,
    },
    kids,
  ];
}

export const useProfileStore = create<ProfileStore>()(
  persist(
    (set, get) => ({
      ownerUserId: null,
      profiles: buildDefaults(null),
      activeProfileId: null,

      ensureAccountProfile(account) {
        const ownerUserId = account?.userId ?? null;
        const current = get();

        if (current.ownerUserId !== ownerUserId) {
          set({
            ownerUserId,
            profiles: buildDefaults(account),
            activeProfileId: null,
          });
          return;
        }

        if (!account || current.activeProfileId) return;

        const main = current.profiles.find((profile) => profile.id === "main");
        if (!main) {
          set({ profiles: buildDefaults(account) });
          return;
        }

        // Merge the primary profile once after login/restore. Prefer the
        // backend's Conflix image (cross-device sync) and fall back to the
        // local store (same-device refresh). If both are missing, no image.
        const serverImage = account.profile?.image;
        const localImage = main.profile.image;
        const mergedImage = serverImage ?? localImage ?? undefined;
        const serverProfile = account.profile;
        const mergedProfile = mergedImage
          ? { ...serverProfile, image: mergedImage }
          : serverProfile;

        if (
          main.name !== (account.nickname?.trim() || "NEXUS") ||
          JSON.stringify(main.profile) !== JSON.stringify(mergedProfile)
        ) {
          set({
            profiles: current.profiles.map((profile) =>
              profile.id === "main"
                ? {
                    ...profile,
                    name: account.nickname?.trim() || "NEXUS",
                    profile: mergedProfile,
                  }
                : profile,
            ),
          });
        }
      },

      restoreActiveProfile(account) {
        if (!account) return;
        const savedId = getLastSelectedProfileId();
        const saved = savedId
          ? get().profiles.find((profile) => profile.id === savedId)
          : undefined;
        if (!saved) return;

        // Re-apply the selected profile to the auth account so the navbar and
        // all consumers show the right name + Conflix image icon after boot.
        // Always keep the backend's image when the local profile doesn't have
        // one yet (new device fresh login — cross-device sync).
        const current = useAuthStore.getState().account;
        const backendImg = current?.profile?.image ?? account?.profile?.image;
        const wantsProfile = backendImg && !saved.profile.image
          ? { ...saved.profile, image: backendImg }
          : saved.profile;
        const wantsName = saved.name;

        // Also back-fill the profile store so the image survives the next
        // Layout useEffect (ensureAccountProfile) pass.
        if (backendImg && !saved.profile.image) {
          get().updateProfile(saved.id, { profile: wantsProfile });
        }

        if (
          current &&
          (current.nickname !== wantsName ||
            JSON.stringify(current.profile) !== JSON.stringify(wantsProfile))
        ) {
          useAuthStore.getState().updateAccount({
            nickname: wantsName,
            profile: wantsProfile,
          });
        }
        if (get().activeProfileId !== saved.id) {
          set({ activeProfileId: saved.id });
        }
      },

      selectProfile(id) {
        const selected = get().profiles.find((profile) => profile.id === id);
        if (selected) set({ activeProfileId: id });
        return selected;
      },

      addProfile(profile) {
        const created: NexusProfile = {
          ...profile,
          id:
            profile.id ??
            `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        };
        set((state) => ({ profiles: [...state.profiles, created] }));
        return created;
      },

      updateProfile(id, patch) {
        set((state) => ({
          profiles: state.profiles.map((profile) =>
            profile.id === id ? { ...profile, ...patch } : profile,
          ),
        }));
      },

      updateActiveProfile(name, profile) {
        const activeProfileId = get().activeProfileId;
        if (!activeProfileId || !profile) return;
        get().updateProfile(activeProfileId, {
          name: name.trim() || "NEXUS",
          profile,
        });
      },

      removeProfile(id) {
        if (id === "main" || id === "kids") return;
        set((state) => ({
          profiles: state.profiles.filter((profile) => profile.id !== id),
          activeProfileId:
            state.activeProfileId === id ? "main" : state.activeProfileId,
        }));
      },
    }),
    {
      name: "nexus-profiles",
      version: 1,
    },
  ),
);
