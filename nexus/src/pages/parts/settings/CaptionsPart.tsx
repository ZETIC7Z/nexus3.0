import classNames from "classnames";
import { ReactNode, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Toggle } from "@/components/buttons/Toggle";
import { Dropdown } from "@/components/form/Dropdown";
import { Icon, Icons } from "@/components/Icon";
import {
  CaptionSetting,
  ColorOption,
  colors,
} from "@/components/player/atoms/settings/CaptionSettingsView";
import { CaptionCue } from "@/components/player/Player";
import { Heading1 } from "@/components/utils/Text";
import { Transition } from "@/components/utils/Transition";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { SubtitleStyling, useSubtitleStore } from "@/stores/subtitles";
import { isFirefox } from "@/utils/browser/detectFeatures";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: Icons;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Icon icon={icon} className="text-base text-type-secondary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-type-secondary">
          {title}
        </h3>
      </div>
      <div className="rounded-xl bg-dropdown-background/30 ring-1 ring-white/5 divide-y divide-white/5">
        {children}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  enabled,
  onChange,
  disabled,
}: {
  title: string;
  description?: ReactNode;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      onClick={() => !disabled && onChange(!enabled)}
      className={classNames(
        "px-4 py-3 select-none flex items-start gap-4 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50 pointer-events-none"
          : "cursor-pointer hover:bg-white/[0.03]",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold leading-snug">{title}</p>
        {description ? (
          <p className="text-sm text-type-secondary mt-1 leading-snug">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle enabled={enabled} />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  decimalsAllowed,
  textTransformer,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  decimalsAllowed?: number;
  textTransformer?: (s: string) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="px-4 py-3">
      <CaptionSetting
        label={label}
        value={value}
        min={min}
        max={max}
        decimalsAllowed={decimalsAllowed}
        textTransformer={textTransformer}
        onChange={onChange}
      />
    </div>
  );
}

function DropdownRow({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected =
    options.find((o) => o.id === value) ?? { id: value, name: value };
  return (
    <div className="px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold leading-snug">{title}</p>
      </div>
      <div className="shrink-0 w-40">
        <Dropdown
          options={options}
          selectedItem={selected}
          setSelectedItem={(item) => onChange(item.id)}
        />
      </div>
    </div>
  );
}

function ColorRow({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold leading-snug">{title}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {colors.map((v) => (
          <ColorOption
            onClick={() => onChange(v)}
            color={v}
            active={value === v}
            key={v}
          />
        ))}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute opacity-0 cursor-pointer w-8 h-8"
          />
          <div style={{ color: value }}>
            <Icon icon={Icons.BRUSH} className="text-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CaptionPreview(props: {
  fullscreen?: boolean;
  show?: boolean;
  styling: SubtitleStyling;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { fullscreen, show, onToggle } = props;

  useEffect(() => {
    if (!fullscreen || !show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreen, show, onToggle]);

  return (
    <div
      className={classNames({
        "pointer-events-none overflow-hidden w-full rounded": true,
        "aspect-video relative": !props.fullscreen,
        "fixed inset-0 z-[999]": props.fullscreen,
      })}
    >
      {props.fullscreen && props.show ? (
        <Helmet>
          <html data-no-scroll />
        </Helmet>
      ) : null}
      <Transition animation="fade" show={props.show}>
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{
            backgroundImage:
              "radial-gradient(102.95% 87.07% at 100% 100%, #EEAA45 0%, rgba(165, 186, 151, 0.56) 54.69%, rgba(74, 207, 254, 0.00) 100%), linear-gradient(180deg, #48D3FF 0%, #3B27B2 100%)",
          }}
        >
          <button
            type="button"
            className="tabbable bg-black absolute right-3 top-3 text-white bg-opacity-25 duration-100 transition-[background-color,transform] active:scale-110 hover:bg-opacity-50 p-2 rounded-md cursor-pointer"
            onClick={props.onToggle}
          >
            <Icon icon={props.fullscreen ? Icons.X : Icons.EXPAND} />
          </button>

          <div
            className="text-white pointer-events-none absolute flex w-full flex-col items-center transition-[bottom] p-4"
            style={{
              bottom: `${props.styling.verticalPosition * 4}px`,
            }}
          >
            <div
              className={
                props.fullscreen ? "" : "transform origin-bottom text-[0.5rem]"
              }
            >
              <CaptionCue
                text={t("settings.subtitles.previewQuote") ?? undefined}
                styling={props.styling}
                overrideCasing={false}
              />
            </div>
          </div>
        </div>
      </Transition>
    </div>
  );
}

export function CaptionsPart(props: {
  styling: SubtitleStyling;
  setStyling: (s: SubtitleStyling) => void;
}) {
  const { t } = useTranslation();
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  const subtitleStore = useSubtitleStore();
  const preferencesStore = usePreferencesStore();
  const setCaptionAsTrack = usePlayerStore((s) => s.setCaptionAsTrack);
  const enableNativeSubtitles = preferencesStore.enableNativeSubtitles;

  useEffect(() => {
    subtitleStore.updateStyling(props.styling);
  }, [props.styling, subtitleStore, subtitleStore.updateStyling]);

  useEffect(() => {
    setCaptionAsTrack(enableNativeSubtitles);
  }, [enableNativeSubtitles, setCaptionAsTrack]);

  const handleStylingChange = (newStyling: SubtitleStyling) => {
    props.setStyling(newStyling);
    subtitleStore.updateStyling(newStyling);
  };

  const resetSubStyling = () => {
    subtitleStore.resetStyling();
    props.setStyling({
      color: "#ffffff",
      backgroundOpacity: 0.5,
      size: 1,
      backgroundBlur: 0.5,
      backgroundBlurEnabled: !isFirefox,
      bold: false,
      verticalPosition: 1,
      fontStyle: "default",
      borderThickness: 1,
      lineHeight: 1.5,
    });
  };

  const styleOptions = [
    { id: "default", name: t("settings.subtitles.textStyle.default") },
    { id: "raised", name: t("settings.subtitles.textStyle.raised") },
    { id: "depressed", name: t("settings.subtitles.textStyle.depressed") },
    { id: "Border", name: t("settings.subtitles.textStyle.Border") },
    { id: "dropShadow", name: t("settings.subtitles.textStyle.dropShadow") },
  ];

  return (
    <div>
      <Heading1 border>{t("settings.subtitles.title")}</Heading1>
      <div className="grid md:grid-cols-[1fr,356px] gap-8">
        <div className="space-y-6">
          <Section
            title={t("settings.subtitles.behaviorSection", "Behavior")}
            icon={Icons.CAPTIONS}
          >
            <ToggleRow
              title={t("player.menus.subtitles.useNativeSubtitles")}
              description={t(
                "player.menus.subtitles.useNativeSubtitlesDescription",
              )}
              enabled={enableNativeSubtitles}
              onChange={(v) => preferencesStore.setEnableNativeSubtitles(v)}
            />
          </Section>

          {!enableNativeSubtitles && (
            <>
              <Section
                title={t("settings.subtitles.backgroundSection", "Background")}
                icon={Icons.BRUSH}
              >
                <SliderRow
                  label={t("settings.subtitles.backgroundLabel")}
                  value={props.styling.backgroundOpacity * 100}
                  min={0}
                  max={100}
                  textTransformer={(s) => `${s}%`}
                  onChange={(v) =>
                    handleStylingChange({
                      ...props.styling,
                      backgroundOpacity: v / 100,
                    })
                  }
                />
                <ToggleRow
                  title={t("settings.subtitles.backgroundBlurEnabledLabel")}
                  description={t(
                    "settings.subtitles.backgroundBlurEnabledDescription",
                  )}
                  enabled={props.styling.backgroundBlurEnabled}
                  onChange={(v) =>
                    handleStylingChange({
                      ...props.styling,
                      backgroundBlurEnabled: v,
                    })
                  }
                />
                {props.styling.backgroundBlurEnabled && (
                  <SliderRow
                    label={t("settings.subtitles.backgroundBlurLabel")}
                    value={props.styling.backgroundBlur * 100}
                    min={0}
                    max={100}
                    textTransformer={(s) => `${s}%`}
                    onChange={(v) =>
                      handleStylingChange({
                        ...props.styling,
                        backgroundBlur: v / 100,
                      })
                    }
                  />
                )}
              </Section>

              <Section
                title={t("settings.subtitles.textSection", "Text")}
                icon={Icons.TRANSLATE}
              >
                <SliderRow
                  label={t("settings.subtitles.textSizeLabel")}
                  value={props.styling.size * 100}
                  min={1}
                  max={200}
                  textTransformer={(s) => `${s}%`}
                  onChange={(v) =>
                    handleStylingChange({
                      ...props.styling,
                      size: v / 100,
                    })
                  }
                />
                <DropdownRow
                  title={t("settings.subtitles.textStyle.title")}
                  options={styleOptions}
                  value={props.styling.fontStyle}
                  onChange={(id) =>
                    handleStylingChange({
                      ...props.styling,
                      fontStyle: id,
                    })
                  }
                />
                {props.styling.fontStyle === "Border" && (
                  <SliderRow
                    label={t("settings.subtitles.BorderThicknessLabel")}
                    value={props.styling.borderThickness}
                    min={0}
                    max={10}
                    decimalsAllowed={1}
                    textTransformer={(s) => `${s}px`}
                    onChange={(v) =>
                      handleStylingChange({
                        ...props.styling,
                        borderThickness: v,
                      })
                    }
                  />
                )}
                <ToggleRow
                  title={t("settings.subtitles.textBoldLabel")}
                  enabled={props.styling.bold}
                  onChange={(v) =>
                    handleStylingChange({ ...props.styling, bold: v })
                  }
                />
                <ColorRow
                  title={t("settings.subtitles.colorLabel")}
                  value={props.styling.color}
                  onChange={(color) =>
                    handleStylingChange({ ...props.styling, color })
                  }
                />
              </Section>

              <Section
                title={t("settings.subtitles.layoutSection", "Layout")}
                icon={Icons.LAYOUT}
              >
                <SliderRow
                  label={t("settings.subtitles.verticalPositionLabel")}
                  value={props.styling.verticalPosition}
                  min={0}
                  max={30}
                  decimalsAllowed={0}
                  textTransformer={(s) => `${s}rem`}
                  onChange={(v) =>
                    handleStylingChange({
                      ...props.styling,
                      verticalPosition: v,
                    })
                  }
                />
                <SliderRow
                  label={t(
                    "settings.subtitles.lineSpacingLabel",
                    "Line spacing",
                  )}
                  value={(props.styling.lineHeight ?? 1.5) * 100}
                  min={100}
                  max={250}
                  textTransformer={(s) => `${s}%`}
                  onChange={(v) =>
                    handleStylingChange({
                      ...props.styling,
                      lineHeight: v / 100,
                    })
                  }
                />
              </Section>

              <Button
                className="w-full md:w-auto"
                theme="secondary"
                onClick={resetSubStyling}
              >
                {t("settings.reset")}
              </Button>
            </>
          )}
        </div>
        {!enableNativeSubtitles && (
          <>
            <CaptionPreview
              show
              styling={props.styling}
              onToggle={() => setFullscreenPreview((s) => !s)}
            />
            <CaptionPreview
              show={fullscreenPreview}
              fullscreen
              styling={props.styling}
              onToggle={() => setFullscreenPreview((s) => !s)}
            />
          </>
        )}
      </div>
    </div>
  );
}
