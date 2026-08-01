// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// Movie / TV:  Zephyr → Nyxos → Astrix → Xylos → Setzu
// Anime:       Nyxos → Vexis → Morvyn
// ---------------------------------------------------------------------------
// VidUp2/VidCore2 are intentionally not registered because their worker
// route-config endpoints are persistently rate-limited.

import { movieboxProvider } from "./moviebox-provider";
import {
  notorrentProvider,
  vidfastProvider,
  vidupProvider,
  anikaiProvider,
  anikotoProvider,
} from "./tmdb-embed-provider";
import { vidfast2Provider } from "./vidfast2-provider";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// Ordered by rank (highest first).
export const nexusCustomProviders = [
  vidfast2Provider,      // 1295 — Zephyr (Cloudflare Worker, standalone)
  movieboxProvider,      // 1290 — Nyxos (self-hosted VPS, MP4 + multi-audio dubs)
  notorrentProvider,     // 1280 — Astrix (Stremio addon, movie+TV, 8-11 streams)
  vidupProvider,         // 1252 — Xylos (vidup.to, movie+TV)
  vidfastProvider,       // 1240 — Setzu (vidfast.vc, movie+TV)
  anikaiProvider,        // 1250 — Vexis (anime, via TMDB-Embed API)
  anikotoProvider,       // 1240 — Morvyn (anime, via TMDB-Embed API, dub support)
] as const;

export const nexusCustomEmbeds = [] as const;

export {
  notorrentProvider,
  vidfastProvider,
  vidfast2Provider,
  vidupProvider,
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
