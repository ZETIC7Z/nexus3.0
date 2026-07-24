import { iso6393To1 } from "iso-639-3";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { FlagIcon } from "@/components/FlagIcon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { AudioTrack } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { getPrettyLanguageNameFromLocale } from "@/utils/locale/language";
import { useAudioTrackStore, switchAudioTrack, AudioTrack as DubTrack } from "@/utils/player/audioTracks";

import { SelectableLink } from "../../internals/ContextMenu/Links";

export function AudioOption(props: {
  langCode?: string;
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <SelectableLink selected={props.selected} onClick={props.onClick}>
      <span className="flex items-center">
        <span data-code={props.langCode} className="mr-3 inline-flex">
          <FlagIcon langCode={props.langCode} />
        </span>
        <span>{props.children}</span>
      </span>
    </SelectableLink>
  );
}

export function AudioView({ id }: { id: string }) {
  const { t } = useTranslation();
  const unknownChoice = t("player.menus.subtitles.unknownLanguage");

  const router = useOverlayRouter(id);

  // Check both store locations for audio tracks
  const playerAudioTracks = usePlayerStore((s) => s.audioTracks);
  const currentAudioTrack = usePlayerStore((s) => s.currentAudioTrack);
  const changeAudioTrack = usePlayerStore((s) => s.display?.changeAudioTrack);

  const dubTracks = useAudioTrackStore((s) => s.tracks);
  const activeDubId = useAudioTrackStore((s) => s.activeId);

  const change = useCallback(
    (track: AudioTrack | DubTrack) => {
      const videoEl = document.querySelector<HTMLVideoElement>("video.vds-video, video");
      if ("url" in track && videoEl) {
        switchAudioTrack(videoEl, track as DubTrack);
      } else {
        changeAudioTrack?.(track as AudioTrack);
      }
      router.close();
    },
    [router, changeAudioTrack],
  );

  // Unified list of tracks
  const allTracks = playerAudioTracks.length > 0 ? playerAudioTracks : dubTracks;
  const activeId = currentAudioTrack?.id ?? activeDubId;

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>Audio</Menu.BackLink>
      <Menu.Section className="flex flex-col pb-4">
        {allTracks.length === 0 ? (
          <div className="p-4 text-center text-sm text-white/60">
            Original Audio (No dubs available)
          </div>
        ) : (
          allTracks.map((v) => {
            const langCode =
              v.language.length === 3
                ? (iso6393To1[v.language] ?? v.language)
                : v.language;
            const isSelected = v.id === activeId;
            return (
              <AudioOption
                key={v.id}
                selected={isSelected}
                langCode={langCode === "und" ? "en" : langCode}
                onClick={() => change(v)}
              >
                {v.label || getPrettyLanguageNameFromLocale(v.language) || unknownChoice}
              </AudioOption>
            );
          })
        )}
      </Menu.Section>
    </>
  );
}
