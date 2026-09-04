// embeds/index.ts
// NEXUS — TMDB-Embed provider family re-exports
// ---------------------------------------------------------------------------
// Each playable provider is its own top-level source in the player
// (Videasy, VaPlayer, NetMirror, ...). See shared.ts for the catalog and
// scrape engine. This file keeps the public exports stable for the dev
// video tester.
// ---------------------------------------------------------------------------

export {
  buildEmbedUrl,
  buildProviderEndpoint,
  buildAudioTracksForProvider,
  collectCaptionsForStreams,
  EMBED_API_BASE,
  extractCaptions,
  fetchEmbedApi,
  fetchProviderResponse,
  fetchProviderStreams,
  headersForItem,
  isBrowserPlayableItem,
  isHlsItem,
  isMkvItem,
  normalizeProviderId,
  playbackUrlForItem,
  providerIdForItem,
  rankStreams,
  streamsForProvider,
  type EmbedApiResponse,
  type EmbedMediaRequest,
  type EmbedStreamItem,
  type NexusProviderDef,
  type RankedStream,
} from "./shared";

export {
  DOWNLOAD_ONLY_PROVIDERS,
  NEXUS_PROVIDER_CATALOG,
  PLAYABLE_PROVIDERS,
} from "./shared";
