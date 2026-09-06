import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";

import { conf } from "@/setup/config";
import {
  loadBannerTag,
  purgeInjectedAds,
  useAdsBlocked,
} from "@/components/ads/helpers";


const LOAD_TIMEOUT_MS = 8000;
/**
 * How long we wait for the creative before collapsing the slot. Adsterra's
 * btag script creates the iframe BLANK first and fills it after the ad
 * server responds — a blank iframe after this long means no fill (no
 * advertiser, or the visitor was filtered). An empty "ADVERTISEMENT" box
 * looks broken, so the slot collapses instead of staying empty.
 */
const NO_FILL_TIMEOUT_MS = 12000;
const PRIMARY_BANNER_GIF_SRC = "/ads/primary-banner.gif";

/** localStorage key: Social Bar hidden until the browser session ends. */
const SOCIAL_BAR_DISMISS_KEY = "__ad_socialbar_dismissed";

/** True while the visitor has closed the Social Bar this session. */
export function isSocialBarDismissed(): boolean {
  try {
    return sessionStorage.getItem(SOCIAL_BAR_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Hide the Social Bar until the end of this browser session. */
export function dismissSocialBar() {
  try {
    sessionStorage.setItem(SOCIAL_BAR_DISMISS_KEY, "1");
  } catch {
    /* private mode — bar simply can't be remembered as dismissed */
  }
  // Purge the script and any top-level iframe/div the network created.
  // This also handles the transport iframe some Social Bar versions append
  // directly under <html> rather than under <body>.
  purgeInjectedAds(["social-bar"]);
}

export type AdSlot = "primary" | "bookmarks";


// loadBannerTag now lives in @/components/ads/helpers (shared with the
// under-player 468×60 banner so every banner slot behaves identically).

interface SlotConfig {
  zoneId: string;
  width: number;
  height: number;
}

/**
 * True only when the slot holds a REAL creative — not Adsterra's blank
 * placeholder iframe. An iframe we can't read (cross-origin) means a
 * creative was served into it; a readable empty iframe means no fill yet.
 */
function slotHasRealContent(container: HTMLElement): boolean {
  if (container.querySelector("img")) return true;
  const iframes = Array.from(container.querySelectorAll("iframe"));
  return iframes.some((f) => {
    const src = (f.getAttribute("src") || "").trim();
    if (src && src !== "about:blank") return true;
    try {
      const doc = f.contentDocument;
      return !!doc?.body && doc.body.childElementCount > 0;
    } catch {
      return true; // cross-origin → creative content, definitely filled
    }
  });
}

function AdSlotInner({ cfg }: { cfg: SlotConfig }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adState, setAdState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const [closed, setClosed] = useState(false);
  const location = useLocation();
  const isWatchPage = location.pathname.startsWith("/media/");

  useEffect(() => {

    if (isWatchPage) {
      setAdState("failed");
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    loadBannerTag(container, cfg.zoneId, cfg.width, cfg.height);

    const update = () => {
      setAdState(slotHasRealContent(container) ? "loaded" : "loading");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });

    // Nothing injected at all after LOAD_TIMEOUT_MS → the network never
    // even created the iframe; collapse.
    const timeout = setTimeout(() => {
      setAdState((s) => (s === "loading" ? "failed" : s));
    }, LOAD_TIMEOUT_MS);

    // iframe exists but still blank after NO_FILL_TIMEOUT_MS → no fill for
    // this visitor (sold-out zone or filtered traffic). Collapse the slot —
    // and keep observing so a late creative still flips it back to loaded.
    const noFillTimeout = setTimeout(() => {
      setAdState((s) =>
        s === "loaded" || slotHasRealContent(container) ? s : "failed",
      );
    }, NO_FILL_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
      clearTimeout(noFillTimeout);
    };
  }, [cfg.zoneId, cfg.width, cfg.height, isWatchPage]);

  if (adState === "failed") return null;

  if (closed) {
    // Slot re-appears after the next refresh/navigation (per-page-view hide,
    // like the rest of the close buttons) — impression already counted.
    return null;
  }

  const wrapperMaxWidth = cfg.width + 16;

  return (
    <div
      className="relative rounded-lg ring-1 ring-white/20 bg-black/30 transition-opacity duration-500 group"
      style={{
        maxWidth: `${wrapperMaxWidth}px`,
        width: "100%",
        opacity: adState === "loaded" ? 1 : 0.6,
      }}
    >
      <button
        onClick={() => setClosed(true)}
        type="button"
        className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-mediaCard-hoverBackground transition-opacity duration-300 md:opacity-0 group-hover:opacity-100"
        aria-label="Close ad"
      >
        <Icon
          className="text-xs font-semibold text-type-secondary"
          icon={Icons.X}
        />
      </button>
      <div className="rounded-lg overflow-hidden">
        <div className="px-2.5 pt-1.5 pb-0.5">
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/60 select-none">
            Advertisement
          </span>
        </div>

        <div className="px-2 pb-2 pt-0.5">
          <div
            ref={containerRef}
            className="flex items-center justify-center mx-auto"
            style={{
              minHeight: `${cfg.height}px`,
              minWidth: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The permanent Smartlink banner. The user's call: this one has NO close
 * button — it must always be visible so its impressions keep counting
 * (it is the highest-earning surface). The Settings ads toggle still
 * removes it completely.
 */
function PrimaryGifBanner({ img, href }: { img: string; href: string }) {
  const cfg = conf();

  // Adsterra Smartlink: when configured, clicking the banner opens the
  // smartlink (auto-rotates to the best-paying offer). Falls back to the
  // plain VITE_PRIMARY_BANNER_GIF_URL when the smartlink is off.
  const smartlinkUrl =
    cfg.ENABLE_SMARTLINK && cfg.SMARTLINK_URL ? cfg.SMARTLINK_URL : null;

  return (
    <div
      className="relative mx-auto w-full max-w-[640px] rounded-[0.95rem] bg-black/35 ring-1 ring-white/15 transition-opacity duration-500"
    >
      <div className="overflow-hidden rounded-[0.95rem]">
        <div className="px-2.5 pt-1.5 pb-1">
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/60 select-none">
            Advertisement
          </span>
        </div>
        <div className="px-2.5 pb-2.5 pt-0.5">
          <a
            href={smartlinkUrl || href}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-[0.8rem]"
          >
            <img
              src={img}
              alt="ad banner"
              className="block w-full rounded-[0.8rem] object-cover"
              style={{
                aspectRatio: "7 / 2",
                maxHeight: "176px",
                minHeight: "60px",
                objectFit: "cover",
              }}
            />
          </a>
        </div>
      </div>
    </div>
  );
}

export function HomeAd({ slot = "primary" }: { slot?: AdSlot } = {}) {
  const cfg = conf();
  const adsBlocked = useAdsBlocked();

  // User turned ads off in Settings → Preferences (or kids profile active).
  // Return before any slot mounts so the btag script is never injected and
  // banners never render.
  if (adsBlocked) return null;

  if (slot === "primary") {
    const gifUrl =
      cfg.ENABLE_PRIMARY_BANNER_GIF && cfg.PRIMARY_BANNER_GIF_URL
        ? cfg.PRIMARY_BANNER_GIF_URL
        : null;
    const homeAdZoneId =
      cfg.ENABLE_HOME_AD && cfg.HOME_AD_ZONE_ID ? cfg.HOME_AD_ZONE_ID : null;

    if (!gifUrl && !homeAdZoneId) return null;

    return (
      <div className="flex w-full flex-col items-center gap-3">
        {gifUrl && (
          <PrimaryGifBanner img={PRIMARY_BANNER_GIF_SRC} href={gifUrl} />
        )}
        {homeAdZoneId && (
          <AdSlotInner
            cfg={{
              zoneId: homeAdZoneId,
              width: 728,
              height: 90,
            }}
          />
        )}
      </div>
    );
  }

  if (slot === "bookmarks") {
    if (!cfg.ENABLE_BOOKMARKS_AD || !cfg.BOOKMARKS_AD_ZONE_ID) return null;
    return (
      <AdSlotInner
        cfg={{
          zoneId: cfg.BOOKMARKS_AD_ZONE_ID,
          width: 336,
          height: 280,
        }}
      />
    );
  }

  // The former 300×250 homepage/sidebar slot was intentionally removed.
  // Keep the public API limited to the primary and bookmarks placements so
  // it cannot be reintroduced accidentally through a stale call site.
  return null;
}
