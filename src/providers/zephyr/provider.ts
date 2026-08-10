// zephyr/provider.ts
// NEXUS — Zephyr (VidFast 2) provider (Cloudflare Worker encryption toolkit)
// ---------------------------------------------------------------------------
// Worker URL:   https://vidfast.samxerz-zeticuz.workers.dev
//              (deployed with /vc-proxy endpoint for vidfast.vc relay)
//
// The CF Worker handles the crypto (/generate, /decrypt, /route-config).
// All raw vidfast.vc page/API calls route through the app's SAME-ORIGIN
// proxy (/api/vidfast2-vc) — the Vite dev proxy in development and the
// api/vidfast2-vc.js serverless function on Vercel. That proxy injects the
// browser headers vidfast.vc requires (Referer, User-Agent, X-Requested-With)
// and forwards the X-CSRF-Token from route-config.
//
// Flow:
//   1. GET  /api/vidfast2-vc/{movie|tv}/{tmdbId}      → extract site token
//   2. GET  worker/route-config                        → paths + headers
//   3. POST worker/generate                            → encrypted payload
//   4. POST /api/vidfast2-vc/{sp}/{svp}/{payload}     → encrypted servers
//   5. POST worker/decrypt                              → server list
//   6. POST /api/vidfast2-vc/{sp}/{stp}/{data}        → encrypted stream
//   7. POST worker/decrypt                              → {url, tmdbId, tracks}
//   8. Return NEXUS stream object
// ---------------------------------------------------------------------------

import { flags, labelToLanguageCode } from "@nexus/providers";
import { makeProviderContext } from "../shared/makeProviderContext";
import { ScrapeContext } from "../shared/types";

// CF Worker URL — also acts as VC proxy (Cloudflare-to-Cloudflare, avoids
// WAF IP blocks that Vercel's datacenter IPs hit). The worker's responses
// carry no CORS headers, so a direct browser fetch to workers.dev is
// blocked. The Vite dev proxy and the api/vidfast2-worker.js Vercel
// function forward to the worker server-side, which sidesteps CORS entirely.
const WORKER_BASE = "/api/vidfast2-worker";

// Stream proxy — same-origin route (Vite dev proxy or Vercel function)
const STREAM_PROXY = "/api/vidfast2-stream";

// Real domain used only for Referer/Origin headers on stream CDN access
const VIDFAST_REFERER = "https://vidfast.vc";

// ── VC via worker proxy ─────────────────────────────────────────────────
// All raw vidfast.vc calls go through the CF Worker's /vc-proxy endpoint.
// The worker runs on Cloudflare's edge, so vidfast.vc's Cloudflare WAF
// sees a Cloudflare IP (not Vercel's datacenter IP) and doesn't block it.
// Uses ?wp= query-param style (works on both Vite dev proxy and Vercel).
function vcUrl(path: string): string {
  return `${WORKER_BASE}?wp=vc-proxy&path=${encodeURIComponent(path)}`;
}

/** Worker endpoint URL (same-origin, query-param style for Vercel compat). */
function workerUrl(ep: string): string {
  return `${WORKER_BASE}?wp=${ep}`;
}

function makeStreamProxyUrl(url: string, kind: "m3u8-proxy" | "ts-proxy"): string {
  const params = new URLSearchParams({ sp: kind, url });
  params.set(
    "headers",
    JSON.stringify({
      Referer: "https://vidfast.vc/",
      Origin: "https://vidfast.vc",
    }),
  );
  return `${STREAM_PROXY}?${params.toString()}`;
}

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

/** Synchronous access to the cached route config (may be null before fetch). */
function getRouteConfigSync(): RouteConfigResponse | null {
  return _cached && Date.now() - _cachedAt < RC_TTL ? _cached : null;
}

async function getRouteConfig(): Promise<RouteConfigResponse> {
  if (_cached && Date.now() - _cachedAt < RC_TTL) return _cached;
  const r = await fetch(workerUrl("route-config"));
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
  // X-CSRF-Token is required by vidfast.vc's API endpoints. The route-config
  // endpoint returns the current token; attach it to every VC call. The
  // proxy (Vite dev + Vercel) forwards it upstream.
  const route = getRouteConfigSync();
  const csrf =
    (route?.headers as Record<string, string> | undefined)?.["X-CSRF-Token"] ??
    (route?.headers as Record<string, string> | undefined)?.["x-csrf-token"];
  if (csrf && (url.startsWith(WORKER_BASE) || url.startsWith("/api/vidfast2-vc"))) {
    init = {
      ...init,
      headers: { ...(init.headers ?? {}), "X-CSRF-Token": csrf },
    };
  }
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

  // 1. Fetch vidfast.vc page via same-origin proxy to extract site token
  let pagePath: string;
  if (media.type === "show" && media.season && media.episode) {
    pagePath = `/tv/${tmdbId}/${media.season.number}/${media.episode.number}`;
  } else {
    pagePath = `/movie/${tmdbId}`;
  }
  const pageRes = await req(vcUrl(pagePath), {}, 15000, 2);
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
  const gen = await (await req(workerUrl("generate"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteData: rawData }),
  }, 20000)).json();
  if (!gen.success) throw new Error(`VidFast2: /generate: ${gen.error}`);
  const payload = gen.payload;

  // 4. Get encrypted servers from vidfast.vc via same-origin proxy
  const serversRes = await req(vcUrl(`/${staticPath}/${serverPath}/${payload}`), {
    method: "POST",
  });
  if (!serversRes.ok) throw new Error(`VidFast2: servers HTTP ${serversRes.status}`);
  const encServers = await serversRes.text();

  // 5. Decrypt servers
  const decServers = await (await req(workerUrl("decrypt"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: encServers }),
  })).json();
  if (!decServers.success) throw new Error(`VidFast2: /decrypt servers: ${decServers.error}`);
  const servers: Array<{ name: string; description: string; data: string }> = decServers.data;
  if (!Array.isArray(servers) || !servers.length) throw new Error("VidFast2: no servers");

  // 6. Get encrypted stream from vidfast.vc via same-origin proxy
  const best = servers.find((s) => s.name === "vRapid") || servers[0];
  const streamRes = await req(vcUrl(`/${staticPath}/${streamPath}/${best.data}`), {
    method: "POST",
  });
  if (!streamRes.ok) throw new Error(`VidFast2: stream HTTP ${streamRes.status}`);
  const encStream = await streamRes.text();

  // 7. Decrypt stream
  const decStream = await (await req(workerUrl("decrypt"), {
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

  // Mark audio as "Original" — Zephyr's source language varies
  stream.audioTracks = [{
    id: "vidfast2-audio-original",
    label: "🌐 Original",
    language: "und",
    url: videoUrl,
    default: true,
  }];

  return { embeds: [], stream: [stream] };
}

// Pre-fetch route-config on module load so the first scrape doesn't wait.
getRouteConfig().catch(() => { /* best-effort; first scrape will retry */ });

// ---------------------------------------------------------------------------
export const vidfast2Provider = makeProviderContext({
  id: "nexus-vidfast2",
  name: "Zephyr",
  rank: 1330,
  disabled: false,
  async scrape(ctx) {
    try { return await scrapeVidFast2(ctx); }
    catch (e: any) { console.error("Zephyr:", e?.message ?? e); throw e; }
  },
});
