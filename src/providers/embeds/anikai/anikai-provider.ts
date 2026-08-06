// embeds/anikai/anikai-provider.ts
// NEXUS — AniKai 🥷 (anime, via TMDB-Embed API)
// Anime-only provider: sub streams play directly, dub streams become
// selectable audio tracks in the player.

import { makeEmbedProvider } from "../shared";

export const anikaiEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-anikai",
  name: "AniKai 🥷",
  rank: 890,
  backend: "anikai",
  anime: true,
});
