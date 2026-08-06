// embeds/vidfast/vidfast-provider.ts
// NEXUS — VidFast ⚡ (movie + TV, via TMDB-Embed API)

import { makeEmbedProvider } from "../shared";

export const vidfastEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-vidfast",
  name: "VidFast ⚡",
  rank: 930,
  backend: "vidfast",
});
