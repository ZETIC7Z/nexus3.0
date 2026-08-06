// embeds/vidcore/vidcore-provider.ts
// NEXUS — VidCore 💎 (movie + TV, via TMDB-Embed API)
// Usually returns 2 servers (e.g. Supreme + Prime) — best/fastest wins.

import { makeEmbedProvider } from "../shared";

export const vidcoreEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-vidcore",
  name: "Embeds / VidCore",
  rank: 960,
  backend: "vidcore",
});
