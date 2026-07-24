// vidfast-provider.ts
// NEXUS — VidFast Provider (enc-dec.app encryption)
// VidFast: https://vidfast.pro/<encrypted>
// Encryption: GET https://enc-dec.app/api/enc-vidfast?text=<TEXT>

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

const ENC_DEC_BASE = "https://enc-dec.app/api";
const VIDFAST_BASE = "https://vidfast.pro";
const TIMEOUT = 12000;

async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface VidfastSource {
  url: string;
  quality: string;
  type?: string;
}

interface VidfastApiResponse {
  success: boolean;
  sources?: VidfastSource[];
  subtitles?: Array<{ url: string; lang: string }>;
}

export async function scrapeVidfast(ctx: ScrapeContext) {
  const { media } = ctx;
  const isShow = media.type === "show";

  // Build the raw identifier string that VidFast uses
  const rawId = isShow
    ? `tv-${media.tmdbId}-s${media.season.number}-e${media.episode.number}`
    : `movie-${media.tmdbId}`;

  // Step 1: Encrypt the identifier
  const encResult = await fetchJson<{ result: string }>(
    `${ENC_DEC_BASE}/enc-vidfast?text=${encodeURIComponent(rawId)}`,
  );
  if (!encResult.result) throw new Error("VidFast: encryption failed");

  // Step 2: Fetch video data
  const apiUrl = `${VIDFAST_BASE}/${encResult.result}`;
  const data = await fetchJson<VidfastApiResponse>(apiUrl);

  if (!data.success || !data.sources?.length) {
    throw new Error("VidFast: no sources found");
  }

  // Build qualities map for MP4 sources
  const qualities: Record<string, { type: "mp4"; url: string }> = {};
  const hlsSrc = data.sources.find((s) => s.url.includes(".m3u8"));

  for (const src of data.sources.filter((s) => !s.url.includes(".m3u8"))) {
    const q = src.quality ?? "Auto";
    qualities[q] = { type: "mp4", url: src.url };
  }

  // Captions
  const captions = (data.subtitles ?? []).map((sub, i) => ({
    id: `vidfast-cap-${i}`,
    url: sub.url,
    type: sub.url.endsWith(".srt") ? ("srt" as const) : ("vtt" as const),
    hasCorsRestrictions: false,
    language: sub.lang?.slice(0, 2) ?? "en",
  }));

  if (hlsSrc) {
    return {
      embeds: [],
      stream: {
        type: "hls" as const,
        playlist: hlsSrc.url,
        flags: [flags.CORS_ALLOWED],
        captions,
      },
    };
  }

  const firstSrc = data.sources[0]!;
  return {
    embeds: [],
    stream: {
      type: "mp4" as const,
      playlist: firstSrc.url,
      flags: [flags.CORS_ALLOWED],
      captions,
      qualities,
    },
  };
}

export const vidfastProvider = makeProviderContext({
  id: "nexus-vidfast",
  name: "VidFast",
  rank: 830,
  disabled: false,
  async scrape(ctx) {
    return scrapeVidfast(ctx);
  },
});
