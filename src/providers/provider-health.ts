// provider-health.ts
// NEXUS — Provider Health & Probe System
// ---------------------------------------------------------------------------
// GOAL (user requirement): the source list AND the loading spinner must ONLY
// show providers that are actually alive. Dead providers never appear.
//
// HOW: before the scrape UI renders its provider list, we run a lightweight
// parallel "probe" against each provider's backend. Only providers that respond
// are marked healthy and shown. This mirrors NEXUS's `useProviderScrape`
// single-probe pattern (see NEXUS README "Single Probe Fetch").
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
const HEALTH_TTL = 5 * 60 * 1000; // re-probe every 5 min
const healthCache = new Map<string, ProviderHealth>();

// ── Per-provider probe endpoints ────────────────────────────────────────────
// A probe just checks "is the backend up?" — cheap, no full scrape.
function probeUrlFor(id: string): string | null {
  const mb = (import.meta.env.VITE_MOVIEBOX_API_URL as string | undefined)?.replace(/\/$/, "");

  switch (id) {
    case "nexus-moviebox":
      return mb ? `${mb}/` : null; // FastAPI root returns endpoint list
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
    const res = await fetch(getProxiedUrl(url), { signal: ctrl.signal, method: "GET", mode: "cors" });
    // Any non-5xx response means the backend is alive.
    healthy = res.status < 500;
  } catch {
    healthy = false;
  } finally {
    clearTimeout(t);
  }

  const h: ProviderHealth = {
    id,
    name,
    healthy,
    latencyMs: healthy ? Math.round(performance.now() - start) : null,
    checkedAt: Date.now(),
  };
  healthCache.set(id, h);
  return h;
}

// ── Public API ────────────────────────────────────────────────────────────
export interface ProbeableProvider {
  id: string;
  name: string;
  disabled?: boolean;
}

/**
 * Probe a list of providers in parallel and return ONLY the healthy ones.
 * Call this before rendering the source picker / spinner.
 */
export async function getHealthyProviders<T extends ProbeableProvider>(
  providers: readonly T[],
): Promise<T[]> {
  const enabled = providers.filter((p) => !p.disabled);
  const results = await Promise.all(enabled.map((p) => probeOne(p.id, p.name)));
  const healthyIds = new Set(results.filter((r) => r.healthy).map((r) => r.id));
  return enabled.filter((p) => healthyIds.has(p.id));
}

/** Get the current cached health map (for a status page / debugging). */
export function getHealthSnapshot(): ProviderHealth[] {
  return [...healthCache.values()];
}

/** Force a re-probe next time (e.g. after a manual "retry sources" action). */
export function invalidateHealth(id?: string): void {
  if (id) healthCache.delete(id);
  else healthCache.clear();
}
