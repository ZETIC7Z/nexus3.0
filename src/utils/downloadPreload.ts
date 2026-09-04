// downloadPreload.ts
// NEXUS - Preloaded download data for the player's Downloads menu.
// The moment a title's meta is set (Play Now) we warm /api/downloads for the
// movie/episode. Opening "Download Movie" or "Download Subtitle" then reads
// the finished promise instantly instead of starting a network round-trip.

export interface DownloadEntry {
  provider: string;
  name: string;
  title: string;
  quality: string;
  format: string;
  size: string;
  url: string;
  headers?: Record<string, string>;
}

export interface SubtitleEntry {
  provider: string;
  lang: string;
  label: string;
  url: string;
  format: string;
}

export interface DownloadsResponse {
  success: boolean;
  downloads: DownloadEntry[];
  subtitles: SubtitleEntry[];
}

interface CacheSlot {
  key: string;
  at: number;
  promise: Promise<DownloadsResponse | null>;
}

const TTL = 4 * 60_000;
let slot: CacheSlot | null = null;

function keyFor(
  type: "movie" | "show",
  tmdbId: string,
  season?: number,
  episode?: number,
): string {
  if (type === "movie") return `movie:${tmdbId}`;
  return `show:${tmdbId}:${season ?? 1}:${episode ?? 1}`;
}

function requestUrl(
  type: "movie" | "show",
  tmdbId: string,
  season?: number,
  episode?: number,
): string {
  const params = new URLSearchParams({
    type: type === "show" ? "series" : "movie",
    id: String(tmdbId),
  });
  if (type === "show" && season && episode) {
    params.set("season", String(season));
    params.set("episode", String(episode));
  }
  return `/api/downloads?${params.toString()}`;
}

function runRequest(url: string): Promise<DownloadsResponse | null> {
  return fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<DownloadsResponse>) : null))
    .then((json) => (json && json.success ? json : null))
    .catch(() => null);
}

/**
 * Kick off (or reuse) the downloads preload for a title. Fire-and-forget:
 * callers never await this, the menu calls getDownloadsData when opened.
 */
export function preloadDownloads(
  type: "movie" | "show",
  tmdbId: string | undefined,
  season?: number,
  episode?: number,
): void {
  if (!tmdbId) return;
  const key = keyFor(type, tmdbId, season, episode);
  if (slot && slot.key === key && Date.now() - slot.at < TTL) return;
  slot = {
    key,
    at: Date.now(),
    promise: runRequest(requestUrl(type, tmdbId, season, episode)),
  };
}

/** Await the preloaded payload (starts one if missing or stale). */
export function getDownloadsData(
  type: "movie" | "show",
  tmdbId: string | undefined,
  season?: number,
  episode?: number,
): Promise<DownloadsResponse | null> {
  if (!tmdbId) return Promise.resolve(null);
  const key = keyFor(type, tmdbId, season, episode);
  if (!slot || slot.key !== key || Date.now() - slot.at >= TTL) {
    preloadDownloads(type, tmdbId, season, episode);
  }
  return slot ? slot.promise : Promise.resolve(null);
}
