// embeds/shared.ts
// NEXUS - TMDB-Embed provider family.
// The HF aggregate endpoint is the source of truth for playback and downloads.
// Stream URLs are passed to the player unchanged.

import { flags, NotFoundError } from "@nexus/providers";

import { createSameOriginStreamProxyUrl, isSameOriginStreamProxyUrl } from "@/utils/hosting/cdn";
import {
  createM3U8ProxyUrl,
  createM3U8ProxyUrls,
  isUrlAlreadyProxied,
  isProxyOriginDead,
  reportProxyFailure,
  reportProxySuccess,
} from "@/components/player/utils/proxy";

import { makeProviderContext } from "../shared/makeProviderContext";
import { ScrapeContext } from "../shared/types";

const configuredEmbedUrl =
  (import.meta.env.VITE_TMDB_EMBED_URL as string | undefined) ??
  (import.meta.env.VITE_TMDB_EMBED_API_URL as string | undefined);

export const EMBED_API_BASE = (
  configuredEmbedUrl ?? "https://stycanine1-tmdb-embed-api.hf.space"
).replace(/\/$/, "");

// The aggregate endpoint invokes several upstream providers, so it needs more
// time than a normal single-provider request.
export const EMBED_REQUEST_TIMEOUT = 45_000;
export const PROBE_TIMEOUT = 8_000;
export const AGGREGATE_CACHE_TTL = 90_000;

// Yamie - movie-only direct endpoint (no HF backend).
// Movies resolve to https://media.vidrift.in/movie_{tmdbId}/vod.m3u8.
const YAMIE_PROVIDER_ID = "yamie";
const YAMIE_STREAM_BASE = "https://media.vidrift.in";

export function buildYamieStreamUrl(tmdbId: string): string {
  return `${YAMIE_STREAM_BASE}/movie_${encodeURIComponent(tmdbId)}/vod.m3u8`;
}

function yamieResponseFor(media: EmbedMediaRequest): EmbedApiResponse {
  if (media.type !== "movie") {
    return { success: true, provider: YAMIE_PROVIDER_ID, streams: [] };
  }
  return {
    success: true,
    provider: YAMIE_PROVIDER_ID,
    streams: [
      {
        id: `yamie-${media.tmdbId}`,
        name: "Yamie",
        title: "Yamie",
        url: buildYamieStreamUrl(media.tmdbId),
        quality: "auto",
        type: "hls",
        provider: YAMIE_PROVIDER_ID,
      },
    ],
  };
}

export interface EmbedSubtitle {
  url: string;
  lang?: string;
  label?: string;
  id?: string;
}
export interface EmbedStreamItem {
  id?: string;
  name?: string;
  server?: string;
  title?: string;
  url: string;
  quality?: string;
  type?: string;
  provider?: string;
  headers?: Record<string, string>;
  preferredHeaders?: Record<string, string>;
  subtitles?: EmbedSubtitle[];
  size?: string;
  proxied?: boolean;
  delivery?: string;
}
export interface EmbedApiResponse {
  success: boolean;
  error?: string;
  provider?: string;
  count?: number;
  providerTimings?: Record<string, number | null>;
  streams?: EmbedStreamItem[];
}
export interface NexusProviderDef {
  id: string;
  name: string;
  playable: boolean;
  anime?: boolean;
  /** Provider only offers streams for movies; hidden for TV shows. */
  moviesOnly?: boolean;
  rank: number;
}
export interface EmbedMediaRequest {
  tmdbId: string;
  type: "movie" | "show";
  title?: string;
  releaseYear?: number;
  imdbId?: string;
  season?: { number: number };
  episode?: { number: number };
}
// hdghartv is intentionally omitted because it is not working upstream.
export const NEXUS_PROVIDER_CATALOG: NexusProviderDef[] = [
  { id: "anikoto", name: "AniKoto", playable: true, anime: true, rank: 1020 },
  { id: "anikai", name: "AniKai", playable: true, anime: true, rank: 1015 },
  { id: "videasy", name: "Videasy", playable: true, rank: 1010 },
  { id: "vaplayer", name: "VaPlayer", playable: true, rank: 1000 },
  { id: "netmirror", name: "NetMirror", playable: true, rank: 990 },
  // VidLink/VixSrc: all endpoints currently return 403 upstream. Code is
  // kept intact - flip playable back to true to re-enable.
  { id: "vidlink", name: "VidLink", playable: false, rank: 0 },
  { id: "castletv", name: "CastleTV", playable: true, rank: 970 },
  { id: "vixsrc", name: "VixSrc", playable: false, rank: 0 },
  { id: "onetouchtv", name: "OneTouchTV", playable: true, rank: 950 },
  { id: "showbox", name: "ShowBox", playable: true, rank: 940 },
  { id: "zxcstreams", name: "ZXCStreams", playable: true, rank: 930 },
  // Yamie - direct movie endpoint (media.vidrift.in); movies only.
  { id: "yamie", name: "Yamie ❤️", playable: true, moviesOnly: true, rank: 920 },
  { id: "streamflix", name: "StreamFlix", playable: false, rank: 0 },
  { id: "4khdhub", name: "4KHDHub", playable: false, rank: 0 },
  { id: "dahmermovies", name: "DahmerMovies", playable: false, rank: 0 },
];
export const PLAYABLE_PROVIDERS = NEXUS_PROVIDER_CATALOG.filter(
  (provider) => provider.playable,
);
export const DOWNLOAD_ONLY_PROVIDERS = NEXUS_PROVIDER_CATALOG.filter(
  (provider) => !provider.playable,
);
export async function fetchEmbedApi(
  url: string,
  timeoutMs = EMBED_REQUEST_TIMEOUT,
): Promise<EmbedApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as EmbedApiResponse;
    if (!json || typeof json !== "object" || json.success === false) {
      throw new Error(json?.error ?? "empty provider response");
    }
    return {
      ...json,
      streams: Array.isArray(json.streams) ? json.streams : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}
function buildProviderUrl(provider: string, media: EmbedMediaRequest): string {
  const mediaType = media.type === "movie" ? "movie" : "series";
  const url = `${EMBED_API_BASE}/api/streams/${provider}/${mediaType}/${encodeURIComponent(
    media.tmdbId,
  )}`;
  if (media.type !== "show") return url;

  const params = new URLSearchParams({
    season: String(media.season?.number ?? 1),
    episode: String(media.episode?.number ?? 1),
  });
  return `${url}?${params.toString()}`;
}

export function buildAggregateUrl(
  ctx: ScrapeContext | { media: EmbedMediaRequest },
): string {
  const { media } = ctx;
  const mediaType = media.type === "movie" ? "movie" : "series";
  const url = `${EMBED_API_BASE}/api/streams/${mediaType}/${encodeURIComponent(
    media.tmdbId,
  )}`;
  if (media.type !== "show") return url;

  const params = new URLSearchParams({
    season: String(media.season?.number ?? 1),
    episode: String(media.episode?.number ?? 1),
  });
  return `${url}?${params.toString()}`;
}

export function buildProviderEndpoint(
  provider: string,
  media: EmbedMediaRequest,
): string {
  if (provider === YAMIE_PROVIDER_ID && media.type === "movie") {
    return buildYamieStreamUrl(media.tmdbId);
  }
  return buildProviderUrl(provider, media);
}

// Kept as a public helper for the developer tester.
export function buildEmbedUrl(provider: string, ctx: ScrapeContext): string {
  return buildProviderUrl(provider, ctx.media);
}

function aggregateKey(media: EmbedMediaRequest): string {
  if (media.type === "movie") return `movie:${media.tmdbId}`;
  return `show:${media.tmdbId}:${media.season?.number ?? 1}:${media.episode?.number ?? 1}`;
}

const aggregateCache = new Map<
  string,
  { createdAt: number; promise: Promise<EmbedApiResponse> }
>();

/** Fetch one aggregate response and share it across all source runners. */
export function fetchAggregateForMedia(
  media: EmbedMediaRequest,
): Promise<EmbedApiResponse> {
  const key = aggregateKey(media);
  const cached = aggregateCache.get(key);
  if (cached && Date.now() - cached.createdAt < AGGREGATE_CACHE_TTL) {
    return cached.promise;
  }

  const promise = fetchEmbedApi(buildAggregateUrl({ media })).catch((error) => {
    aggregateCache.delete(key);
    throw error;
  });
  aggregateCache.set(key, { createdAt: Date.now(), promise });
  return promise;
}

const providerResponseCache = new Map<
  string,
  { createdAt: number; promise: Promise<EmbedApiResponse> }
>();

export function clearAggregateCache(): void {
  aggregateCache.clear();
  providerResponseCache.clear();
}

function stampUnlabelledProviderResponse(
  response: EmbedApiResponse,
  providerId: string,
): EmbedApiResponse {
  const streams = response.streams ?? [];
  const responseProvider = normalizeProviderId(response.provider);
  const canStamp = responseProvider === null || responseProvider === providerId;
  if (!canStamp || streams.length === 0) return response;

  return {
    ...response,
    provider: responseProvider ?? providerId,
    streams: streams.map((item) =>
      providerIdForItem(item) ? item : { ...item, provider: providerId },
    ),
  };
}

export async function fetchProviderResponse(
  providerId: string,
  media: EmbedMediaRequest,
): Promise<EmbedApiResponse> {
  const cacheKey = `${aggregateKey(media)}:${providerId}`;
  const cached = providerResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < AGGREGATE_CACHE_TTL) {
    return cached.promise;
  }

  const promise = (async () => {
    // Yamie never touches the HF backend - movies use the direct URL,
    // shows return an empty response so the provider is skipped.
    if (providerId === YAMIE_PROVIDER_ID) return yamieResponseFor(media);
    let providerResponse: EmbedApiResponse | null = null;
    let providerError: unknown = null;

    try {
      providerResponse = stampUnlabelledProviderResponse(
        await fetchEmbedApi(buildProviderUrl(providerId, media)),
        providerId,
      );
      if (streamsForProvider(providerResponse, providerId).length > 0) {
        return providerResponse;
      }
    } catch (error) {
      providerError = error;
    }

    try {
      const aggregate = await fetchAggregateForMedia(media);
      if (streamsForProvider(aggregate, providerId).length > 0) {
        return aggregate;
      }
      if (providerResponse) return providerResponse;
      return aggregate;
    } catch (aggregateError) {
      throw providerError ?? aggregateError;
    }
  })().catch((error) => {
    providerResponseCache.delete(cacheKey);
    throw error;
  });

  providerResponseCache.set(cacheKey, { createdAt: Date.now(), promise });
  return promise;
}

export async function fetchProviderStreams(
  providerId: string,
  media: EmbedMediaRequest,
): Promise<EmbedStreamItem[]> {
  const response = await fetchProviderResponse(providerId, media);
  return streamsForProvider(response, providerId);
}

/** Convert display/provider aliases returned by the HF backend to catalog ids. */
export function normalizeProviderId(value?: string): string | null {
  if (!value) return null;
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!compact) return null;

  if (compact.includes("febbox") || compact === "fid") return "showbox";
  if (compact.includes("4khdhub")) return "4khdhub";
  if (compact.includes("dahmermovies")) return "dahmermovies";
  if (compact.includes("streamflix")) return "streamflix";
  if (compact.includes("castletv") || compact === "castle") return "castletv";
  if (compact.includes("netmirror")) return "netmirror";
  if (compact.includes("onetouchtv") || compact.includes("onetouch")) {
    return "onetouchtv";
  }
  if (compact.includes("zxcstreams") || compact.includes("zxcstream")) {
    return "zxcstreams";
  }
  if (compact.includes("anikoto")) return "anikoto";
  if (compact.includes("anikai")) return "anikai";
  if (compact.includes("vaplayer")) return "vaplayer";
  if (compact.includes("videasy")) return "videasy";
  if (compact.includes("vidlink")) return "vidlink";
  if (compact.includes("vixsrc")) return "vixsrc";

  if (compact.includes("yamie")) return "yamie";
  if (compact.includes("hdghartv")) return "hdghartv";
  if (compact.includes("showbox")) return "showbox";
  return null;
}

export function providerIdForItem(item: EmbedStreamItem): string | null {
  return (
    normalizeProviderId(item.provider) ??
    normalizeProviderId(item.server) ??
    normalizeProviderId(item.name) ??
    normalizeProviderId(item.title)
  );
}

export function streamsForProvider(
  response: EmbedApiResponse,
  providerId: string,
): EmbedStreamItem[] {
  const responseProvider = normalizeProviderId(response.provider);
  return (response.streams ?? []).filter((item) => {
    const itemProvider = providerIdForItem(item);
    return itemProvider === providerId ||
      (itemProvider === null && responseProvider === providerId);
  });
}

function readChunk(response: Response, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const reader = response.body?.getReader();
    if (!reader) {
      response
        .arrayBuffer()
        .then((buffer) => resolve(new Uint8Array(buffer.slice(0, maxBytes))))
        .catch(() => resolve(new Uint8Array()));
      return;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    (async () => {
      try {
        while (total < maxBytes) {
          const result = await reader.read();
          if (result.done) break;
          if (result.value) {
            chunks.push(result.value);
            total += result.value.length;
          }
        }
      } catch {
        // A cancelled range request is still useful when it returned bytes.
      }
      try {
        await reader.cancel();
      } catch {
        // ignore cancellation errors
      }

      const bytes = new Uint8Array(Math.min(total, maxBytes));
      let offset = 0;
      for (const chunk of chunks) {
        const size = Math.min(chunk.length, bytes.length - offset);
        if (size <= 0) break;
        bytes.set(chunk.subarray(0, size), offset);
        offset += size;
      }
      resolve(bytes);
    })();
  });
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    let output = "";
    for (const byte of bytes) output += String.fromCharCode(byte);
    return output;
  }
}

function firstHlsVariant(body: string): string | null {
  const lines = body.split(/\r?\n/);
  const streamIndex = lines.findIndex((line) =>
    line.includes("#EXT-X-STREAM-INF"),
  );
  if (streamIndex < 0) return null;
  for (let index = streamIndex + 1; index < lines.length; index += 1) {
    const value = lines[index]?.trim();
    if (value && !value.startsWith("#")) return value;
  }
  return null;
}

async function probeHlsVariant(
  masterUrl: string,
  masterBody: string,
  timeoutMs: number,
  requestHeaders: Record<string, string> = {},
): Promise<boolean> {
  const variant = firstHlsVariant(masterBody);
  if (!variant) return false;

  let variantUrl: string;
  try {
    variantUrl = new URL(variant, masterUrl).toString();
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(variantUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
        ...(isSameOriginStreamProxyUrl(variantUrl) ? {} : requestHeaders),
      },
      cache: "no-store",
    });
    if (response.status < 200 || response.status >= 400) return false;
    const body = decodeBytes(await readChunk(response, 4096));
    return body.trimStart().startsWith("#EXTM3U");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function isHlsItem(item: EmbedStreamItem): boolean {
  const url = (item.url ?? "").toLowerCase();
  const description = `${item.name ?? ""} ${item.title ?? ""} ${item.server ?? ""} ${item.type ?? ""}`.toLowerCase();
  return (
    item.type?.toLowerCase() === "hls" ||
    url.includes(".m3u8") ||
    url.includes("m3u8-proxy") ||
    /\/playlist(?:[/?]|$)/.test(url) ||
    /\/pl(?:[/?]|$)/.test(url) ||
    /\bhls\b|m3u8|master\.m3u8/.test(description)
  );
}

/** MKV URLs are downloads even when the server hides .mkv behind a query. */
export function isMkvItem(item: EmbedStreamItem): boolean {
  const url = `${item?.url ?? ""}`;
  const type = `${item?.type ?? ""}`.toLowerCase();
  const lowerUrl = url.toLowerCase();

  // ShowBox/FID includes the original filename (often ".mkv") in the
  // title, even when the actual delivery URL is an HLS playlist.
  if (
    isHlsItem(item) ||
    lowerUrl.includes(".m3u8") ||
    lowerUrl.includes("m3u8-proxy") ||
    lowerUrl.includes("/playlist")
  ) {
    return false;
  }
  if (/\bmkv\b/.test(type) || /\.mkv(?:$|[?#])/i.test(url)) return true;

  const rawText = `${item?.name ?? ""} ${item?.title ?? ""} ${item?.server ?? ""}`;
  let text = rawText;
  try {
    text = decodeURIComponent(rawText);
  } catch {
    // Keep the original text when a signed URL contains malformed escaping.
  }
  return /\bmkv\b/i.test(text) && !item.type;
}

export function isBrowserPlayableItem(item: EmbedStreamItem): boolean {
  return Boolean(item?.url) && !isMkvItem(item);
}

function streamHeaders(item: EmbedStreamItem): Record<string, string> {
  const rawHeaders = {
    ...(item.preferredHeaders ?? {}),
    ...(item.headers ?? {}),
  };
  return Object.fromEntries(
    Object.entries(rawHeaders).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string" &&
        entry[0].length > 0 && entry[1].length > 0,
    ),
  );
}

export function playbackUrlForItem(item: EmbedStreamItem): string {
  const url = item.url;
  const headers = streamHeaders(item);
  const hls = isHlsItem(item);

  // The configured P-Stream/simple-proxy service rewrites every playlist,
  // variant and segment URL while carrying the provider headers in the query.
  // Use it for every HLS provider, including Videasy/ShowBox/CastleTV; their
  // source configuration stays unchanged while the browser gets a CORS-safe
  // URL. Fall back to the app proxy only when no external proxy is configured.
  if (hls && !isUrlAlreadyProxied(url)) {
    const externalProxyUrl = createM3U8ProxyUrl(url, headers);
    if (externalProxyUrl !== url) return externalProxyUrl;
    return createSameOriginStreamProxyUrl(url, headers, "m3u8-proxy");
  }
  if (isSameOriginStreamProxyUrl(url)) return url;
  if (hls || Object.keys(headers).length > 0) {
    return createSameOriginStreamProxyUrl(
      url,
      headers,
      hls ? "m3u8-proxy" : "ts-proxy",
    );
  }
  return url;
}

export function headersForItem(item: EmbedStreamItem): Record<string, string> {
  return streamHeaders(item);
}

export function normalizeQuality(quality?: string, extra?: string): string {
  const text = `${quality ?? ""} ${extra ?? ""}`.toLowerCase();
  if (/4k|2160|uhd/.test(text)) return "4k";
  if (/1080/.test(text)) return "1080";
  if (/720/.test(text)) return "720";
  if (/480/.test(text)) return "480";
  if (/360/.test(text)) return "360";
  return "unknown";
}

const QUALITY_RANK: Record<string, number> = {
  "4k": 100,
  "1080": 90,
  "720": 80,
  "480": 70,
  "360": 60,
  unknown: 50,
};

export function qualityRank(quality: string): number {
  return QUALITY_RANK[quality] ?? QUALITY_RANK.unknown;
}


function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}


/** Probe the exact direct URL that will be passed to the player. */
export async function probeUrl(
  url: string,
  timeoutMs = PROBE_TIMEOUT,
  expectHls = false,
  requestHeaders: Record<string, string> = {},
): Promise<number | null> {
  // Origins remembered as dead from earlier failures are skipped without
  // touching the network at all (no request, no console error).
  if (!isSameOriginStreamProxyUrl(url) && isProxyOriginDead(url)) return null;
  const trackOutcome = !isSameOriginStreamProxyUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  const hls = expectHls || /\.m3u8|m3u8-proxy|\/playlist|\/pl(?:[/?]|$)/i.test(url);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        ...(hls
          ? { Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*" }
          : { Range: "bytes=0-8191" }),
        ...(isSameOriginStreamProxyUrl(url) ? {} : requestHeaders),
      },
      cache: "no-store",
    });
    if (response.status < 200 || response.status >= 400) {
      if (trackOutcome && response.status >= 500) reportProxyFailure(url, "timeout");
      else if (trackOutcome) reportProxySuccess(url);
      return null;
    }
    if (trackOutcome) reportProxySuccess(url);

    const body = decodeBytes(await readChunk(response, 8192));
    if (body.trimStart().startsWith("#EXTM3U")) {
      if (body.includes("#EXT-X-STREAM-INF")) {
        const validVariant = await probeHlsVariant(
          url,
          body,
          timeoutMs,
          requestHeaders,
        );
        if (!validVariant) return null;
      }
      return Math.round(performance.now() - started);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      /video\//i.test(contentType) ||
      /octet-stream/i.test(contentType) ||
      body.includes("ftyp")
    ) {
      return Math.round(performance.now() - started);
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const PROBE_CACHE_TTL = 90_000;
const ORIGIN_PROBE_TTL = 60_000;
const originProbeCache = new Map<
  string,
  { at: number; promise: Promise<number | null> }
>();
const probeCache = new Map<
  string,
  { at: number; promise: Promise<number | null> }
>();

/**
 * probeUrl with a short-lived shared cache. Health checks and real scrapes
 * hit the same URLs moments apart - the cache stops the same stream from
 * being fetched twice and makes repeat scrapes near-instant.
 */
export function probeUrlCached(
  url: string,
  timeoutMs: number = PROBE_TIMEOUT,
  expectHls = false,
  requestHeaders: Record<string, string> = {},
): Promise<number | null> {
  // Foreign origins (CDNs, third-party proxies) collapse to ONE probe per
  // origin per window: concurrent candidates on the same host share the
  // result, so a dead host costs a single failed request instead of one
  // per stream. Our own same-origin proxy is stream-specific and keeps
  // the per-URL cache below.
  if (!isSameOriginStreamProxyUrl(url)) {
    const origin = originOf(url);
    if (origin) {
      const hit = originProbeCache.get(origin);
      if (hit && Date.now() - hit.at < ORIGIN_PROBE_TTL) return hit.promise;
      if (originProbeCache.size > 100) originProbeCache.clear();
      const promise = probeUrl(url, timeoutMs, expectHls, requestHeaders).catch(
        () => null,
      );
      originProbeCache.set(origin, { at: Date.now(), promise });
      return promise;
    }
  }
  const key = `${url}|${expectHls ? "h" : "f"}|${JSON.stringify(requestHeaders)}`;
  const cached = probeCache.get(key);
  if (cached && Date.now() - cached.at < PROBE_CACHE_TTL) return cached.promise;
  if (probeCache.size > 400) probeCache.clear();
  const promise = probeUrl(url, timeoutMs, expectHls, requestHeaders).catch(
    () => null,
  );
  probeCache.set(key, { at: Date.now(), promise });
  return promise;
}

export interface RankedStream {
  item: EmbedStreamItem;
  playUrl: string;
  quality: string;
  latency: number | null;
}

export async function rankStreams(
  items: EmbedStreamItem[],
  providerHint?: string,
): Promise<RankedStream[]> {
  const normalizedHint = normalizeProviderId(providerHint) ?? providerHint;
  const seenUrls = new Set<string>();
  const candidates = items
    .filter((item) => {
      if (!isBrowserPlayableItem(item) || seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    })
    .map((item) => {
      if (providerIdForItem(item) || !normalizedHint) return item;
      return { ...item, provider: normalizedHint };
    });
  const ranked = await Promise.all(
    candidates.map(async (item) => {
      const hls = isHlsItem(item);
      const _providerId = providerIdForItem(item);
      const requestHeaders = headersForItem(item);
      const playbackCandidates = hls
        ? [
            ...createM3U8ProxyUrls(item.url, requestHeaders),
            item.url,
          ]
        : [playbackUrlForItem(item)];
      const uniquePlaybackCandidates = [...new Set(playbackCandidates)];
      const probeResults = await Promise.all(
        uniquePlaybackCandidates.map((candidate) =>
          probeUrlCached(candidate, PROBE_TIMEOUT, hls, requestHeaders),
        ),
      );
      const workingIndex = probeResults.findIndex((result) => result !== null);
      const playUrl =
        workingIndex >= 0
          ? uniquePlaybackCandidates[workingIndex]!
          : playbackUrlForItem(item);
      const latency = workingIndex >= 0 ? probeResults[workingIndex] : null;

      return {
        item,
        playUrl,
        quality: normalizeQuality(item.quality, `${item.title ?? ""} ${item.name ?? ""}`),
        latency,
      };
    }),
  );

  return ranked.sort((left, right) => {
    const qualityDifference = qualityRank(right.quality) - qualityRank(left.quality);
    if (qualityDifference !== 0) return qualityDifference;
    const leftWorking = left.latency === null ? 0 : 1;
    const rightWorking = right.latency === null ? 0 : 1;
    if (leftWorking !== rightWorking) return rightWorking - leftWorking;
    if (left.latency !== null && right.latency !== null) {
      return left.latency - right.latency;
    }
    return 0;
  });
}

export function pickUsable(ranked: RankedStream[]): RankedStream[] {
  return ranked.filter((stream) => stream.latency !== null);
}

function stripEmoji(text: string): string {
  return Array.from(text)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return !(
        (code >= 0x1f300 && code <= 0x1faff) ||
        (code >= 0x2600 && code <= 0x27bf) ||
        code === 0xfe0f ||
        code === 0x200d
      );
    })
    .join("");
}

const LANGUAGE_PATTERNS: Array<[RegExp, string]> = [
  [/\benglish\b|\beng\b/i, "English"],
  [/original\s*audio/i, "English"],
  [/\blatino\b|latina/i, "Español (Latino)"],
  [/\bspanish\b|español/i, "Español"],
  [/türkçe|turkish/i, "Türkçe"],
  [/\bfrench\b|français/i, "Français"],
  [/\bgerman\b|deutsch/i, "Deutsch"],
  [/\bitalian\b|italiano|\bita\b/i, "Italiano"],
  [/\bportuguese\b|português/i, "Português"],
  [/\bjapanese\b|日本語/i, "日本語"],
  [/\bkorean\b|한국어/i, "한국어"],
  [/\barabic\b|العربية/i, "العربية"],
  [/\brussian\b|русский/i, "Русский"],
  [/\bhindi\b|हिन्दी/i, "हिन्दी"],
  [/\btamil\b|தமிழ்/i, "தமிழ்"],
  [/\btelugu\b/i, "తెలుగు"],
  [/\bindonesian\b|bahasa indonesia/i, "Bahasa Indonesia"],
  [/\bthai\b|ไทย/i, "ไทย"],
  [/\bvietnamese\b|tiếng việt/i, "Tiếng Việt"],
  [/\bpolish\b|polski/i, "Polski"],
  [/\bdutch\b|nederlands/i, "Nederlands"],
  [/\btagalog\b/i, "Tagalog"],
  [/\bbengali\b|বাংলা/i, "বাংলা"],
  [/\bukrainian\b|українська/i, "Українська"],
  [/\bchinese\b|中文/i, "中文"],
];

export function extractAudioLanguage(text: string): string | null {
  const clean = stripEmoji(text).replace(/\s+/g, " ").trim();
  for (const [pattern, label] of LANGUAGE_PATTERNS) {
    if (pattern.test(clean)) return label;
  }
  if (/\bdub\b/i.test(clean)) return "Dubbed";
  return null;
}

const LANGUAGE_CODES: Record<string, string> = {
  english: "en",
  eng: "en",
  español: "es",
  spanish: "es",
  latino: "es",
  latina: "es",
  türkçe: "tr",
  turkish: "tr",
  français: "fr",
  french: "fr",
  deutsch: "de",
  german: "de",
  italiano: "it",
  italian: "it",
  português: "pt",
  portuguese: "pt",
  日本語: "ja",
  japanese: "ja",
  한국어: "ko",
  korean: "ko",
  العربية: "ar",
  arabic: "ar",
  русский: "ru",
  russian: "ru",
  हिन्दी: "hi",
  hindi: "hi",
  தமிழ்: "ta",
  tamil: "ta",
  తెలుగు: "te",
  telugu: "te",
  "bahasa indonesia": "id",
  indonesian: "id",
  ไทย: "th",
  thai: "th",
  "tiếng việt": "vi",
  vietnamese: "vi",
  polski: "pl",
  polish: "pl",
  nederlands: "nl",
  dutch: "nl",
  tagalog: "tl",
  বাংলা: "bn",
  bengali: "bn",
  українська: "uk",
  ukrainian: "uk",
  中文: "zh",
  chinese: "zh",
};

export function languageCodeFromLabel(label: string): string {
  const lower = label.toLowerCase().trim();
  if (lower.length <= 3 && /^[a-z]+$/.test(lower)) return lower;
  for (const [name, code] of Object.entries(LANGUAGE_CODES)) {
    if (lower.includes(name)) return code;
  }
  return "und";
}

const LANGUAGE_FLAGS: Record<string, string> = {
  en: "🇬🇧",
  es: "🇪🇸",
  fr: "🇫🇷",
  de: "🇩🇪",
  it: "🇮🇹",
  pt: "🇵🇹",
  hi: "🇮🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  zh: "🇨🇳",
  ru: "🇷🇺",
  ar: "🇸🇦",
  tr: "🇹🇷",
  th: "🇹🇭",
  vi: "🇻🇳",
  id: "🇮🇩",
  nl: "🇳🇱",
  pl: "🇵🇱",
  ta: "🇮🇳",
  te: "🇮🇳",
  bn: "🇧🇩",
  tl: "🇵🇭",
  uk: "🇺🇦",
  und: "🌐",
};

export function flagForLang(language: string): string {
  return LANGUAGE_FLAGS[language] ?? "🌐";
}

function itemAudioText(item: EmbedStreamItem): string {
  return `${item.name ?? ""} ${item.title ?? ""} ${item.server ?? ""}`;
}

function isDubItem(item: EmbedStreamItem): boolean {
  return /\bdub(?:bed)?\b/i.test(itemAudioText(item));
}

function isSubItem(item: EmbedStreamItem): boolean {
  return /\bsub(?:bed)?\b/i.test(itemAudioText(item));
}

export function audioLabelForItem(item: EmbedStreamItem): string | null {
  const text = itemAudioText(item);
  const language = extractAudioLanguage(text);
  if (language) return `${flagForLang(languageCodeFromLabel(language))} ${language}`;
  if (isSubItem(item)) return `${flagForLang("ja")} Japanese`;
  if (isDubItem(item)) return `${flagForLang("und")} Dubbed`;
  return null;
}

function toIsoLanguage(value?: string): string {
  if (!value) return "und";
  const lower = value.toLowerCase().trim();
  if (lower.length <= 3 && /^[a-z]+$/.test(lower)) return lower;
  return languageCodeFromLabel(lower);
}

export function extractCaptions(item: EmbedStreamItem, prefix: string): any[] {
  return (item.subtitles ?? [])
    .filter((subtitle) => subtitle?.url)
    .map((subtitle, index) => {
      const language = toIsoLanguage(subtitle.lang ?? subtitle.label);
      return {
        id: `${prefix}-sub-${language}-${index}`,
        language,
        url: subtitle.url,
        type: /\.vtt(?:$|\?)/i.test(subtitle.url) ? "vtt" : "srt",
        hasCorsRestrictions: false,
        opensubtitles: false,
      };
    });
}

export function collectCaptionsForStreams(
  items: RankedStream[],
  prefix: string,
): any[] {
  const captions: any[] = [];
  const seen = new Set<string>();
  for (const stream of items) {
    for (const caption of extractCaptions(stream.item, prefix)) {
      const key = `${caption.language}:${caption.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      captions.push({ ...caption, id: `${prefix}-sub-${captions.length}` });
    }
  }
  return captions;
}

function audioTrackFor(
  def: NexusProviderDef,
  stream: RankedStream,
  isDefault: boolean,
): any {
  const languageLabel = audioLabelForItem(stream.item);
  const language = languageLabel
    ? languageCodeFromLabel(languageLabel)
    : "und";
  return {
    id: `nexus-${def.id}-audio-${language}-${stream.item.url.slice(-12)}`,
    label: languageLabel ?? "Original",
    language,
    url: stream.playUrl,
    type: isHlsItem(stream.item) ? "hls" : "mp4",
    headers: headersForItem(stream.item),
    preferredHeaders: headersForItem(stream.item),
    default: isDefault,
  };
}

function buildAudioTracks(
  def: NexusProviderDef,
  usable: RankedStream[],
  primary: RankedStream,
): any[] {
  const tracks = [audioTrackFor(def, primary, true)];
  const seenKeys = new Set<string>([
    `${isDubItem(primary.item) ? "dub" : isSubItem(primary.item) ? "sub" : "audio"}:${tracks[0].language}`,
  ]);
  const seenUrls = new Set([primary.playUrl]);

  for (const stream of usable) {
    if (seenUrls.has(stream.playUrl)) continue;
    const label = audioLabelForItem(stream.item);
    if (!label) continue;
    const language = languageCodeFromLabel(label);
    const kind = isDubItem(stream.item)
      ? "dub"
      : isSubItem(stream.item)
        ? "sub"
        : "audio";
    const key = `${kind}:${language}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    seenUrls.add(stream.playUrl);
    tracks.push(audioTrackFor(def, stream, false));
  }
  return tracks;
}

export function buildAudioTracksForProvider(
  providerId: string,
  usable: RankedStream[],
  primary: RankedStream,
): any[] {
  const def = NEXUS_PROVIDER_CATALOG.find((provider) => provider.id === providerId) ?? {
    id: providerId,
    name: providerId,
    playable: true,
    rank: 0,
  };
  return buildAudioTracks(def, usable, primary);
}

function choosePrimaryStream(
  def: NexusProviderDef,
  streams: RankedStream[],
): RankedStream {
  if (def.anime) {
    const subtitleStream = streams.find((stream) => isSubItem(stream.item));
    if (subtitleStream) return subtitleStream;
  }
  return streams[0]!;
}

export function buildHlsStream(
  url: string,
  id: string,
  captions: any[] = [],
  audioTracks: any[] = [],
  headers: Record<string, string> = {},
): any {
  return {
    id,
    type: "hls",
    playlist: url,
    flags: [flags.CORS_ALLOWED],
    captions,
    skipValidation: true,
    ...(Object.keys(headers).length ? { preferredHeaders: headers } : {}),
    ...(audioTracks.length ? { audioTracks } : {}),
  };
}

export function buildFileStream(
  qualities: Record<
    string,
    {
      type: "mp4";
      url: string;
      headers?: Record<string, string>;
      preferredHeaders?: Record<string, string>;
    }
  >,
  id: string,
  captions: any[] = [],
  audioTracks: any[] = [],
  headers: Record<string, string> = {},
): any {
  return {
    id,
    type: "file",
    qualities,
    flags: [flags.CORS_ALLOWED],
    captions,
    skipValidation: true,
    ...(Object.keys(headers).length ? { preferredHeaders: headers } : {}),
    ...(audioTracks.length ? { audioTracks } : {}),
  };
}

async function scrapeProvider(
  def: NexusProviderDef,
  ctx: ScrapeContext,
): Promise<{ embeds: any[]; stream: any[] }> {
  const response = await fetchProviderResponse(def.id, ctx.media);
  const returnedItems = streamsForProvider(response, def.id);
  const items = returnedItems.filter(isBrowserPlayableItem);

  if (items.length === 0) {
    throw new NotFoundError(`${def.name}: no browser-playable streams`);
  }

  const ranked = await rankStreams(items);
  const usable = pickUsable(ranked);
  if (usable.length === 0) {
    throw new NotFoundError(`${def.name}: all direct URLs failed`);
  }

  const hls = usable.filter((stream) => isHlsItem(stream.item));
  const prefix = `nexus-${def.id}`;

  if (hls.length > 0) {
    const primary = choosePrimaryStream(def, hls);
    return {
      embeds: [],
      stream: [
        buildHlsStream(
          primary.playUrl,
          `${prefix}-hls`,
          collectCaptionsForStreams(usable, prefix),
          buildAudioTracks(def, usable, primary),
          headersForItem(primary.item),
        ),
      ],
    };
  }

  const qualities: Record<
    string,
    {
      type: "mp4";
      url: string;
      headers?: Record<string, string>;
      preferredHeaders?: Record<string, string>;
    }
  > = {};
  for (const stream of usable) {
    if (!qualities[stream.quality]) {
      qualities[stream.quality] = {
        type: "mp4",
        url: stream.playUrl,
        headers: headersForItem(stream.item),
        preferredHeaders: headersForItem(stream.item),
      };
    }
  }
  if (Object.keys(qualities).length === 0) {
    throw new NotFoundError(`${def.name}: no playable files`);
  }

  const primary = choosePrimaryStream(def, usable);
  return {
    embeds: [],
    stream: [
      buildFileStream(
        qualities,
        `${prefix}-file`,
        collectCaptionsForStreams(usable, prefix),
        buildAudioTracks(def, usable, primary),
        headersForItem(primary.item),
      ),
    ],
  };
}

export function makeEmbedSource(def: NexusProviderDef) {
  return makeProviderContext({
    id: `nexus-${def.id}`,
    name: def.name,
    rank: def.rank,
    // Movie-only providers register without "show" so the runner skips
    // them for TV entirely.
    ...(def.moviesOnly ? { mediaTypes: ["movie"] as const } : {}),
    async scrape(ctx: ScrapeContext) {
      // Errors propagate to the runner, which marks the source not-found;
      // nothing is logged so auto-scrape stays quiet in the console.
      return scrapeProvider(def, ctx);
    },
  });
}

export const nexusEmbedSources = PLAYABLE_PROVIDERS.map(makeEmbedSource);

// These helpers remain for UI compatibility with the former nested-server UI.
const serverLabelCache: Record<string, string> = {};
export function setServerEmbedLabels(labels: string[]): void {
  labels.forEach((label, index) => {
    if (label) serverLabelCache[`nexus-server-${index + 1}`] = label;
  });
}
export function getServerEmbedLabel(embedId: string): string | undefined {
  return serverLabelCache[embedId];
}
export function getPackedEmbedLabel(_url: string): string | undefined {
  return undefined;
}

const ANIME_KEYWORDS = [
  "one piece",
  "naruto",
  "bleach",
  "dragon ball",
  "jujutsu kaisen",
  "demon slayer",
  "attack on titan",
  "my hero academia",
  "solo leveling",
  "chainsaw man",
  "pokemon",
  "pokémon",
  "death note",
  "hunter x hunter",
  "tokyo ghoul",
  "fullmetal alchemist",
  "sword art online",
  "gintama",
  "steins;gate",
  "code geass",
  "mob psycho",
  "haikyuu",
  "one punch man",
  "vinland saga",
  "drifting dragons",
];

export async function detectIsAnime(
  media: ScrapeContext["media"],
): Promise<boolean> {
  const title = (media.title ?? "").toLowerCase();
  if (ANIME_KEYWORDS.some((keyword) => title.includes(keyword))) return true;

  try {
    const endpoint =
      media.type === "movie"
        ? `/api/tmdb/movie/${media.tmdbId}`
        : `/api/tmdb/tv/${media.tmdbId}`;
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return false;
    const data: any = await response.json();
    const genres: Array<{ id?: number; name?: string }> = data.genres ?? [];
    const countries: string[] = data.origin_country ?? [];
    return (
      genres.some(
        (genre) => genre.id === 16 || genre.name?.toLowerCase() === "animation",
      ) &&
      (countries.includes("JP") || data.original_language === "ja")
    );
  } catch {
    return false;
  }
}
