// embeds/videasy/videasy-provider.ts
// NEXUS — Videasy 🎥 (movie + TV, via TMDB-Embed API)

import { makeEmbedProvider } from "../shared";

export const videasyEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-videasy",
  name: "Videasy 🎥",
  rank: 950,
  backend: "videasy",
});
