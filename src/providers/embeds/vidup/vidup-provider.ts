// embeds/vidup/vidup-provider.ts
// NEXUS — VidUp ⬆️ (movie + TV, via TMDB-Embed API)

import { makeEmbedProvider } from "../shared";

export const vidupEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-vidup",
  name: "VidUp",
  rank: 940,
  backend: "vidup",
});
