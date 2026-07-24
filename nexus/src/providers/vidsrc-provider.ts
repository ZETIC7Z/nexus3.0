// vidsrc-provider.ts
// NEXUS — VidSrc Provider (self-hosted scraper via Vite proxy)
// ---------------------------------------------------------------------------
// The vidsrc scraper runs as a Docker container on localhost:3000.
// In dev: Vite proxies /nexus-vidsrc → http://localhost:3000  (vite.config.mts)
// In prod: Set VITE_VIDSRC_API_URL to your VPS URL (e.g. https://vidsrc.yourvps.com)
// ---------------------------------------------------------------------------

import { makeProviderContext } from "@/providers/makeProviderContext";
import { flags } from "@nexus/providers";

// Use Vite dev proxy path (/nexus-vidsrc) in development so the browser
// never makes a cross-origin request to localhost:3000 directly.
// In production, VITE_VIDSRC_API_URL points to your VPS.
const VIDSRC_BASE: string =
  (import.meta.env.VITE_VIDSRC_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "/nexus-vidsrc";

interface VidSrcResult {
  hls_url: string | null;
  subtitles: string[];
  error: string | null;
}

interface VidSrcResponse {
  success: boolean;
  results: Record<string, VidSrcResult>;
}

async function fetchVidSrc(ctx: any): Promise<VidSrcResult> {
  const { media } = ctx;
  const mediaType = media.type === "show" ? "tv" : "movie";
  const tmdbId = String(media.tmdbId);
  const season = media.type === "show" ? media.season?.number : undefined;
  const episode = media.type === "show" ? media.episode?.number : undefined;

  const params = new URLSearchParams({ type: mediaType, tmdb_id: tmdbId });
  if (season !== undefined) params.set("season", String(season));
  if (episode !== undefined) params.set("episode", String(episode));

  const url = `${VIDSRC_BASE}/extract?${params.toString()}`;
  console.log(`[vidsrc] → ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`VidSrc scraper HTTP ${res.status}`);

  const json = (await res.json()) as VidSrcResponse;
  const providerResults = Object.values(json.results ?? {}) as VidSrcResult[];

  for (const r of providerResults) {
    if (r?.hls_url) {
      console.log(`[vidsrc] ✅ HLS found: ${r.hls_url.slice(0, 80)}...`);
      return { hls_url: r.hls_url, subtitles: r.subtitles ?? [], error: null };
    }
  }

  throw new Error("VidSrc: no HLS URL from any provider");
}

export const vidsrcProvider = makeProviderContext({
  id: "nexus-vidsrc",
  name: "VidSrc 🔗",
  rank: 900,
  disabled: false,
  async scrape(ctx) {
    const result = await fetchVidSrc(ctx);
    return {
      embeds: [],
      stream: [
        {
          id: "vidsrc-hls",
          type: "hls",
          playlist: `${VIDSRC_BASE}/m3u8-proxy?url=${encodeURIComponent(result.hls_url!)}`,
          flags: [flags.CORS_ALLOWED],
          captions: result.subtitles.map((sub, i) => ({
            id: `vidsrc-sub-${i}`,
            url: sub,
            type: "vtt",
            hasCorsRestrictions: false,
          })),
          skipValidation: true,
        },
      ],
    };
  },
});
