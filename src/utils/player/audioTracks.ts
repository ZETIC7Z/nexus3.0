// audioTracks.ts
// NEXUS — Audio Track (Dub Language) support for the player
// ---------------------------------------------------------------------------
// MovieBox returns one muxed MP4 per dub language. This module lets the player:
//   - list all available audio languages ("Original" default)
//   - switch language instantly, preserving currentTime + play state
//
// It's a small Zustand store + a helper that swaps the <video> source.
// The provider (moviebox-provider.ts) attaches `audioTracks` to its stream.
// ---------------------------------------------------------------------------

import { create } from "zustand";

import { usePlayerStore } from "@/stores/player/store";

export interface AudioTrack {
  id: string;
  label: string;      // "Original", "Tagalog", "Hindi", "English Dub", ...
  language: string;   // "und", "tl", "hi", "en", ...
  url: string;        // MP4 or HLS (m3u8) URL for this language
  default: boolean;
}

interface AudioTrackState {
  tracks: AudioTrack[];
  activeId: string | null;
  setTracks: (tracks: AudioTrack[]) => void;
  setActive: (id: string) => void;
  reset: () => void;
}

export const useAudioTrackStore = create<AudioTrackState>((set) => ({
  tracks: [],
  activeId: null,
  setTracks(tracks) {
    const def = tracks.find((t) => t.default) ?? tracks[0];
    set({ tracks, activeId: def?.id ?? null });
  },
  setActive(id) {
    set({ activeId: id });
  },
  reset() {
    set({ tracks: [], activeId: null });
  },
}));

/**
 * Swap the player's video source to a different dub language while keeping
 * the current playback position and play/pause state. Call this from the
 * audio menu when the user picks a language (e.g. Tagalog, English Dub).
 *
 * HLS tracks (AniKoto/AniKai dubs) are m3u8 playlists owned by hls.js, so we
 * route them through the player display (which re-initializes hls.js with the
 * new playlist) instead of swapping `video.src` directly.
 *
 * @param videoEl   the underlying <video> element
 * @param track     the audio track to switch to
 */
export function switchAudioTrack(videoEl: HTMLVideoElement, track: AudioTrack): void {
  const wasPlaying = !videoEl.paused;
  const resumeAt = videoEl.currentTime;

  // HLS track — re-init hls.js with the new playlist via the player display.
  if (track.url.includes(".m3u8")) {
    const store = usePlayerStore.getState();
    store.display?.load({
      source: { type: "hls", url: track.url },
      startAt: resumeAt,
      automaticQuality: true,
      preferredQuality: null,
    });
    useAudioTrackStore.getState().setActive(track.id);
    // hls.js re-attaches asynchronously; resume on canplay (play() right after
    // load() would race the manifest load).
    if (wasPlaying) {
      const onCanPlay = () => {
        void videoEl.play().catch(() => undefined);
        videoEl.removeEventListener("canplay", onCanPlay);
      };
      videoEl.addEventListener("canplay", onCanPlay);
    }
    return;
  }

  const onLoaded = () => {
    // Restore position, then resume if it was playing
    try {
      videoEl.currentTime = resumeAt;
    } catch {
      /* seeking may be clamped on very short buffers */
    }
    if (wasPlaying) void videoEl.play().catch(() => undefined);
    videoEl.removeEventListener("loadedmetadata", onLoaded);
  };

  videoEl.addEventListener("loadedmetadata", onLoaded);
  videoEl.src = track.url;
  videoEl.load();

  useAudioTrackStore.getState().setActive(track.id);
}
