import { useCallback, useEffect, useState } from "react";

import {
  getClickPopOwner,
  injectAdScript,
  MONETAG_MARKERS,
  purgeInjectedAds,
  shouldBlockAds,
  useAdsBlockedSubscription,
} from "@/components/ads/helpers";
import { conf } from "@/setup/config";

/**
 * Monetag rotates delivery domains. Known domains use first-party paths so
 * Vercel/Vite can proxy the initial script request; unknown rotations use the
 * direct URL as a safe fallback.
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
    return rawUrl;
  }
}

function hasUrl(url: string | null): url is string {
  return !!url && url.trim().length > 8;
}

/**
 * Monetag controller for eligible browsing routes.
 *
 * The verified Multitag is Monetag's official all-in-one tag: Onclick, Push
 * Notifications, In-Page Push, and Vignette Banner. It is loaded only when
 * Monetag owns the current eligible browsing route's click-pop slot;
 * Adsterra owns the other route contexts. This prevents two click-pop
 * scripts from racing on one genuine user click while still giving both
 * networks eligible traffic.
 *
 * No hidden click-capture layer or synthetic click is used. Player, account,
 * settings, profile, kids, onboarding, migration, support, and admin routes
 * are excluded by App's explicit allowlist.
 */
export function MonetagAdController({
  isEligible,
  contextKey,
}: {
  isEligible: boolean;
  contextKey: string;
}) {
  const [blocked, setBlocked] = useState(() => shouldBlockAds());
  const sync = useCallback((nextBlocked: boolean) => {
    setBlocked(nextBlocked);
    if (nextBlocked) purgeInjectedAds([...MONETAG_MARKERS]);
  }, []);
  useAdsBlockedSubscription(sync);

  useEffect(() => {
    if (blocked || !isEligible || shouldBlockAds()) {
      purgeInjectedAds([...MONETAG_MARKERS]);
      return;
    }

    const cfg = conf();
    const multitagUrl = cfg.MONETAG_MULTITAG_URL;
    const onclickUrl = cfg.MONETAG_ONCLICK_URL;
    const inpageUrl = cfg.MONETAG_INPAGE_URL;
    const vignetteUrl = cfg.MONETAG_VIGNETTE_URL;
    const adsterraClickActive =
      cfg.ENABLE_POPUNDER && hasUrl(cfg.POPUNDER_SCRIPT_URL);
    const multitagActive =
      cfg.ENABLE_MONETAG_MULTITAG && hasUrl(multitagUrl);
    const standaloneOnclickActive =
      cfg.ENABLE_MONETAG_ONCLICK && hasUrl(onclickUrl);
    const monetagClickActive = multitagActive || standaloneOnclickActive;
    const owner = getClickPopOwner(
      contextKey,
      adsterraClickActive,
      monetagClickActive,
    );

    purgeInjectedAds([...MONETAG_MARKERS]);

    if (multitagActive && multitagUrl) {
      if (owner !== "monetag") return;
      // Monetag requires data-zone to exist before tag.min.js executes.
      injectAdScript(
        monetagScriptUrl(multitagUrl),
        "monetag-multitag",
        {
          monetag: "multitag",
          ...(cfg.MONETAG_MULTITAG_ZONE
            ? { zone: cfg.MONETAG_MULTITAG_ZONE }
            : {}),
        },
      );
      return;
    }

    // Individual zones remain supported when Multitag is not configured.
    // They do not compete with Adsterra's Popunder unless Onclick is active.
    if (cfg.ENABLE_MONETAG_INPAGE && hasUrl(inpageUrl)) {
      injectAdScript(monetagScriptUrl(inpageUrl), "monetag-inpage", {
        monetag: "inpage",
      });
    }
    if (cfg.ENABLE_MONETAG_VIGNETTE && hasUrl(vignetteUrl)) {
      injectAdScript(
        monetagScriptUrl(vignetteUrl),
        "monetag-vignette",
        { monetag: "vignette" },
      );
    }
    if (standaloneOnclickActive && onclickUrl && owner === "monetag") {
      injectAdScript(
        monetagScriptUrl(onclickUrl),
        "monetag-onclick",
        { monetag: "onclick" },
      );
    }
  }, [blocked, contextKey, isEligible]);

  return null;
}
