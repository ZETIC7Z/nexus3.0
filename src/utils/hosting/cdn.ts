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

      if (
        parsedUrl.origin !== currentOrigin &&
        !parsedUrl.hostname.includes("localhost") &&
        !parsedUrl.hostname.includes("127.0.0.1") &&
        !isMovieBoxDomain
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
