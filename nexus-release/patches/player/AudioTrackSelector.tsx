// AudioTrackSelector.tsx
// NEXUS — Audio (dub language) selector for the player settings menu.
// ---------------------------------------------------------------------------
// Drop this into src/components/player/atoms/settings/ and register it in the
// settings menu next to the existing "Quality" / "Captions" options.
// See PLAYER_INTEGRATION.md for exact wiring into P-Stream's SettingsMenu.
// ---------------------------------------------------------------------------

import { useCallback } from "react";

import { useAudioTrackStore, switchAudioTrack } from "@/utils/player/audioTracks";
// ^ if you place audioTracks.ts elsewhere, fix this import path.

interface AudioTrackSelectorProps {
  /** Ref/getter to the underlying <video> element used by the player. */
  getVideoEl: () => HTMLVideoElement | null;
  /** Optional: called after switching (e.g. to close the menu). */
  onSelected?: () => void;
}

export function AudioTrackSelector({ getVideoEl, onSelected }: AudioTrackSelectorProps) {
  const tracks = useAudioTrackStore((s) => s.tracks);
  const activeId = useAudioTrackStore((s) => s.activeId);

  const handleSelect = useCallback(
    (trackId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      const video = getVideoEl();
      if (!track || !video) return;
      switchAudioTrack(video, track);
      onSelected?.();
    },
    [tracks, getVideoEl, onSelected],
  );

  // Hide the whole menu entry if there's only the original track (no dubs).
  if (tracks.length <= 1) return null;

  return (
    <div className="flex flex-col">
      <p className="mb-2 px-3 text-sm font-semibold text-white/60">Audio</p>
      <div className="flex flex-col">
        {tracks.map((track) => {
          const isActive = track.id === activeId;
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => handleSelect(track.id)}
              className={[
                "flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5",
              ].join(" ")}
            >
              <span>{track.label}</span>
              {isActive ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AudioTrackSelector;
