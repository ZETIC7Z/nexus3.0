// vidlink-provider.ts
// NEXUS — VidLink Provider (enc-dec.app encrypted API)
// VidLink API: https://vidlink.pro/api/b/<encrypted_id>
// Encryption endpoint: https://enc-dec.app/api/enc-vidlink?text=<TMDB_ID>

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

const ENC_DEC_BASE = "https://enc-dec.app/api";
const VIDLINK_API = "https://vidlink.pro/api/b";
const REQUEST_TIMEOUT = 10000;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface VidLinkSource {
  file: string;
  type: string;
  label?: string;
}

interface VidLinkResponse {
  success: boolean;
  data?: {
    sources?: VidLinkSource[];
    tracks?: Array<{ file: string; kind: string; label?: string; default?: boolean }>;
  };
  sources?: VidLinkSource[];
}

export async function scrapeVidLink(ctx: ScrapeContext) {
  const { media } = ctx;
  const isShow = media.type === "show";
  const tmdbId = media.tmdbId;

  // Step 1: Encrypt the TMDB ID
  const encResult = await fetchJson<{ result: string }>(
    `${ENC_DEC_BASE}/enc-vidlink?text=${tmdbId}`,
  );
  if (!encResult.result) throw new Error("VidLink: encryption failed");

  // Step 2: Build API URL
  const apiPath = isShow
    ? `${encResult.result}?season=${media.season.number}&episode=${media.episode.number}`
    : encResult.result;

  // Step 3: Fetch video data
  const data = await fetchJson<VidLinkResponse>(`${VIDLINK_API}/${apiPath}`);
  const sources = data.data?.sources ?? data.sources ?? [];
  if (!sources.length) throw new Error("VidLink: no sources found");

  // Pick best source (prefer m3u8/hls)
  const hlsSrc = sources.find((s) => s.type?.includes("hls") || s.file?.includes(".m3u8"));
  const best = hlsSrc ?? sources[0]!;

  // Build captions
  const tracks = data.data?.tracks ?? [];
  const captions = tracks
    .filter((t) => t.kind === "subtitles" || t.kind === "captions")
    .map((t, i) => ({
      id: `vidlink-cap-${i}`,
      url: t.file,
      type: t.file.endsWith(".srt") ? ("srt" as const) : ("vtt" as const),
      hasCorsRestrictions: false,
      language: t.label?.toLowerCase().slice(0, 2) ?? "en",
    }));

  return {
    embeds: [],
    stream: {
      type: best.file.includes(".m3u8") ? ("hls" as const) : ("mp4" as const),
      playlist: best.file,
      flags: [flags.CORS_ALLOWED],
      captions,
    },
  };
}

export const vidlinkProvider = makeProviderContext({
  id: "nexus-vidlink",
  name: "VidLink",
  rank: 850,
  disabled: false,
  async scrape(ctx) {
    return scrapeVidLink(ctx);
  },
});
