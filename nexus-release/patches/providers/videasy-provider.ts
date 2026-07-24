// videasy-provider.ts
// NEXUS — Videasy Provider (enc-dec.app decryption)
// Videasy API: https://api.videasy.net/<encrypted_data>
// Decryption: POST https://enc-dec.app/api/dec-videasy

import { flags } from "@/utils/proxiedFetch";
import { makeProviderContext } from "@/providers/makeProviderContext";
import { ScrapeContext } from "@/providers/types";

const ENC_DEC_BASE = "https://enc-dec.app/api";
const VIDEASY_API = "https://api.videasy.net";
const TIMEOUT = 12000;

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function get<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

interface VideasyRaw {
  sources?: Array<{ file: string; type?: string; label?: string }>;
  tracks?: Array<{ file: string; kind: string; label?: string }>;
  encrypted?: string;
}

interface DecVideasyResult {
  success: boolean;
  data?: VideasyRaw;
}

export async function scrapeVideasy(ctx: ScrapeContext) {
  const { media } = ctx;
  const isShow = media.type === "show";

  // Build Videasy endpoint URL
  const endpoint = isShow
    ? `/tv/${media.tmdbId}/${media.season.number}/${media.episode.number}`
    : `/movie/${media.tmdbId}`;

  // Fetch raw (encrypted) data from Videasy
  let rawData: VideasyRaw;
  try {
    rawData = await get<VideasyRaw>(`${VIDEASY_API}${endpoint}`);
  } catch {
    throw new Error("Videasy: failed to fetch data");
  }

  // If data is encrypted, use enc-dec.app to decrypt
  if (rawData.encrypted) {
    const decrypted = await post<DecVideasyResult>(`${ENC_DEC_BASE}/dec-videasy`, {
      data: rawData.encrypted,
    });
    if (!decrypted.success || !decrypted.data) {
      throw new Error("Videasy: decryption failed");
    }
    rawData = decrypted.data;
  }

  const sources = rawData.sources ?? [];
  if (!sources.length) throw new Error("Videasy: no sources");

  const best = sources.find((s) => s.file?.includes(".m3u8")) ?? sources[0]!;

  const captions = (rawData.tracks ?? [])
    .filter((t) => t.kind === "subtitles" || t.kind === "captions")
    .map((t, i) => ({
      id: `videasy-cap-${i}`,
      url: t.file,
      type: t.file.endsWith(".srt") ? ("srt" as const) : ("vtt" as const),
      hasCorsRestrictions: false,
      language: t.label?.toLowerCase().slice(0, 2) ?? "en",
    }));

  return {
    embeds: [],
    stream: {
      type: best.file.includes(".m3u8") ? ("hls" as const) : ("mp4" as const),
      playlist: best.file,
      flags: [flags.CORS_ALLOWED],
      captions,
    },
  };
}

export const videasyProvider = makeProviderContext({
  id: "nexus-videasy",
  name: "Videasy",
  rank: 840,
  disabled: false,
  async scrape(ctx) {
    return scrapeVideasy(ctx);
  },
});
