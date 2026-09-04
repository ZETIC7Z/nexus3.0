import { useCallback, useEffect, useMemo } from "react";

import { Caption, CaptionListItem } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { useSubtitleStore } from "@/stores/subtitles";


// Captions whose download already failed this session (CORS-blocked hosts,
// dead URLs). Auto-select never retries them, keeping the console clean.
const failedCaptionIds = new Set<string>();
const MAX_AUTO_CAPTION_ATTEMPTS = 3;
let autoCaptionAttempts = 0;

// OpenSubtitles download links never send CORS headers, so they can only
// load through the extension/proxy path - never as a direct auto-select.
const CORS_DEAD_CAPTION_HOSTS = ["dl.opensubtitles.org"];
function isLikelyDeadCaptionUrl(url: string): boolean {
  try {
    return CORS_DEAD_CAPTION_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function useCaptions() {
  const setSubtitle = useSubtitleStore((s) => s.setSubtitle);
  const enabled = useSubtitleStore((s) => s.enabled);
  const resetSubtitleSpecificSettings = useSubtitleStore(
    (s) => s.resetSubtitleSpecificSettings,
  );
  const setCaption = usePlayerStore((s) => s.setCaption);
  const currentTranslateTask = usePlayerStore((s) => s.caption.translateTask);
  const lastSelectedLanguage = useSubtitleStore((s) => s.lastSelectedLanguage);
  const lastSelectedSubtitleId = useSubtitleStore(
    (s) => s.lastSelectedSubtitleId,
  );
  const setIsOpenSubtitles = useSubtitleStore((s) => s.setIsOpenSubtitles);

  const captionList = usePlayerStore((s) => s.captionList);
  const getHlsCaptionList = usePlayerStore((s) => s.display?.getCaptionList);
  const source = usePlayerStore((s) => s.source);
  const selectedCaption = usePlayerStore((s) => s.caption.selected);

  const getSubtitleTracks = usePlayerStore((s) => s.display?.getSubtitleTracks);
  const setSubtitlePreference = usePlayerStore(
    (s) => s.display?.setSubtitlePreference,
  );
  const setCaptionAsTrack = usePlayerStore((s) => s.setCaptionAsTrack);
  const enableNativeSubtitles = usePreferencesStore(
    (s) => s.enableNativeSubtitles,
  );

  const captions = useMemo(
    () =>
      captionList.length !== 0 ? captionList : (getHlsCaptionList?.() ?? []),
    [captionList, getHlsCaptionList],
  );

  const setDirectCaption = useCallback(
    (caption: Caption, listItem: CaptionListItem) => {
      setIsOpenSubtitles(!!listItem.opensubtitles);
      setCaption(caption);

      // Only reset subtitle settings if selecting a different caption
      if (selectedCaption?.id !== caption.id) {
        resetSubtitleSpecificSettings();
      }

      setSubtitle(true, caption.language, caption.id);

      // Use native tracks for MP4 streams instead of custom rendering
      if (source?.type === "file" && enableNativeSubtitles) {
        setCaptionAsTrack(true);
      } else {
        // For HLS sources or when native subtitles are disabled, use custom rendering
        setCaptionAsTrack(false);
      }
    },
    [
      setIsOpenSubtitles,
      setSubtitle,
      setCaption,
      resetSubtitleSpecificSettings,
      source,
      setCaptionAsTrack,
      enableNativeSubtitles,
      selectedCaption,
    ],
  );

  const selectCaptionById = useCallback(
    async (captionId: string) => {
      if (selectedCaption?.id === captionId) return;

      const caption = captions.find((v) => v.id === captionId);
      if (!caption) return;

      const captionToSet: Caption = {
        id: caption.id,
        language: caption.language,
        url: caption.url,
        srtData: "",
      };

      if (!caption.hls) {
        try {
          const { downloadCaption } = await import("@/backend/helpers/subs");
          const srtData = await downloadCaption(caption);
          captionToSet.srtData = srtData;
        } catch (err) {
          failedCaptionIds.add(caption.id);
          throw err;
        }
      } else {
        // request a language change to hls, so it can load the subtitles
        await setSubtitlePreference?.(caption.language);
        const track = getSubtitleTracks?.().find(
          (t) => t.id.toString() === caption.id && t.details !== undefined,
        );
        if (!track) return;

        const fragments =
          track.details?.fragments?.filter(
            (frag) => frag !== null && frag.url !== null,
          ) ?? [];

        const vttCaptions = (
          await Promise.all(
            fragments.map(async (frag) => {
              const { downloadWebVTT } = await import("@/backend/helpers/subs");
              const vtt = await downloadWebVTT(frag.url);
              const { parseVttSubtitles } = await import("../utils/captions");
              return parseVttSubtitles(vtt);
            }),
          )
        ).flat();

        const { filterDuplicateCaptionCues } = await import("../utils/captions");
        const filtered = filterDuplicateCaptionCues(vttCaptions);

        const { default: subsrt } = await import("subsrt-ts");
        const srtData = subsrt.build(filtered, { format: "srt" });
        captionToSet.srtData = srtData;
      }

      setDirectCaption(captionToSet, caption);
    },
    [
      captions,
      getSubtitleTracks,
      setSubtitlePreference,
      setDirectCaption,
      selectedCaption,
    ],
  );

  const selectLanguage = useCallback(
    async (language: string) => {
      const caption = captions.find((v) => v.language === language);
      if (!caption) return;
      return selectCaptionById(caption.id);
    },
    [captions, selectCaptionById],
  );

  const disable = useCallback(async () => {
    setIsOpenSubtitles(false);
    setCaption(null);
    setSubtitle(false);
  }, [setCaption, setSubtitle, setIsOpenSubtitles]);

  const selectLastUsedLanguage = useCallback(async () => {
    // Cap automatic attempts per session: a dead preferred caption must not
    // be retried on every captionList update (console noise + wasted calls).
    if (autoCaptionAttempts >= MAX_AUTO_CAPTION_ATTEMPTS) return false;
    autoCaptionAttempts += 1;

    if (
      lastSelectedSubtitleId &&
      !failedCaptionIds.has(lastSelectedSubtitleId)
    ) {
      const caption = captions.find(
        (v) =>
          v.id === lastSelectedSubtitleId &&
          !isLikelyDeadCaptionUrl(v.url),
      );
      if (caption) {
        try {
          return await selectCaptionById(caption.id);
        } catch {
          // Dead saved URL - fall through to the language fallback below.
        }
      }
    }

    const language = lastSelectedLanguage ?? "en";
    const candidate = captions.find(
      (v) =>
        v.language === language &&
        !failedCaptionIds.has(v.id) &&
        !isLikelyDeadCaptionUrl(v.url),
    );
    if (candidate) {
      try {
        return await selectCaptionById(candidate.id);
      } catch {
        // All candidates for this language are dead; stay quiet.
      }
    }
    return true;
  }, [
    lastSelectedLanguage,
    selectLanguage,
    lastSelectedSubtitleId,
    captions,
    selectCaptionById,
  ]);

  const toggleLastUsed = useCallback(async () => {
    if (enabled) disable();
    else await selectLastUsedLanguage();
  }, [selectLastUsedLanguage, disable, enabled]);

  const selectLastUsedLanguageIfEnabled = useCallback(async () => {
    if (enabled) await selectLastUsedLanguage();
  }, [selectLastUsedLanguage, enabled]);

  const selectRandomCaptionFromLastUsedLanguage = useCallback(async () => {
    const language = lastSelectedLanguage ?? "en";

    // Filter captions by language
    const languageCaptions = captions.filter(
      (caption) => caption.language === language,
    );

    // If no captions exist for that language, return early
    if (languageCaptions.length === 0) return;

    // Filter out the currently selected caption if possible
    const availableCaptions = languageCaptions.filter(
      (caption) => caption.id !== selectedCaption?.id,
    );

    // If we filtered out all captions (only one caption available), use all captions
    const captionsToChooseFrom =
      availableCaptions.length > 0 ? availableCaptions : languageCaptions;

    // Pick a random caption
    const randomIndex = Math.floor(Math.random() * captionsToChooseFrom.length);
    const randomCaption = captionsToChooseFrom[randomIndex];

    // Select the random caption
    await selectCaptionById(randomCaption.id);
  }, [lastSelectedLanguage, captions, selectedCaption, selectCaptionById]);

  // Validate selected caption when caption list changes
  useEffect(() => {
    if (!selectedCaption) return;

    // Skip validation for custom/pasted captions that aren't in the caption list
    const isCustomCaption =
      selectedCaption.id === "custom-caption" ||
      selectedCaption.id === "pasted-caption";

    if (isCustomCaption) return;

    const isSelectedCaptionStillAvailable = captions.some(
      (caption) =>
        caption.id ===
        (currentTranslateTask
          ? currentTranslateTask.targetCaption
          : selectedCaption
        ).id,
    );

    if (!isSelectedCaptionStillAvailable) {
      // Try to find a caption with the same language
      const sameLanguageCaption = captions.find(
        (caption) =>
          caption.language ===
          (currentTranslateTask
            ? currentTranslateTask.targetCaption
            : selectedCaption
          ).language,
      );

      if (sameLanguageCaption) {
        // Automatically select the first caption with the same language
        selectCaptionById(sameLanguageCaption.id).catch(() => {});
      } else {
        // No caption with the same language found, clear the selection
        setCaption(null);
      }
    }
  }, [
    captions,
    selectedCaption,
    setCaption,
    selectCaptionById,
    currentTranslateTask,
  ]);

  // Auto-select subtitle when captions become available
  useEffect(() => {
    if (!selectedCaption && captions.length > 0 && enabled) {
      selectLastUsedLanguage();
    }
  }, [captions.length, selectedCaption, enabled, selectLastUsedLanguage]);

  return {
    selectLanguage,
    disable,
    selectLastUsedLanguage,
    toggleLastUsed,
    selectLastUsedLanguageIfEnabled,
    setDirectCaption,
    selectCaptionById,
    selectRandomCaptionFromLastUsedLanguage,
  };
}
