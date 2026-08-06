// embeds/notorrent/notorrent-provider.ts
// NEXUS — NoTorrent 🧲 (movie + TV, via TMDB-Embed API)
// Stremio-based aggregator — usually returns multiple MP4/HLS mirrors.

import { makeEmbedProvider } from "../shared";

export const notorrentEmbedProvider = makeEmbedProvider({
  id: "nexus-embed-notorrent",
  name: "NoTorrent",
  rank: 970,
  backend: "notorrent",
});
