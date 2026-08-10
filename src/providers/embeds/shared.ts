// embeds/shared.ts
// NEXUS — Shared infrastructure for the "Embeds ⚡" provider family
// ---------------------------------------------------------------------------
// All providers in this folder call the TMDB-Embed API:
//
//   GET {BASE}/api/streams/{provider}/movie/{tmdbId}
//   GET {BASE}/api/streams/{provider}/series/{tmdbId}?season={n}&episode={n}
//
//   → { success, provider, streams: [{ name?, server?, title?, url,
//       quality?, type?, provider?, headers?, subtitles? }] }
//
// The returned stream URLs are ALREADY proxied through the TMDB-Embed
// backend (/m3u8-proxy and /ts-proxy) — every HLS segment and MP4 byte is
// rewritten to that host, which serves CORS `*`. So the player can consume
// them directly, with no worker/proxy wrapping on our side.
//
// Best-server selection: each provider may return several servers/qualities
// (e.g. Vidcore Supreme + Prime, Vidlink 480p/720p/1080p, AniKoto sub/dub).
// We probe each candidate URL (short HEAD/range GET, parallel) and rank by
// quality tier first, then by measured latency, keeping only working ones.
// ---------------------------------------------------------------------------

import { flags, NotFoundError } from "@nexus/providers";

import { makeEmbedContext, makeProviderContext } from "../shared/makeProviderContext";
import { ScrapeContext } from "../shared/types";

export const EMBED_API_BASE =
  (
    (import.meta.env.VITE_TMDB_EMBED_URL as string | undefined) ??
    "https://stycanine1-tmdb-embed-api.hf.space"
  ).replace(/\/$/, "");

export const EMBED_REQUEST_TIMEOUT = 20_000;
export const PROBE_TIMEOUT = 5_000;

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------
export interface EmbedStreamItem {
  name?: string;
  server?: string;
  title?: string;
  url: string;
  quality?: string;
  type?: string;
  provider?: string;
  headers?: Record<string, string>;
  subtitles?: Array<{ lang?: string; label?: string; url?: string }>;
}

export interface EmbedApiResponse {
  success: boolean;
  error?: string;
  provider?: string;
  count?: number;
  providerTimings?: Record<string, number>;
  streams?: EmbedStreamItem[];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
export async function fetchEmbedApi(
  url: string,
  timeoutMs = EMBED_REQUEST_TIMEOUT,
): Promise<EmbedApiResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: EmbedApiResponse = await res.json();
    if (!json || json.success === false) {
      throw new Error(json?.error ?? "empty response");
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

export function buildEmbedUrl(provider: string, ctx: ScrapeContext): string {
  const { media } = ctx;
  const type = media.type === "movie" ? "movie" : "series";
  const params = new URLSearchParams();
  if (media.type === "show" && media.season && media.episode) {
    params.set("season", String(media.season.number));
    params.set("episode", String(media.episode.number));
  }
  if (media.imdbId) params.set("imdbId", media.imdbId);
  const qs = params.toString();
  return `${EMBED_API_BASE}/api/streams/${provider}/${type}/${encodeURIComponent(media.tmdbId)}${qs ? `?${qs}` : ""}`;
}

// ---------------------------------------------------------------------------
// Quality normalisation (support 4K)
// ---------------------------------------------------------------------------
const QUALITY_RANK: Record<string, number> = {
  "4k": 100,
  "1080": 90,
  "720": 80,
  "480": 70,
  "360": 60,
  unknown: 50,
};

export function normalizeQuality(q?: string, extra?: string): string {
  const text = `${q ?? ""} ${extra ?? ""}`.toLowerCase();
  if (text.includes("4k") || text.includes("2160") || text.includes("uhd")) return "4k";
  if (text.includes("1080")) return "1080";
  if (text.includes("720")) return "720";
  if (text.includes("480")) return "480";
  if (text.includes("360")) return "360";
  return "unknown";
}

export function qualityRank(q: string): number {
  return QUALITY_RANK[q] ?? QUALITY_RANK.unknown;
}

// ---------------------------------------------------------------------------
// Latency probe — short request that measures how fast the server responds
// AND verifies the body is real media. Many CDNs answer with a 200/206 HTML
// error page ("Wrong IP", "forbidden", S3 AccessDenied XML, ...) — those
// must count as dead so the strict picker never hands them to the player.
// ---------------------------------------------------------------------------
function readChunk(res: Response, maxBytes: number): Promise<string> {
  return new Promise((resolve) => {
    const reader = res.body?.getReader();
    if (!reader) {
      resolve("");
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    (async () => {
      try {
        while (total < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            total += value.length;
          }
        }
      } catch {
        /* ignore read errors */
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      // latin1 decode preserves raw bytes for signature sniffing
      let text = "";
      for (let i = 0; i < bytes.length; i += 1) {
        text += String.fromCharCode(bytes[i]);
      }
      resolve(text);
    })();
  });
}

export async function probeUrl(
  url: string,
  timeoutMs = PROBE_TIMEOUT,
): Promise<number | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const isPlaylist = url.includes("m3u8");
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: isPlaylist ? {} : { Range: "bytes=0-8191" },
    });
    const latency = Math.round(performance.now() - start);
    if (res.status < 200 || res.status >= 400) return null;

    const body = await readChunk(res, 8192);

    if (isPlaylist) {
      // A real HLS playlist always starts with #EXTM3U.
      if (!body.trimStart().startsWith("#EXTM3U")) return null;
    } else if (
      // Strict: any non-media content is not playable (HTML error pages,
      // S3 XML errors, "Wrong IP" bodies, ... all fail this check).
      !(/video\//.test(res.headers.get("content-type") ?? "") ||
        (res.headers.get("content-type") ?? "").includes("octet-stream") ||
        body.includes("ftyp"))
    ) {
      return null;
    }
    return latency;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Stream classification
// ---------------------------------------------------------------------------
export function isHlsItem(item: EmbedStreamItem): boolean {
  const url = item.url ?? "";
  return (
    url.includes(".m3u8") ||
    url.includes("m3u8-proxy") ||
    item.type === "hls"
  );
}

export function isDubItem(item: EmbedStreamItem): boolean {
  return `${item.name ?? ""} ${item.title ?? ""} ${item.server ?? ""}`
    .toLowerCase()
    .includes("(dub)");
}

// ---------------------------------------------------------------------------
// Best-stream selection: probe every candidate in parallel, rank by quality
// tier then latency, keep working servers only (fall back to all if every
// probe failed so we never return empty on a flaky probe).
// ---------------------------------------------------------------------------
export interface RankedStream {
  item: EmbedStreamItem;
  quality: string;
  latency: number | null;
}

export async function rankStreams(
  items: EmbedStreamItem[],
): Promise<RankedStream[]> {
  const candidates = items.filter((i) => i?.url);
  if (candidates.length === 0) return [];

  const probed = await Promise.all(
    candidates.map(async (item) => ({
      item,
      quality: normalizeQuality(item.quality, item.title || item.server),
      latency: await probeUrl(item.url),
    })),
  );

  return probed.sort((a, b) => {
    const qDiff = qualityRank(b.quality) - qualityRank(a.quality);
    if (qDiff !== 0) return qDiff;
    const aOk = a.latency !== null ? 1 : 0;
    const bOk = b.latency !== null ? 1 : 0;
    if (aOk !== bOk) return bOk - aOk;
    if (a.latency !== null && b.latency !== null) return a.latency - b.latency;
    return 0;
  });
}

export function pickUsable(ranked: RankedStream[]): RankedStream[] {
  // STRICT: only return servers that actually responded to the probe. The
  // movie-web runner stops at the first embed that returns a stream, so a
  // dead stream here would mean a dead end for the whole "Embeds ⚡" family.
  // If nothing responded, the caller throws so the runner fails over to the
  // next provider ("if server offline, only get the working").
  return ranked.filter((r) => r.latency !== null);
}

// ---------------------------------------------------------------------------
// Subtitle extraction — pull caption tracks from the API response so the
// player can auto-select matching languages (smart subtitle sync).
// ---------------------------------------------------------------------------
const LANG_CODE_MAP: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it",
  portuguese: "pt", russian: "ru", japanese: "ja", korean: "ko", chinese: "zh",
  arabic: "ar", hindi: "hi", turkish: "tr", thai: "th", vietnamese: "vi",
  indonesian: "id", dutch: "nl", polish: "pl", romanian: "ro", swedish: "sv",
  greek: "el", czech: "cs", hungarian: "hu", danish: "da", finnish: "fi",
};

function toIso(lang?: string): string {
  if (!lang) return "unknown";
  const lower = lang.toLowerCase().trim();
  if (LANG_CODE_MAP[lower]) return LANG_CODE_MAP[lower];
  if (lower.length === 2) return lower;
  return lower;
}

function extractCaptions(item: EmbedStreamItem, prefix: string): any[] {
  const captions: any[] = [];
  const subs = item.subtitles ?? [];
  for (const sub of subs) {
    if (!sub.url) continue;
    const lang = toIso(sub.lang || sub.label);
    captions.push({
      id: `${prefix}-sub-${lang}-${captions.length}`,
      language: lang,
      url: sub.url,
      type: sub.url.includes(".vtt") ? "vtt" : "srt",
      needsProxy: false,
      opensubtitles: false,
    });
  }
  return captions;
}

// ---------------------------------------------------------------------------
// Build movie-web Stream objects (play DIRECTLY — URLs are already proxied).
// NOTE: never forward API `headers` — the required Referer/User-Agent headers
// are already baked into the HF proxy URL query params, and a headers object
// would make the runner's `requiresProxy()` wrap the URL in the placeholder
// destination proxy, breaking playback.
// ---------------------------------------------------------------------------
export function buildHlsStream(
  url: string,
  id: string,
  captions: any[] = [],
): any {
  return {
    id,
    type: "hls",
    playlist: url,
    flags: [flags.CORS_ALLOWED],
    captions,
    headers: {},
    skipValidation: true,
    audioTracks: [{
      id: `${id}-audio-original`,
      label: "🌐 Original",
      language: "und",
      url,
      default: true,
    }],
  };
}

export function buildFileStream(
  qualities: Record<string, { type: "mp4"; url: string }>,
  id: string,
  captions: any[] = [],
): any {
  const firstUrl = Object.values(qualities)[0]?.url ?? "";
  return {
    id,
    type: "file",
    qualities,
    flags: [flags.CORS_ALLOWED],
    captions,
    headers: {},
    skipValidation: true,
    audioTracks: [{
      id: `${id}-audio-original`,
      label: "🌐 Original",
      language: "und",
      url: firstUrl,
      default: true,
    }],
  };
}

// ---------------------------------------------------------------------------
// Provider factory — each embed provider calls the TMDB-Embed API for its
// backend, ranks the returned servers/qualities by quality + latency, and
// returns the single best playable stream (dubs → audioTracks for anime).
// ---------------------------------------------------------------------------
const DUB_LANG_MAP: Array<[RegExp, string, string]> = [
  [/\bspanish\b|\bespañol\b/, "Spanish Dub", "es"],
  [/\bportuguese\b|\bportuguês\b/, "Portuguese Dub", "pt"],
  [/\bfrench\b|\bfrançais\b/, "French Dub", "fr"],
  [/\bgerman\b|\bdeutsch\b/, "German Dub", "de"],
  [/\bitalian\b|\bitaliano\b/, "Italian Dub", "it"],
  [/\bhindi\b/, "Hindi Dub", "hi"],
  [/\barabic\b/, "Arabic Dub", "ar"],
  [/\bturkish\b/, "Turkish Dub", "tr"],
  [/\brussian\b/, "Russian Dub", "ru"],
  [/\bkorean\b/, "Korean Dub", "ko"],
  [/\bjapanese\b/, "Japanese Dub", "ja"],
  [/\bthai\b/, "Thai Dub", "th"],
  [/\bindonesian\b/, "Indonesian Dub", "id"],
  [/\bvietnamese\b/, "Vietnamese Dub", "vi"],
];

/** Map ISO language code to country flag emoji. */
const LANG_FLAG: Record<string, string> = {
  en: "🇬🇧", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", pt: "🇵🇹",
  hi: "🇮🇳", ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", ru: "🇷🇺", ar: "🇸🇦",
  tr: "🇹🇷", th: "🇹🇭", vi: "🇻🇳", id: "🇮🇩", nl: "🇳🇱", pl: "🇵🇱",
  ro: "🇷🇴", sv: "🇸🇪", el: "🇬🇷", cs: "🇨🇿", hu: "🇭🇺", da: "🇩🇰",
  fi: "🇫🇮", ta: "🇮🇳", te: "🇮🇳", ml: "🇮🇳", bn: "🇧🇩", ur: "🇵🇰",
  und: "🌐",
};

export function flagForLang(lang: string): string {
  return LANG_FLAG[lang] ?? "🌐";
}

function dubLanguage(item: EmbedStreamItem): { label: string; language: string } {
  const name = `${item.name ?? ""} ${item.title ?? ""} ${item.server ?? ""}`.toLowerCase();
  for (const [re, label, language] of DUB_LANG_MAP) {
    if (re.test(name)) return { label, language };
  }
  // Unknown dub — don't guess "English" when it could be anything.
  return { label: "Dubbed", language: "und" };
}

/**
 * Movie / TV scrape — rank servers, return the single best stream.
 * HLS wins over MP4 (adaptive quality); otherwise an MP4 file stream with
 * every working quality exposed so the player can auto-pick the best.
 *
 * NOTE: movie-web embeds only receive `ctx.url` (no media object), so the
 * "Embeds ⚡" source passes the FULL API endpoint URL as the embed URL.
 */
async function scrapeMovieTvEmbed(
  backend: string,
  apiUrl: string,
  label: string,
): Promise<any> {
  const data = await fetchEmbedApi(apiUrl);
  const items = data.streams ?? [];
  if (items.length === 0) throw new NotFoundError(`${label}: no sources`);

  const ranked = await rankStreams(items);
  const usable = pickUsable(ranked);
  if (usable.length === 0) {
    throw new NotFoundError(
      `${label}: no working servers (${items.length} returned, all unreachable)`,
    );
  }

  const hls = usable.filter((r) => isHlsItem(r.item));
  const files = usable.filter((r) => !isHlsItem(r.item));

  if (hls.length > 0) {
    const best = hls[0]!;
    const captions = extractCaptions(best.item, `nexus-embed-${backend}`);
    return {
      embeds: [],
      stream: [buildHlsStream(best.item.url, `nexus-embed-${backend}-hls`, captions)],
    };
  }

  // MP4 — expose every distinct quality, prefer the best working one.
  const qualities: Record<string, { type: "mp4"; url: string }> = {};
  for (const r of files) {
    const key = r.quality;
    if (!qualities[key]) qualities[key] = { type: "mp4", url: r.item.url };
  }
  if (Object.keys(qualities).length === 0) {
    qualities.unknown = { type: "mp4", url: files[0]!.item.url };
  }
  const caps = files.length > 0 ? extractCaptions(files[0]!.item, `nexus-embed-${backend}`) : [];
  return {
    embeds: [],
    stream: [buildFileStream(qualities, `nexus-embed-${backend}-file`, caps)],
  };
}

/**
 * Anime scrape (anikai / anikoto) — sub streams become the main stream, dub
 * streams become selectable audio tracks (the player's Audio menu), each
 * picked from the best/fastest working server.
 */
async function scrapeAnimeEmbed(
  backend: string,
  apiUrl: string,
  label: string,
): Promise<any> {
  const data = await fetchEmbedApi(apiUrl);
  const items = data.streams ?? [];
  if (items.length === 0) throw new NotFoundError(`${label}: no sources`);

  const ranked = await rankStreams(items);
  const usable = pickUsable(ranked);
  if (usable.length === 0) {
    throw new NotFoundError(
      `${label}: no working servers (${items.length} returned, all unreachable)`,
    );
  }

  const subs = usable.filter((r) => !isDubItem(r.item));
  const dubs = usable.filter((r) => isDubItem(r.item));
  const mainPool = subs.length > 0 ? subs : usable;
  const best = mainPool[0]!;

  const captions = extractCaptions(best.item, `nexus-embed-${backend}`);
  const stream: any = isHlsItem(best.item)
    ? buildHlsStream(best.item.url, `nexus-embed-${backend}-hls`, captions)
    : buildFileStream(
        { [best.quality]: { type: "mp4", url: best.item.url } },
        `nexus-embed-${backend}-file`,
        captions,
      );

  if (dubs.length > 0) {
    // Anime: default is Japanese (sub), dubs are alternatives with flags
    const audioTracks: any[] = [
      { id: `nexus-embed-${backend}-audio-jp`, label: `🇯🇵 Japanese`, language: "ja", url: best.item.url, default: true },
    ];
    const seen = new Set<string>(["und"]);
    for (const r of dubs) {
      const { label: dubLabel, language } = dubLanguage(r.item);
      if (seen.has(language)) continue;
      seen.add(language);
      const flag = flagForLang(language);
      audioTracks.push({
        id: `nexus-embed-${backend}-audio-${language}`,
        label: `${flag} ${dubLabel}`,
        language,
        url: r.item.url,
        default: false,
      });
    }
    stream.audioTracks = audioTracks;
  }

  return { embeds: [], stream: [stream] };
}

/**
 * Create an embed provider for one TMDB-Embed backend.
 * The "Embeds ⚡" source passes the FULL API endpoint URL via the embed
 * `url` field, so the embed needs no media context of its own.
 */
export function makeEmbedProvider(opts: {
  id: string;
  name: string;
  rank: number;
  backend: string;
  anime?: boolean;
  disabled?: boolean;
}) {
  const { id, name, rank, backend, anime, disabled } = opts;
  return makeEmbedContext({
    id,
    name,
    rank,
    backend,
    anime: anime ?? false,
    disabled: disabled ?? false,
    async scrape(ctx) {
      try {
        const apiUrl = (ctx as any).url ?? "";
        if (anime) return await scrapeAnimeEmbed(backend, apiUrl, name);
        return await scrapeMovieTvEmbed(backend, apiUrl, name);
      } catch (e: any) {
        console.error(`${name}:`, e?.message ?? e);
        throw e;
      }
    },
  });
}

/**
 * Create a standalone source provider from an embed backend.
 * Each provider becomes its own source in the player's source list.
 */
export function makeStandaloneSource(opts: {
  id: string;
  name: string;
  rank: number;
  backend: string;
  anime?: boolean;
}) {
  const { id, name, rank, backend, anime } = opts;
  return makeProviderContext({
    id,
    name,
    rank,
    async scrape(ctx: any) {
      try {
        const apiUrl = buildEmbedUrl(backend, ctx);
        const data = await fetchEmbedApi(apiUrl);
        const items = data.streams ?? [];
        if (items.length === 0) throw new NotFoundError(`${name}: no sources`);

        const ranked = await rankStreams(items);
        const usable = pickUsable(ranked);
        if (usable.length === 0) {
          throw new NotFoundError(`${name}: no working servers`);
        }

        // Separate subs and dubs for anime
        const subs = anime ? usable.filter((r) => !isDubItem(r.item)) : usable;
        const dubs = anime ? usable.filter((r) => isDubItem(r.item)) : [];
        const mainPool = subs.length > 0 ? subs : usable;

        if (anime && dubs.length > 0) {
          // Return best sub as stream, dubs as audio tracks
          const best = mainPool[0];
          const captions = extractCaptions(best.item, `${id}-sub`);
          const stream = isHlsItem(best.item)
            ? buildHlsStream(best.item.url, `${id}-hls`, captions)
            : buildFileStream({ [best.quality]: { type: "mp4", url: best.item.url } }, `${id}-file`, captions);

          // Anime: default is Japanese (sub), dubs are alternatives with flags
          const audioTracks: any[] = [
            { id: `${id}-audio-jp`, label: `🇯🇵 Japanese`, language: "ja", url: best.item.url, default: true },
          ];
          const seen = new Set<string>(["und"]);
          for (const r of dubs) {
            const { label: dl, language } = dubLanguage(r.item);
            if (seen.has(language)) continue;
            seen.add(language);
            const flag = flagForLang(language);
            audioTracks.push({ id: `${id}-audio-${language}`, label: `${flag} ${dl}`, language, url: r.item.url, default: false });
          }
          stream.audioTracks = audioTracks;
          return { embeds: [], stream: [stream] };
        }

        // Return all working servers as numbered embeds so user can pick.
        // Pack captions + audio info alongside the URL so the server embed
        // can build a complete stream with subtitles.
        return {
          embeds: mainPool.map((r, i) => ({
            embedId: `nexus-server-${i + 1}`,
            url: JSON.stringify({
              url: r.item.url,
              captions: extractCaptions(r.item, `${id}-srv${i + 1}`),
              quality: r.quality,
              label: r.item.server || r.item.title || `Server ${i + 1}`,
            }),
          })),
          stream: [],
        };
      } catch (e: any) {
        console.error(`${name}:`, e?.message ?? e);
        throw e;
      }
    },
  });
}

/**
 * Ranked view used by the /dev embed tester — returns all streams with
 * quality + latency so the developer can see what's available.
 */
export async function fetchAndRankEmbed(
  apiUrl: string,
): Promise<{ item: EmbedStreamItem; quality: string; latency: number | null }[]> {
  const data = await fetchEmbedApi(apiUrl);
  return rankStreams(data.streams ?? []);
}

// ---------------------------------------------------------------------------
// Anime detection — used by the "Embeds ⚡" source to pick which provider
// family (movie/TV vs anime) to surface.
// ---------------------------------------------------------------------------
const ANIME_KEYWORDS = [
  "one piece", "naruto", "bleach", "dragon ball", "jujutsu kaisen",
  "demon slayer", "attack on titan", "my hero academia", "solo leveling",
  "chainsaw man", "pokémon", "pokemon", "death note", "hunter x hunter",
  "tokyo ghoul", "fullmetal alchemist", "sword art online", "fate/",
  "gintama", "steins;gate", "code geass", "mob psycho", "haikyuu",
  "one punch man", "vinland saga", "boku no hero", "kimetsu no yaiba",
  "shingeki no kyojin",
];

export async function detectIsAnime(media: ScrapeContext["media"]): Promise<boolean> {
  const title = (media.title ?? "").toLowerCase();
  if (ANIME_KEYWORDS.some((kw) => title.includes(kw))) return true;

  try {
    const endpoint =
      media.type === "movie"
        ? `/api/tmdb/movie/${media.tmdbId}`
        : `/api/tmdb/tv/${media.tmdbId}`;
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data: any = await res.json();
      const genres: Array<{ id: number; name?: string }> = data.genres ?? [];
      const originCountry: string[] = data.origin_country ?? [];
      const isAnimation = genres.some(
        (g) => g.id === 16 || g.name?.toLowerCase() === "animation",
      );
      const isJapanese =
        originCountry.includes("JP") || data.original_language === "ja";
      return isAnimation && isJapanese;
    }
  } catch {
    /* best-effort — fall through to not-anime */
  }
  return false;
}

// ---------------------------------------------------------------------------
// Server-name registry — server names packed by standalone sources so the
// UI can show real names without re-deriving them.
// ---------------------------------------------------------------------------
const serverLabelCache: Record<string, string> = {};

export function setServerEmbedLabels(labels: string[]): void {
  labels.forEach((label, i) => {
    if (label) serverLabelCache[`nexus-server-${i + 1}`] = label;
  });
}

export function getServerEmbedLabel(embedId: string): string | undefined {
  return serverLabelCache[embedId];
}

export function getPackedEmbedLabel(url: string): string | undefined {
  try {
    const parsed = JSON.parse(url);
    if (parsed && typeof parsed.label === "string" && parsed.label) {
      return parsed.label;
    }
  } catch {
    /* plain URL — no extras */
  }
  return undefined;
}
