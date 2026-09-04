// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// All playback sources come from the TMDB-Embed HF backend
// (stycanine1-tmdb-embed-api.hf.space). Only browser-playable providers are
// registered here — MKV-only providers (4KHDHub, DahmerMovies, StreamFlix)
// are download sources surfaced in the Downloads menu instead.
// ---------------------------------------------------------------------------

import type { ScrapeMedia } from "@nexus/providers";

import {
  nexusEmbedSources,
  NEXUS_PROVIDER_CATALOG,
  type EmbedMediaRequest,
} from "./embeds/shared";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

export { NEXUS_PROVIDER_CATALOG } from "./embeds/shared";

// ── Source list (ordered by rank — highest tried first) ─────────────────
export const nexusCustomProviders = nexusEmbedSources;

// ── Legacy server-embed support (no longer used by new providers) ───────
export const nexusCustomEmbeds = [] as const;

export type NexusCustomProvider = (typeof nexusCustomProviders)[number];

export { getHealthyProviders, getHealthSnapshot, invalidateHealth } from "./provider-health";
export type { ProviderHealth } from "./provider-health";

function toHealthMedia(media?: ScrapeMedia): EmbedMediaRequest | undefined {
  if (!media) return undefined;
  if (media.type === "movie") {
    return { tmdbId: String(media.tmdbId), type: "movie" };
  }
  return {
    tmdbId: String(media.tmdbId),
    type: "show",
    season: { number: Number(media.season?.number) || 1 },
    episode: { number: Number(media.episode?.number) || 1 },
  };
}

export async function getLiveNexusProviders(
  media?: ScrapeMedia,
  builtinSources?: { id: string; name: string }[],
): Promise<ProbeableProvider[]> {
  const healthy = await getHealthyProviders(
    NEXUS_PROVIDER_CATALOG.filter((p) => p.playable).map((p) => ({
      id: `nexus-${p.id}`,
      name: p.name,
      disabled: false,
    })),
    toHealthMedia(media),
  );
  return [...healthy, ...(builtinSources ?? [])];
}
