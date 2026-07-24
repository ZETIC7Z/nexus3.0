// TMdb-provider.ts
// NEXUS - Primary streaming provider using TMDB-Embed-API (HuggingFace Space)
// This provider scrapes via the zeticuz.online backend deployed on HuggingFace.
// Architecture:
//   User clicks Play → zeticuz-provider builds API request
//   → secure-config resolves HuggingFace URL
//   → single parallel probe fetch for providers
//   → player renders probedSources

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TMDB_EMBED_API_BASE = "https://zetic7z-tmdb-embed-api.hf.space";
const PROBE_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;

interface TmdbEmbedSource {
  url: string;
  quality?: string;
  type: "hls" | "mp4" | "dash";
  provider?: string;
}

interface TmdbEmbedResponse {
  success: boolean;
  sources?: TmdbEmbedSource[];
  subtitles?: Array<{ lang: string; url: string; label?: string }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helper: build the API endpoint for a movie or TV show
// ---------------------------------------------------------------------------

function buildApiUrl(
  type: "movie" | "show",
  tmdbId: string,
  imdbId: string | null,
  season?: number,
  episode?: number,
): string {
  const params = new URLSearchParams({
    tmdb: tmdbId,
    type,
    ...(imdbId ? { imdb: imdbId } : {}),
    ...(season !== undefined ? { season: String(season) } : {}),
    ...(episode !== undefined ? { episode: String(episode) } : {}),
    nexus: "1", // NEXUS identifier flag
  });
  return `${TMDB_EMBED_API_BASE}/api/sources?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Helper: fetch with retry
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-Nexus-Client": "1",
          "X-Nexus-Version": import.meta.env.VITE_APP_VERSION ?? "7.0.0",
        },
      });
      clearTimeout(timeout);
      if (res.ok) return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error("All retries exhausted");
}

// ---------------------------------------------------------------------------
// Helper: map quality string to embed stream quality label
// ---------------------------------------------------------------------------

function normalizeQuality(q?: string): string {
  if (!q) return "Auto";
  const lower = q.toLowerCase();
  if (lower.includes("4k") || lower.includes("2160")) return "4K";
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("480")) return "480p";
  if (lower.includes("360")) return "360p";
  return q;
}

// ---------------------------------------------------------------------------
// Main scrape function
// ---------------------------------------------------------------------------

interface NexusCaption {
  id: string;
  url: string;
  type: "srt" | "vtt";
  hasCorsRestrictions: boolean;
  language: string;
}

interface NexusScrapeResult {
  embeds: unknown[];
  stream?: {
    id?: string;
    type: "hls" | "mp4";
    playlist: string;
    flags: unknown[];
    captions: NexusCaption[];
    qualities?: Record<string, { type: "mp4"; url: string }>;
  };
}

export async function scrapeTmdbProvider(ctx: ScrapeContext): Promise<NexusScrapeResult> {
  const { media } = ctx;
  const isShow = media.type === "show";

  const apiUrl = buildApiUrl(
    isShow ? "show" : "movie",
    media.tmdbId,
    media.imdbId ?? null,
    isShow ? media.season.number : undefined,
    isShow ? media.episode.number : undefined,
  );

  let data: TmdbEmbedResponse;
  try {
    const res = await fetchWithRetry(apiUrl);
    data = (await res.json()) as TmdbEmbedResponse;
  } catch (err) {
    throw new Error(
      `NEXUS TMdb provider: network error — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!data.success || !data.sources?.length) {
    throw new Error(data.error ?? "No sources returned from NEXUS TMdb provider");
  }

  // Pick the best source (prefer HLS, then highest quality)
  const sorted = [...data.sources].sort((a, b) => {
    const typeScore = (t: string) => (t === "hls" ? 2 : t === "mp4" ? 1 : 0);
    return typeScore(b.type) - typeScore(a.type);
  });
  const best = sorted[0]!;

  // Build captions
  const captions = (data.subtitles ?? []).map((sub, i) => ({
    id: `nexus-tmdb-sub-${i}`,
    url: sub.url,
    type: sub.url.endsWith(".srt") ? ("srt" as const) : ("vtt" as const),
    hasCorsRestrictions: false,
    language: sub.lang,
  }));

  if (best.type === "hls") {
    return {
      embeds: [],
      stream: {
        type: "hls",
        playlist: best.url,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    };
  }

  // MP4 fallback: build qualities map from all MP4 sources
  const qualities: Record<string, { type: "mp4"; url: string }> = {};
  for (const src of data.sources.filter((s) => s.type === "mp4")) {
    const q = normalizeQuality(src.quality);
    qualities[q] = { type: "mp4", url: src.url };
  }
  if (!Object.keys(qualities).length) {
    qualities["Auto"] = { type: "mp4", url: best.url };
  }

  return {
    embeds: [],
    stream: {
      type: "mp4",
      playlist: best.url,
      flags: [flags.CORS_ALLOWED],
      captions,
      qualities,
    },
  };
}

// ---------------------------------------------------------------------------
// Provider registration object (compatible with @p-stream/providers structure)
// ---------------------------------------------------------------------------

export const tmdbProvider = makeProviderContext({
  id: "nexus-tmdb",
  name: "NEXUS",
  rank: 900, // Highest priority
  disabled: false,

  async scrape(ctx) {
    return scrapeTmdbProvider(ctx);
  },
});
