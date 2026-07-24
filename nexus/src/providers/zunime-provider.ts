// zunime-provider.ts
// NEXUS — Zunime Custom Anime Provider (Anivexa API / Zetianime-API)
// ---------------------------------------------------------------------------
// Uses Anivexa API (Worker proxy / Vercel API) to aggregate anime sources.
// Clean provider list: real source provider names without Sub/Dub suffixes.
// ---------------------------------------------------------------------------

import { flags } from "@nexus/providers";
import { makeProviderContext, makeEmbedContext } from "./makeProviderContext";
import { getProxiedUrl } from "./proxiedFetch";
import { ScrapeContext } from "./types";

// All requests route through Vite dev-server proxy → real hosts never
// appear in the browser's network tab (security: no URL leakage).
const WORKER_API_BASE = "/nexus-zunime-worker";
const VERCEL_API_BASE = "/nexus-zunime";
const ANILIST_PROXY = "/nexus-anilist";
const REQUEST_TIMEOUT = 12000;

// ---------------------------------------------------------------------------
// Real source provider definitions
// ---------------------------------------------------------------------------
export const ZUNIME_PROVIDERS = [
  { key: "anidbapp",   label: "AniDBApp" },
  { key: "anibd",      label: "AniBD" },
  { key: "animegg",    label: "AnimeGG" },
  { key: "reanime",    label: "Reanime" },
  { key: "2dhive",     label: "2DHive" },
  { key: "allmanga",   label: "AllManga" },
  { key: "anizone",    label: "AniZone" },
  { key: "senshi",     label: "Senshi" },
  { key: "kaa",        label: "KickAssAnime" },
  { key: "animenosub", label: "AnimeNoSub" },
] as const;

// Metadata for all embeds (used by Settings source list)
// Ranks start at 1500 — above ALL built-in embeds (max rank ~450) to avoid
// "Embeds have duplicate ranks" errors from the @nexus/providers validator.
export const zunimeEmbedMetadata = ZUNIME_PROVIDERS.map((p, idx) => ({
  id: `zunime-${p.key}`,
  name: p.label,
  type: "embed" as const,
  rank: 1500 - idx,
}));

// ---------------------------------------------------------------------------
// HTTP helper with primary/fallback and timeout
// ---------------------------------------------------------------------------
async function fetchWithFallback<T>(path: string): Promise<T | null> {
  const urls = [`${VERCEL_API_BASE}${path}`, `${WORKER_API_BASE}${path}`];
  for (const url of urls) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    try {
      const res = await fetch(getProxiedUrl(url), { signal: ctrl.signal });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && (data.streams || data.sources || data.error)) {
          return data as T;
        }
      }
    } catch {
      /* try next endpoint */
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}


// ---------------------------------------------------------------------------
// Anivexa API stream response type
// ---------------------------------------------------------------------------
interface AniStream {
  url: string;
  type: "hls" | "mp4" | "embed";
  embed?: string;
  quality?: string;
  audio?: string;
  server?: string;
  referer?: string;
  isActive?: boolean;
  priority?: number;
}

interface AniWatchResponse {
  error?: string;
  streams?: AniStream[];
  sources?: Array<{ url: string; isM3U8?: boolean; quality?: string }>; // legacy
  headers?: Record<string, string>;
  tracks?: Array<{ file: string; label: string; kind: string }>;
}

// Pick the best playable stream (prefer HLS → MP4; fallback to embed)
function pickStream(streams: AniStream[]): AniStream | null {
  if (!streams || !streams.length) return null;

  // 1. Prefer direct HLS
  const hls = streams.find((s) => s.type === "hls" && !!s.url);
  if (hls) return hls;

  // 2. Prefer direct MP4
  const mp4 = streams.find((s) => s.type === "mp4" && !!s.url);
  if (mp4) return mp4;

  // 3. Fallback: stream with type !== 'embed'
  const direct = streams
    .filter((s) => s.type !== "embed" && !!s.url)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  if (direct.length > 0) return direct[0];

  // 4. Ultimate fallback: any stream with url or embed property
  const fallback = streams.find((s) => !!s.url || !!s.embed);
  if (fallback) {
    return {
      ...fallback,
      url: fallback.url || fallback.embed!,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Embed scrapers — one per provider
// ---------------------------------------------------------------------------
export const zunimeEmbeds = ZUNIME_PROVIDERS.map((p, idx) =>
  makeEmbedContext({
    id: `zunime-${p.key}`,
    name: p.label,
    rank: 1500 - idx,
    disabled: false,
    async scrape(ctx: { url: string }) {
      const data = await fetchWithFallback<AniWatchResponse>(ctx.url);

      if (!data) throw new Error(`${p.label}: API unavailable.`);
      if (data.error) throw new Error(`${p.label}: ${data.error}`);

      const streams: AniStream[] =
        data.streams ??
        (data.sources?.map((s) => ({
          url: s.url,
          type: s.isM3U8 ? ("hls" as const) : ("mp4" as const),
        })) ?? []);

      const selected = pickStream(streams);

      if (!selected?.url) {
        throw new Error(`${p.label}: no playable stream found.`);
      }

      const isHls = selected.type === "hls" || selected.url.includes(".m3u8");
      const headers: Record<string, string> = {
        ...(data.headers ?? {}),
        ...(selected.referer ? { Referer: selected.referer } : {}),
      };

      return {
        stream: [
          {
            id: `zunime-${p.key}`,
            type: isHls ? ("hls" as const) : ("file" as const),
            ...(isHls
              ? { playlist: selected.url }
              : { qualities: { unknown: { type: "mp4" as const, url: selected.url } } }),
            flags: [flags.CORS_ALLOWED],
            captions: [],
            headers,
          },
        ],
      };
    },
  }),
);

// ---------------------------------------------------------------------------
// AniList ID resolver
// ---------------------------------------------------------------------------
interface AniListSearchItem {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
}

interface AniListSearchResponse {
  data?: { Page?: { media?: AniListSearchItem[] } };
}

async function getAniListId(media: any): Promise<number | null> {
  const title: string = media.title ?? "";
  if (!title) return null;

  const query = `
    query ($search: String) {
      Page(perPage: 1) {
        media(search: $search, type: ANIME) {
          id
          title { romaji english native }
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { search: title } }),
    });
    if (res.ok) {
      const json = (await res.json()) as AniListSearchResponse;
      const aniId = json.data?.Page?.media?.[0]?.id;
      if (aniId) return aniId;
    }
  } catch {
    /* fallback */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main scrape function — returns embed list with correct API URLs
// ---------------------------------------------------------------------------
export async function scrapeZunime(ctx: ScrapeContext) {
  const { media } = ctx;
  const aniId = await getAniListId(media);
  if (!aniId) {
    throw new Error("Zunime: Could not resolve AniList ID for: " + media.title);
  }

  const ep = media.type === "show" ? (media.episode?.number ?? 1) : 1;

  const embeds: Array<{ embedId: string; url: string }> = [];

  for (const p of ZUNIME_PROVIDERS) {
    const watchUrl = `/watch/${p.key}/${aniId}/sub/${p.key}-${ep}`;
    embeds.push({ embedId: `zunime-${p.key}`, url: watchUrl });
  }

  return { embeds, stream: undefined };
}

// ---------------------------------------------------------------------------
// Zunime source provider
// ---------------------------------------------------------------------------
export const zunimeProvider = makeProviderContext({
  id: "nexus-zunime",
  name: "Zunime",
  rank: 1050,
  disabled: false,
  async scrape(ctx) {
    return scrapeZunime(ctx);
  },
});
