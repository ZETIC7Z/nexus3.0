// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// Custom NEXUS providers — MovieBox only.
// Zunime and VidSrc are disabled; only MovieBox is active.
// ---------------------------------------------------------------------------

import { movieboxProvider } from "./moviebox-provider";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// Ordered by rank (highest first)
export const nexusCustomProviders = [
  movieboxProvider,  // 1000 — MovieBox (self-hosted VPS, MP4 + multi-audio dubs)
] as const;

export const nexusCustomEmbeds: never[] = [];

export { movieboxProvider };

export { getHealthyProviders, getHealthSnapshot, invalidateHealth } from "./provider-health";
export type { ProviderHealth } from "./provider-health";

export type NexusCustomProvider = (typeof nexusCustomProviders)[number];

/**
 * Return only the providers whose backend is currently alive.
 * Merges probed MovieBox with built-in P-Stream sources so all
 * providers display in a single unified area.
 */
export async function getLiveNexusProviders(
  builtinSources: { id: string; name: string }[] = [],
): Promise<ProbeableProvider[]> {
  const healthyCustom = await getHealthyProviders(
    nexusCustomProviders.map((p) => ({ id: p.id, name: p.name })),
  );
  return [...healthyCustom, ...builtinSources];
}
