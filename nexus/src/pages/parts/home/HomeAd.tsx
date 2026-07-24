import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";

import { conf } from "@/setup/config";


const BTAG_SRC = "https://aqle3.com/btag.min.js";
const LOAD_TIMEOUT_MS = 8000;
const PRIMARY_BANNER_GIF_SRC = "/ads/primary-banner.gif";

export type AdSlot = "primary" | "secondary" | "bookmarks";


function loadBannerTag(
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

interface SlotConfig {
  zoneId: string;
  width: number;
  height: number;
}

function AdSlotInner({ cfg }: { cfg: SlotConfig }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adState, setAdState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
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
      if (container.querySelector("iframe, img")) {
        setAdState("loaded");
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(container, { childList: true, subtree: true });

    const timeout = setTimeout(() => {
      setAdState((s) => (s === "loading" ? "failed" : s));
    }, LOAD_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [cfg.zoneId, cfg.width, cfg.height, isWatchPage]);

  if (adState === "failed") return null;

  const wrapperMaxWidth = cfg.width + 16;

  return (
    <div
      className="relative rounded-lg ring-1 ring-white/20 bg-black/30 transition-opacity duration-500"
      style={{
        maxWidth: `${wrapperMaxWidth}px`,
        width: "100%",
        opacity: adState === "loaded" ? 1 : 0.6,
      }}
    >
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

const PRIMARY_GIF_DISMISS_KEY = "primaryBannerGifDismissedUntil";
const PRIMARY_GIF_DISMISS_MS = 24 * 60 * 60 * 1000; // 24 hours

function PrimaryGifBanner({ img, href }: { img: string; href: string }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const until = Number(
      window.localStorage.getItem(PRIMARY_GIF_DISMISS_KEY) || "0",
    );
    return Date.now() < until;
  });

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(
        PRIMARY_GIF_DISMISS_KEY,
        String(Date.now() + PRIMARY_GIF_DISMISS_MS),
      );
    } catch {
      // ignore storage errors
    }
  }, []);

  if (dismissed) return null;

  return (
    <div
      className="relative mx-auto w-full max-w-[640px] rounded-[0.95rem] bg-black/35 ring-1 ring-white/15 transition-opacity duration-500 group"
    >
      <button
        onClick={dismiss}
        type="button"
        className="absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-mediaCard-hoverBackground transition-opacity duration-300 md:opacity-0 group-hover:opacity-100"
        aria-label="Dismiss ad"
      >
        <Icon
          className="text-xs font-semibold text-type-secondary"
          icon={Icons.X}
        />
      </button>
      <div className="overflow-hidden rounded-[0.95rem]">
        <div className="px-2.5 pt-1.5 pb-1">
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-white/60 select-none">
            Advertisement
          </span>
        </div>
        <div className="px-2.5 pb-2.5 pt-0.5">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-[0.8rem]"
          >
            <img
              src={img}
              alt="ad banner"
              className="block w-full rounded-[0.8rem] object-cover"
              style={{ aspectRatio: "7 / 2", maxHeight: "176px" }}
            />
          </a>
        </div>
      </div>
    </div>
  );
}

export function HomeAd({ slot = "primary" }: { slot?: AdSlot } = {}) {
  const cfg = conf();

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

  if (!cfg.ENABLE_SECONDARY_AD || !cfg.SECONDARY_AD_ZONE_ID) return null;
  return (
    <AdSlotInner
      cfg={{
        zoneId: cfg.SECONDARY_AD_ZONE_ID,
        width: 300,
        height: 250,
      }}
    />
  );
}
