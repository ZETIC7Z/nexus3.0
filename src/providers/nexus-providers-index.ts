// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// Movie / TV:  VidFast → NoTorrent → VidUp → MovieBox
// Anime:       AniKai → AniKoto → MovieBox
// ---------------------------------------------------------------------------

import { movieboxProvider } from "./moviebox-provider";
import { notorrentProvider, vidfastProvider, vidupProvider, felisplusProvider, anikaiProvider, anikotoProvider } from "./tmdb-embed-provider";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// Ordered by rank (highest first).
export const nexusCustomProviders = [
  vidfastProvider,     // 1290 — VidFast (vidfast.vc, movie+TV)
  notorrentProvider,   // 1280 — NoTorrent (Stremio addon, movie+TV, 8-11 streams)
  felisplusProvider,   // 1255 — FelisPlus (movie+TV, via TMDB-Embed API)
  vidupProvider,       // 1252 — VidUp (vidup.to, movie+TV)
  anikaiProvider,      // 1250 — AniKai (anime, via TMDB-Embed API)
  anikotoProvider,     // 1240 — AniKoto (anime, via TMDB-Embed API, dub support)
  movieboxProvider,    // 1000 — MovieBox (self-hosted VPS, MP4 + multi-audio dubs)
] as const;

export const nexusCustomEmbeds = [] as const;

export {
  notorrentProvider,
  vidfastProvider,
  vidupProvider,
  felisplusProvider,
  movieboxProvider,
  anikaiProvider,
  anikotoProvider,
};

export { getHealthyProviders, getHealthSnapshot, invalidateHealth } from "./provider-health";
export type { ProviderHealth } from "./provider-health";

export type NexusCustomProvider = (typeof nexusCustomProviders)[number];

export async function getLiveNexusProviders(
  builtinSources: { id: string; name: string }[] = [],
): Promise<ProbeableProvider[]> {
  const healthyCustom = await getHealthyProviders(
    nexusCustomProviders.map((p) => ({
      id: p.id,
      name: p.name,
      disabled: p.disabled,
    })),
  );
  return [...healthyCustom, ...builtinSources];
}
