import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "react-use";

import { watchHistoryItemToInputs } from "@/backend/accounts/watchHistory";
import { useSimklAuthStore } from "@/stores/simkl/store";
import {
  WatchHistoryItem,
  useWatchHistoryStore,
} from "@/stores/watchHistory";
import { simklService } from "@/utils/services/simkl";
import { SimklContentData } from "@/utils/services/simklTypes";

const PROGRESS_THRESHOLD = 0.15; 
const SIMKL_HISTORY_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const INITIAL_SYNC_DELAY_MS = 4000;

function toSimklContentData(
  id: string,
  item: WatchHistoryItem,
): SimklContentData | null {
  const { watched, duration } = item.progress;
  const progress = duration > 0 ? watched / duration : 0;
  if (progress < PROGRESS_THRESHOLD) return null;

  const input = watchHistoryItemToInputs(id, item);

  if (item.type === "movie") {
    return {
      type: "movie",
      tmdbId: input.tmdbId,
      title: item.title,
      year: item.year,
    };
  }

  if (
    item.type === "show" &&
    input.seasonNumber != null &&
    input.episodeNumber != null
  ) {
    const showTmdbId = id.includes("-") ? id.split("-")[0] : input.tmdbId;
    return {
      type: "episode",
      tmdbId: input.tmdbId,
      title: item.title,
      year: item.year,
      season: input.seasonNumber,
      episode: input.episodeNumber,
      showTmdbId,
      showTitle: item.title,
      showYear: item.year,
    };
  }

  return null;
}


export function SimklHistorySyncer() {
  const { accessToken } = useSimklAuthStore();
  const isSyncingRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const pushHistoryToSimkl = useCallback(async () => {
    if (!accessToken || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const items = useWatchHistoryStore.getState().items;
      for (const [id, item] of Object.entries(items)) {
        const content = toSimklContentData(id, item);
        if (!content) continue;

        const input = watchHistoryItemToInputs(id, item);
        try {
          await simklService.addToHistory(content, input.watchedAt);
        } catch (err) {
          console.error(`Failed to sync watch history to Simkl: ${id}`, err);
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [accessToken]);

  useEffect(() => {
    const check = () => useSimklAuthStore.persist?.hasHydrated?.() ?? false;
    if (check()) {
      setHydrated(true);
      return;
    }
    const unsub = useSimklAuthStore.persist?.onFinishHydration?.(() =>
      setHydrated(true),
    );
    const t = setTimeout(() => setHydrated(true), 500);
    return () => {
      unsub?.();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    const t = setTimeout(pushHistoryToSimkl, INITIAL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [hydrated, accessToken, pushHistoryToSimkl]);

  useInterval(pushHistoryToSimkl, SIMKL_HISTORY_SYNC_INTERVAL_MS);

  return null;
}
