// nexus-providers-index.ts
// NEXUS — Provider Registry (updated)
// ---------------------------------------------------------------------------
// All custom NEXUS providers, ordered by priority (highest rank first).
// These supplement the @p-stream/providers package.
//
// IMPORTANT: only providers that pass the health probe (provider-health.ts)
// are shown in the source list / spinner. Dead providers are hidden.
// ---------------------------------------------------------------------------

import { tmdbProvider } from "./TMdb-provider";
import { movieboxProvider } from "./moviebox-provider";
import { vidlinkProvider } from "./vidlink-provider";
import { videasyProvider } from "./videasy-provider";
import { vidfastProvider } from "./vidfast-provider";
import { hexaProvider } from "./hexa-provider";
import { yflixProvider } from "./yflix-provider";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// Ordered by rank (highest first)
export const nexusCustomProviders = [
  tmdbProvider,      // 900 — NEXUS HuggingFace TMDB-embed backend
  vidlinkProvider,   // 850 — VidLink (enc-dec.app)
  videasyProvider,   // 840 — Videasy (enc-dec.app)
  vidfastProvider,   // 830 — VidFast (enc-dec.app)
  hexaProvider,      // 820 — Hexa (enc-dec.app)
  yflixProvider,     // 810 — yFlix / 1Movies (enc-dec.app)
  movieboxProvider,  // 780 — MovieBox (self-hosted VPS, MP4 + multi-audio dubs)
] as const;

export {
  tmdbProvider,
  movieboxProvider,
  vidlinkProvider,
  videasyProvider,
  vidfastProvider,
  hexaProvider,
  yflixProvider,
};

export { getHealthyProviders, getHealthSnapshot, invalidateHealth } from "./provider-health";
export type { ProviderHealth } from "./provider-health";

export type NexusCustomProvider = (typeof nexusCustomProviders)[number];

/**
 * Return only the NEXUS providers whose backend is currently alive.
 * Use this to build the source-select list and the loading spinner
 * so DEAD providers never appear.
 *
 * Example (in your scrape hook / source list component):
 *   const live = await getLiveNexusProviders();
 *   // render `live` only
 */
export async function getLiveNexusProviders(): Promise<ProbeableProvider[]> {
  return getHealthyProviders(
    nexusCustomProviders.map((p) => ({ id: p.id, name: p.name })),
  );
}
