import { MediaPlaylist } from "hls.js";

import { MWMediaType } from "@/backend/metadata/types/mw";
import { AudioTrack, CaptionListItem } from "@/stores/player/slices/source";
import { LoadableSource, SourceQuality } from "@/stores/player/utils/qualities";
import { Listener } from "@/utils/common/events";

export type DisplayErrorType = "hls" | "htmlvideo" | "global";
export type DisplayError = {
  stackTrace?: string;
  message?: string;
  key?: string;
  errorName: string;
  type: DisplayErrorType;
  hls?: {
    details: string;
    fatal: boolean;
    level?: number;
    levelDetails?: {
      url: string;
      width: number;
      height: number;
      bitrate: number;
    };
    frag?: {
      url: string;
      baseurl: string;
      duration: number;
      start: number;
      sn: number | string;
    };
    type: string;
    url?: string;
  };
};

export type DisplayInterfaceEvents = {
  play: void;
  pause: void;
  fullscreen: boolean;
  volumechange: number;
  time: number;
  duration: number;
  buffered: number;
  loading: boolean;
  qualities: SourceQuality[];
  changedquality: SourceQuality | null;
  audiotracks: AudioTrack[];
  changedaudiotrack: AudioTrack | null;
  needstrack: boolean;
  playbackrate: number;
  error: DisplayError;
};

export interface qualityChangeOptions {
  source: LoadableSource | null;
  automaticQuality: boolean;
  preferredQuality: SourceQuality | null;
  startAt: number;
}

export interface DisplayMeta {
  title: string;
  type: MWMediaType;
}

export interface DisplayCaption {
  id: string;
  srtData: string;
  language: string;
  url?: string;
}

export type DisplayType = "web" | "casting";

export interface DisplayInterface extends Listener<DisplayInterfaceEvents> {
  play(): void;
  pause(): void;
  load(ops: qualityChangeOptions): void;
  changeQuality(
    automaticQuality: boolean,
    preferredQuality: SourceQuality | null,
  ): void;
  changeAudioTrack(audioTrack: AudioTrack): void;
  processVideoElement(video: HTMLVideoElement): void;
  processContainerElement(container: HTMLElement): void;
  toggleFullscreen(): void;
  togglePictureInPicture(): void;
  setSeeking(active: boolean): void;
  setVolume(vol: number): void;
  setTime(t: number): void;
  destroy(): void;
  setPlaybackRate(rate: number): void;
  setMeta(meta: DisplayMeta): void;
  setCaption(caption: DisplayCaption | null): void;
  getType(): DisplayType;
  getCaptionList(): CaptionListItem[];
  getSubtitleTracks(): MediaPlaylist[];
  setSubtitlePreference(lang: string): Promise<void>;
  getAudioActivity?(): { t: number; e: number }[];

  isAudioSyncAvailable?(): boolean;

  getAudioWindow?(durationSec: number): {
    pcm: Float32Array;
    sampleRate: number;
    startTime: number;
    endTime: number;
  } | null;

  // Real codec fourccs (e.g. "avc1.4d0020,mp4a.40.2") probed client-side by
  // hls.js against actual segment data, or null if unavailable/not hls.
  getCodecsHint?(): string | null;

  // The currently-active HLS level's own resolved media-playlist URL (not
  // the master), or null if unavailable/not hls.
  getResolvedVariantUrl?(): string | null;
}
