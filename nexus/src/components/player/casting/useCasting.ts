import { useEffect, useState } from "react";

import {
  isAirplayAvailable,
  onAirplayConnectionChange,
  triggerAirplayPicker,
} from "@/components/player/casting/airplay";
import {
  endChromecastSession,
  initChromecast,
  loadChromecastMedia,
  onChromecastAvailable,
  onChromecastConnectionChange,
  requestChromecastSession,
} from "@/components/player/casting/chromecastSession";
import {
  createM3U8ProxyUrl,
  createMP4ProxyUrl,
  isUrlAlreadyProxied,
} from "@/components/player/utils/proxy";
import { usePlayerStore } from "@/stores/player/store";
import { selectQuality } from "@/stores/player/utils/qualities";
import { useQualityStore } from "@/stores/quality";
import { processCdnLink } from "@/utils/hosting/cdn";

export type CastType = "chromecast" | "airplay" | null;

// Casting lives entirely outside usePlayerStore's AllSlices on purpose — see
// the plan notes on why the old CastingSlice + DisplayInterface-swap design
// made a real bug impossible to isolate. This hook is the only place casting
// state exists; the local <video> element is simply paused while casting,
// never torn down or replaced.
export function useCasting() {
  const [chromecastAvailable, setChromecastAvailable] = useState(false);
  const [chromecastConnected, setChromecastConnected] = useState(false);
  const [airplayConnected, setAirplayConnected] = useState(false);

  const source = usePlayerStore((s) => s.source);
  const meta = usePlayerStore((s) => s.meta);
  const display = usePlayerStore((s) => s.display);

  useEffect(() => {
    initChromecast();
    onChromecastAvailable(setChromecastAvailable);
  }, []);

  useEffect(
    () => onChromecastConnectionChange(setChromecastConnected),
    [],
  );

  // Re-subscribe whenever the local video element is (re)created — it shares
  // a lifecycle with `display` (both are recreated by VideoContainer).
  useEffect(() => onAirplayConnectionChange(setAirplayConnected), [display]);

  useEffect(() => {
    if (!chromecastConnected || !source) return;
    let cancelled = false;

    void (async () => {
      const qualityPreferences = useQualityStore.getState().quality;
      const { stream } = selectQuality(source, qualityPreferences);

      let contentUrl = processCdnLink(stream.url);
      let contentType = "video/mp4";
      const allHeaders = { ...stream.preferredHeaders, ...stream.headers };
      const hasHeaders = Object.keys(allHeaders).length > 0;

      if (stream.type === "hls") {
        contentType = "application/x-mpegurl";
        if (!isUrlAlreadyProxied(stream.url) && hasHeaders) {
          contentUrl = createM3U8ProxyUrl(stream.url, allHeaders);
        } else {
          // Bypass artemis entirely for the manifest itself: fetch the
          // already-resolved single-variant media playlist (real CDN segment
          // URLs, no further artemis references — confirmed live) client-side
          // — this browser tab can fetch it fine since local playback already
          // works — then hand Chromecast a self-contained data: URI instead
          // of an https://artemis.fontaine.lol/... URL. Whatever was blocking
          // the receiver's own fetch to artemis (still unconfirmed — not
          // artemis's app logic itself, no matching log line server-side)
          // never gets a chance to matter, since the receiver never contacts
          // artemis at all: it decodes the manifest locally and streams
          // segments straight from hls-aws.shegu.net.
          const resolvedUrl =
            display?.getResolvedVariantUrl?.() ?? contentUrl;
          try {
            const res = await fetch(resolvedUrl);
            const text = await res.text();
            if (cancelled) return;
            const b64 = btoa(String.fromCodePoint(...new TextEncoder().encode(text)));
            contentUrl = `data:application/vnd.apple.mpegurl;base64,${b64}`;
          } catch {
            // Fetch failed — fall back to handing Chromecast the plain URL
            // (old behavior) rather than blocking the cast entirely.
            contentUrl = resolvedUrl;
          }
        }
      } else if (hasHeaders) {
        contentUrl = createMP4ProxyUrl(stream.url, allHeaders);
      }

      if (cancelled) return;
      loadChromecastMedia({
        url: contentUrl,
        contentType,
        title: meta?.title,
      });
      display?.pause();
    })();

    return () => {
      cancelled = true;
    };
  }, [chromecastConnected, source, meta, display]);

  const isCasting = chromecastConnected || airplayConnected;
  const castType: CastType = chromecastConnected
    ? "chromecast"
    : airplayConnected
      ? "airplay"
      : null;

  return {
    isCasting,
    castType,
    chromecastAvailable,
    airplayAvailable: isAirplayAvailable(),
    startChromecast: requestChromecastSession,
    startAirplay: triggerAirplayPicker,
    stop: () => {
      if (chromecastConnected) endChromecastSession();
    },
  };
}
