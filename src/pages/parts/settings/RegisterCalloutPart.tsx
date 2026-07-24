import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { SolidSettingsCard } from "@/components/layout/SettingsCard";
import { Heading3 } from "@/components/utils/Text";
import { useAuthModal } from "@/components/overlays/auth";

export function RegisterCalloutPart() {
  const { t } = useTranslation();
  const { openAuthModal } = useAuthModal();

  return (
    <div>
      <SolidSettingsCard
        paddingClass="px-6 py-12"
        className="grid grid-cols-2 gap-12 mt-5"
      >
        <div>
          <Heading3>{t("settings.account.register.title")}</Heading3>
          <p className="text-type-text max-w-[30rem]">
            {t("settings.account.register.text")}
          </p>
        </div>
        <div className="flex flex-col justify-center items-end gap-3">
          <Button theme="secondary" className="px-4 py-1.5 text-sm" onClick={() => openAuthModal("login")}>
            Sign In
          </Button>
          <Button theme="purple" onClick={() => openAuthModal("trust")}>
            {t("settings.account.register.cta")}
          </Button>
        </div>
      </SolidSettingsCard>
    </div>
  );
}
