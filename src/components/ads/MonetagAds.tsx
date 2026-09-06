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
 * The Monetag delivery domain from the account's sw.js (3nbf4.com). Scripts
 * served from it are rewritten to the same-origin /monetag-serve/ proxy
 * (nginx in production, Vite dev proxy locally) so adblockers — which block
 * known ad-network domains but almost never the site's own origin — keep
 * them loading. Any other host (Monetag sometimes rotates domains) falls
 * back to the direct URL.
 */
const MONETAG_SERVE_HOST = "3nbf4.com";

function monetagScriptUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === MONETAG_SERVE_HOST) {
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

    // ── Onclick (popunder-equivalent; staggered with Adsterra) ──
    if (cfg.ENABLE_MONETAG_ONCLICK && hasUrl(cfg.MONETAG_ONCLICK_URL)) {
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
