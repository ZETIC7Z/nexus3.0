import { useCallback, useEffect, useRef, useState } from "react";

import { Icon, Icons } from "@/components/Icon";

import { conf } from "@/setup/config";

import { loadBannerTag, useAdsBlocked } from "./helpers";

const BANNER_W = 468;
const BANNER_H = 60;
const LOAD_TIMEOUT_MS = 8000;
const DISMISS_KEY = "playerBannerDismissedUntil";
const DISMISS_MS = 24 * 60 * 60 * 1000; // 24 hours

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(window.localStorage.getItem(DISMISS_KEY) || "0");
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  } catch {
    return false;
  }
}

/**
 * 468×60 leaderboard banner rendered *below* the video player.
 *
 * Professional placement rules:
 * - sits outside the fullscreen node, so it disappears automatically in
 *   fullscreen/widescreen (it can never overlay video controls);
 * - hidden entirely while ads are disabled (Settings → Preferences) or a
 *   kids profile is active;
 * - scales down on narrow screens (never overflows a 320px phone);
 * - user can dismiss it for 24h;
 * - nothing renders until a zone id / invoke key is configured, so the
 *   slot stays dormant until you paste your Adsterra zone code values.
 */
export function PlayerBannerAd() {
  const adsBlocked = useAdsBlocked();
  const cfg = conf();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adState, setAdState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );
  const [dismissed, setDismissed] = useState(readDismissed);

  const zoneId = cfg.ENABLE_PLAYER_BANNER ? cfg.PLAYER_BANNER_ZONE_ID : null;
  const invokeKey = cfg.ENABLE_PLAYER_BANNER
    ? cfg.PLAYER_BANNER_INVOKE_KEY
    : null;
  const configured = !!(zoneId || invokeKey);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const blocked = adsBlocked;

  useEffect(() => {
    if (blocked || dismissed || !configured) return;
    const container = containerRef.current;
    if (!container) return;

    if (invokeKey) {
      // Adsterra "atOptions / invoke.js" banner code style.
      if (!document.getElementById("atOptions-player-banner")) {
        const at = document.createElement("script");
        at.id = "atOptions-player-banner";
        at.type = "text/javascript";
        at.textContent = `atOptions = { 'key' : '${invokeKey}', 'format' : 'iframe', 'height' : ${BANNER_H}, 'width' : ${BANNER_W}, 'params' : {} };`;
        container.appendChild(at);
        const inv = document.createElement("script");
        inv.type = "text/javascript";
        inv.src = "//www.highperformanceformat.com/invoke.js";
        container.appendChild(inv);
      }
      setAdState("loading");
    } else if (zoneId) {
      // btag banner code style (same loader the home slots use).
      loadBannerTag(container, zoneId, BANNER_W, BANNER_H);
    }

    const update = () => {
      if (container.querySelector("iframe, img")) setAdState("loaded");
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
  }, [blocked, dismissed, configured, zoneId, invokeKey]);

  // Hard gate AFTER hooks: ads off / kids profile / no zone / dismissed →
  // nothing mounts, no script is injected, zero layout space is used.
  if (blocked || dismissed || !configured || adState === "failed") return null;

  return (
    <div className="mt-3 flex w-full justify-center px-2">
      <div className="relative w-full max-w-[484px]">
        <button
          type="button"
          onClick={dismiss}
          className="group absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-mediaCard-hoverBackground opacity-60 transition-opacity duration-300 hover:opacity-100 md:opacity-0"
          aria-label="Dismiss ad"
        >
          <Icon
            className="text-xs font-semibold text-type-secondary"
            icon={Icons.X}
          />
        </button>
        <div className="rounded-lg bg-black/30 px-2 pb-2 pt-1 ring-1 ring-white/20">
          <span className="block select-none pb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
            Advertisement
          </span>
          <div
            ref={containerRef}
            className="mx-auto flex items-center justify-center overflow-hidden"
            style={{ minHeight: `${BANNER_H}px`, maxWidth: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
