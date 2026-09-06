import { useEffect } from "react";

import { useAdsStore } from "@/stores/ads";
import { useProfileStore } from "@/stores/profiles";

/**
 * Shared plumbing for all NEXUS ad surfaces (Adsterra + banner slots).
 *
 * Two hard rules:
 * 1. Every ad surface checks `shouldBlockAds()` before injecting ANY script
 *    or rendering ANY markup — the Settings "Disable advertisements" switch
 *    must remove all ads completely.
 * 2. Ads are also suppressed while a kids profile is active.
 */

/** True when the user turned ads off in Settings → Preferences. */
export function areAdsDisabled(): boolean {
  return useAdsStore.getState().adsDisabled;
}

/**
 * True when no ad script/markup should ever load: user opted out via
 * Settings, OR a kids profile is active (kid surfaces stay ad-free).
 */
export function shouldBlockAds(): boolean {
  if (areAdsDisabled()) return true;
  const { activeProfileId, profiles } = useProfileStore.getState();
  if (!activeProfileId) return false;
  const active = profiles.find((p) => p.id === activeProfileId);
  return !!active?.isKids;
}

/**
 * Reactive version of `shouldBlockAds()` for components that render visible
 * ad markup. This keeps banners in sync when the active profile changes
 * without a route change.
 */
export function useAdsBlocked(): boolean {
  const adsDisabled = useAdsStore((state) => state.adsDisabled);
  const isKids = useProfileStore((state) => {
    if (!state.activeProfileId) return false;
    const active = state.profiles.find(
      (profile) => profile.id === state.activeProfileId,
    );
    return !!active?.isKids;
  });
  return adsDisabled || isKids;
}

/**
 * Subscribe to ad-preference changes for the lifetime of the page.
 * `onChange` fires immediately with the current blocked state and again
 * whenever the ads-disabled flag flips. Use it to purge/unpurge scripts
 * mid-session so toggling ads in Settings takes effect without a reload.
 */
export function useAdsBlockedSubscription(onChange: (blocked: boolean) => void) {
  useEffect(() => {
    let last: boolean | null = null;
    const check = () => {
      const blocked = shouldBlockAds();
      if (blocked !== last) {
        last = blocked;
        onChange(blocked);
      }
    };
    check();
    // The ads store is persisted to localStorage; storage events catch
    // changes from other tabs, zustand subscriptions catch same-tab flips.
    const unsub = useAdsStore.subscribe(check);
    const profileUnsub = useProfileStore.subscribe(check);
    let onStorage: ((e: StorageEvent) => void) | null = (e) => {
      if (e.key === "__MW::ads") check();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      profileUnsub();
      if (onStorage) window.removeEventListener("storage", onStorage);
      onStorage = null;
    };
  }, [onChange]);
}

const adArtifactObservers = new Map<string, MutationObserver>();
const adArtifactHints = new Map<string, string[]>();

function getAdArtifactHints(sourceHint: string): string[] {
  return Array.from(
    new Set(
      sourceHint.toLowerCase().match(/[a-z0-9]{8,}/g) ?? [],
    ),
  );
}

/**
 * Track top-level nodes created by a network script. Popunder, Social Bar,
 * and Vignette formats commonly append their own iframe/div outside React's
 * root, so removing only the script tag would leave an overlay behind on a
 * route change. The observer watches both <body> and direct <html> children;
 * it marks only nodes that look like the requesting network's artifact, never
 * React descendants.
 */
function watchAdArtifacts(marker: string, sourceHint = ""): void {
  if (typeof document === "undefined" || !document.documentElement) return;
  if (sourceHint) adArtifactHints.set(marker, getAdArtifactHints(sourceHint));
  if (adArtifactObservers.has(marker)) return;

  const isArtifactForMarker = (element: HTMLElement): boolean => {
    const identity = `${element.id} ${
      typeof element.className === "string" ? element.className : ""
    }`.toLowerCase();
    const markup = element.outerHTML.slice(0, 12000).toLowerCase();
    const hints = adArtifactHints.get(marker) ?? [];
    if (hints.some((hint) => markup.includes(hint))) return true;

    // Social Bar's top-level transport iframe uses this stable prefix.
    if (marker === "social-bar" && /(^|[-_])container[-_]/.test(identity)) {
      return true;
    }

    // Adsterra's click-pop trigger is a nearly transparent, full-screen,
    // highest-z-index element (the network creates it, not this app).
    if (marker === "popunder") {
      const style = element.style;
      const zIndex = Number.parseInt(style.zIndex || "0", 10);
      const rect = element.getBoundingClientRect();
      const fullScreen =
        rect.width >= window.innerWidth * 0.9 &&
        rect.height >= window.innerHeight * 0.9;
      return style.position === "fixed" && zIndex >= 2147483646 && fullScreen;
    }

    // Monetag may rotate its container names, so its delivery host or zone
    // identifier is the safest marker when it appears in the generated DOM.
    if (marker.startsWith("monetag-")) {
      return /quge5|3nbf4|277030/.test(markup);
    }

    return false;
  };

  const mark = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const parent = element.parentElement;
    if (
      (parent !== document.body && parent !== document.documentElement) ||
      element === document.head ||
      element === document.body ||
      element.id === "root"
    ) {
      return;
    }
    if (isArtifactForMarker(element)) {
      element.dataset.nexusAdArtifact = marker;
    }
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(mark);
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  adArtifactObservers.set(marker, observer);
}

/**
 * Injects an external ad script once per page, tagged for later removal.
 * No-ops when `shouldBlockAds()` is true. Returns the injected element
 * (or null when blocked / already present).
 */
export function injectAdScript(
  src: string,
  marker: string,
  attrs: Record<string, string> = {},
): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  if (shouldBlockAds()) return null;
  watchAdArtifacts(marker, `${src} ${JSON.stringify(attrs)}`);
  const existing = document.querySelector(`script[data-ad-marker="${marker}"]`);
  if (existing) return existing as HTMLScriptElement;

  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.dataset.adMarker = marker;
  s.setAttribute("data-cfasync", "false");
  Object.entries(attrs).forEach(([k, v]) => {
    s.dataset[k] = v;
  });
  document.head.appendChild(s);
  return s;
}

/**
 * Shared banner-tag loader (same network the home/bookmarks banner slots
 * already use). Appends the banner script into `container` once per zone.
 */
export const BTAG_SRC = "https://aqle3.com/btag.min.js";

export function loadBannerTag(
  container: HTMLElement,
  zoneId: string,
  width: number,
  height: number,
) {
  if (typeof window === "undefined" || !zoneId || shouldBlockAds()) return;
  const dedupeId = `btag-${zoneId}`;
  if (document.getElementById(dedupeId)) return;
  const s = document.createElement("script");
  s.id = dedupeId;
  s.async = true;
  s.dataset.cfasync = "false";
  s.dataset.size = `${width}x${height}`;
  s.dataset.category = "common";
  s.dataset.id = `dl-banner-${width}x${height}`;
  s.dataset.zone = zoneId;
  s.src = BTAG_SRC;
  container.appendChild(s);
}

/**
 * First-party ad-script delivery (anti-adblock layer).
 *
 * Adblockers (uBlock, AdGuard, AdBlock Plus) block known ad-network
 * domains, but almost never the site's own origin. So the ad script is
 * requested same-origin from `/ads-serve/<path>` — nginx (production) and
 * the Vite dev proxy (local) forward it to the ad network server-side.
 * If first-party delivery fails (e.g. static host without the proxy), we
 * fall back to the ad network's direct URL once.
 */
export function injectAdScriptViaProxy(
  scriptUrl: string,
  marker: string,
  attrs: Record<string, string> = {},
): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  if (shouldBlockAds()) return null;
  if (document.querySelector(`script[data-ad-marker="${marker}"]`)) {
    return document.querySelector<HTMLScriptElement>(
      `script[data-ad-marker="${marker}"]`,
    );
  }

  let pathname = scriptUrl;
  try {
    const url = new URL(scriptUrl);
    pathname = `${url.pathname}${url.search}`;
  } catch {
    /* not an absolute URL — treat as path already */
  }

  const proxySrc = `/ads-serve${pathname}`;
  watchAdArtifacts(marker, `${scriptUrl} ${JSON.stringify(attrs)}`);
  const appendDirectFallback = () => {
    if (document.querySelector(`script[data-ad-fallback="${marker}"]`)) return;
    const fb = document.createElement("script");
    fb.src = scriptUrl;
    fb.async = true;
    fb.dataset.adMarker = marker;
    fb.dataset.adFallback = marker;
    fb.setAttribute("data-cfasync", "false");
    document.head.appendChild(fb);
  };

  const s = document.createElement("script");
  s.src = proxySrc;
  s.async = true;
  s.dataset.adMarker = marker;
  s.setAttribute("data-cfasync", "false");
  Object.entries(attrs).forEach(([k, v]) => {
    s.dataset[k] = v;
  });
  s.addEventListener("error", () => {
    s.remove();
    appendDirectFallback();
  });
  document.head.appendChild(s);

  // Some edge proxies return HTTP 200 with an empty body or an HTML
  // fallback. A script tag may not emit `error` for that case, so validate
  // the first-party response and switch to the real network URL explicitly.
  void fetch(proxySrc, { cache: "no-store" })
    .then(async (response) => {
      const type = response.headers.get("content-type") || "";
      const body = await response.text();
      const valid =
        response.ok &&
        /javascript|ecmascript/i.test(type) &&
        body.trim().length > 0;
      if (!valid && document.contains(s)) {
        s.remove();
        appendDirectFallback();
      }
    })
    .catch(() => {
      // The script's own error handler handles network failures. Keep the
      // tag here so a slow-but-valid proxy response is not duplicated.
    });

  return s;
}

/**
 * Removes every injected ad script / social-bar artifact from the DOM.
 * Called when ads are disabled mid-session so nothing lingers.
 */
export function purgeInjectedAds(markers: string[] = ["popunder", "social-bar"]) {
  if (typeof document === "undefined") return;
  markers.forEach((marker) => {
    document
      .querySelectorAll(`script[data-ad-marker="${marker}"]`)
      .forEach((el) => el.remove());
    document
      .querySelectorAll(`[data-nexus-ad-artifact="${marker}"]`)
      .forEach((el) => el.remove());
    adArtifactObservers.get(marker)?.disconnect();
    adArtifactObservers.delete(marker);
    adArtifactHints.delete(marker);
  });
  // Adsterra Social Bar renders itself inside an iframe appended to <body>
  // (id like "ads-fr" / container divs). Only remove those artifacts when
  // the Social Bar marker is being purged; changing click-pop owners must
  // not remove a still-eligible Social Bar.
  if (markers.includes("social-bar")) {
    document
      .querySelectorAll(          "body > iframe[src], body > iframe[id^='container-'], " +
          "body > iframe[class^='container-'], body > ins, body > div[id^='ads'], " +
          "html > iframe[id^='container-'], html > div[id^='container-'], " +

          "html > ins[id^='container-']",
      )
      .forEach((el) => el.remove());
  }
}

/**
 * Routes where advertising is appropriate. Keep this allowlist explicit so
 * player, account, settings, profile, kids, onboarding, migration, support,
 * and admin surfaces never start ad scripts accidentally.
 */
export function isAdEligiblePath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/browse" ||
    pathname.startsWith("/browse/") ||
    pathname === "/search" ||
    pathname.startsWith("/search/") ||
    pathname === "/s" ||
    pathname.startsWith("/s/") ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/") ||
    pathname === "/bookmarks" ||
    pathname === "/history" ||
    pathname === "/watch-history" ||
    pathname === "/algorithm" ||
    pathname.startsWith("/person/")
  );
}

// ── Click-pop coordination (Adsterra Popunder ↔ Monetag Multitag) ─────
// Both networks sell a click-pop format. Loading both on the same route can
// open two tabs from one user click, so exactly one network owns each
// eligible browsing context. The network itself still controls its frequency
// cap and whether the browser accepts the popup.
const CLICK_POP_NET_KEY = "__nexus_click_pop_net";

export type ClickPopNetwork = "adsterra" | "monetag";

let clickPopContextKey: string | null = null;
let clickPopOwner: ClickPopNetwork | null = null;

/**
 * Returns the single click-pop owner for a route context. The result is
 * memoized so Adsterra and Monetag controllers agree during one render, then
 * alternates across route changes/reloads when both networks are configured.
 */
export function getClickPopOwner(
  contextKey: string,
  adsterraConfigured: boolean,
  monetagConfigured: boolean,
): ClickPopNetwork | null {
  if (!adsterraConfigured && !monetagConfigured) {
    clickPopContextKey = contextKey;
    clickPopOwner = null;
    return null;
  }
  if (clickPopContextKey === contextKey) return clickPopOwner;

  if (!adsterraConfigured) {
    clickPopOwner = "monetag";
  } else if (!monetagConfigured) {
    clickPopOwner = "adsterra";
  } else {
    let lastNet: string | null = null;
    try {
      lastNet = sessionStorage.getItem(CLICK_POP_NET_KEY);
    } catch {
      /* private mode — default to Adsterra */
    }
    clickPopOwner = lastNet === "adsterra" ? "monetag" : "adsterra";
    try {
      sessionStorage.setItem(CLICK_POP_NET_KEY, clickPopOwner);
    } catch {
      /* ignore */
    }
  }

  clickPopContextKey = contextKey;
  return clickPopOwner;
}

/** All Monetag script markers, for purging. */
export const MONETAG_MARKERS = [
  "monetag-onclick",
  "monetag-inpage",
  "monetag-vignette",
  "monetag-multitag",
] as const;
