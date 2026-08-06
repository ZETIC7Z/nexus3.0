// embeds/anikoto/anikoto-provider.ts
// NEXUS — AniKoto 👺 (anime, via TMDB-Embed API, dub support)
// Anime-only provider: sub streams play directly, dub streams become
// selectable audio tracks in the player.

import { makeEmbedProvider } from "../shared";

export const anikotoEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-anikoto",
  name: "AniKoto",
  rank: 900,
  backend: "anikoto",
  anime: true,
});
