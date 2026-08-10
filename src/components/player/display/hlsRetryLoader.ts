import Hls from "hls.js";
import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { getLoadbalancedProxyUrl } from "@/backend/providers/fetchers";

const DefaultLoader: any = (Hls as any).DefaultConfig.loader;

const ARTEMIS_HOST_RE = /(^|\.)shegu\.net$/i;

function isArtemisUrl(url: string): boolean {
  if (!url) return false;
  try {
    const checkUrl = url.includes("destination=")
      ? decodeURIComponent(new URL(url).searchParams.get("destination") ?? "")
      : url;
    return ARTEMIS_HOST_RE.test(new URL(checkUrl).hostname);
  } catch {
    return false;
  }
}

function bodyText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    if (data.byteLength === 0 || data.byteLength > 4096) return "";
    try {
      return new TextDecoder().decode(new Uint8Array(data));
    } catch {
      return "";
    }
  }
  if (data instanceof Uint8Array) {
    if (data.byteLength === 0 || data.byteLength > 4096) return "";
    try {
      return new TextDecoder().decode(data);
    } catch {
      return "";
    }
  }
  return "";
}

function looksLike403Body(t: string): boolean {
  if (!t) return false;
  if (/#EXTM3U/.test(t)) return false;
  return /\b403\b/.test(t) || /forbidden/i.test(t);
}

// VidFast2's stream proxy rewrites media segments to /ts-proxy. These URLs
// are already CORS-safe; wrapping them in the generic destination proxy
// causes the observed 403. Keep this exception narrowly scoped to VidFast2.
function isEncryptedSiteSegmentProxy(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      /^\/api\/(vidfast2)-stream\/ts-proxy$/.test(
        parsed.pathname,
      ) ||
      (parsed.hostname === "pstream.dovetechnology.org" &&
        parsed.pathname === "/ts-proxy")
    );
  } catch {
    return false;
  }
}

const MAX_RETRIES = 12;
const BASE_DELAY = 250;
const MAX_DELAY = 3000;

// The TMDB-Embed backend rewrites every HLS segment to its own /ts-proxy and
// serves CORS `*`, so those URLs are already playable straight — wrapping
// them in the generic destination proxy breaks playback.
//
// The embed backend rewrites segment lines but leaves EXT-X-MAP init URIs
// raw (e.g. https://paperzebra.top/.../init-s1080p-v1-a1.mp4). Those raw CDN
// hosts require a Referer (403 without), and the generic destination proxy
// also 403s on them. The embed backend's own /ts-proxy forwards the proper
// Referer and serves CORS `*` — so rewrite raw init URLs through it, exactly
// like the backend rewrites segments.
const EMBED_RAW_CDN_HOSTS = ["paperzebra.top"];
const EMBED_PROXY_BASE = "https://stycanine1-tmdb-embed-api.hf.space";

function isAlreadyProxiedHlsUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes("m3u8-proxy") || url.includes("ts-proxy")) return true;
  try {
    const host = new URL(url).hostname;
    return host.endsWith("stycanine1-tmdb-embed-api.hf.space");
  } catch {
    return false;
  }
}

// VidFast2 CDN hosts (Zephyr provider). These hosts serve HLS segments that
// require a Referer of https://vidfast.vc/ — the generic destination proxy
// 403s on them. Route through the same-origin /api/vidfast2-stream/ts-proxy
// which rewrites the Referer correctly.
const VIDFAST2_CDN_HOSTS = [
  "brightmoss.top",
  "moon.ironwallnet.net",
  "housestrong.site",
];

function rewriteVidfast2CdnUrl(url: string): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const isVf2 = VIDFAST2_CDN_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
    if (!isVf2) return null;
    const params = new URLSearchParams({ url });
    params.set(
      "headers",
      JSON.stringify({
        Referer: "https://vidfast.vc/",
        Origin: "https://vidfast.vc",
      }),
    );
    return `/api/vidfast2-stream/ts-proxy?${params.toString()}`;
  } catch {
    return null;
  }
}

// EXT-X-MAP init segments (and any other leftover raw segment) on embed CDN
// hosts get proxied through the embed backend's /ts-proxy so the Referer the
// CDN requires is attached and CORS is served.
function rewriteRawEmbedCdnUrl(url: string): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const isRawEmbedHost = EMBED_RAW_CDN_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
    if (!isRawEmbedHost) return null;
    const params = new URLSearchParams({ url });
    params.set(
      "headers",
      JSON.stringify({
        Referer: "https://vidcore.net/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      }),
    );
    return `${EMBED_PROXY_BASE}/ts-proxy?${params.toString()}`;
  } catch {
    return null;
  }
}

export class ArtemisRetryLoader extends DefaultLoader {
  private _retryTimer?: ReturnType<typeof setTimeout>;

  load(context: any, config: any, callbacks: any): void {
    let url: string = context?.url ?? "";

    // VidFast2 CDN segments (Zephyr) must go through the same-origin
    // stream proxy — it attaches the required Referer and serves CORS.
    const vf2Proxied = rewriteVidfast2CdnUrl(url);
    if (vf2Proxied) {
      context.url = vf2Proxied;
      url = vf2Proxied;
    }

    // Raw embed-CDN URLs (EXT-X-MAP init segments) must go through the embed
    // backend's /ts-proxy — it attaches the required Referer and serves CORS.
    if (!vf2Proxied) {
      const embedProxied = rewriteRawEmbedCdnUrl(url);
      if (embedProxied) {
        context.url = embedProxied;
        url = embedProxied;
      }
    }

    if (
      !vf2Proxied &&
      !isExtensionActiveCached() &&
      !isEncryptedSiteSegmentProxy(url) &&
      !isAlreadyProxiedHlsUrl(url)
    ) {
      const proxyBase = getLoadbalancedProxyUrl();
      if (proxyBase && url && !url.includes("destination=")) {
        context.url = `${proxyBase}?destination=${encodeURIComponent(url)}`;
        url = context.url;
      }
    }

    if (!isArtemisUrl(url)) {
      super.load(context, config, callbacks);
      return;
    }

    const originalSuccess = callbacks.onSuccess;
    let attempts = 0;
    let delay = BASE_DELAY;

    const guardedSuccess = (response: any, stats: any, ctx: any, net: any) => {
      const txt = bodyText(response?.data);
      if (looksLike403Body(txt) && attempts < MAX_RETRIES) {
        attempts += 1;
        const wait = delay;
        delay = Math.min(delay * 2, MAX_DELAY);
        this._retryTimer = setTimeout(() => {
          this._retryTimer = undefined;
          super.load(context, config, { ...callbacks, onSuccess: guardedSuccess });
        }, wait);
        return;
      }
      originalSuccess(response, stats, ctx, net);
    };

    super.load(context, config, { ...callbacks, onSuccess: guardedSuccess });
  }

  abort(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    super.abort();
  }

  destroy(): void {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    super.destroy();
  }
}
