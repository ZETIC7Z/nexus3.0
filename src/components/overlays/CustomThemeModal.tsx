import classNames from "classnames";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import {
  SavedCustomTheme,
  usePreviewThemeStore,
  useThemeStore,
} from "@/stores/theme";
import {
  primaryOptions,
  secondaryOptions,
  tertiaryOptions,
} from "@themes/custom";

import { OverlayPortal } from "./OverlayDisplay";

function ColorOption({
  opt,
  selected,
  onClick,
  colorKey1,
  colorKey2,
}: {
  opt: any;
  selected: boolean;
  onClick: () => void;
  colorKey1: string;
  colorKey2?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "relative w-12 h-12 md:w-14 md:h-14 rounded-xl flex-shrink-0 cursor-pointer overflow-hidden transition-all duration-300 ease-out outline-none",
        selected
          ? "ring-2 ring-white ring-offset-2 ring-offset-background-main scale-100 shadow-xl shadow-white/10"
          : "hover:scale-110 opacity-60 hover:opacity-100 shadow-lg",
      )}
    >
      <div className="absolute inset-0 flex">
        <div
          className="flex-1 h-full"
          style={{
            backgroundColor: opt.colors[colorKey1]
              ? `rgb(${opt.colors[colorKey1]})`
              : "transparent",
          }}
        />
        {colorKey2 && opt.colors[colorKey2] && (
          <div
            className="flex-1 h-full"
            style={{ backgroundColor: `rgb(${opt.colors[colorKey2]})` }}
          />
        )}
      </div>
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Icon
            icon={Icons.CHECKMARK}
            className="text-white text-xl drop-shadow-md"
          />
        </div>
      )}
    </button>
  );
}

function CustomColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 md:w-14 md:h-14 rounded-xl cursor-pointer border-2 border-white/20 hover:border-white/50 transition-colors bg-transparent"
        />
      </div>
      <div>
        <p className="text-white/60 text-xs">{label}</p>
        <p className="text-white font-mono text-sm">{value.toUpperCase()}</p>
      </div>
    </div>
  );
}

function LivePreview() {
  return (
    <div className="w-full max-w-md mx-auto rounded-xl overflow-hidden border border-white/10 bg-background-main shadow-2xl">
      <div className="relative w-full h-full">
        {/* Background glow */}
        <div className="bg-themePreview-primary/50 w-[130%] h-16 absolute left-1/2 -top-8 blur-2xl transform -translate-x-1/2 rounded-[100%]" />
        {/* Navbar */}
        <div className="relative p-3 flex justify-between items-center">
          <div className="flex space-x-2 items-center">
            <div className="bg-themePreview-primary w-6 h-3 rounded-full" />
            <div className="bg-themePreview-ghost/20 w-10 h-2 rounded-full" />
            <div className="bg-themePreview-ghost/20 w-6 h-2 rounded-full" />
            <div className="bg-themePreview-ghost/20 w-6 h-2 rounded-full" />
          </div>
          <div className="bg-themePreview-ghost/20 w-4 h-4 rounded-full" />
        </div>
        {/* Hero */}
        <div className="relative mt-4 flex items-center flex-col gap-2 px-6">
          <div className="bg-themePreview-ghost/30 w-32 h-2 rounded-full" />
          <div className="bg-themePreview-ghost/20 w-24 h-1.5 rounded-full" />
          {/* Search bar */}
          <div className="bg-themePreview-ghost/10 w-full max-w-xs h-6 mt-2 rounded-full" />
        </div>
        {/* Media grid */}
        <div className="mt-8 px-4 pb-4">
          <div className="flex gap-2 items-center mb-2">
            <div className="bg-themePreview-primary w-3 h-3 rounded-full" />
            <div className="bg-themePreview-ghost/30 w-16 h-1.5 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
          </div>
          <div className="flex gap-2 items-center mb-2 mt-4">
            <div className="bg-themePreview-secondary w-3 h-3 rounded-full" />
            <div className="bg-themePreview-ghost/30 w-20 h-1.5 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
            <div className="bg-themePreview-ghost/10 w-full h-16 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomThemeModal(props: {
  id: string;
  isShown: boolean;
  onHide: () => void;
  themeToEdit?: SavedCustomTheme | null;
  onSave?: (theme: SavedCustomTheme) => void;
}) {
  const { t } = useTranslation();

  const saveCustomTheme = useThemeStore((s) => s.saveCustomTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setCustomTheme = useThemeStore((s) => s.setCustomTheme);
  const setPreviewTheme = usePreviewThemeStore((s) => s.setPreviewTheme);

  const [name, setName] = useState("");
  const [primary, setPrimary] = useState(primaryOptions[0].id);
  const [secondary, setSecondary] = useState(secondaryOptions[0].id);
  const [tertiary, setTertiary] = useState(tertiaryOptions[0].id);

  // Custom color picker state (hex values)
  const [useCustomPrimary, setUseCustomPrimary] = useState(false);
  const [useCustomSecondary, setUseCustomSecondary] = useState(false);
  const [useCustomTertiary, setUseCustomTertiary] = useState(false);
  const [customPrimaryColor, setCustomPrimaryColor] = useState("#7B61FF");
  const [customSecondaryColor, setCustomSecondaryColor] = useState("#FFFFFF");
  const [customTertiaryColor, setCustomTertiaryColor] = useState("#0F0F12");

  const [wasShown, setWasShown] = useState(false);

  if (props.isShown && !wasShown) {
    setWasShown(true);
    if (props.themeToEdit) {
      setName(props.themeToEdit.name);
      setPrimary(props.themeToEdit.primary);
      setSecondary(props.themeToEdit.secondary);
      setTertiary(props.themeToEdit.tertiary);
    } else {
      setName("");
      setPrimary(primaryOptions[0].id);
      setSecondary(secondaryOptions[0].id);
      setTertiary(tertiaryOptions[0].id);
    }
    setUseCustomPrimary(false);
    setUseCustomSecondary(false);
    setUseCustomTertiary(false);
  } else if (!props.isShown && wasShown) {
    setWasShown(false);
  }

  // Sync state to the preview theme in real-time
  useEffect(() => {
    if (props.isShown) {
      setPreviewTheme("custom");
      setCustomTheme({ primary, secondary, tertiary });
    } else {
      setPreviewTheme(null);
    }
  }, [
    props.isShown,
    primary,
    secondary,
    tertiary,
    setPreviewTheme,
    setCustomTheme,
  ]);

  const handleClose = () => {
    props.onHide();
  };

  const handleSave = () => {
    const themeName = name.trim() || "Untitled Theme";
    const id = props.themeToEdit
      ? props.themeToEdit.id
      : `custom-${Date.now()}`;
    const newTheme: SavedCustomTheme = {
      id,
      name: themeName,
      primary,
      secondary,
      tertiary,
      ...(useCustomPrimary && { customPrimaryHex: customPrimaryColor }),
      ...(useCustomSecondary && { customSecondaryHex: customSecondaryColor }),
      ...(useCustomTertiary && { customTertiaryHex: customTertiaryColor }),
    };

    if (props.onSave) {
      props.onSave(newTheme);
    } else {
      saveCustomTheme(newTheme);
      setTheme(id);
    }

    props.onHide();
  };

  return (
    <OverlayPortal show={props.isShown}>
      <div className="absolute inset-0 z-[1000] flex flex-col lg:flex-row bg-background-main/95 backdrop-blur-3xl text-white pointer-events-auto overflow-hidden">
        {/* Left Section - Name, Preview & Actions */}
        <div className="flex-1 flex flex-col p-6 md:p-12 border-b lg:border-b-0 lg:border-r border-white/5 relative overflow-y-auto">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-4 text-white uppercase flex flex-wrap gap-x-3 md:block">
              <span>
                {props.themeToEdit
                  ? t("settings.appearance.customTheme.editBtn", "Edit")
                  : t("settings.appearance.customTheme.createBtn", "Create")}
              </span>
              <br className="hidden md:block" />
              <span>
                {t(
                  "settings.appearance.customTheme.createBtn2",
                  "Your Own Theme",
                )}
              </span>
            </h1>
          </div>

          <div className="my-4">
            <input
              type="text"
              id="theme-name-input"
              name="theme-name"
              className="w-full text-2xl md:text-3xl font-black bg-transparent border-none outline-none text-white placeholder-white/20 transition-colors min-w-0"
              placeholder={t("settings.appearance.customTheme.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Live Preview */}
          <div className="flex-1 flex flex-col justify-center py-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3 font-semibold">
              {t("settings.appearance.customTheme.livePreview")}
            </p>
            <LivePreview />
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 mt-auto w-full pt-4">
            <Button
              className="w-full md:w-auto md:flex-1 !bg-white/5 hover:!bg-white/10 !text-white !font-bold !px-6 !py-4 !rounded-xl transition-all"
              onClick={handleClose}
            >
              {t("global.cancel", "Cancel")}
            </Button>
            <Button
              className="w-full md:w-auto md:flex-[2] !bg-white hover:!bg-gray-200 !text-black !font-black !px-10 !py-4 !rounded-xl transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-2xl shadow-white/10"
              onClick={handleSave}
              disabled={name.trim().length === 0}
            >
              {t("global.save", "Save")}
            </Button>
          </div>
        </div>

        {/* Right Section - Color Pickers */}
        <div className="w-full lg:w-[50%] xl:w-[45%] flex flex-col gap-8 p-6 md:p-12 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {/* Primary */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">
                {t("settings.appearance.customTheme.primaryColor")}
              </h2>
              <button
                type="button"
                onClick={() => setUseCustomPrimary(!useCustomPrimary)}
                className={classNames(
                  "text-xs px-3 py-1.5 rounded-lg transition-colors font-medium",
                  useCustomPrimary
                    ? "bg-white/20 text-white"
                    : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10",
                )}
              >
                <Icon icon={Icons.BRUSH} className="mr-1" />
                {t("settings.appearance.customTheme.customToggle")}
              </button>
            </div>
            {useCustomPrimary ? (
              <CustomColorPicker
                label={t("settings.appearance.customTheme.primaryColorLabel")}
                value={customPrimaryColor}
                onChange={setCustomPrimaryColor}
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {primaryOptions.map((opt) => (
                  <ColorOption
                    key={opt.id}
                    opt={opt}
                    selected={primary === opt.id}
                    onClick={() => setPrimary(opt.id)}
                    colorKey1="--colors-type-logo"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Secondary */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">
                {t("settings.appearance.customTheme.secondaryColor")}
              </h2>
              <button
                type="button"
                onClick={() => setUseCustomSecondary(!useCustomSecondary)}
                className={classNames(
                  "text-xs px-3 py-1.5 rounded-lg transition-colors font-medium",
                  useCustomSecondary
                    ? "bg-white/20 text-white"
                    : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10",
                )}
              >
                <Icon icon={Icons.BRUSH} className="mr-1" />
                {t("settings.appearance.customTheme.customToggle")}
              </button>
            </div>
            {useCustomSecondary ? (
              <CustomColorPicker
                label={t("settings.appearance.customTheme.secondaryColorLabel")}
                value={customSecondaryColor}
                onChange={setCustomSecondaryColor}
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {secondaryOptions.map((opt) => (
                  <ColorOption
                    key={opt.id}
                    opt={opt}
                    selected={secondary === opt.id}
                    onClick={() => setSecondary(opt.id)}
                    colorKey1="--colors-type-text"
                    colorKey2="--colors-buttons-secondary"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Tertiary */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">
                {t("settings.appearance.customTheme.tertiaryColor")}
              </h2>
              <button
                type="button"
                onClick={() => setUseCustomTertiary(!useCustomTertiary)}
                className={classNames(
                  "text-xs px-3 py-1.5 rounded-lg transition-colors font-medium",
                  useCustomTertiary
                    ? "bg-white/20 text-white"
                    : "bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10",
                )}
              >
                <Icon icon={Icons.BRUSH} className="mr-1" />
                {t("settings.appearance.customTheme.customToggle")}
              </button>
            </div>
            {useCustomTertiary ? (
              <CustomColorPicker
                label={t("settings.appearance.customTheme.tertiaryColorLabel")}
                value={customTertiaryColor}
                onChange={setCustomTertiaryColor}
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {tertiaryOptions.map((opt) => (
                  <ColorOption
                    key={opt.id}
                    opt={opt}
                    selected={tertiary === opt.id}
                    onClick={() => setTertiary(opt.id)}
                    colorKey1="--colors-background-main"
                    colorKey2="--colors-modal-background"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
