import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AvatarPicker } from "@/components/AvatarPicker";
import { Button } from "@/components/buttons/Button";
import { ConflixAvatar } from "@/components/ConflixAvatar";
import { Modal, ModalCard } from "@/components/overlays/Modal";
import { Heading2 } from "@/components/utils/Text";

export interface ProfileEditValue {
  colorA: string;
  colorB: string;
  icon: string;
  image?: string | null;
}

export interface ProfileEditModalProps {
  id: string;
  close?: () => void;
  value: ProfileEditValue;
  onChange: (value: ProfileEditValue) => void;
  /** Optional nickname editing (Conflix-style profile editor). */
  nickname?: string;
  setNickname?: (s: string) => void;
}

/**
 * Conflix-style profile editor for Settings: shows the profile image live and
 * lets the user pick a Conflix icon (or the Nexus gradient style), exactly
 * like the /profiles edit screen.
 */
export function ProfileEditModal(props: ProfileEditModalProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<ProfileEditValue>({ ...props.value });
  const [localNickname, setLocalNickname] = useState(props.nickname ?? "");

  const commit = () => {
    props.onChange(local);
    if (props.setNickname && localNickname.trim()) {
      props.setNickname(localNickname.trim());
    }
    props.close?.();
  };

  return (
    <Modal id={props.id}>
      <ModalCard className="!max-w-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Heading2 className="!mt-0 !mb-1 text-2xl md:text-3xl">
              {t("settings.account.profile.title")}
            </Heading2>
            <p className="text-sm text-white/50">
              {t("settings.account.profile.subtitle") ||
                "Change the name or avatar — everything stays saved."}
            </p>
          </div>
          <ConflixAvatar
            profile={local}
            sizeClass="w-16 h-16 rounded-[8px]"
            iconClass="text-2xl"
            square
          />
        </div>

        {props.setNickname ? (
          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/50">
              {t("settings.account.profile.nicknameLabel") || "Profile name"}
            </span>
            <input
              value={localNickname}
              onChange={(e) => setLocalNickname(e.target.value)}
              maxLength={24}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/50"
            />
          </label>
        ) : null}

        <AvatarPicker value={local} onChange={setLocal} />

        <div className="mt-8 flex justify-center gap-3">
          <Button theme="secondary" onClick={props.close}>
            {t("actions.cancel")}
          </Button>
          <Button theme="purple" className="!px-12" onClick={commit}>
            {t("settings.account.profile.finish")}
          </Button>
        </div>
      </ModalCard>
    </Modal>
  );
}
