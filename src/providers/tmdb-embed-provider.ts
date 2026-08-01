// tmdb-embed-provider.ts
// NEXUS — Individual providers via the TMDB-Embed API (Oracle Cloud VPS)
// ---------------------------------------------------------------------------
// The Oracle Cloud Always Free VPS hosts the backend, exposed through
// Cloudflare Tunnel for CORS-safe, always-on access.
//
// Each provider calls its own backend endpoint:
//   GET /api/streams/:provider/movie|series/:tmdbId?...
//   → { success, streams: [{ name, title, url, quality, headers? }] }
//
// VPS: 168.107.87.42 (Oracle Cloud VM.Standard.E2.1.Micro, Singapore)
// Also hosts MovieBox (port 8000) — see MOVIEBOX_API_URL in Vercel env vars.
// Working providers (tested live 2026-08-01):
//   vidfast   — vidfast.vc (movie+TV)
//   notorrent — Stremio addon, 8-11 streams (movie+TV)
//   vidup     — vidup.to (movie+TV)
//   anikai    — anikai.watch scraper (anime only)
//   anikoto   — anikototv.to via Vercel API (anime only, dub support)
// ---------------------------------------------------------------------------

import { flags } from "@nexus/providers";
import { makeProviderContext } from "./makeProviderContext";
import { getProxiedUrl } from "./proxiedFetch";
import { ScrapeContext } from "./types";

const STABLE_TMDB_EMBED_BASE = "https://stycanine1-tmdb-embed-api.hf.space";
const configuredTmdbEmbedBase = import.meta.env.VITE_TMDB_EMBED_URL?.replace(/\/$/, "");
const TMDB_EMBED_BASES = [configuredTmdbEmbedBase, STABLE_TMDB_EMBED_BASE].filter(
  (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
);

function toSameOriginEmbedUrl(url: string): string {
  return url;
}

const REQUEST_TIMEOUT = 8000;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
async function getJson<T>(urls: string[]): Promise<T | null> {
  for (const url of urls) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    try {
      const res = await fetch(getProxiedUrl(url), {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // Try the stable fallback backend before reporting a provider failure.
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------
interface EmbedStreamItem {
  name?: string;
  title?: string;
  url: string;
  quality?: string;
  type?: string;
  provider?: string;
  headers?: Record<string, string>;
}

interface EmbedStreamResponse {
  success?: boolean;
  error?: string;
  count?: number;
  streams?: EmbedStreamItem[];
}

// ---------------------------------------------------------------------------
// Sub / Dub classification (for anikoto)
// ---------------------------------------------------------------------------
function isDubStream(s: EmbedStreamItem): boolean {
  return `${s.name ?? ""} ${s.title ?? ""}`.toLowerCase().includes("(dub)");
}

function dubLanguage(s: EmbedStreamItem): { label: string; language: string } {
  const name = `${s.name ?? ""} ${s.title ?? ""}`.toLowerCase();
  const langMap: Array<[RegExp, string, string]> = [
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
  for (const [re, label, language] of langMap) {
    if (re.test(name)) return { label, language };
  }
  return { label: "English Dub", language: "en" };
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------
function buildApiUrls(provider: string, ctx: ScrapeContext): string[] {
  const { media } = ctx;
  const type = media.type === "movie" ? "movie" : "series";
  const params = new URLSearchParams();
  if (media.type === "show" && media.season && media.episode) {
    params.set("season", String(media.season.number));
    params.set("episode", String(media.episode.number));
  }
  if (media.imdbId) params.set("imdbId", media.imdbId);
  const suffix = `/api/streams/${provider}/${type}/${encodeURIComponent(media.tmdbId)}?${params.toString()}`;
  return TMDB_EMBED_BASES.map((base) => `${base}${suffix}`);
}

// ---------------------------------------------------------------------------
// Normalize quality
// ---------------------------------------------------------------------------
function normalizeQuality(q?: string): string {
  if (!q) return "unknown";
  const lower = q.toLowerCase();
  if (lower.includes("4k") || lower.includes("2160")) return "4k";
  if (lower.includes("1080")) return "1080";
  if (lower.includes("720")) return "720";
  if (lower.includes("480")) return "480";
  if (lower.includes("360")) return "360";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Shared scrape logic — works for all individual providers
// ---------------------------------------------------------------------------
async function scrapeTmdbEmbed(ctx: ScrapeContext, provider: string, label: string) {
  const data = await getJson<EmbedStreamResponse>(buildApiUrls(provider, ctx));

  if (!data?.success || !data.streams?.length) {
    throw new Error(`${label}: no sources (${data?.error ?? "empty response"}).`);
  }

  const streams = data.streams
    .filter((s) => s?.url)
    .map((s) => ({ ...s, url: toSameOriginEmbedUrl(s.url) }));
  if (!streams.length) throw new Error(`${label}: no playable stream.`);

  // For anime providers, handle sub/dub split
  if (provider === "anikoto" || provider === "anikai") {
    const subStreams = streams.filter((s) => !isDubStream(s));
    const dubStreams = streams.filter((s) => isDubStream(s));
    const mainCandidates = subStreams.length ? subStreams : streams;
    const best = mainCandidates.find((s) => s.url.includes(".m3u8")) ?? mainCandidates[0]!;
    const isHls = best.url.includes(".m3u8");

    const stream: any = {
      id: `nexus-${provider}-stream`,
      type: isHls ? "hls" : "file",
      flags: [flags.CORS_ALLOWED],
      captions: [],
      headers: best.headers ?? {},
      skipValidation: true,
    };

    if (isHls) {
      stream.playlist = best.url;
    } else {
      const qualities: Record<string, { type: "mp4"; url: string }> = {};
      for (const s of streams) {
        if (!s.url || s.url.includes(".m3u8")) continue;
        const key = normalizeQuality(s.quality);
        if (!qualities[key]) qualities[key] = { type: "mp4", url: s.url };
      }
      if (!Object.keys(qualities).length) {
        qualities.unknown = { type: "mp4", url: best.url };
      }
      stream.qualities = qualities;
    }

    if (dubStreams.length) {
      const audioTracks: any[] = [
        { id: `nexus-${provider}-audio-original`, label: "Original", language: "und", url: best.url, default: true },
      ];
      const seen = new Set<string>(["und"]);
      for (const d of dubStreams) {
        const { label: dubLabel, language } = dubLanguage(d);
        if (seen.has(language)) continue;
        seen.add(language);
        audioTracks.push({ id: `nexus-${provider}-audio-${language}`, label: dubLabel, language, url: d.url, default: false });
      }
      stream.audioTracks = audioTracks;
    }

    return { embeds: [], stream: [stream] };
  }

  // For movie/TV providers — fan out each stream individually so the user
  // can see exactly which provider returned which stream in the source list.
  const result: any[] = [];
  for (const s of streams) {
    // Skip streams whose proxy URL has a relative path (starts with /) —
    // the HF Space proxy can't resolve these and returns HTTP 500.
    const urlParam = s.url.match(/[?&]url=([^&]+)/)?.[1];
    if (urlParam) {
      try {
        const decoded = decodeURIComponent(urlParam);
        if (decoded.startsWith('/')) {
          console.log(`[${label}] Skipping stream with relative proxy URL: ${decoded.slice(0, 40)}`);
          continue;
        }
      } catch { /* malformed URL, let it through */ }
    }

    // Detect HLS: prefer API-provided type field, then check URL for
    // .m3u8 extension OR m3u8-proxy prefix (proxy URLs hide the .m3u8 suffix).
    const isHls = s.type === 'hls' || s.url.includes('.m3u8') || s.url.includes('m3u8-proxy');
    const stream: any = {
      id: `nexus-${provider}-${result.length}`,
      type: isHls ? "hls" : "file",
      flags: [flags.CORS_ALLOWED],
      captions: [],
      headers: s.headers ?? {},
      skipValidation: true,
    };
    if (isHls) {
      stream.playlist = s.url;
    } else {
      stream.qualities = { [normalizeQuality(s.quality)]: { type: "mp4", url: s.url } };
    }
    result.push(stream);
  }

  return { embeds: [], stream: result };
}

// ---------------------------------------------------------------------------
// Provider factories — concise wrapper around the shared scrape
// ---------------------------------------------------------------------------
function makeEmbedProvider(
  id: string,
  name: string,
  rank: number,
  backendProvider: string,
  disabled = false,
) {
  return makeProviderContext({
    id, name, rank, disabled,
    async scrape(ctx) {
      try {
        return await scrapeTmdbEmbed(ctx, backendProvider, name);
      } catch (e: any) {
        console.error(`${name}: error:`, e?.message ?? e);
        throw e;
      }
    },
  });
}

// Movie / TV providers — each shown separately in the source list
export const vidfastProvider   = makeEmbedProvider("nexus-vidfast",   "VidFast ⚡",   1290, "vidfast");
export const notorrentProvider = makeEmbedProvider("nexus-notorrent", "NoTorrent 🧲", 1280, "notorrent");
export const vidupProvider     = makeEmbedProvider("nexus-vidup",     "VidUp 📤",     1252, "vidup");

// Anime providers (keep existing dub support via isDubStream check)
export const anikaiProvider  = makeEmbedProvider("nexus-anikai",  "AniKai 🀄",  1250, "anikai");
export const anikotoProvider = makeEmbedProvider("nexus-anikoto", "AniKoto 🀄", 1240, "anikoto");
