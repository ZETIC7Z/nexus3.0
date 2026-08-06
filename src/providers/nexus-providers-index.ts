// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// Sources (shown in the player source list):
//   1. Zephyr 🔥   — CF Worker + vidfast.vc (tried first)
//   2. Embeds ⚡   — container for all TMDB-Embed providers (movie/TV + anime)
//
// Embeds (inside "Embeds ⚡"):
//   Movie/TV: VidLink, NoTorrent, Videasy, VixSrc, VidCore, VidUp, VidFast
//   Anime:     AniKoto, AniKai
// ---------------------------------------------------------------------------

import { vidfast2Provider } from "./zephyr/provider";
import {
  embedsSourceProvider,
  nexusEmbedProviders,
} from "./embeds";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// Ordered by rank (highest first). Zephyr is tried before Embeds.
export const nexusCustomProviders = [
  vidfast2Provider,      // 1330 — Zephyr (CF Worker + vidfast.vc, works everywhere)
  embedsSourceProvider,  // 1320 — Embeds ⚡ (TMDB-Embed provider family)
] as const;

export const nexusCustomEmbeds = nexusEmbedProviders;

export { vidfast2Provider } from "./zephyr/provider";
export {
  embedsSourceProvider,
  nexusEmbedProviders,
} from "./embeds";

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
