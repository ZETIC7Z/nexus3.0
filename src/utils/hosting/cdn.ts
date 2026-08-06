import { conf } from "@/setup/config";
import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { getLoadbalancedProxyUrl } from "@/backend/providers/fetchers";

export function processCdnLink(url: string): string {
  if (!url) return url;

  let processedUrl = url;
  try {
    const parsedUrl = new URL(url);
    const replacements = conf().CDN_REPLACEMENTS;
    for (const [before, after] of replacements) {
      if (parsedUrl.hostname.endsWith(before)) {
        parsedUrl.hostname = after;
        parsedUrl.port = "";
        parsedUrl.protocol = "https:";
        processedUrl = parsedUrl.toString();
        break;
      }
    }
  } catch (e) {
    return url;
  }

  // If extension is not active, route third-party URLs through the CORS proxy worker
  if (!isExtensionActiveCached()) {
    try {
      const parsedUrl = new URL(processedUrl);
      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
      const isMovieBoxDomain = 
        parsedUrl.hostname.endsWith("hakunaymatata.com") || 
        parsedUrl.hostname.endsWith("aoneroom.com");
      // TMDB-Embed stream URLs are ALREADY proxied (m3u8-proxy / ts-proxy on
      // the embed backend, which rewrites every segment and serves CORS `*`).
      // Wrapping them in the destination proxy would add a pointless hop, so
      // let them play straight like the moviebox domains.
      const isAlreadyProxiedEmbedUrl =
        processedUrl.includes("/m3u8-proxy?url=") ||
        processedUrl.includes("/ts-proxy?url=") ||
        parsedUrl.hostname.endsWith("stycanine1-tmdb-embed-api.hf.space");

      if (
        parsedUrl.origin !== currentOrigin &&
        !parsedUrl.hostname.includes("localhost") &&
        !parsedUrl.hostname.includes("127.0.0.1") &&
        !isMovieBoxDomain &&
        !isAlreadyProxiedEmbedUrl
      ) {
        const proxyBase = getLoadbalancedProxyUrl();
        if (proxyBase) {
          return `${proxyBase}?destination=${encodeURIComponent(processedUrl)}`;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return processedUrl;
}
