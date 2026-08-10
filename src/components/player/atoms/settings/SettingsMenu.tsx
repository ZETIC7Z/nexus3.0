import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getArtemisVariantMeta, getVariantMeta } from "@/sdk";
import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { Toggle } from "@/components/buttons/Toggle";
import { Icon, Icons } from "@/components/Icon";
import { useCaptions } from "@/components/player/hooks/useCaptions";
import { useCasting } from "@/components/player/casting/useCasting";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useAudioTrackStore } from "@/utils/player/audioTracks";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { usePlayerStore } from "@/stores/player/store";
import { qualityToString } from "@/stores/player/utils/qualities";
import { useSubtitleStore } from "@/stores/subtitles";
import { getPrettyLanguageNameFromLocale } from "@/utils/locale/language";
import { getServerEmbedLabel } from "@/providers/embeds/shared";

export function SettingsMenu({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useOverlayRouter(id);
  const currentQuality = usePlayerStore((s) => s.currentQuality);

  const selectedCaptionLanguage = usePlayerStore(
    (s) => s.caption.selected?.language,
  );
  const subtitlesEnabled = useSubtitleStore((s) => s.enabled);
  const currentSourceId = usePlayerStore((s) => s.sourceId);
  const currentEmbedId = usePlayerStore(
    (s) => (s as any).embedId as string | null,
  );
  const sourceName = useMemo(() => {
    if (!currentSourceId) return "...";
    const source = getCachedMetadata().find(
      (src) => src.id === currentSourceId,
    );
    return source?.name ?? "...";
  }, [currentSourceId]);
  const embedName = useMemo(() => {
    if (!currentEmbedId) return undefined;
    // Prefer the real server name (Prime / Orbit / Euro) over generic "Server N".
    const serverLabel = getServerEmbedLabel(currentEmbedId);
    if (serverLabel) return serverLabel;
    const meta = getCachedMetadata().find((s) => s.id === currentEmbedId);
    return meta?.name;
  }, [currentEmbedId]);
  const { toggleLastUsed } = useCaptions();

  const selectedLanguagePretty = selectedCaptionLanguage
    ? (getPrettyLanguageNameFromLocale(selectedCaptionLanguage) ??
      t("player.menus.subtitles.unknownLanguage"))
    : undefined;



  const source = usePlayerStore((s) => s.source);

  const downloadable = source?.type === "file" || source?.type === "hls";


  const { isCasting, chromecastAvailable, airplayAvailable, startChromecast, startAirplay, stop } =
    useCasting();
  const isArtemis = currentSourceId === "artemis";
  const castPlatformAvailable = chromecastAvailable || airplayAvailable;

  const requestCast = () => {
    if (!isArtemis) return;
    if (isCasting) {
      stop();
      return;
    }
    if (chromecastAvailable) {
      startChromecast();
      return;
    }
    startAirplay();
  };

  const variantMeta =
    currentSourceId === "aurora"
      ? getVariantMeta()
      : currentSourceId === "artemis"
        ? getArtemisVariantMeta()
        : null;
  const hasVariants = (variantMeta?.variants?.length ?? 0) > 1;

  return (
    <Menu.Card>
      <Menu.Section grid>
        <Menu.ChevronLink
          box
          onClick={() => router.navigate("/quality")}
          rightText={currentQuality ? qualityToString(currentQuality) : ""}
        >
          {t("player.menus.settings.qualityItem")}
          <span className="text-type-secondary text-sm">
            {currentQuality
              ? qualityToString(currentQuality)
              : t("player.menus.quality.auto")}
          </span>
        </Menu.ChevronLink>
        <Menu.ChevronLink
          box
          onClick={() => router.navigate("/source")}
          rightText={embedName ? `${sourceName} \\ ${embedName}` : sourceName}
        >
          {t("player.menus.settings.sourceItem")}
          <span className="text-type-secondary text-sm">
            {embedName ? `${sourceName} \\ ${embedName}` : sourceName}
          </span>
        </Menu.ChevronLink>

        <Menu.ChevronLink
          box
          onClick={() => router.navigate("/captions")}
          rightText={sourceName}
        >
          {t("player.menus.settings.subtitleItem")}
          <span className="text-type-secondary text-sm">
            {selectedLanguagePretty ?? t("player.menus.subtitles.offChoice")}
          </span>
        </Menu.ChevronLink>
        <Menu.ChevronLink
          box
          onClick={() => router.navigate("/audio")}
          rightText={useAudioTrackStore.getState().tracks.find(track => track.id === useAudioTrackStore.getState().activeId)?.label ?? "English"}
        >
          Audio
          <span className="text-type-secondary text-sm">
            {useAudioTrackStore((s) => s.tracks.find(track => track.id === s.activeId)?.label ?? "English")}
          </span>
        </Menu.ChevronLink>
      </Menu.Section>
      <Menu.Section>
        <Menu.Link
          clickable
          onClick={() =>
            router.navigate(downloadable ? "/download" : "/download/unable")
          }
          rightSide={<Icon className="text-xl" icon={Icons.DOWNLOAD} />}
          className={downloadable ? "opacity-100" : "opacity-50"}
        >
          {t("player.menus.settings.downloadItem")}
        </Menu.Link>
        <Menu.Link
          clickable
          onClick={() =>
            router.navigate(downloadable ? "/watchparty" : "/download/unable")
          }
          rightSide={<Icon className="text-xl" icon={Icons.WATCH_PARTY} />}
          className={downloadable ? "opacity-100" : "opacity-50"}
        >
          {t("player.menus.watchparty.watchpartyItem")}
        </Menu.Link>
        {castPlatformAvailable ? (
          <Menu.Link
            clickable={isArtemis}
            disabled={!isArtemis}
            onClick={requestCast}
            rightSide={<Icon className="text-xl" icon={Icons.CASTING} />}
          >
            <span className="flex flex-col">
              {t("player.menus.settings.castItem")}
              {!isArtemis && (
                <span className="text-type-secondary text-xs">
                  {t("player.menus.settings.castArtemisOnly")}
                </span>
              )}
            </span>
          </Menu.Link>
        ) : null}
      </Menu.Section>
      {hasVariants ? (
        <Menu.Section>
          <Menu.ChevronLink
            onClick={() => router.navigate("/variant")}
            rightText={`${variantMeta!.variants!.length}`}
          >
            Stream Variants
          </Menu.ChevronLink>
        </Menu.Section>
      ) : null}
      <Menu.Section>
        <Menu.Link
          rightSide={
            <Toggle
              enabled={subtitlesEnabled}
              onClick={() => toggleLastUsed().catch(() => {})}
            />
          }
        >
          {t("player.menus.settings.enableSubtitles")}
        </Menu.Link>
        <Menu.ChevronLink onClick={() => router.navigate("/playback")}>
          {t("player.menus.settings.playbackItem")}
        </Menu.ChevronLink>
        <Menu.ChevronLink
          onClick={() => router.navigate("/playback/skip-segments")}
        >
          {t("player.skipTime.skipSegments")}
        </Menu.ChevronLink>
      </Menu.Section>
    </Menu.Card>
  );
}
