// moviebox-provider.ts
// NEXUS — MovieBox Provider (self-hosted VPS: walterwhite-69/Moviebox-API)
// ---------------------------------------------------------------------------
// HOW IT WORKS (read BACKENDS.md for the full picture):
//   MovieBox uses its OWN slug system (e.g. "tokyo-ghoul-hindi-OlanoKZKGR2"),
//   NOT TMDB IDs. So this provider must:
//     1. Take the TMDB title + year that NEXUS already has
//     2. Search the MovieBox VPS  → GET /search?q=<title>
//     3. Match the best result by title + year
//     4. Resolve subjectId via   → GET /detail/<slug>  (also gives dubs[])
//     5. Fetch streams via        → GET /api/stream/<subjectId>?detail_path=<slug>&se=&ep=
//     6. Keep MP4 ONLY (project player has no DASH support — user requirement)
//     7. Expose every dub language as a selectable AUDIO TRACK, "Original" default
//
//   Multi-audio: MovieBox returns one muxed MP4 per language. We surface them as
//   `audioTracks`. The player patch (AudioTrackSelector) swaps video.src on
//   selection while preserving currentTime, so picking "Tagalog" loads instantly.
// ---------------------------------------------------------------------------

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

// ── Config (base URL comes from .env → VITE_MOVIEBOX_API_URL) ───────────────
const MOVIEBOX_BASE: string =
  (import.meta.env.VITE_MOVIEBOX_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8000";

const TIMEOUT = 15000;

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`MovieBox HTTP ${res.status} — ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// ── Response shapes (match the real api.py) ─────────────────────────────────
interface MovieBoxSearchResult {
  query: string;
  count: number;
  movies: Array<{
    name: string;
    poster_url: string | null;
    url: string | null;
    slug: string | null;
    badge: string | null;
  }>;
}

interface MovieBoxDetail {
  slug: string;
  source: string;
  metadata: {
    id: string; // subjectId
    title: string;
    description?: string;
    release_date?: string;
    duration?: number;
    genre?: string;
    country?: string;
    imdb_rating?: string;
    poster?: string | null;
    badge?: string | null;
    dubs?: string[]; // ["English", "Hindi", "Tagalog", ...]
  };
  streams: {
    mp4: string[];
    hls: string[];
  };
}

interface MovieBoxStreamSource {
  resolution: string; // "1080p"
  format: string; // "mp4" | "hls" | "dash"
  url: string;
  size_bytes?: number;
  id?: number | string;
  // Some MovieBox deployments include a language tag on the stream:
  lang?: string;
  language?: string;
  dubType?: string;
}

interface MovieBoxStreamResponse {
  subject_id: string;
  detail_path: string;
  season: number;
  episode: number;
  stream_domain: string;
  count: number;
  sources: MovieBoxStreamSource[];
  raw?: {
    streams?: MovieBoxStreamSource[];
    // Newer MovieBox builds expose an explicit audio list here:
    audioTrackList?: Array<{ lang?: string; language?: string; url?: string; name?: string }>;
    [k: string]: unknown;
  };
}

// ── Title matching (normalize + score) ──────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[.*?\]/g, "") // strip [Hindi], [Dubbed], etc.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickBestMatch(
  results: MovieBoxSearchResult["movies"],
  wantTitle: string,
  wantYear?: number,
): MovieBoxSearchResult["movies"][number] | null {
  const target = normalize(wantTitle);
  let best: { m: (typeof results)[number]; score: number } | null = null;

  for (const m of results) {
    if (!m.slug) continue;
    const name = normalize(m.name);
    let score = 0;
    if (name === target) score += 100;
    else if (name.includes(target) || target.includes(name)) score += 60;
    else {
      // word overlap
      const tWords = new Set(target.split(" "));
      const nWords = name.split(" ");
      const overlap = nWords.filter((w) => tWords.has(w)).length;
      score += overlap * 10;
    }
    // Year hint (slug/name sometimes carries the year)
    if (wantYear && m.name.includes(String(wantYear))) score += 20;

    if (!best || score > best.score) best = { m, score };
  }

  // Require a minimal confidence so we don't play the wrong title
  if (best && best.score >= 30) return best.m;
  return null;
}

// ── Language helpers ─────────────────────────────────────────────────────────
const LANG_CODES: Record<string, string> = {
  english: "en", tagalog: "tl", filipino: "tl", hindi: "hi", spanish: "es",
  french: "fr", japanese: "ja", korean: "ko", chinese: "zh", mandarin: "zh",
  arabic: "ar", german: "de", italian: "it", portuguese: "pt", thai: "th",
  vietnamese: "vi", indonesian: "id", malay: "ms", russian: "ru", turkish: "tr",
};

function toLangCode(name?: string): string {
  if (!name) return "und";
  return LANG_CODES[name.toLowerCase().trim()] ?? name.slice(0, 2).toLowerCase();
}

// ── Build a stream request for a given dub language (if supported) ──────────
async function fetchStreamsForLang(
  subjectId: string,
  slug: string,
  season: number,
  episode: number,
  lang?: string,
): Promise<MovieBoxStreamResponse> {
  const params = new URLSearchParams({
    detail_path: slug,
    se: String(season),
    ep: String(episode),
    ...(lang ? { lang } : {}),
  });
  return getJson<MovieBoxStreamResponse>(
    `${MOVIEBOX_BASE}/api/stream/${encodeURIComponent(subjectId)}?${params.toString()}`,
  );
}

// ── Main scrape ──────────────────────────────────────────────────────────────
export async function scrapeMovieBox(ctx: ScrapeContext) {
  const { media } = ctx;
  const isShow = media.type === "show";
  const season = isShow ? media.season.number : 0;
  const episode = isShow ? media.episode.number : 0;

  // 1. Search MovieBox by title
  const search = await getJson<MovieBoxSearchResult>(
    `${MOVIEBOX_BASE}/search?q=${encodeURIComponent(media.title)}`,
  );
  if (!search.movies?.length) {
    throw new Error(`MovieBox: no search results for "${media.title}"`);
  }

  // 2. Match the best result
  const match = pickBestMatch(
    search.movies,
    media.title,
    "releaseYear" in media ? (media.releaseYear as number | undefined) : undefined,
  );
  if (!match?.slug) throw new Error(`MovieBox: no confident title match for "${media.title}"`);

  // 3. Resolve subjectId + dub list
  const detail = await getJson<MovieBoxDetail>(
    `${MOVIEBOX_BASE}/detail/${encodeURIComponent(match.slug)}`,
  );
  const subjectId = detail.metadata.id;
  if (!subjectId) throw new Error("MovieBox: could not resolve subjectId");

  const dubs = detail.metadata.dubs ?? [];

  // 4. Fetch the primary (original) streams
  const primary = await fetchStreamsForLang(subjectId, match.slug, season, episode);

  // 5. Keep MP4 ONLY (drop DASH / HLS — player has no DASH support)
  const mp4Sources = (primary.sources ?? []).filter(
    (s) => s.format?.toLowerCase() === "mp4" && s.url,
  );
  if (!mp4Sources.length) {
    throw new Error("MovieBox: no MP4 sources (only DASH/HLS returned)");
  }

  // Sort by resolution desc → build qualities map
  const sorted = [...mp4Sources].sort((a, b) => {
    const q = (r: string) => parseInt(r.replace(/\D/g, ""), 10) || 0;
    return q(b.resolution) - q(a.resolution);
  });

  const qualities: Record<string, { type: "mp4"; url: string }> = {};
  for (const s of sorted) {
    const key = s.resolution || "Auto";
    qualities[key] = { type: "mp4", url: s.url };
  }
  const bestUrl = sorted[0]!.url;

  // 6. Build AUDIO TRACKS (Original + every dub language)
  //    Strategy A: explicit audio list in `raw.audioTrackList`
  //    Strategy B: per-source lang tags
  //    Strategy C: re-query the API per dub language (?lang=)
  const audioTracks: Array<{
    id: string;
    label: string;
    language: string;
    url: string;
    default: boolean;
  }> = [];

  // Original is always first + default
  audioTracks.push({
    id: "moviebox-audio-original",
    label: "Original",
    language: "und",
    url: bestUrl,
    default: true,
  });

  // Strategy A
  const rawAudio = primary.raw?.audioTrackList ?? [];
  for (const a of rawAudio) {
    if (!a.url) continue;
    const langName = a.name ?? a.language ?? a.lang ?? "Unknown";
    audioTracks.push({
      id: `moviebox-audio-${toLangCode(langName)}`,
      label: langName,
      language: toLangCode(langName),
      url: a.url,
      default: false,
    });
  }

  // Strategy B — sources with an explicit language tag
  for (const s of mp4Sources) {
    const langName = s.lang ?? s.language ?? s.dubType;
    if (!langName) continue;
    const code = toLangCode(langName);
    if (audioTracks.some((t) => t.language === code)) continue;
    audioTracks.push({
      id: `moviebox-audio-${code}`,
      label: langName,
      language: code,
      url: s.url,
      default: false,
    });
  }

  // Strategy C — re-query per dub language (only if we haven't already got them)
  if (audioTracks.length === 1 && dubs.length) {
    await Promise.all(
      dubs.map(async (dubName) => {
        const code = toLangCode(dubName);
        if (audioTracks.some((t) => t.language === code)) return;
        try {
          const langStreams = await fetchStreamsForLang(
            subjectId, match.slug!, season, episode, dubName,
          );
          const mp4 = (langStreams.sources ?? []).find(
            (s) => s.format?.toLowerCase() === "mp4" && s.url,
          );
          if (mp4) {
            audioTracks.push({
              id: `moviebox-audio-${code}`,
              label: dubName,
              language: code,
              url: mp4.url,
              default: false,
            });
          }
        } catch {
          /* language variant not available — skip silently */
        }
      }),
    );
  }

  // 7. Return a NEXUS/p-stream-compatible stream object.
  //    `audioTracks` is a NEXUS extension consumed by AudioTrackSelector.tsx.
  return {
    embeds: [],
    stream: {
      id: "moviebox-primary",
      type: "mp4" as const,
      playlist: bestUrl,
      // Route through the proxy chain to guarantee no CORS issue on the CDN.
      flags: [flags.CORS_ALLOWED],
      captions: [],
      qualities,
      // NEXUS extension — read by the player audio menu:
      audioTracks,
    },
  };
}

// ── Provider registration ────────────────────────────────────────────────────
export const movieboxProvider = makeProviderContext({
  id: "nexus-moviebox",
  name: "MovieBox",
  rank: 780, // just below the enc-dec providers; adjust in the index if desired
  disabled: false,
  async scrape(ctx) {
    return scrapeMovieBox(ctx);
  },
});
