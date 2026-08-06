// embeds/index.ts
// NEXUS — "Embeds ⚡" source provider
// ---------------------------------------------------------------------------
// A single source entry in the player ("Embeds ⚡") that contains every
// TMDB-Embed provider inside it. Its scrape returns embeds for the relevant
// provider family:
//
//   Movie / TV : NoTorrent, VidCore, Videasy, VidUp, VidFast
//   Anime      : AniKoto, AniKai
//
// NOTE: VidLink and VixSrc were removed — their CDN (bcdnxw.hakunaymatata.com)
// is consistently geo-blocked through the HF proxy (429/403 on every stream).
// No replacement providers exist on the TMDB-Embed API.
//
// Each embed's URL is the FULL TMDB-Embed API endpoint for this media, so
// the embed scrapers need no media context of their own. The movie-web
// runner tries embeds in rank order (fast/stable first) and stops at the
// first one that returns a playable stream — that is the automatic
// "best provider" selection. Dead/offline providers fail fast and are
// skipped by the runner.
// ---------------------------------------------------------------------------

import { NotFoundError } from "@nexus/providers";

import { makeProviderContext } from "../shared/makeProviderContext";
import { buildEmbedUrl, detectIsAnime } from "./shared";
import { anikaiEmbedProvider } from "./anikai/anikai-provider";
import { anikotoEmbedProvider } from "./anikoto/anikoto-provider";
import { notorrentEmbedProvider } from "./notorrent/notorrent-provider";
import { vidcoreEmbedProvider } from "./vidcore/vidcore-provider";
import { videasyEmbedProvider } from "./videasy/videasy-provider";
import { vidfastEmbedProvider } from "./vidfast/vidfast-provider";
import { vidupEmbedProvider } from "./vidup/vidup-provider";

// Ordered by rank (highest = tried first by the runner).
export const nexusEmbedProviders = [
  notorrentEmbedProvider, // 970 — Stremio aggregator, many mirrors, reliable
  vidcoreEmbedProvider,   // 960 — Supreme/Prime/Orbit servers (moon CDN works)
  videasyEmbedProvider,   // 950 — movie + TV
  vidupEmbedProvider,     // 940 — movie + TV (moon CDN works for series)
  vidfastEmbedProvider,   // 930 — movie + TV
  anikotoEmbedProvider,   // 900 — anime, dub support
  anikaiEmbedProvider,    // 890 — anime
] as const;

export {
  anikaiEmbedProvider,
  anikotoEmbedProvider,
  notorrentEmbedProvider,
  vidcoreEmbedProvider,
  videasyEmbedProvider,
  vidfastEmbedProvider,
  vidupEmbedProvider,
};

export {
  fetchAndRankEmbed,
  buildEmbedUrl,
  EMBED_API_BASE,
  isHlsItem,
  type EmbedStreamItem,
  type RankedStream,
} from "./shared";

/**
 * "Embeds ⚡" source — returns one embed per relevant provider, each with
 * the full API endpoint URL pre-built for the current media.
 */
export const embedsSourceProvider = makeProviderContext({
  id: "nexus-embeds",
  name: "Embeds ⚡",
  rank: 1320,
  disabled: false,
  async scrape(ctx: any) {
    const media = ctx.media;
    const isAnime = await detectIsAnime(media);
    const family = nexusEmbedProviders.filter((p) =>
      isAnime ? p.anime : !p.anime,
    );
    if (family.length === 0) throw new NotFoundError("Embeds: no providers");

    return {
      embeds: family.map((p) => ({
        embedId: p.id,
        url: buildEmbedUrl(p.backend ?? p.id, ctx),
      })),
    };
  },
});
