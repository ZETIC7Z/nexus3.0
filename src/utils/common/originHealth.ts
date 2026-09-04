// originHealth.ts
// Remembers which proxy/CDN origins have failed from THIS device so the
// player can skip them instead of burning a request (and a console error)
// on every stream. Persisted to localStorage so the lesson survives reloads.
//
// Failure kinds tracked:
//  - "network": the browser could not reach the origin at all (CORS refusal,
//    DNS failure, connection refused). These almost never heal, so they are
//    remembered for a long time (6h) with immediate re-check allowed.
//  - "timeout": origin answered too slowly. Remembered briefly (10 min).

const STORAGE_KEY = "nexus-origin-health-v1";
const NETWORK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 60;

export type OriginFailureKind = "network" | "timeout";

interface OriginHealthEntry {
  kind: OriginFailureKind;
  at: number;
}

function loadStore(): Record<string, OriginHealthEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, OriginHealthEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, OriginHealthEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full/blocked - memory-only mode is fine.
  }
}

export function originOfUrl(url: string): string | null {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

function isFresh(entry: OriginHealthEntry | undefined): boolean {
  if (!entry) return false;
  const ttl = entry.kind === "network" ? NETWORK_TTL_MS : TIMEOUT_TTL_MS;
  return Date.now() - entry.at < ttl;
}

/** True while we should avoid this origin entirely. */
export function isOriginDead(url: string): boolean {
  if (typeof window === "undefined") return false;
  const origin = originOfUrl(url);
  if (!origin) return false;
  const store = loadStore();
  return isFresh(store[origin]);
}

/** Only true for origins we are confident are long-term dead (CORS/DNS). */
export function isOriginLikelyPermanentlyDead(url: string): boolean {
  if (typeof window === "undefined") return false;
  const origin = originOfUrl(url);
  if (!origin) return false;
  const store = loadStore();
  return store[origin]?.kind === "network" && isFresh(store[origin]);
}

/** Record that an origin failed with a network-level error (CORS/DNS/etc). */
export function markOriginNetworkDead(url: string): void {
  const origin = originOfUrl(url);
  if (!origin) return;
  const store = loadStore();
  store[origin] = { kind: "network", at: Date.now() };
  prune(store);
  saveStore(store);
}

/** Record that an origin timed out - a softer, shorter-lived memory. */
export function markOriginTimeout(url: string): void {
  const origin = originOfUrl(url);
  if (!origin) return;
  const store = loadStore();
  store[origin] = { kind: "timeout", at: Date.now() };
  prune(store);
  saveStore(store);
}

/** A successful fetch clears any memory of failure for that origin. */
export function markOriginHealthy(url: string): void {
  const origin = originOfUrl(url);
  if (!origin) return;
  const store = loadStore();
  if (store[origin]) {
    delete store[origin];
    saveStore(store);
  }
}

/** Manually clear all memory (exposed for a future settings button). */
export function clearOriginHealth(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function prune(store: Record<string, OriginHealthEntry>): void {
  const keys = Object.keys(store);
  // Drop stale entries first.
  for (const key of keys) {
    if (!isFresh(store[key])) delete store[key];
  }
  // Hard-cap size, evicting oldest.
  const remaining = Object.keys(store);
  if (remaining.length <= MAX_ENTRIES) return;
  remaining
    .sort((a, b) => (store[a]?.at ?? 0) - (store[b]?.at ?? 0))
    .slice(0, remaining.length - MAX_ENTRIES)
    .forEach((key) => delete store[key]);
}
