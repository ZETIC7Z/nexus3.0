// vidfast2-provider.ts
// NEXUS — VidFast 2 provider (Cloudflare Worker encryption toolkit)
// ---------------------------------------------------------------------------
// Worker URL:   /api/vidfast2-worker  (Vite proxy → samxerz-zeticuz.workers.dev)
// VidFast API:  /api/vidfast2-vc      (Vite proxy → vidfast.vc)
//
// All external requests go through Vite's server-side proxy to avoid CORS.
// The provider makes same-origin calls only — no cross-origin fetch.
//
// Flow:
//   1. GET  /api/vidfast2-vc/{movie|tv}/{tmdbId}  → extract site token
//   2. GET  /api/vidfast2-worker/route-config      → paths + headers
//   3. POST /api/vidfast2-worker/generate          → encrypted payload
//   4. POST /api/vidfast2-vc/{sp}/{sp}/{payload}   → encrypted servers
//   5. POST /api/vidfast2-worker/decrypt            → server list
//   6. POST /api/vidfast2-vc/{sp}/{stp}/{data}     → encrypted stream
//   7. POST /api/vidfast2-worker/decrypt            → {url, tmdbId, tracks}
//   8. Return NEXUS stream object
// ---------------------------------------------------------------------------

import { flags, labelToLanguageCode } from "@nexus/providers";
import { makeProviderContext } from "./makeProviderContext";
import { getProxiedUrl } from "./proxiedFetch";
import { ScrapeContext } from "./types";

// Worker & stream proxies always use same-origin routes (work on both Vite dev and Vercel).
const WORKER_PROXY = "/api/vidfast2-worker";
const STREAM_PROXY = "/api/vidfast2-stream";

// VC calls need browser-emulation headers. In dev, Vite proxy injects them.
// In production (Vercel), Cloudflare blocks datacenter IPs so we can't proxy
// VC calls through Vercel functions. Instead, route them through the user's
// configured CORS proxy which uses residential IPs.
const VIDFAST_VC_BASE = "https://vidfast.vc";
const VC_HEADERS: Record<string, string> = {
  "Accept": "*/*",
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
  "Referer": "https://vidfast.vc/",
  "X-Requested-With": "XMLHttpRequest",
};

function vcUrl(path: string): string {
  if (import.meta.env.DEV) {
    // Vite proxy injects VC_HEADERS server-side.
    return `/api/vidfast2-vc${path}`;
  }
  // Production: route through the CORS proxy to bypass Cloudflare.
  return getProxiedUrl(`${VIDFAST_VC_BASE}${path}`);
}

function makeStreamProxyUrl(url: string, kind: "m3u8-proxy" | "ts-proxy"): string {
  const params = new URLSearchParams({ url });
  params.set(
    "headers",
    JSON.stringify({
      Referer: "https://vidfast.vc/",
      Origin: "https://vidfast.vc",
    }),
  );
  return `${STREAM_PROXY}/${kind}?${params.toString()}`;
}

// Real domain used only for Referer/Origin headers on stream CDN access
const VIDFAST_REFERER = "https://vidfast.vc";

// ---------------------------------------------------------------------------
// Route-config cache (30 min TTL)
// ---------------------------------------------------------------------------
interface RouteConfig {
  staticPath: string;
  serverPath: string;
  streamPath: string;
}
interface RouteConfigResponse {
  success: boolean;
  data: RouteConfig;
  headers: Record<string, string>;
}

let _cached: RouteConfigResponse | null = null;
let _cachedAt = 0;
const RC_TTL = 30 * 60_000;

async function getRouteConfig(): Promise<RouteConfigResponse> {
  if (_cached && Date.now() - _cachedAt < RC_TTL) return _cached;
  const r = await fetch(`${WORKER_PROXY}/route-config`);
  if (!r.ok) throw new Error(`VidFast2: route-config HTTP ${r.status}`);
  const j = await r.json();
  if (!j.success) throw new Error(`VidFast2: route-config: ${j.error}`);
  _cached = {
    success: j.success,
    data: {
      staticPath: j.data.static_path,
      serverPath: j.data.server_path,
      streamPath: j.data.stream_path,
    },
    headers: j.headers ?? {},
  };
  _cachedAt = Date.now();
  return _cached;
}

// ---------------------------------------------------------------------------
// HTTP helper — plain browser fetch to same-origin proxy URLs
// ---------------------------------------------------------------------------
async function req(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
  retries = 0,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const method = (init.method ?? "GET").toUpperCase();
      const requestUrl =
        attempt > 0 && method === "GET"
          ? `${url}${url.includes("?") ? "&" : "?"}vf2_retry=${Date.now()}-${attempt}`
          : url;
      const response = await fetch(requestUrl, {
        ...init,
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (
        attempt < retries &&
        (response.status === 403 || response.status === 429)
      ) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 350 * (attempt + 1));
        });
        continue;
      }
      return response;
    } finally {
      clearTimeout(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Scrape
// ---------------------------------------------------------------------------
async function scrapeVidFast2(ctx: ScrapeContext) {
  const { media } = ctx;
  const tmdbId = media.tmdbId;

  // 1. Fetch vidfast.vc page via proxy to extract site token
  let pagePath: string;
  if (media.type === "show" && media.season && media.episode) {
    pagePath = `/tv/${tmdbId}/${media.season.number}/${media.episode.number}`;
  } else {
    pagePath = `/movie/${tmdbId}`;
  }
  const pageRes = await req(
    vcUrl(pagePath),
    {
      headers: import.meta.env.DEV
        ? { Accept: "*/*", "Cache-Control": "no-cache", Pragma: "no-cache" }
        : { ...VC_HEADERS },
    },
    15000,
    2,
  );
  if (!pageRes.ok) throw new Error(`VidFast2: page HTTP ${pageRes.status}`);
  const html = await pageRes.text();

  const tokenMatch =
    html.match(/\\"en\\":\\"(.*?)\\"/) ??
    html.match(/"en":"(.*?)"/);
  if (!tokenMatch) throw new Error("VidFast2: could not extract site token");
  const rawData = tokenMatch[1];

  // 2. Route config (cached)
  const cfg = await getRouteConfig();
  const { staticPath, serverPath, streamPath } = cfg.data;

  // 3. Generate payload
  const gen = await (await req(`${WORKER_PROXY}/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteData: rawData }),
  }, 20000)).json();
  if (!gen.success) throw new Error(`VidFast2: /generate: ${gen.error}`);
  const payload = gen.payload;

  // 4. Get encrypted servers from vidfast.vc (Vite proxy injects Referer/UA/X-Requested-With)
  const serversRes = await req(vcUrl(`/${staticPath}/${serverPath}/${payload}`), {
    method: "POST",
    headers: import.meta.env.DEV ? {} : { ...VC_HEADERS },
  });
  if (!serversRes.ok) throw new Error(`VidFast2: servers HTTP ${serversRes.status}`);
  const encServers = await serversRes.text();

  // 5. Decrypt servers
  const decServers = await (await req(`${WORKER_PROXY}/decrypt`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: encServers }),
  })).json();
  if (!decServers.success) throw new Error(`VidFast2: /decrypt servers: ${decServers.error}`);
  const servers: Array<{ name: string; description: string; data: string }> = decServers.data;
  if (!Array.isArray(servers) || !servers.length) throw new Error("VidFast2: no servers");

  // 6. Get encrypted stream (Vite proxy injects Referer/UA/X-Requested-With)
  const best = servers.find((s) => s.name === "vRapid") || servers[0];
  const streamRes = await req(vcUrl(`/${staticPath}/${streamPath}/${best.data}`), {
    method: "POST",
    headers: import.meta.env.DEV ? {} : { ...VC_HEADERS },
  });
  if (!streamRes.ok) throw new Error(`VidFast2: stream HTTP ${streamRes.status}`);
  const encStream = await streamRes.text();

  // 7. Decrypt stream
  const decStream = await (await req(`${WORKER_PROXY}/decrypt`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: encStream }),
  })).json();
  if (!decStream.success) throw new Error(`VidFast2: /decrypt stream: ${decStream.error}`);
  const streamData = decStream.data;
  if (!streamData?.url) throw new Error("VidFast2: no stream URL");

  const videoUrl: string = streamData.url;

  // 8. Build NEXUS stream
  const isHls = videoUrl.includes(".m3u8");
  const stream: any = {
    id: "nexus-vidfast2-stream",
    type: isHls ? "hls" : "file",
    flags: [flags.CORS_ALLOWED],
    captions: [],
    headers: { Referer: `${VIDFAST_REFERER}/`, Origin: VIDFAST_REFERER },
    skipValidation: true,
  };

  if (Array.isArray(streamData.tracks)) {
    stream.captions = streamData.tracks
      .filter((t: any) => t.file && t.label)
      .map((t: any) => ({
        id: `vidfast2-${t.label}`,
        language: labelToLanguageCode(t.label) || t.label || "unknown",
        url: makeStreamProxyUrl(t.file, "ts-proxy"),
        type: t.file.includes(".vtt") ? "vtt" : "srt",
        needsProxy: false, opensubtitles: false,
        display: t.label, source: "vidfast2",
      }));
  }

  if (isHls) {
    // processCdnLink/hlsRetryLoader normally wrap external URLs in a generic
    // destination proxy. That proxy returns 403 for this CDN, so use the
    // VidFast2-only same-origin stream route instead. The Vite route forwards
    // the request to the configured M3U8 proxy with the required headers.
    stream.playlist = makeStreamProxyUrl(videoUrl, "m3u8-proxy");
  } else {
    stream.qualities = { unknown: { type: "mp4", url: videoUrl } };
  }

  return { embeds: [], stream: [stream] };
}

// ---------------------------------------------------------------------------
export const vidfast2Provider = makeProviderContext({
  id: "nexus-vidfast2",
  name: "Zephyr 🔥",
  rank: 1310,
  disabled: false,
  async scrape(ctx) {
    try { return await scrapeVidFast2(ctx); }
    catch (e: any) { console.error("Zephyr:", e?.message ?? e); throw e; }
  },
});
