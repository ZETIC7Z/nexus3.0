import { useEffect, useRef } from "react";

import { getMediaKey, playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";

declare global {
  interface Window {
    rybbit?: {
      event: (name: string, properties?: Record<string, unknown>) => void;
      pageview: () => void;
    };
  }
}


export function useRybbitWatchingEvent() {
  const status = usePlayerStore((s) => s.status);
  const meta = usePlayerStore((s) => s.meta);
  const lastFiredKey = useRef<string | null>(null);

  useEffect(() => {
    if (status !== playerStatus.PLAYING || !meta) return;
    const key = getMediaKey(meta);
    if (!key || key === lastFiredKey.current) return;
    if (typeof window === "undefined" || !window.rybbit) return;

    lastFiredKey.current = key;
    window.rybbit.event("watching", {
      tmdbId: meta.tmdbId,
      title: meta.title,
      type: meta.type,
      ...(meta.type === "show" && meta.season && meta.episode
        ? {
            season: meta.season.number,
            episode: meta.episode.number,
          }
        : {}),
    });
  }, [status, meta]);
}
