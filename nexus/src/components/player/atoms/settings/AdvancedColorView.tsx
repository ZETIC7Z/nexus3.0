import { useTranslation } from "react-i18next";

import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { usePreferencesStore } from "@/stores/preferences";

import { Slider } from "./PlaybackSettingsView";

export function AdvancedColorView({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useOverlayRouter(id);

  const videoBrightness = usePreferencesStore((s) => s.videoBrightness);
  const setVideoBrightness = usePreferencesStore((s) => s.setVideoBrightness);
  const videoContrast = usePreferencesStore((s) => s.videoContrast);
  const setVideoContrast = usePreferencesStore((s) => s.setVideoContrast);
  const videoSaturation = usePreferencesStore((s) => s.videoSaturation);
  const setVideoSaturation = usePreferencesStore((s) => s.setVideoSaturation);
  const videoHueRotate = usePreferencesStore((s) => s.videoHueRotate);
  const setVideoHueRotate = usePreferencesStore((s) => s.setVideoHueRotate);

  const resetAll = () => {
    setVideoBrightness(100);
    setVideoContrast(100);
    setVideoSaturation(100);
    setVideoHueRotate(0);
  };

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/playback")}>
        Advanced color
      </Menu.BackLink>
      <Menu.Section>
        <div className="space-y-4 mt-3">
          <Slider
            label={t("settings.preferences.brightnessLabel", { defaultValue: "Brightness" })}
            value={videoBrightness}
            min={10}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={setVideoBrightness}
            onReset={() => setVideoBrightness(100)}
          />
          <Slider
            label="Contrast"
            value={videoContrast}
            min={50}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={setVideoContrast}
            onReset={() => setVideoContrast(100)}
          />
          <Slider
            label="Saturation"
            value={videoSaturation}
            min={0}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={setVideoSaturation}
            onReset={() => setVideoSaturation(100)}
          />
          <Slider
            label="Hue"
            value={videoHueRotate}
            min={-180}
            max={180}
            step={5}
            defaultValue={0}
            unit="°"
            onChange={setVideoHueRotate}
            onReset={() => setVideoHueRotate(0)}
          />
          <button
            type="button"
            onClick={resetAll}
            className="w-full text-sm text-type-secondary hover:text-white py-1 tabbable"
          >
            Reset all
          </button>
          <p className="text-xs text-type-secondary">
            Color adjustments are applied via CSS filters and persist across sessions.
            HDR and Dolby Vision content may still look incorrect — that is a browser/OS
            decoding limitation, not a player issue. Use these sliders to compensate.
          </p>
        </div>
      </Menu.Section>
    </>
  );
}
