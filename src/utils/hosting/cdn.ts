// Provider URLs are already resolved by the TMDB-Embed backend. Keep the
// exact URL, including its signed query string, all the way to the player.
export function processCdnLink(url: string): string {
  return url;
}

const SAME_ORIGIN_PROXY_PATH = "/api/stream-proxy";

export type SameOriginProxyKind = "m3u8-proxy" | "ts-proxy" | "sub-proxy";

export function createSameOriginStreamProxyUrl(
  url: string,
  headers: Record<string, string> = {},
  kind: SameOriginProxyKind = "m3u8-proxy",
): string {
  const params = new URLSearchParams({
    sp: kind,
    url,
  });
  if (Object.keys(headers).length > 0) {
    params.set("headers", JSON.stringify(headers));
  }
  return `${SAME_ORIGIN_PROXY_PATH}?${params.toString()}`;
}

export function isSameOriginStreamProxyUrl(url: string): boolean {
  try {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, origin);
    return parsed.origin === origin &&
      parsed.pathname === SAME_ORIGIN_PROXY_PATH &&
      (parsed.searchParams.get("sp") === "m3u8-proxy" ||
        parsed.searchParams.get("sp") === "ts-proxy" ||
        parsed.searchParams.get("sp") === "sub-proxy");
  } catch {
    return false;
  }
}
