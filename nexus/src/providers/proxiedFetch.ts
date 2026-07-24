import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { getLoadbalancedProxyUrl } from "@/backend/providers/fetchers";

export function getProxiedUrl(url: string): string {
  // Treat as local: relative paths, localhost, OR any /nexus-* proxy route
  // (nexus-* routes are handled server-side by Vite proxy — no CORS proxy needed)
  const isLocal =
    url.startsWith("/") ||
    url.startsWith("./") ||
    url.startsWith("../") ||
    url.includes("localhost") ||
    url.includes("127.0.0.1");

  if (isLocal) return url;

  if (!isExtensionActiveCached()) {
    const proxyBase = getLoadbalancedProxyUrl();
    if (proxyBase && url && !url.includes("destination=")) {
      return `${proxyBase}?destination=${encodeURIComponent(url)}`;
    }
  }
  return url;
}

