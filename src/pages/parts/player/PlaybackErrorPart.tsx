import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Icons } from "@/components/Icon";
import { IconPill } from "@/components/layout/IconPill";
import { useModal } from "@/components/overlays/Modal";
import { Paragraph } from "@/components/text/Paragraph";
import { Title } from "@/components/text/Title";
import { getCachedMetadata } from "@/backend/helpers/providerApi";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { ErrorContainer, ErrorLayout } from "@/pages/layouts/ErrorLayout";
import { getMediaKey } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";

import { ErrorCardInModal } from "../errors/ErrorCard";

function lookupSourceName(sourceId: string): string | null {
  try {
    return getCachedMetadata().find((s) => s.id === sourceId)?.name ?? null;
  } catch {
    return null;
  }
}

export interface PlaybackErrorPartProps {
  onResume?: (startFromSourceId: string) => void;
  currentSourceId?: string | null;
  autoResumeExhausted?: boolean;
}

export function PlaybackErrorPart(props: PlaybackErrorPartProps) {
  const { t } = useTranslation();
  const playbackError = usePlayerStore((s) => s.interface.error);
  const currentSourceId = usePlayerStore((s) => s.sourceId);
  const currentEmbedId = usePlayerStore((s) => s.embedId);
  const meta = usePlayerStore((s) => s.meta);
  const failedEmbedsPerMedia = usePlayerStore((s) => s.failedEmbedsPerMedia);
  const addFailedSource = usePlayerStore((s) => s.addFailedSource);
  const addFailedEmbed = usePlayerStore((s) => s.addFailedEmbed);
  const setAutoFallbackPopout = usePlayerStore((s) => s.setAutoFallbackPopout);
  const modal = useModal("error");
  const settingsRouter = useOverlayRouter("settings");
  const hasOpenedSettings = useRef(false);
  const hasAutoResumed = useRef(false);
  const setLastSuccessfulSource = usePreferencesStore(
    (s) => s.setLastSuccessfulSource,
  );
  const enableAutoResumeOnPlaybackError = usePreferencesStore(
    (s) => s.enableAutoResumeOnPlaybackError,
  );

  // Mark the failed source/embed and handle UI when a playback error occurs.
  // Merging the previous two effects ensures addFailedEmbed/addFailedSource run
  // BEFORE the optional resume call so the next scraper pass sees the failure.
  useEffect(() => {
    if (!playbackError || !currentSourceId) return;

    const isFatalError =
      playbackError.type === "hls"
        ? (playbackError.hls?.fatal ?? false)
        : playbackError.type === "htmlvideo";

    const willAutoResume =
      enableAutoResumeOnPlaybackError &&
      !props.autoResumeExhausted &&
      !!props.currentSourceId &&
      !!props.onResume;

    if (isFatalError) {
      if (currentEmbedId) {
        addFailedEmbed(currentSourceId, currentEmbedId);

        const mediaKey = getMediaKey(meta);
        const failedEmbeds =
          mediaKey && failedEmbedsPerMedia[mediaKey]
            ? failedEmbedsPerMedia[mediaKey]
            : {};
        const failedEmbedsForSource = failedEmbeds[currentSourceId] || [];
        if (failedEmbedsForSource.length >= 2) {
          addFailedSource(currentSourceId);
        }
      } else {
        addFailedSource(currentSourceId);
      }
    }

    // If auto-resume is going to run, fire it now (single effect = single source of truth)
    if (willAutoResume && !hasAutoResumed.current) {
      hasAutoResumed.current = true;
      const failedName = lookupSourceName(currentSourceId);
      setAutoFallbackPopout(true, failedName);
      props.onResume!(currentSourceId);
      // Don't open the source picker — auto-resume is taking over.
      return;
    }

    // Otherwise, user needs to pick a source manually.
    if (!hasOpenedSettings.current) {
      hasOpenedSettings.current = true;
      setLastSuccessfulSource(null);
      settingsRouter.open();
      settingsRouter.navigate("/source");
    }
  }, [
    playbackError,
    currentSourceId,
    currentEmbedId,
    meta,
    failedEmbedsPerMedia,
    addFailedSource,
    addFailedEmbed,
    setAutoFallbackPopout,
    settingsRouter,
    setLastSuccessfulSource,
    enableAutoResumeOnPlaybackError,
    props.autoResumeExhausted,
    props.currentSourceId,
    props.onResume,
  ]);

  const handleOpenSourcePicker = () => {
    settingsRouter.open();
    settingsRouter.navigate("/source");
  };

  return (
    <ErrorLayout>
      <ErrorContainer>
        {props.autoResumeExhausted ? (
          <>
            <IconPill icon={Icons.WAND}>
              {t("player.playbackError.exhaustedBadge")}
            </IconPill>
            <Title>{t("player.playbackError.title")}</Title>
            <Paragraph>{t("player.playbackError.exhaustedText")}</Paragraph>
          </>
        ) : enableAutoResumeOnPlaybackError ? (
          <>
            <IconPill icon={Icons.WAND}>
              {t("player.playbackError.switchingBadge")}
            </IconPill>
            <Title>{t("player.playbackError.title")}</Title>
            <Paragraph>{t("player.playbackError.autoResumeText")}</Paragraph>
          </>
        ) : (
          <>
            <IconPill icon={Icons.WAND}>{t("player.playbackError.badge")}</IconPill>
            <Title>{t("player.playbackError.title")}</Title>
            <Paragraph>{t("player.playbackError.text")}</Paragraph>
          </>
        )}
        <div className="flex gap-3">
          {props.currentSourceId && props.onResume && (
            <Button
              onClick={() => props.onResume!(props.currentSourceId!)}
              theme="purple"
              padding="md:px-12 p-2.5"
              className="mt-6"
            >
              {t("player.playbackError.resumeButton")}
            </Button>
          )}
          <Button
            onClick={handleOpenSourcePicker}
            theme="purple"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("player.menus.sources.title")}
          </Button>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => modal.show()}
            theme="danger"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("errors.showError")}
          </Button>
        </div>
        <div className="flex gap-3">
          <Button
            href="/"
            theme="secondary"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("player.playbackError.homeButton")}
          </Button>
          <Button
            theme="secondary"
            padding="md:px-12 p-2.5"
            className="mt-6"
            onClick={(e) => {
              e.preventDefault();
              window.location.reload();
            }}
          >
            {t("errors.reloadPage")}
          </Button>
        </div>
      </ErrorContainer>
      {/* Error */}
      <ErrorCardInModal
        onClose={() => modal.hide()}
        error={playbackError}
        id={modal.id}
      />
    </ErrorLayout>
  );
}
