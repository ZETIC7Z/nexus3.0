import { useTranslation } from "react-i18next";

import { Icon, Icons } from "@/components/Icon";
import { useCasting } from "@/components/player/casting/useCasting";
import { usePlayerStore } from "@/stores/player/store";

export function CastingNotification() {
  const { t } = useTranslation();
  const isLoading = usePlayerStore((s) => s.mediaPlaying.isLoading);
  const { isCasting } = useCasting();

  if (isLoading || !isCasting) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="rounded-full bg-opacity-10 bg-video-buttonBackground p-3 brightness-100 grayscale">
        <Icon icon={Icons.CASTING} />
      </div>
      <p className="text-center">
        {t("player.casting.to", { device: t("player.casting.device") })}
      </p>
    </div>
  );
}
