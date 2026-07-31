// provider-health.ts
// NEXUS — Provider Health & Probe System
// ---------------------------------------------------------------------------

import { getProxiedUrl } from "./proxiedFetch";

export interface ProviderHealth {
  id: string;
  name: string;
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: number;
}

const PROBE_TIMEOUT = 6000;
const HEALTH_TTL = 5 * 60 * 1000;
const healthCache = new Map<string, ProviderHealth>();

function probeUrlFor(id: string): string | null {
  const mb = "/api/moviebox";
  const hf = "https://stycanine1-tmdb-embed-api.hf.space";

  switch (id) {
    case "nexus-moviebox":
      return `${mb}/search?q=one`;
    case "nexus-notorrent":
    case "nexus-vidfast":
    case "nexus-vidup":
      return `${hf}/api/streams/${id.replace("nexus-", "")}/movie/603`;
    case "nexus-anikai":
    case "nexus-anikoto":
      return `${hf}/api/streams/${id.replace("nexus-", "")}/series/37854?season=1&episode=1`;
    case "nexus-felisplus":
      return null;
    default:
      return null;
  }
}

async function probeOne(id: string, name: string): Promise<ProviderHealth> {
  const cached = healthCache.get(id);
  if (cached && Date.now() - cached.checkedAt < HEALTH_TTL) return cached;

  const url = probeUrlFor(id);
  const start = performance.now();

  if (!url) {
    const h: ProviderHealth = { id, name, healthy: false, latencyMs: null, checkedAt: Date.now() };
    healthCache.set(id, h);
    return h;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
  let healthy = false;
  try {
    // The HF Space explicitly allows browser CORS. Probe it directly so a
    // flaky user-configured CORS proxy cannot hide otherwise working sources.
    const probeTarget = url.startsWith("https://stycanine1-tmdb-embed-api.hf.space/")
      ? url
      : getProxiedUrl(url);
    const res = await fetch(probeTarget, { signal: ctrl.signal, method: "GET", mode: "cors" });
    healthy = res.status >= 200 && res.status < 400;
  } catch {
    healthy = false;
  } finally {
    clearTimeout(t);
  }

  const h: ProviderHealth = { id, name, healthy, latencyMs: healthy ? Math.round(performance.now() - start) : null, checkedAt: Date.now() };
  healthCache.set(id, h);
  return h;
}

export interface ProbeableProvider { id: string; name: string; disabled?: boolean; }

export async function getHealthyProviders<T extends ProbeableProvider>(providers: readonly T[]): Promise<T[]> {
  const enabled = providers.filter((p) => !p.disabled);
  const results = await Promise.all(enabled.map((p) => probeOne(p.id, p.name)));
  const healthyIds = new Set(results.filter((r) => r.healthy).map((r) => r.id));
  return enabled.filter((p) => healthyIds.has(p.id));
}

export function getHealthSnapshot(): ProviderHealth[] { return [...healthCache.values()]; }

export function invalidateHealth(id?: string): void {
  if (id) healthCache.delete(id);
  else healthCache.clear();
}
