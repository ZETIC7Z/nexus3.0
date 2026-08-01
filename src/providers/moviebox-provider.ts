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

import { flags } from "@nexus/providers";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";
import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { getLoadbalancedProxyUrl } from "@/backend/providers/fetchers";

// ── Config (base URL comes from .env → VITE_MOVIEBOX_API_URL) ───────────────
// MovieBox requests always use the same-origin route. The Vercel function
// (and Vite dev proxy) injects the upstream URL and secret server-side.
const MOVIEBOX_BASE = "/api/moviebox";const TIMEOUT = 8000;
const STREAM_TIMEOUT = 15000;

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function getJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? TIMEOUT);
  
  let targetUrl = url;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (
    !isExtensionActiveCached() &&
    !url.startsWith("/") &&
    !url.startsWith(".") &&
    !url.includes("localhost") &&
    !url.includes("127.0.0.1")
  ) {
    const proxyBase = getLoadbalancedProxyUrl();
    if (proxyBase && url && !url.includes("destination=")) {
      targetUrl = `${proxyBase}?destination=${encodeURIComponent(url)}`;
    }
  }

  try {
    const res = await fetch(targetUrl, {
      signal: ctrl.signal,
      headers,
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
  movies?: Array<{
    name: string;
    poster_url: string | null;
    url: string | null;
    slug: string | null;
    badge: string | null;
  }>;
  items?: Array<{
    name: string;
    poster_url: string | null;
    url: string | null;
    slug: string | null;
    badge: string | null;
  }>;
}

interface MovieBoxDetail {
  code?: number;
  message?: string;
  data?: {
    subject?: {
      subjectId: string;
      title: string;
      description?: string;
      releaseDate?: string;
      genre?: string;
      countryName?: string;
      imdbRatingValue?: string;
      dubs?: Array<{
        subjectId: string;
        lanName: string;
        lanCode: string;
        original: boolean;
        type: number;
        detailPath: string;
      }>;
    };
    metadata?: {
      title: string;
      description: string;
      keyWords?: string;
      image?: string;
    };
  };
  slug?: string;
  source?: string;
  metadata?: {
    id: string;
    title: string;
    description?: string;
    release_date?: string;
    duration?: number;
    genre?: string;
    country?: string;
    imdb_rating?: string;
    poster?: string | null;
    badge?: string | null;
    dubs?: string[];
  };
  streams?: {
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
  hls?: Array<{ url: string }>;
  dash?: Array<{ format?: string; url: string; resolutions?: string; codecName?: string; vipLocked?: boolean }>;
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
    .replace(/\bs\d+(?:-s\d+)?\b/gi, "") // strip S1-S8, S1-S13, S1, etc.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface MovieBoxSearchItem {
  name: string;
  poster_url: string | null;
  url: string | null;
  slug: string | null;
  badge: string | null;
}

function pickBestMatch(
  results: MovieBoxSearchItem[],
  wantTitle: string,
  wantOriginalTitle?: string,
  wantYear?: number,
  tmdbId?: string,
): MovieBoxSearchItem | null {
  if (tmdbId && String(tmdbId) === "111110") {
    const netflixMatch = results.find(
      (m) =>
        m.slug?.includes("netflix") ||
        m.name?.toLowerCase().includes("netflix"),
    );
    if (netflixMatch) return netflixMatch;
  }
  const target = normalize(wantTitle);
  const targetOrig = wantOriginalTitle ? normalize(wantOriginalTitle) : target;
  let best: { m: MovieBoxSearchItem; score: number } | null = null;

  for (const m of results) {
    if (!m.slug) continue;
    const name = normalize(m.name);
    
    let score1 = 0;
    if (name === target) score1 += 100;
    else if (name.startsWith(target) || target.startsWith(name)) score1 += 80;
    else if (name.includes(target) || target.includes(name)) score1 += 60;
    else {
      const tWords = new Set(target.split(" "));
      const nWords = name.split(" ");
      const overlap = nWords.filter((w) => tWords.has(w)).length;
      score1 += overlap * 10;
    }

    let score2 = 0;
    if (name === targetOrig) score2 += 100;
    else if (name.startsWith(targetOrig) || targetOrig.startsWith(name)) score2 += 80;
    else if (name.includes(targetOrig) || targetOrig.includes(name)) score2 += 60;
    else {
      const tWords = new Set(targetOrig.split(" "));
      const nWords = name.split(" ");
      const overlap = nWords.filter((w) => tWords.has(w)).length;
      score2 += overlap * 10;
    }

    let score = Math.max(score1, score2);

    // Year hint (slug/name sometimes carries the year)
    if (wantYear && (m.name.includes(String(wantYear)) || m.slug.includes(String(wantYear)))) score += 30;

    if (!best || score > best.score) best = { m, score };
  }

  // Require a minimal confidence so we don't play the wrong title.
  // Lowered from 30 to allow partial matches (e.g. "Martian Land" for
  // "The Martian") when the MovieBox backend returns relevant results
  // under a slightly different name.
  if (best && best.score >= 10) return best.m;
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
    STREAM_TIMEOUT,
  );
}

// ── Main scrape ──────────────────────────────────────────────────────────────
function normalizeQuality(q?: string): string {
  if (!q) return "unknown";
  const num = parseInt(q.replace(/\D/g, ""), 10);
  if (num === 2160 || q.toLowerCase().includes("4k")) return "4k";
  if (num === 1080) return "1080";
  if (num === 720) return "720";
  if (num === 480) return "480";
  if (num === 360) return "360";
  return "unknown";
}

// ── Main scrape ──────────────────────────────────────────────────────────────
export async function scrapeMovieBox(ctx: ScrapeContext) {
  const { media } = ctx;

  // 1. Search MovieBox by title + concurrently check if show is anime via TMDB
  const isShow = media.type === "show";
  const isMovie = media.type === "movie";
  const season = isShow ? media.season.number : 0;
  const episode = isShow ? media.episode.number : 0;

  const cleanTitle = media.title.replace(/-ZE$/i, "").trim();
  const hasZeSuffix = media.title.endsWith("-ZE") || media.title.endsWith("-ze") || !!(media as any).customEpisode;

  // Fire search and anime-detection concurrently to save ~300ms
  const searchPromise = getJson<MovieBoxSearchResult>(
    `${MOVIEBOX_BASE}/search?q=${encodeURIComponent(cleanTitle)}`,
  );

  let animeCheckPromise: Promise<void> | null = null;
  let preDetectedAnime = false;
  if (isShow && !hasZeSuffix) {
    animeCheckPromise = (async () => {
      try {
        const resp = await fetch(`/api/tmdb/tv/${media.tmdbId}`, {
          headers: { Accept: "application/json" },
        });
        if (resp.ok) {
          const data = await resp.json();
          const genres = data.genres ?? [];
          const originCountry = data.origin_country ?? [];
          const isAnimation = genres.some((g: any) => g.id === 16);
          const isJapanese = originCountry.includes("JP");
          if (isAnimation && isJapanese) preDetectedAnime = true;
        }
      } catch { /* best-effort, fall through */ }
    })();
  }

  const search = await searchPromise;
  const movies = search.items ?? search.movies ?? [];
  if (!movies.length) {
    throw new Error(`MovieBox: no search results for "${cleanTitle}"`);
  }

  // 2. Match the best result
  const match = pickBestMatch(
    movies,
    cleanTitle,
    (media as any).originalTitle,
    "releaseYear" in media ? (media.releaseYear as number | undefined) : undefined,
    media.tmdbId,
  );
  if (!match?.slug) throw new Error(`MovieBox: no confident title match for "${cleanTitle}"`);

  // 3. Resolve subjectId + dub list
  const detail = await getJson<MovieBoxDetail>(
    `${MOVIEBOX_BASE}/detail/${encodeURIComponent(match.slug)}`,
  );
  const subject = detail.data?.subject ?? detail.metadata ?? {};
  const subjectId = (match as any).subject_id ?? (match as any).subjectId ?? (subject as any).subjectId ?? (subject as any).id ?? (subject as any).subject_id;
  if (!subjectId) throw new Error("MovieBox: could not resolve subjectId");

  const dubs: Array<{ lanName: string; subjectId: string; detailPath: string; lanCode?: string; original?: boolean }> = (subject as any).dubs ?? [];

  // Resolve anime detection (awaited here if the concurrent check was kicked off)
  if (animeCheckPromise) await animeCheckPromise;
  let isAnime = hasZeSuffix || preDetectedAnime;
  const badge = match.badge ?? (subject as any).badge;
  if (badge?.toLowerCase() === "anime") {
    isAnime = true;
  }


  // Exact API Specification Season / Episode rules:
  // - Movies: se = 0, ep = 0
  // - Anime: se = 1, ep = episode
  // - TV Series: se = season, ep = episode
  const customSeason = (media as any).customSeason;
  const customEpisode = (media as any).customEpisode;

  let querySeason = 0;
  let queryEpisode = 0;

  if (isMovie) {
    querySeason = 0;
    queryEpisode = 0;
  } else if (isAnime) {
    querySeason = 1;
    queryEpisode = customEpisode !== undefined ? customEpisode : episode;
  } else {
    querySeason = customSeason !== undefined ? customSeason : season;
    queryEpisode = customEpisode !== undefined ? customEpisode : episode;
  }

  // 4. Fetch the primary stream
  const primary = await fetchStreamsForLang(subjectId, match.slug, querySeason, queryEpisode);

  // 5. MovieBox is intentionally MP4-only. Return the fastest source first.
  // Sources are sorted by resolution (highest first) but all are valid.
  const mp4Sources = (primary.sources ?? []).filter(
    (s: any) => s.format?.toLowerCase() === "mp4" && typeof s.url === "string" && s.url.trim().length > 0,
  );

  if (!mp4Sources.length) {
    throw new Error("MovieBox: no valid playable sources found");
  }

  // MovieBox MP4 URLs are pre-signed with ?sign=...&t=... and work directly.
  // Proxy is bypassed for speed and reliability — the CDN geo-restricts
  // datacenter IPs (Oracle Singapore) but serves browsers fine.
  const streamType = "file" as const;
  const sortedMp4 = [...mp4Sources].sort((a, b) => {
    const q = (r: string) => parseInt(r.replace(/\D/g, ""), 10) || 0;
    return q(b.resolution) - q(a.resolution);
  });
  const bestUrl = sortedMp4[0]!.url;

  const qualities: Record<string, { type: "mp4"; url: string }> = {};
  if (streamType === "file") {
    for (const s of sortedMp4) {
      if (!s.url || !s.url.trim()) continue;
      const key = normalizeQuality(s.resolution);
      qualities[key] = { type: "mp4", url: s.url };
    }
  }


  // 6. Build AUDIO TRACKS (Multi-Dub Language Switching using subjectId & detailPath)
  const audioTracks: Array<{
    id: string;
    label: string;
    language: string;
    url: string;
    default: boolean;
  }> = [];

  audioTracks.push({
    id: "moviebox-audio-original",
    label: "Original",
    language: "und",
    url: bestUrl,
    default: true,
  });

  if (dubs.length > 0) {
    await Promise.all(
      dubs.map(async (dub) => {
        if (dub.original) return;
        const code = dub.lanCode || toLangCode(dub.lanName);
        if (audioTracks.some((t) => t.language === code)) return;
        try {
          const dubStreams = await fetchStreamsForLang(
            dub.subjectId,
            dub.detailPath || match.slug || "",
            querySeason,
            queryEpisode,
          );
          const dubMp4 = (dubStreams.sources ?? []).find(
            (s: any) => s.format?.toLowerCase() === "mp4" && s.url,
          );
          const dubUrl = dubMp4?.url;

          if (dubUrl) {
            audioTracks.push({
              id: `moviebox-audio-${code}`,
              label: dub.lanName,
              language: code,
              url: dubUrl,
              default: false,
            });
          }
        } catch {
          /* dub variant unavailable — skip silently */
        }
      }),
    );
  }

  const streamObject: any = {
    id: "moviebox-primary",
    type: streamType,
    playlist: bestUrl,
    flags: [flags.CORS_ALLOWED],
    captions: [],
    skipValidation: true,
  };

  if (streamType === "file") {
    streamObject.qualities = qualities;
  }
  if (audioTracks.length > 1) {
    streamObject.audioTracks = audioTracks;
  }

  return {
    embeds: [],
    stream: [streamObject],
  };
}

// ── Provider registration ────────────────────────────────────────────────────
export const movieboxProvider = makeProviderContext({
  id: "nexus-moviebox",
  name: "Nyxos ⚡",
  rank: 1320,
  disabled: false,
  async scrape(ctx) {
    try {
      console.debug("Nyxos Scraper: scrape called with media:", JSON.stringify(ctx.media));
      const res = await scrapeMovieBox(ctx);
      console.debug("Nyxos Scraper: scrape returned result:", JSON.stringify(res));
      return res;
    } catch (e: any) {
      console.error("Nyxos Scraper: error occurred during scrape:", e.message, e.stack);
      throw e;
    }
  },
});
