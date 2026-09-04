import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/buttons/Button";
import { ColorPicker, initialColor } from "@/components/form/ColorPicker";
import { IconPicker, initialIcon } from "@/components/form/IconPicker";
import {
  LargeCard,
  LargeCardButtons,
  LargeCardText,
} from "@/components/layout/LargeCard";
import { AuthInputBox } from "@/components/text-inputs/AuthInputBox";
import { UserIcons } from "@/components/UserIcon";
import { detectDeviceLabel } from "@/utils/common/device";

export interface AccountProfile {
  device: string;
  /** User-chosen nickname (the account's display name). */
  nickname?: string;
  profile: {
    colorA: string;
    colorB: string;
    icon: string;
    /** Conflix-style image avatar. */
    image?: string | null;
  };
}

interface AccountCreatePartProps {
  onNext?: (data: AccountProfile) => void;
}

export function AccountCreatePart(props: AccountCreatePartProps) {
  const [nickname, setNickname] = useState("");
  const [colorA, setColorA] = useState(initialColor);
  const [colorB, setColorB] = useState(initialColor);
  const [userIcon, setUserIcon] = useState<UserIcons>(initialIcon);
  const { t } = useTranslation();
  const [hasNicknameError, setHasNicknameError] = useState(false);

  const nextStep = useCallback(() => {
    setHasNicknameError(false);
    const validatedNickname = nickname.trim();
    if (validatedNickname.length === 0) {
      setHasNicknameError(true);
      return;
    }

    props.onNext?.({
      // The real device is auto-detected (brand/model/OS/browser) so the
      // Devices list shows the actual device, not a free-text label.
      device: detectDeviceLabel(),
      nickname: validatedNickname,
      profile: {
        colorA,
        colorB,
        icon: userIcon,
      },
    });
  }, [nickname, props, colorA, colorB, userIcon]);

  return (
    <LargeCard>
      <LargeCardText
        icon={
          <Avatar
            profile={{ colorA, colorB, icon: userIcon }}
            iconClass="text-3xl"
            sizeClass="w-16 h-16"
          />
        }
        title={t("auth.register.information.title") ?? undefined}
      >
        {t("auth.register.information.header")}
      </LargeCardText>
      <div className="space-y-6">
        <AuthInputBox
          label={t("auth.nicknameLabel") ?? undefined}
          value={nickname}
          onChange={setNickname}
          placeholder={t("auth.nicknamePlaceholder") ?? undefined}
        />
        <ColorPicker
          label={t("auth.register.information.color1")}
          value={colorA}
          onInput={setColorA}
        />
        <ColorPicker
          label={t("auth.register.information.color2")}
          value={colorB}
          onInput={setColorB}
        />
        <IconPicker
          label={t("auth.register.information.icon")}
          value={userIcon}
          onInput={setUserIcon}
        />
        {hasNicknameError ? (
          <p className="text-authentication-errorText">
            {t("auth.login.deviceLengthError")}
          </p>
        ) : null}
      </div>
      <LargeCardButtons>
        <Button theme="purple" onClick={() => nextStep()}>
          {t("auth.register.information.next")}
        </Button>
      </LargeCardButtons>
    </LargeCard>
  );
}
