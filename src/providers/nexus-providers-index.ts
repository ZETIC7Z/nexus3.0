// nexus-providers-index.ts
// NEXUS — Provider Registry
// ---------------------------------------------------------------------------
// Sources (shown in the player source list, tried in rank order):
//   1. Zephyr        — CF Worker + vidfast.vc (movies, TV)
//   2. NoTorrent     — Stremio aggregator → Server 1, 2, 3...
//   3. VidCore       — Supreme/Prime → Server 1, 2...
//   4. Videasy       — movies, TV
//   5. VidUp         — movies, TV (moon CDN)
//   6. VidFast       — movies, TV
//   7. AniKoto       — anime, dub support
//   8. AniKai        — anime, sub only
// ---------------------------------------------------------------------------

import { vidfast2Provider } from "./zephyr/provider";
import { makeStandaloneSource } from "./embeds/shared";
import { makeEmbedContext } from "./shared/makeProviderContext";
import { flags } from "@nexus/providers";
import { getHealthyProviders, type ProbeableProvider } from "./provider-health";

// ── Movie / TV sources ──────────────────────────────────────────────────
export const notorrentSource = makeStandaloneSource({
  id: "nexus-notorrent", name: "NoTorrent", rank: 970, backend: "notorrent",
});

export const vidcoreSource = makeStandaloneSource({
  id: "nexus-vidcore", name: "VidCore", rank: 960, backend: "vidcore",
});

export const videasySource = makeStandaloneSource({
  id: "nexus-videasy", name: "Videasy", rank: 950, backend: "videasy",
});

export const vidupSource = makeStandaloneSource({
  id: "nexus-vidup", name: "VidUp", rank: 940, backend: "vidup",
});

export const vidfastSource = makeStandaloneSource({
  id: "nexus-vidfast", name: "VidFast", rank: 930, backend: "vidfast",
});

// ── Anime sources ───────────────────────────────────────────────────────
export const anikotoSource = makeStandaloneSource({
  id: "nexus-anikoto", name: "AniKoto", rank: 900, backend: "anikoto", anime: true,
});

export const anikaiSource = makeStandaloneSource({
  id: "nexus-anikai", name: "AniKai", rank: 890, backend: "anikai", anime: true,
});

// ── Source list (ordered by rank, highest tried first) ──────────────────
export const nexusCustomProviders = [
  vidfast2Provider,  // 1330 — Zephyr
  notorrentSource,   // 970  — NoTorrent
  vidcoreSource,     // 960  — VidCore
  videasySource,     // 950  — Videasy
  vidupSource,       // 940  — VidUp
  vidfastSource,     // 930  — VidFast
  anikotoSource,     // 900  — AniKoto (anime)
  anikaiSource,      // 890  — AniKai (anime)
] as const;

// ── Numbered server embeds (for per-provider server selection) ──────────
const makeServerEmbed = (n: number) => makeEmbedContext({
  id: `nexus-server-${n}`,
  name: `Server ${n}`,
  rank: 1000 - n,
  async scrape(ctx: any) {
    const url = (ctx as any).url ?? "";
    if (!url) throw new Error("No URL");
    const isHls = url.includes(".m3u8") || url.includes("m3u8-proxy");
    return {
      embeds: [],
      stream: [isHls
        ? { id: `srv${n}-hls`, type: "hls", playlist: url, flags: [flags.CORS_ALLOWED], captions: [], headers: {}, skipValidation: true }
        : { id: `srv${n}-mp4`, type: "file", qualities: { unknown: { type: "mp4", url } }, flags: [flags.CORS_ALLOWED], captions: [], headers: {}, skipValidation: true }
      ],
    };
  },
});

export const nexusCustomEmbeds = [
  makeServerEmbed(1), makeServerEmbed(2), makeServerEmbed(3),
  makeServerEmbed(4), makeServerEmbed(5), makeServerEmbed(6),
] as const;

export { vidfast2Provider } from "./zephyr/provider";
export { getHealthyProviders, getHealthSnapshot, invalidateHealth } from "./provider-health";
export type { ProviderHealth } from "./provider-health";
export type NexusCustomProvider = (typeof nexusCustomProviders)[number];

export async function getLiveNexusProviders(
  builtinSources: { id: string; name: string }[] = [],
): Promise<ProbeableProvider[]> {
  const healthyCustom = await getHealthyProviders(
    nexusCustomProviders.map((p) => ({ id: p.id, name: p.name, disabled: p.disabled })),
  );
  return [...healthyCustom, ...builtinSources];
}
