// provider-health.ts
// NEXUS — Provider Health & Probe System
// ---------------------------------------------------------------------------
// A provider is healthy only when its endpoint returns at least one stream that
// passes the same media-aware validation used for playback. Results are cached
// per provider and media request so one empty title cannot hide a provider that
// works for another title.
// ---------------------------------------------------------------------------

import {
  fetchProviderStreams,
  pickUsable,
  rankStreams,
  type EmbedMediaRequest,
} from "./embeds/shared";

export interface ProviderHealth {
  id: string;
  name: string;
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: number;
  mediaKey?: string;
}

const HEALTH_TIMEOUT = 30_000;
const HEALTH_TTL = 5 * 60 * 1000;
const healthCache = new Map<string, ProviderHealth>();

const ANIME_PROVIDER_IDS = new Set(["anikoto", "anikai"]);

function providerSlug(id: string): string | null {
  if (!id.startsWith("nexus-")) return null;
  return id.replace(/^nexus-/, "");
}

function fallbackMediaFor(id: string): EmbedMediaRequest {
  const slug = providerSlug(id);
  if (slug && ANIME_PROVIDER_IDS.has(slug)) {
    // One Piece — a stable anime fixture for manual source selection.
    return {
      tmdbId: "37854",
      type: "show",
      season: { number: 1 },
      episode: { number: 1 },
    };
  }

  // Shaun the Sheep Movie — a cheap, broadly cached general fixture.
  return { tmdbId: "24021", type: "movie" };
}

function normalizeMedia(media: EmbedMediaRequest): EmbedMediaRequest {
  if (media.type === "movie") {
    return { tmdbId: String(media.tmdbId), type: "movie" };
  }
  return {
    tmdbId: String(media.tmdbId),
    type: "show",
    season: { number: Number(media.season?.number) || 1 },
    episode: { number: Number(media.episode?.number) || 1 },
  };
}

function mediaKey(media: EmbedMediaRequest): string {
  const normalized = normalizeMedia(media);
  if (normalized.type === "movie") return `movie:${normalized.tmdbId}`;
  return `show:${normalized.tmdbId}:${normalized.season?.number ?? 1}:${normalized.episode?.number ?? 1}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("provider health check timed out")),
      timeoutMs,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

async function probeOne(
  provider: ProbeableProvider,
  requestedMedia?: EmbedMediaRequest,
): Promise<ProviderHealth> {
  const media = normalizeMedia(requestedMedia ?? fallbackMediaFor(provider.id));
  const requestKey = `${provider.id}|${mediaKey(media)}`;
  const cached = healthCache.get(requestKey);
  if (cached && Date.now() - cached.checkedAt < HEALTH_TTL) return cached;

  const started = performance.now();
  let healthy = false;
  try {
    const items = await withTimeout(
      fetchProviderStreams(providerSlug(provider.id) ?? "", media),
      HEALTH_TIMEOUT,
    );
    if (items.length > 0) {
      const ranked = await withTimeout(rankStreams(items), HEALTH_TIMEOUT);
      healthy = pickUsable(ranked).length > 0;
    }
  } catch {
    healthy = false;
  }

  const result: ProviderHealth = {
    id: provider.id,
    name: provider.name,
    healthy,
    latencyMs: healthy ? Math.round(performance.now() - started) : null,
    checkedAt: Date.now(),
    mediaKey: mediaKey(media),
  };
  healthCache.set(requestKey, result);
  return result;
}

export interface ProbeableProvider {
  id: string;
  name: string;
  disabled?: boolean;
  anime?: boolean;
}

export async function getHealthyProviders<T extends ProbeableProvider>(
  providers: readonly T[],
  media?: EmbedMediaRequest,
): Promise<T[]> {
  const enabled = providers.filter((provider) => !provider.disabled);
  const results = await Promise.all(
    enabled.map((provider) => probeOne(provider, media)),
  );
  const healthyIds = new Set(
    results.filter((result) => result.healthy).map((result) => result.id),
  );
  return enabled.filter((provider) => healthyIds.has(provider.id));
}

export function getHealthSnapshot(): ProviderHealth[] {
  return [...healthCache.values()];
}

export function invalidateHealth(id?: string): void {
  if (!id) {
    healthCache.clear();
    return;
  }
  for (const key of healthCache.keys()) {
    if (key.startsWith(`${id}|`)) healthCache.delete(key);
  }
}
