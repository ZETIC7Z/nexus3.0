import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAsyncFn } from "react-use";

import { createPasskey, isPasskeySupported } from "@/backend/accounts/crypto";
import { Button } from "@/components/buttons/Button";
import { ConflixAvatar } from "@/components/ConflixAvatar";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { useModal } from "@/components/overlays/Modal";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { UserIcons } from "@/components/UserIcon";
import { useAuth } from "@/hooks/auth/useAuth";
import { ProfileEditModal } from "@/pages/parts/settings/ProfileEditModal";
import { useAuthStore } from "@/stores/auth";

export function AccountEditPart(props: {
  deviceName: string;
  setDeviceName: (s: string) => void;
  nickname: string;
  setNickname: (s: string) => void;
  colorA: string;
  setColorA: (s: string) => void;
  colorB: string;
  setColorB: (s: string) => void;
  userIcon: UserIcons;
  setUserIcon: (s: UserIcons) => void;
  profileImage?: string | null;
  setProfileImage?: (s: string | null) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const profileEditModal = useModal("profile-edit");
  const account = useAuthStore((s) => s.account);
  const [passkeyConnected, setPasskeyConnected] = useState(false);

  const [passkeyState, handleConnectPasskey] = useAsyncFn(async () => {
    if (!isPasskeySupported()) throw new Error("Passkeys are not supported in this browser");
    const uname = (account as any)?.username || (account as any)?.profile?.nickname || props.nickname || "nexus-user";
    try {
      const credential = await createPasskey(uname, uname);
      if (credential && credential.id) {
        setPasskeyConnected(true);
      }
    } catch (err) {
      throw new Error(`Failed to create passkey: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [account, props.nickname]);

  return (
    <SettingsCard paddingClass="px-8 py-10" className="!mt-8">
      <ProfileEditModal
        id={profileEditModal.id}
        close={profileEditModal.hide}
        value={{
          colorA: props.colorA,
          colorB: props.colorB,
          icon: props.userIcon,
          image: props.profileImage ?? null,
        }}
        onChange={(value) => {
          props.setColorA(value.colorA);
          props.setColorB(value.colorB);
          props.setUserIcon(value.icon as UserIcons);
          if (props.setProfileImage) {
            props.setProfileImage(value.image ?? null);
          }
        }}
        nickname={props.nickname}
        setNickname={props.setNickname}
      />
      <div className="grid lg:grid-cols-[auto,1fr] gap-8">
        <div>
          <ConflixAvatar
            profile={{
              colorA: props.colorA,
              colorB: props.colorB,
              icon: props.userIcon,
              image: props.profileImage,
            }}
            iconClass="text-5xl"
            sizeClass="w-32 h-32 rounded-[8px]"
            square
            bottom={
              <button
                type="button"
                className="tabbable text-xs flex gap-2 items-center bg-editBadge-bg text-editBadge-text hover:bg-editBadge-bgHover py-1 px-3 rounded-full cursor-pointer"
                onClick={profileEditModal.show}
              >
                <Icon icon={Icons.EDIT} />
                {t("settings.account.accountDetails.editProfile")}
              </button>
            }
          />
        </div>
        <div>
          <div className="flex flex-col md:flex-row md:gap-4 gap-4">
            <div className="w-full">
              <AuthInputBox
                label={t("settings.account.accountDetails.nicknameLabel")}
                placeholder={t(
                  "settings.account.accountDetails.nicknamePlaceholder",
                )}
                value={props.nickname}
                onChange={(value) => props.setNickname(value)}
                className="w-full"
              />
            </div>
            <div className="w-full">
              <AuthInputBox
                label={
                  t("settings.account.accountDetails.deviceNameLabel") ??
                  undefined
                }
                placeholder={
                  t("settings.account.accountDetails.deviceNamePlaceholder") ??
                  undefined
                }
                value={props.deviceName}
                onChange={(value) => props.setDeviceName(value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Button className="logout-button" theme="danger" onClick={logout}>
              {t("settings.account.accountDetails.logoutButton")}
            </Button>
            <Button
              type="button"
              theme="secondary"
              onClick={() => navigate("/profiles")}
              className="flex items-center gap-2"
            >
              <Icon icon={Icons.USER} />
              Switch profile
            </Button>

            <Button
              type="button"
              theme="secondary"
              loading={passkeyState.loading}
              disabled={passkeyConnected}
              onClick={handleConnectPasskey}
              className="flex items-center gap-2 py-2 px-4 rounded-xl !bg-purple-600/20 hover:!bg-purple-600/30 border border-purple-500/30 text-purple-200 font-medium transition-all"
            >
              <Icon icon={passkeyConnected ? Icons.CIRCLE_CHECK : Icons.KEY} className="text-base text-purple-400" />
              <span>{passkeyConnected ? "Passkey Added & Saved!" : "Create Passkey / Add to Authenticator"}</span>
            </Button>
          </div>
          {passkeyState.error && (
            <p className="text-red-400 text-xs mt-2">{passkeyState.error.message}</p>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
