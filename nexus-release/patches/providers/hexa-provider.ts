// hexa-provider.ts
// NEXUS — Hexa Provider (hexa.su / flixer.su)
// Uses enc-dec.app for challenge solving + decryption
// Challenge token: GET https://enc-dec.app/api/enc-hexa
// Decrypt stream: POST https://enc-dec.app/api/dec-hexa

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

const ENC_DEC_BASE = "https://enc-dec.app/api";
const HEXA_API = "https://theemoviedb.hexa.su/api";
const TIMEOUT = 15000;

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface HexaTokenResponse {
  token: string;
}

interface HexaRawResponse {
  encrypted: string;
  [key: string]: unknown;
}

interface HexaDecryptedSource {
  url: string;
  quality?: string;
  type?: string;
}

interface HexaDecResult {
  success: boolean;
  sources?: HexaDecryptedSource[];
  subtitles?: Array<{ url: string; lang: string; label?: string }>;
}

export async function scrapeHexa(ctx: ScrapeContext) {
  const { media } = ctx;
  const isShow = media.type === "show";

  // Step 1: Get solved challenge token
  const tokenRes = await getJson<HexaTokenResponse>(`${ENC_DEC_BASE}/enc-hexa`);
  if (!tokenRes.token) throw new Error("Hexa: failed to get challenge token");

  // Step 2: Fetch raw (encrypted) data from hexa.su API
  const hexaPath = isShow
    ? `/tv/${media.tmdbId}/${media.season.number}/${media.episode.number}`
    : `/movie/${media.tmdbId}`;
  const hexaUrl = `${HEXA_API}${hexaPath}?token=${tokenRes.token}`;

  const rawData = await getJson<HexaRawResponse>(hexaUrl);
  if (!rawData.encrypted) throw new Error("Hexa: no encrypted data");

  // Step 3: Decrypt via enc-dec.app
  const decResult = await postJson<HexaDecResult>(`${ENC_DEC_BASE}/dec-hexa`, {
    data: rawData.encrypted,
  });

  if (!decResult.success || !decResult.sources?.length) {
    throw new Error("Hexa: decryption failed or no sources");
  }

  const hlsSrc = decResult.sources.find((s) => s.url.includes(".m3u8")) ?? decResult.sources[0]!;
  const qualities: Record<string, { type: "mp4"; url: string }> = {};

  for (const src of decResult.sources.filter((s) => !s.url.includes(".m3u8"))) {
    const q = src.quality ?? "Auto";
    qualities[q] = { type: "mp4", url: src.url };
  }

  const captions = (decResult.subtitles ?? []).map((sub, i) => ({
    id: `hexa-cap-${i}`,
    url: sub.url,
    type: sub.url.endsWith(".srt") ? ("srt" as const) : ("vtt" as const),
    hasCorsRestrictions: false,
    language: (sub.lang ?? sub.label ?? "en").slice(0, 2).toLowerCase(),
  }));

  return {
    embeds: [],
    stream: {
      type: hlsSrc.url.includes(".m3u8") ? ("hls" as const) : ("mp4" as const),
      playlist: hlsSrc.url,
      flags: [flags.CORS_ALLOWED],
      captions,
      ...(Object.keys(qualities).length ? { qualities } : {}),
    },
  };
}

export const hexaProvider = makeProviderContext({
  id: "nexus-hexa",
  name: "Hexa",
  rank: 820,
  disabled: false,
  async scrape(ctx) {
    return scrapeHexa(ctx);
  },
});
