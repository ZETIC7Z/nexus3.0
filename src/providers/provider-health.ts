// provider-health.ts
// NEXUS — Provider Health & Probe System
// ---------------------------------------------------------------------------

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
  switch (id) {
    case "nexus-vidfast2":
      // Keep Zephyr's existing health check unchanged.
      return "https://vidfast.samxerz-zeticuz.workers.dev/vc-proxy?path=movie/603";
    case "nexus-notorrent":
      // Same-origin API route; verifies the direct addon integration is alive.
      return "/api/notorrent?type=movie&id=tt1745960";
    case "nexus-vidcore":
    case "nexus-videasy":
    case "nexus-vidup":
    case "nexus-vidfast":
      // These providers already return CORS-safe URLs from the TMDB-Embed
      // backend. Probe each provider endpoint directly instead of probing a
      // generic root or incorrectly marking it unhealthy.
      return `https://stycanine1-tmdb-embed-api.hf.space/api/streams/${
        id.replace("nexus-", "")
      }/movie/533535`;
    case "nexus-embeds":
      return "https://stycanine1-tmdb-embed-api.hf.space/";
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
    // Probe directly — both the CF Worker and the TMDB-Embed space serve
    // CORS `*`, so a flaky user-configured CORS proxy can never hide a
    // working provider.
    const res = await fetch(url, { signal: ctrl.signal, method: "GET", mode: "cors" });
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
