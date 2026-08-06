import classNames from "classnames";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { editUser } from "@/backend/accounts/user";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Button } from "@/components/buttons/Button";
import { ConflixAvatar } from "@/components/ConflixAvatar";
import { Icon, Icons } from "@/components/Icon";
import { BrandPill } from "@/components/layout/BrandPill";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { ALL_PROFILE_ICONS } from "@/stores/profiles/iconCatalog";
import { useAuthStore } from "@/stores/auth";
import {
  clearNewSignup,
  useProfileStore,
  type NexusProfile,
} from "@/stores/profiles";

function randomConflixIcon(): string {
  return ALL_PROFILE_ICONS[
    Math.floor(Math.random() * ALL_PROFILE_ICONS.length)
  ].src;
}

export function ProfileSelect() {
  const navigate = useNavigate();
  const backendUrl = useBackendUrl();
  const account = useAuthStore((s) => s.account);
  const updateAccount = useAuthStore((s) => s.updateAccount);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const selectProfile = useProfileStore((s) => s.selectProfile);
  const addProfile = useProfileStore((s) => s.addProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const removeProfile = useProfileStore((s) => s.removeProfile);

  const [isManaging, setIsManaging] = useState(false);
  // null = no editor open; "new" = creating a profile; otherwise a profile id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState<{
    image?: string | null;
    colorA: string;
    colorB: string;
    icon: string;
  }>({ colorA: "#E50914", colorB: "#B81D24", icon: "user_group" });

  const isKidsProfile = useMemo(() => {
    const current = profiles.find((p) => p.id === editingId);
    return !!current?.isKids;
  }, [profiles, editingId]);

  // Persist ONLY the primary "main" profile to the Nexus backend — the
  // backend stores a single nickname+profile per account, so writing a
  // sub-profile (Kids, custom) here would silently overwrite the account's
  // real nickname/avatar on the server. Sub-profiles stay purely local,
  // exactly like Conflix's per-device profiles.
  const syncProfileToBackend = (
    id: string,
    name: string,
    profile: NexusProfile["profile"],
  ) => {
    if (id !== "main" || !backendUrl || !account) return;
    editUser(backendUrl, account, { nickname: name.trim(), profile })
      .then(() => {
        // Also refresh the persisted account so the image survives restores.
        updateAccount({ nickname: name.trim(), profile });
      })
      .catch((err) => {
        console.warn("Failed to sync profile to backend:", err);
      });
  };

  // Push the picked profile onto the auth account (drives navbar/avatar), but
  // only ever PATCH the backend for the primary profile.
  const applyToAuthAndBackend = (profile: NexusProfile) => {
    updateAccount({ nickname: profile.name, profile: profile.profile });
    syncProfileToBackend(profile.id, profile.name, profile.profile);
  };

  const activate = (id: string) => {
    const profile = selectProfile(id);
    if (!profile) return;
    // Keep all existing Nexus components working: they read nickname/profile
    // from the auth store. The Conflix image icon rides along inside profile.
    applyToAuthAndBackend(profile);
    try {
      localStorage.setItem("nexus_last_profile", id);
    } catch {
      /* ignore */
    }
    navigate(profile.isKids ? "/kids" : "/browse");
  };

  const beginEdit = (profile: NexusProfile) => {
    setEditingId(profile.id);
    setEditName(profile.name);
    setEditAvatar({
      image: profile.profile.image ?? null,
      colorA: profile.profile.colorA,
      colorB: profile.profile.colorB,
      icon: profile.profile.icon,
    });
  };

  const beginCreate = () => {
    setEditingId("new");
    setEditName("");
    setEditAvatar({
      image: randomConflixIcon(),
      colorA: "#E50914",
      colorB: "#B81D24",
      icon: "user_group",
    });
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const profile = {
      colorA: editAvatar.colorA,
      colorB: editAvatar.colorB,
      icon: editAvatar.icon,
      // Keep undefined when no image was picked so existing gradient avatars
      // are never accidentally flagged as "cleared image".
      image: editAvatar.image ?? undefined,
    };
    if (editingId === "new") {
      // Brand-new accounts start with only the Kids profile pre-created. The
      // FIRST profile the user creates becomes their main profile, synced to
      // the backend (nickname + avatar) exactly like Conflix's account setup.
      const hasMain = profiles.some((p) => p.id === "main");
      if (!hasMain) {
        const mainProfile: NexusProfile = {
          id: "main",
          name: editName.trim(),
          profile,
          isKids: false,
        };
        addProfile(mainProfile);
        applyToAuthAndBackend(mainProfile);
        clearNewSignup();
      } else {
        // Additional profiles are local-only — never touch the backend.
        addProfile({ name: editName.trim(), profile, isKids: false });
      }
      setEditingId(null);
      return;
    }
    updateProfile(editingId, { name: editName.trim(), profile });
    // Always push edits to the auth account when the edited profile is the
    // primary "main" profile or the currently active one. Otherwise the
    // navbar/avatar (which reads the auth account) never sees the new Conflix
    // image, and a refresh would revert to the Nexus icon.
    if (editingId === "main" || editingId === activeProfileId) {
      applyToAuthAndBackend({
        id: editingId,
        name: editName.trim(),
        profile,
        isKids: false,
      });
    } else {
      // Sub-profile edits stay local.
      syncProfileToBackend(editingId, editName.trim(), profile);
    }
    setEditingId(null);
  };

  const deleteEditing = () => {
    if (!editingId || editingId === "new") return;
    removeProfile(editingId);
    // If we deleted the active profile, fall back to the main profile so the
    // navbar avatar doesn't keep showing the deleted profile's icon.
    if (editingId === activeProfileId) {
      const main = profiles.find((profile) => profile.id === "main");
      if (main) {
        applyToAuthAndBackend(main);
      }
    }
    setEditingId(null);
  };

  const signOut = () => {
    useAuthStore.getState().removeAccount();
    useProfileStore.setState({ ownerUserId: null, activeProfileId: null });
    try {
      localStorage.removeItem("nexus_last_profile");
      // A leftover new-signup flag must never affect a different user who logs
      // in on the same browser later.
      localStorage.removeItem("nexus_new_user");
    } catch {
      /* ignore */
    }
    navigate("/login");
  };

  const editorOpen = editingId !== null;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0a] text-white">
      {/* Conflix-style vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,#1c1c1c_0%,#0a0a0a_70%)]" />
      <div className="absolute left-6 top-6 z-10 md:left-12">
        <BrandPill clickable header />
      </div>

      {!editorOpen ? (
        <section className="relative z-10 w-full max-w-6xl px-6 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.4em] text-white/40">
            NEXUS profiles
          </p>
          <h1 className="mb-10 text-3xl font-medium tracking-tight md:text-5xl">
            {isManaging ? "Manage Profiles:" : "Who's watching?"}
          </h1>

          <div className="mx-auto grid max-w-5xl grid-cols-2 justify-items-center gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {profiles.map((profile) => {
              const isActive = activeProfileId === profile.id;
              return (
                <div
                  key={profile.id}
                  className="group flex w-full max-w-[160px] flex-col items-center"
                >
                  <button
                    type="button"
                    className="w-full text-center"
                    onClick={() =>
                      isManaging ? beginEdit(profile) : activate(profile.id)
                    }
                    aria-label={`Select ${profile.name} profile`}
                  >
                    <span
                      className={classNames(
                        "relative block transition duration-200",
                        isActive
                          ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0a] rounded-[8px]"
                          : "group-hover:scale-105",
                      )}
                    >
                      <ConflixAvatar
                        profile={profile.profile}
                        sizeClass="mx-auto aspect-square w-24 sm:w-28 md:w-32 rounded-[8px]"
                        iconClass="text-4xl md:text-5xl"
                        square
                      />
                      {isManaging && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-black/55">
                          <Icon
                            icon={Icons.EDIT}
                            className="text-2xl text-white"
                          />
                        </span>
                      )}
                    </span>
                    <span className="mt-3 block truncate text-sm text-white/65 transition group-hover:text-white md:text-base">
                      {profile.name}
                    </span>
                    {profile.isKids && (
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-sky-400">
                        Kids
                      </span>
                    )}
                  </button>
                </div>
              );
            })}

            {!isManaging && profiles.length < 5 && (
              <button
                type="button"
                onClick={beginCreate}
                className="group flex w-full max-w-[160px] flex-col items-center text-center"
              >
                <span className="mx-auto flex aspect-square w-24 items-center justify-center rounded-[8px] border-2 border-white/20 transition group-hover:scale-105 group-hover:border-white sm:w-28 md:w-32">
                  <Icon
                    icon={Icons.PLUS}
                    className="text-4xl text-white/40 transition group-hover:text-white"
                  />
                </span>
                <span className="mt-3 text-sm text-white/50 transition group-hover:text-white">
                  Add Profile
                </span>
              </button>
            )}
          </div>

          <div className="mt-12 flex justify-center gap-4">
            <Button
              type="button"
              theme="secondary"
              onClick={() => setIsManaging((value) => !value)}
              className="!border-white/25 uppercase tracking-wider"
            >
              {isManaging ? "Done" : "Manage Profiles"}
            </Button>
            <Button
              type="button"
              theme="secondary"
              onClick={() => navigate("/settings")}
            >
              Settings
            </Button>
          </div>
        </section>
      ) : (
        /* Conflix-style Edit Profile screen */
        <section className="relative z-10 w-full max-w-2xl px-6">
          <div className="rounded-xl border border-white/10 bg-[#141414] p-6 md:p-10 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-3xl font-medium md:text-4xl">
                  {editingId === "new" ? "Add Profile" : "Edit Profile"}
                </p>
                <p className="mt-1 text-sm text-white/50">
                  {editingId === "new"
                    ? "Create a new profile with its own icon and nickname."
                    : "Change the name or avatar — everything stays saved."}
                </p>
              </div>
              <ConflixAvatar
                profile={editAvatar}
                sizeClass="w-16 h-16 rounded-[8px]"
                iconClass="text-2xl"
                square
              />
            </div>

            <label className="mb-6 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/50">
                Profile name
              </span>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                placeholder="e.g. Alex"
                maxLength={24}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/50"
              />
            </label>

            <AvatarPicker value={editAvatar} onChange={setEditAvatar} />

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                theme="purple"
                onClick={saveEdit}
                className="flex-1 justify-center"
              >
                Save
              </Button>
              <Button
                type="button"
                theme="secondary"
                onClick={() => setEditingId(null)}
                className="flex-1 justify-center"
              >
                Cancel
              </Button>
              {editingId !== "new" &&
                !isKidsProfile &&
                editingId !== "main" &&
                editingId !== "kids" && (
                  <Button
                    type="button"
                    theme="danger"
                    onClick={deleteEditing}
                    className="w-full justify-center sm:w-auto"
                  >
                    Delete
                  </Button>
                )}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={signOut}
        className="absolute bottom-6 right-6 z-10 text-xs text-white/35 transition hover:text-white md:right-12"
      >
        Sign out
      </button>
    </main>
  );
}
