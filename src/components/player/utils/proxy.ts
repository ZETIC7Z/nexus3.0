import { getLoadbalancedM3U8ProxyUrl } from "@/backend/providers/fetchers";
import { getM3U8ProxyUrls } from "@/utils/hosting/proxyUrls";
import {
  isOriginDead,
  markOriginNetworkDead,
  markOriginTimeout,
  markOriginHealthy,
} from "@/utils/common/originHealth";

function normalizedBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function getEnabledProxyUrls(): string[] {
  const configured = getM3U8ProxyUrls().map(normalizedBaseUrl).filter(Boolean);
  if (typeof localStorage === "undefined") return configured;

  const enabledProxies = localStorage.getItem("m3u8-proxy-enabled");
  if (!enabledProxies) return configured;

  try {
    const enabled = JSON.parse(enabledProxies) as Record<string, boolean>;
    return configured
      .filter((_url, index) => enabled[index.toString()] !== false)
      .filter((url) => !isProxyOriginDead(url));
  } catch {
    return configured.filter((url) => !isProxyOriginDead(url));
  }
}

/**
 * A proxy origin remembered as dead (CORS/DNS refused from this device,
 * see originHealth) is skipped everywhere proxies are picked. Probes and
 * playback report outcomes so the memory stays accurate.
 */
export function isProxyOriginDead(url: string): boolean {
  return isOriginDead(url);
}

export function reportProxyFailure(url: string, kind: "network" | "timeout") {
  if (kind === "network") markOriginNetworkDead(url);
  else markOriginTimeout(url);
}

export function reportProxySuccess(url: string) {
  markOriginHealthy(url);
}

function buildM3U8ProxyUrl(
  proxyBaseUrl: string,
  url: string,
  headers: Record<string, string>,
): string {
  const params = new URLSearchParams({
    url,
  });
  if (Object.keys(headers).length > 0) {
    params.set("headers", JSON.stringify(headers));
  }
  return `${normalizedBaseUrl(proxyBaseUrl)}/m3u8-proxy?${params.toString()}`;
}

/**
 * Creates a proxied M3U8 URL using the configured P-Stream/simple-proxy
 * service. The proxy rewrites variant playlists and segment URLs, so the
 * browser never has to make cross-origin HLS requests to the CDN.
 */
export function createM3U8ProxyUrl(
  url: string,
  headers: Record<string, string> = {},
): string {
  if (!url || isUrlAlreadyProxied(url)) return url;

  let proxyBaseUrl: string | null = getLoadbalancedM3U8ProxyUrl();
  if (proxyBaseUrl && isProxyOriginDead(proxyBaseUrl)) {
    // Previously-failed proxy - transparently fall back to a healthy one.
    proxyBaseUrl =
      getEnabledProxyUrls().find((base) => !isProxyOriginDead(base)) ?? null;
  }
  if (!proxyBaseUrl) {
    // Fires per stream otherwise - a stale-config setup would spam the
    // console once per candidate URL. Warn a single time instead.
    if (!(window as any).__nexusWarnedNoM3U8Proxy) {
      (window as any).__nexusWarnedNoM3U8Proxy = true;
      console.warn("No M3U8 proxy URLs available in configuration");
    }
    return url;
  }

  return buildM3U8ProxyUrl(proxyBaseUrl, url, headers);
}

/**
 * Return every enabled configured proxy in stable order. The currently
 * load-balanced proxy is tried first, followed by the remaining proxies.
 */
export function createM3U8ProxyUrls(
  url: string,
  headers: Record<string, string> = {},
): string[] {
  if (!url) return [];
  if (isUrlAlreadyProxied(url)) return [url];

  const configured = getEnabledProxyUrls();
  const selected = getLoadbalancedM3U8ProxyUrl();
  const ordered = selected
    ? [normalizedBaseUrl(selected), ...configured]
    : configured;
  const uniqueBases = [
    ...new Set(ordered.filter((base) => !isProxyOriginDead(base))),
  ];

  return uniqueBases.map((base) => buildM3U8ProxyUrl(base, url, headers));
}

/**
 * TODO: Creates a proxied MP4 URL for MP4 streams.
 * MP4 playback normally works through a regular URL; header-dependent files
 * use the application's same-origin stream proxy instead.
 */
export function createMP4ProxyUrl(
  url: string,
  _headers: Record<string, string> = {},
): string {
  return url;
}

/**
 * Checks whether a URL is already routed through a known HLS proxy.
 */
export function isUrlAlreadyProxied(url: string): boolean {
  if (!url) return false;

  if (
    url.includes("/m3u8-proxy?url=") ||
    url.includes("/ts-proxy?url=") ||
    url.includes("/?destination=")
  ) {
    return true;
  }

  const proxyUrls = getM3U8ProxyUrls().map(normalizedBaseUrl);
  return proxyUrls.some(
    (proxyUrl) => url === proxyUrl || url.startsWith(`${proxyUrl}/`),
  );
}
