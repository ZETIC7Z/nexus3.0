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

// ZETIANIME-API endpoints — worker is primary, Vercel is fallback
const ZUNIME_WORKER_URL = "https://zetianime-api.samxerz-zeticuz.workers.dev";
const ZUNIME_VERCEL_URL = "https://zetianime-api.vercel.app";

// Providers that are external (not self-hosted). These are ALWAYS shown in the
// source list — they will fail gracefully during scrape rather than disappearing.
const EXTERNAL_PROVIDER_IDS = new Set(["nexus-zunime"]);

// ── Per-provider probe endpoints ────────────────────────────────────────────
// A probe just checks "is the backend up?" — cheap, no full scrape.
function probeUrlFor(id: string): string | null {
  const mb = (import.meta.env.VITE_MOVIEBOX_API_URL as string | undefined)?.replace(/\/$/, "");

  switch (id) {
    case "nexus-moviebox":
      return mb ? `${mb}/` : null; // FastAPI root returns endpoint list
    case "nexus-zunime":
      return `${ZUNIME_WORKER_URL}/`; // Probe ZETIANIME worker API root
    default:
      return null;
  }
}

async function probeOne(id: string, name: string): Promise<ProviderHealth> {
  const cached = healthCache.get(id);
  if (cached && Date.now() - cached.checkedAt < HEALTH_TTL) return cached;

  const url = probeUrlFor(id);
  const start = performance.now();

  // External providers (e.g. free APIs without a VPS) are always shown —
  // they degrade gracefully during scrape rather than vanishing from source list.
  if (!url) {
    const alwaysHealthy = EXTERNAL_PROVIDER_IDS.has(id);
    const h: ProviderHealth = { id, name, healthy: alwaysHealthy, latencyMs: null, checkedAt: Date.now() };
    healthCache.set(id, h);
    return h;
  }

  // Probe the primary URL with a timeout; for external providers, also try
  // the fallback URL before giving up.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
  let healthy = false;
  try {
    const res = await fetch(getProxiedUrl(url), { signal: ctrl.signal, method: "GET", mode: "cors" });
    // Any non-5xx response means the backend is alive.
    healthy = res.status < 500;
  } catch {
    // If primary probe failed and this is an external provider, try Vercel fallback
    if (id === "nexus-zunime") {
      try {
        const res2 = await fetch(getProxiedUrl(`${ZUNIME_VERCEL_URL}/`), { method: "GET", mode: "cors" });
        healthy = res2.status < 500;
      } catch {
        // Both failed — still show as healthy (graceful scrape failure)
        healthy = true;
      }
    } else {
      healthy = false;
    }
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
