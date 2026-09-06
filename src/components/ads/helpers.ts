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
    // changes from other tabs, zustand subscribe catches same-tab flips.
    const unsub = useAdsStore.subscribe(check);
    let onStorage: ((e: StorageEvent) => void) | null = (e) => {
      if (e.key === "__MW::ads") check();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      if (onStorage) window.removeEventListener("storage", onStorage);
      onStorage = null;
    };
  }, [onChange]);
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
  if (typeof window === "undefined" || !zoneId) return;
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
    pathname = new URL(scriptUrl).pathname;
  } catch {
    /* not an absolute URL — treat as path already */
  }

  const proxySrc = `/ads-serve${pathname}`;
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
  });
  // Adsterra Social Bar renders itself inside an iframe appended to <body>
  // (id like "ads-fr" / container divs). Nuke any iframe that lives directly
  // under body — the app itself never creates those.
  document
    .querySelectorAll("body > iframe[src], body > ins, body > div[id^='ads']")
    .forEach((el) => el.remove());
}

// ── Click-pop coordination (Adsterra Popunder ↔ Monetag Onclick) ───────
// Both networks sell the same format (first click opens an ad tab). Running
// them uncoordinated can open TWO ad tabs from a single click, which reads
// as a popunder attack and tanks retention. Instead exactly ONE network's
// script loads per page load (alternating), so only one pop is ever armed.

const CLICK_POP_NET_KEY = "__pu_net";

export type ClickPopNetwork = "adsterra" | "monetag";

/**
 * Which network's click-pop script loads on THIS page load. Alternates on
 * every new page load (SPA navigations included) so both networks earn over
 * a session, and memoized so the Adsterra and Monetag controllers can never
 * disagree within one load. Each network's own script still applies its own
 * per-user frequency cap — this only decides who is ARMED, never frequency.
 */
let clickPopOwner: ClickPopNetwork | null = null;

export function popunderMayLoadThisPage(
  net: ClickPopNetwork,
  otherConfigured: boolean,
): boolean {
  if (clickPopOwner) return clickPopOwner === net;
  if (!otherConfigured) {
    clickPopOwner = net;
    return true;
  }
  let lastNet: string | null = null;
  try {
    lastNet = sessionStorage.getItem(CLICK_POP_NET_KEY);
  } catch {
    /* private mode — just alternate in-memory */
  }
  clickPopOwner = lastNet === "adsterra" ? "monetag" : "adsterra";
  try {
    sessionStorage.setItem(CLICK_POP_NET_KEY, clickPopOwner);
  } catch {
    /* ignore */
  }
  return clickPopOwner === net;
}

/** All Monetag script markers, for purging. */
export const MONETAG_MARKERS = [
  "monetag-onclick",
  "monetag-inpage",
  "monetag-vignette",
  "monetag-multitag",
] as const;
