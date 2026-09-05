import { useTranslation } from "react-i18next";

import { AdsToggle } from "@/components/ads/AdsToggle";
import { Heading1 } from "@/components/utils/Text";

export function AdsPart() {
  const { t } = useTranslation();

  return (
    <div>
      <Heading1 border>{t("settings.ads.title")}</Heading1>
      <AdsToggle />
    </div>
  );
}
