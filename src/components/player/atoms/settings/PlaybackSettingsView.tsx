import classNames from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateSettings } from "@/backend/accounts/settings";
import { Toggle } from "@/components/buttons/Toggle";
import { Icon, Icons } from "@/components/Icon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { useWatchPartyStore } from "@/stores/watchParty";
import { isAutoplayAllowed } from "@/utils/media/autoplay";

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset: () => void;
  defaultValue: number;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-type-secondary">{props.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white tabular-nums">
            {props.value}{props.unit ?? ""}
          </span>
          {props.value !== props.defaultValue && (
            <button
              type="button"
              className="text-xs text-type-secondary hover:text-white tabbable"
              onClick={props.onReset}
            >
              <Icon icon={Icons.X} className="text-sm" />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-video-context-light cursor-pointer"
        aria-label={props.label}
      />
    </div>
  );
}

function ButtonList(props: {
  options: number[];
  selected: number;
  onClick: (v: any) => void;
  disabled?: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [customValue, setCustomValue] = useState<string>("");
  const [isCustomSpeed, setIsCustomSpeed] = useState(false);

  // Check if current speed is a custom value (not in preset options)
  useEffect(() => {
    if (!props.options.includes(props.selected)) {
      setIsCustomSpeed(true);
    } else {
      setIsCustomSpeed(false);
    }
  }, [props.selected, props.options]);

  const handleButtonClick = useCallback(
    (option: number, index: number) => {
      if (editingIndex === index) {
        // Already in edit mode, do nothing
        return;
      }

      // If clicking the custom speed button, enter edit mode
      if (isCustomSpeed && option === props.selected) {
        setEditingIndex(0);
        setCustomValue(option.toString());
        return;
      }

      props.onClick(option);
      setIsCustomSpeed(false);
    },
    [editingIndex, props, isCustomSpeed],
  );

  const handleDoubleClick = useCallback(
    (option: number, index: number) => {
      if (props.disabled) return;

      setEditingIndex(index);
      setCustomValue(option.toString());
    },
    [props.disabled],
  );

  const handleCustomValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomValue(e.target.value);
    },
    [],
  );

  const handleCustomValueKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const value = parseFloat(customValue);
        if (!Number.isNaN(value) && value > 0 && value <= 5) {
          props.onClick(value);
          setEditingIndex(null);
          setIsCustomSpeed(true);
        }
      } else if (e.key === "Escape") {
        setEditingIndex(null);
      }
    },
    [customValue, props],
  );

  const handleInputBlur = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleResetCustomSpeed = useCallback(() => {
    setIsCustomSpeed(false);
    props.onClick(1); // Reset to default speed (1x)
  }, [props]);

  return (
    <div className="flex items-center bg-video-context-light/10 p-1 rounded-lg">
      {isCustomSpeed ? (
        // Show only the custom speed button when a custom speed is set
        <button
          type="button"
          disabled={props.disabled}
          className={classNames(
            "w-full px-2 py-1 rounded-md tabbable relative",
            "bg-video-context-light/20 text-white",
            props.disabled ? "opacity-50 cursor-not-allowed" : null,
          )}
          onClick={() => handleButtonClick(props.selected, 0)}
          onDoubleClick={() => handleDoubleClick(props.selected, 0)}
          key="custom"
        >
          {editingIndex === 0 ? (
            <input
              type="text"
              value={customValue}
              onChange={handleCustomValueChange}
              onKeyDown={handleCustomValueKeyDown}
              onBlur={handleInputBlur}
              className="w-full bg-transparent text-center focus:outline-none"
              autoFocus
              aria-label="Custom playback speed"
            />
          ) : (
            <>
              {`${props.selected}x`}
              <button
                type="button"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs text-video-context-light/70 hover:text-white"
                onClick={handleResetCustomSpeed}
                title="Reset to presets"
              >
                <Icon icon={Icons.X} className="text-sm" />
              </button>
            </>
          )}
        </button>
      ) : (
        // Show all preset options when no custom speed is set
        props.options.map((option, index) => {
          const isEditing = editingIndex === index;
          return (
            <button
              type="button"
              disabled={props.disabled}
              className={classNames(
                "w-full px-2 py-1 rounded-md tabbable relative",
                props.selected === option
                  ? "bg-video-context-light/20 text-white"
                  : null,
                props.disabled ? "opacity-50 cursor-not-allowed" : null,
              )}
              onClick={() => handleButtonClick(option, index)}
              onDoubleClick={() => handleDoubleClick(option, index)}
              key={option}
            >
              {isEditing ? (
                <input
                  type="text"
                  value={customValue}
                  onChange={handleCustomValueChange}
                  onKeyDown={handleCustomValueKeyDown}
                  onBlur={handleInputBlur}
                  className="w-full bg-transparent text-center focus:outline-none"
                  autoFocus
                  aria-label="Custom playback speed"
                />
              ) : (
                `${option}x`
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

export function PlaybackSettingsView({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useOverlayRouter(id);
  const playbackRate = usePlayerStore((s) => s.mediaPlaying.playbackRate);
  const display = usePlayerStore((s) => s.display);
  const enableAutoplay = usePreferencesStore((s) => s.enableAutoplay);
  const setEnableAutoplay = usePreferencesStore((s) => s.setEnableAutoplay);
  const enableLowPerformanceMode = usePreferencesStore(
    (s) => s.enableLowPerformanceMode,
  );
  const videoBrightness = usePreferencesStore((s) => s.videoBrightness);
  const setVideoBrightness = usePreferencesStore((s) => s.setVideoBrightness);
  const volumeBoost = usePreferencesStore((s) => s.volumeBoost);
  const setVolumeBoost = usePreferencesStore((s) => s.setVolumeBoost);
  const [volumeBoostEnabled, setVolumeBoostEnabled] = useState(volumeBoost > 100);

  const isInWatchParty = useWatchPartyStore((s) => s.enabled);

  const account = useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();
  const allowAutoplay = useMemo(() => isAutoplayAllowed(), []);
  const canShowAutoplay =
    !isInWatchParty && allowAutoplay && !enableLowPerformanceMode;

  const saveAutoplaySetting = useCallback(
    async (value: boolean) => {
      if (!account || !backendUrl) return;
      try {
        await updateSettings(backendUrl, account, { enableAutoplay: value });
      } catch (error) {
        console.error("Failed to save autoplay setting:", error);
      }
    },
    [account, backendUrl],
  );

  const setPlaybackRate = useCallback(
    (v: number) => {
      if (isInWatchParty) return;
      display?.setPlaybackRate(v);
    },
    [display, isInWatchParty],
  );

  const handleAutoplayToggle = useCallback(() => {
    const newValue = !enableAutoplay;
    setEnableAutoplay(newValue);
    saveAutoplaySetting(newValue);
  }, [enableAutoplay, setEnableAutoplay, saveAutoplaySetting]);

  const handleVolumeBoostToggle = useCallback(() => {
    const next = !volumeBoostEnabled;
    setVolumeBoostEnabled(next);
    if (!next) setVolumeBoost(100);
  }, [volumeBoostEnabled, setVolumeBoost]);

  useEffect(() => {
    if (isInWatchParty && display && playbackRate !== 1) {
      display.setPlaybackRate(1);
    }
  }, [isInWatchParty, display, playbackRate]);

  const options = [0.25, 0.5, 1, 1.5, 2];

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.playback.title")}
      </Menu.BackLink>
      <Menu.Section>
        <div className="space-y-4 mt-3">
          <Menu.FieldTitle>
            {t("player.menus.playback.speedLabel")}
            {isInWatchParty && (
              <span className="text-sm text-type-secondary ml-2">
                {t("player.menus.playback.disabled")}
              </span>
            )}
          </Menu.FieldTitle>
          <ButtonList
            options={options}
            selected={isInWatchParty ? 1 : playbackRate}
            onClick={setPlaybackRate}
            disabled={isInWatchParty}
          />
        </div>
      </Menu.Section>
      <Menu.Section>
        <div className="space-y-4 mt-3">
          {canShowAutoplay && (
            <Menu.Link
              rightSide={
                <Toggle enabled={enableAutoplay} onClick={handleAutoplayToggle} />
              }
            >
              {t("settings.preferences.autoplayLabel")}
            </Menu.Link>
          )}
          <Slider
            label="Brightness"
            value={videoBrightness}
            min={10}
            max={200}
            step={5}
            defaultValue={100}
            unit="%"
            onChange={setVideoBrightness}
            onReset={() => setVideoBrightness(100)}
          />
          <Menu.Link
            rightSide={
              <Toggle enabled={volumeBoostEnabled} onClick={handleVolumeBoostToggle} />
            }
          >
            Volume Boost
          </Menu.Link>
          {volumeBoostEnabled && (
            <Slider
              label="Boost level"
              value={volumeBoost}
              min={100}
              max={300}
              step={10}
              defaultValue={100}
              unit="%"
              onChange={setVolumeBoost}
              onReset={() => setVolumeBoost(100)}
            />
          )}
          <Menu.ChevronLink onClick={() => router.navigate("/playback/advanced")}>
            Advanced color
          </Menu.ChevronLink>
        </div>
      </Menu.Section>
    </>
  );
}
