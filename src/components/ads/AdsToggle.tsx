import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Toggle } from "@/components/buttons/Toggle";
import { useAdsStore } from "@/stores/ads";

/**
 * "Disable advertisements" switch.
 * Ads are ON by default; the user can switch them off after confirming.
 */
export function AdsToggle() {
  const { t } = useTranslation();
  const adsDisabled = useAdsStore((s) => s.adsDisabled);
  const disableAds = useAdsStore((s) => s.disableAds);
  const enableAds = useAdsStore((s) => s.enableAds);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (adsDisabled) {
      enableAds();
      return;
    }
    setShowConfirm(true);
  };

  return (
    <div>
      <p className="text-white font-bold mb-3">
        {t("settings.preferences.ads.title")}
      </p>
      <p className="max-w-[25rem] font-medium">
        {t("settings.preferences.ads.description")}
      </p>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        className="bg-dropdown-background hover:bg-dropdown-hoverBackground select-none my-4 cursor-pointer space-x-3 flex items-center max-w-[25rem] py-3 px-4 rounded-lg outline-none focus:ring-2 focus:ring-[hsl(var(--colors-active))]"
      >
        <span className="flex-1 font-medium">
          {adsDisabled
            ? t("settings.preferences.ads.off")
            : t("settings.preferences.ads.on")}
        </span>
        <Toggle enabled={!adsDisabled} />
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#161616] border border-white/10 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
              <span>💔</span> {t("settings.preferences.ads.confirm.title")}
            </h3>
            <p className="text-sm text-white/70 leading-relaxed">
              <Trans
                i18nKey="settings.preferences.ads.confirm.body"
                components={{ b: <b className="text-white/90" /> }}
              />
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 min-w-[8rem] rounded-lg bg-buttons-purple hover:bg-buttons-purple/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                {t("settings.preferences.ads.confirm.keep")}
              </button>
              <button
                type="button"
                onClick={() => {
                  disableAds();
                  setShowConfirm(false);
                }}
                className="flex-1 min-w-[8rem] rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                {t("settings.preferences.ads.confirm.disable")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
