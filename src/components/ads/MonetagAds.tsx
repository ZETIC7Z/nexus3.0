import { useCallback, useEffect } from "react";

import {
  injectAdScript,
  MONETAG_MARKERS,
  popunderMayLoadThisPage,
  purgeInjectedAds,
  shouldBlockAds,
  useAdsBlockedSubscription,
} from "@/components/ads/helpers";
import { conf } from "@/setup/config";

/**
 * Monetag delivery domains (they rotate): scripts from these hosts are
 * rewritten to the same-origin /monetag-serve/ proxy (Vercel rewrite in
 * production, Vite dev proxy locally) so adblockers — which block known
 * ad-network domains but almost never the site's own origin — keep them
 * loading. Any other host falls back to the direct URL.
 */
const MONETAG_SERVE_HOSTS = ["3nbf4.com", "quge5.com"];

function monetagScriptUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (MONETAG_SERVE_HOSTS.includes(url.hostname)) {
      return `/monetag-serve${url.pathname}${url.search}`;
    }
    return rawUrl;
  } catch {
    return rawUrl; // already a relative path
  }
}

/**
 * Monetag ad controller — Onclick, In-Page Push and Vignette Banner.
 *
 * Hard rules (mirrors the Adsterra controller):
 * - injects NOTHING when ads are disabled in Settings or a kids profile is
 *   active, and purges everything the moment either flips mid-session;
 * - In-Page Push and Vignette Banner render on the homepage ONLY — purged
 *   on every other route, including the player page;
 * - Onclick is staggered with the Adsterra Popunder through the shared
 *   click-pop window (`claimClickPopSlot`) so a visitor never gets two ad
 *   tabs from one click.
 *
 * Zone scripts come from the Monetag dashboard ("Get code" → the
 * `.../tag.min.js?zone=...` URL) and live in env vars. Zones without a URL
 * are skipped gracefully, so pasting codes later needs zero code changes.
 */
export function MonetagAdController({ isHomePage }: { isHomePage: boolean }) {
  const sync = useCallback((blocked: boolean) => {
    if (blocked) purgeInjectedAds([...MONETAG_MARKERS]);
  }, []);
  useAdsBlockedSubscription(sync);

  useEffect(() => {
    if (!isHomePage) {
      // Homepage-only surfaces: gone the moment the visitor leaves home
      // (especially important — never on the player page).
      purgeInjectedAds([...MONETAG_MARKERS]);
      return;
    }
    if (shouldBlockAds()) {
      purgeInjectedAds([...MONETAG_MARKERS]);
      return;
    }

    const cfg = conf();
    const hasUrl = (url: string | null): url is string =>
      !!url && url.trim().length > 8;

    // ── In-Page Push (native-looking notification card above content) ──
    if (cfg.ENABLE_MONETAG_INPAGE && hasUrl(cfg.MONETAG_INPAGE_URL)) {
      injectAdScript(monetagScriptUrl(cfg.MONETAG_INPAGE_URL), "monetag-inpage", {
        monetag: "inpage",
      });
    }

    // ── Vignette Banner (full-screen rich-media overlay on click/exit) ──
    if (cfg.ENABLE_MONETAG_VIGNETTE && hasUrl(cfg.MONETAG_VIGNETTE_URL)) {
      injectAdScript(
        monetagScriptUrl(cfg.MONETAG_VIGNETTE_URL),
        "monetag-vignette",
        { monetag: "vignette" },
      );
    }

    // ── Multitag (one script, auto-runs Onclick + In-Page Push + Vignette
    // per visitor; the dashboard's recommended format) ──
    // Homepage-only and staggered with the Adsterra Popunder through the
    // shared click-pop window: Multitag includes a popunder-style format,
    // so loading it on every page alongside Adsterra's popunder could open
    // TWO ad tabs from one click. When Adsterra wins this page load, no
    // Monetag script runs at all; they alternate page by page.
    if (cfg.ENABLE_MONETAG_MULTITAG && hasUrl(cfg.MONETAG_MULTITAG_URL)) {
      const adsterraPopunderActive =
        cfg.ENABLE_POPUNDER && hasUrl(cfg.POPUNDER_SCRIPT_URL);
      if (popunderMayLoadThisPage("monetag", adsterraPopunderActive)) {
        // Multitag's code requires its zone id on the script before it is
        // appended, so pass it through the injector's pre-append attributes.
        injectAdScript(
          monetagScriptUrl(cfg.MONETAG_MULTITAG_URL),
          "monetag-multitag",
          {
            monetag: "multitag",
            ...(cfg.MONETAG_MULTITAG_ZONE
              ? { zone: cfg.MONETAG_MULTITAG_ZONE }
              : {}),
          },
        );
      }
    }

    // ── Onclick (standalone popunder-equivalent; staggered with Adsterra) ──
    // Only used when NO Multitag zone is configured (Multitag already
    // contains the Onclick format — running both would double-fire).
    if (
      cfg.ENABLE_MONETAG_ONCLICK &&
      hasUrl(cfg.MONETAG_ONCLICK_URL) &&
      !(cfg.ENABLE_MONETAG_MULTITAG && hasUrl(cfg.MONETAG_MULTITAG_URL))
    ) {
      const adsterraPopunderActive =
        cfg.ENABLE_POPUNDER && hasUrl(cfg.POPUNDER_SCRIPT_URL);
      if (
        popunderMayLoadThisPage("monetag", adsterraPopunderActive)
      ) {
        injectAdScript(
          monetagScriptUrl(cfg.MONETAG_ONCLICK_URL),
          "monetag-onclick",
          { monetag: "onclick" },
        );
      }
    }
  }, [isHomePage]);

  return null;
}
