/* eslint-disable no-console */
import { labelToLanguageCode } from "@nexus/providers";

import { CaptionListItem } from "@/stores/player/slices/source";

const NATSUKI_BASE = "https://natsuki.fontaine.lol/subs";

interface NatsukiSubtitleEntry {
  sid?: string;
  language?: string;
  langCode?: string;
  url?: string;
  fileName?: string;
  date?: string;
  delay?: string;
  hearingImpaired?: boolean;
  translatedFrom?: string;
  sidOrg?: string;
}

interface NatsukiResponse {
  fid?: string;
  imdbId?: string;
  title?: string;
  cached?: boolean;
  subtitles?: NatsukiSubtitleEntry[];
}

function getSubtitleType(url: string, fileName?: string): "srt" | "vtt" {
  const target = `${url} ${fileName ?? ""}`.toLowerCase();
  return target.includes(".vtt") ? "vtt" : "srt";
}

function mapEntries(data: unknown): CaptionListItem[] {
  const payload = data as NatsukiResponse | null;
  if (!payload || !Array.isArray(payload.subtitles)) return [];

  return payload.subtitles
    .filter((sub) => typeof sub.url === "string" && sub.url)
    .map((sub) => ({
      id: sub.sid ?? sub.url!,
      language:
        labelToLanguageCode(sub.language ?? "") ||
        sub.langCode ||
        sub.language ||
        "unknown",
      url: sub.url!,
      type: getSubtitleType(sub.url!, sub.fileName),
      needsProxy: false,
      opensubtitles: true,
      display: sub.fileName,
      isHearingImpaired: sub.hearingImpaired,
      source: "natsuki",
      release: sub.date ?? null,
      origin: sub.translatedFrom ?? null,
    }) as CaptionListItem);
}

export async function scrapeNatsukiCaptions(
  tmdbId: string | number,
  imdbId: string,
  season?: number,
  episode?: number,
): Promise<CaptionListItem[]> {
  if (!imdbId && !tmdbId) return [];

  const attempts: URLSearchParams[] = [];
  if (tmdbId) {
    const params = new URLSearchParams();
    params.set("tmdbId", String(tmdbId));
    if (season && episode) {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }
    attempts.push(params);
  }
  if (imdbId) {
    const params = new URLSearchParams();
    params.set("imdbId", imdbId);
    if (season && episode) {
      params.set("season", String(season));
      params.set("episode", String(episode));
    }
    attempts.push(params);
  }

  try {
    for (const params of attempts) {
      const res = await fetch(`${NATSUKI_BASE}?${params.toString()}`, {
        method: "GET",
      });
      if (!res.ok) {
        console.warn(`Natsuki HTTP ${res.status} for ${params.toString()}`);
        continue;
      }
      const data = await res.json();
      const mapped = mapEntries(data);
      if (mapped.length > 0) {
        return mapped;
      }
    }
    return [];
  } catch (err) {
    console.error("Natsuki fetch failed:", err);
    return [];
  }
}
