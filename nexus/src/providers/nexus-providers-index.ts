// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// Custom NEXUS providers merged with built-in P-Stream sources.
// ---------------------------------------------------------------------------

import { movieboxProvider } from "./moviebox-provider";
import { zunimeProvider, zunimeEmbeds } from "./zunime-provider";
import { vidsrcProvider } from "./vidsrc-provider";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// Ordered by rank (highest first)
export const nexusCustomProviders = [
  zunimeProvider,    // 1050 — Zunime (ZETIANIME-API, anime only)
  movieboxProvider,  // 1000 — MovieBox (self-hosted VPS, MP4 + multi-audio dubs)
  vidsrcProvider,    //  900 — VidSrc (self-hosted scraper, HLS via headless browser)
] as const;

export const nexusCustomEmbeds = [
  ...zunimeEmbeds,
] as const;

export { movieboxProvider };
export { zunimeProvider };
export { zunimeEmbeds };
export { vidsrcProvider };

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
