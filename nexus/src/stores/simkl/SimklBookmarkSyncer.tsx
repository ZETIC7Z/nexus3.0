import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval } from "react-use";

import { getPosterForMedia } from "@/backend/metadata/tmdb";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useSimklAuthStore } from "@/stores/simkl/store";
import { simklService } from "@/utils/services/simkl";
import { SimklContentData, SimklSyncItem } from "@/utils/services/simklTypes";

const SIMKL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const INITIAL_SYNC_DELAY_MS = 2000;


export function SimklBookmarkSyncer() {
  const { replaceBookmarks } = useBookmarkStore();
  const { accessToken } = useSimklAuthStore();
  const setLastSync = useSimklAuthStore((s) => s.setLastSync);
  const isSyncingRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const pushBookmarksToSimkl = useCallback(async () => {
    if (!accessToken) return;
    const bookmarks = useBookmarkStore.getState().bookmarks;
    for (const [tmdbId, b] of Object.entries(bookmarks)) {
      try {
        const content: SimklContentData = {
          type: b.type === "movie" ? "movie" : "show",
          tmdbId,
          title: b.title,
          year: b.year,
        };
        await simklService.addToList("plantowatch", content);
      } catch (err) {
        console.warn("Failed to push bookmark to Simkl:", tmdbId, err);
      }
    }
  }, [accessToken]);

  const pullWatchlistFromSimkl = useCallback(async () => {
    if (!accessToken) return;
    try {
      if (!useSimklAuthStore.getState().user) {
        await simklService.getUserSettings();
      }

      const lastSync = useSimklAuthStore.getState().lastSync;
      const activities = await simklService.getActivities();
      if (lastSync && activities.all === lastSync) {
        return; // nothing new
      }

      const items = await simklService.getAllItems({
        dateFrom: lastSync ?? undefined,
        extended: "full",
      });

      const merged = { ...useBookmarkStore.getState().bookmarks };

      const ingest = async (
        bucket: SimklSyncItem[] | undefined,
        defaultType: "movie" | "show",
      ) => {
        if (!bucket) return;
        for (const item of bucket) {
       
          const ref = item.movie ?? item.show ?? item.anime;
          if (!ref) continue;
          const tmdbId = ref.ids?.tmdb ? String(ref.ids.tmdb) : null;
          if (!tmdbId) continue;
          if (merged[tmdbId]) continue;

        
          if (
            item.status &&
            !["plantowatch", "watching", "hold"].includes(item.status)
          )
            continue;

          let poster: string | undefined;
          try {
            poster = await getPosterForMedia(tmdbId, defaultType);
          } catch {
            poster = undefined;
          }
          merged[tmdbId] = {
            type: defaultType,
            title: ref.title,
            year: ref.year,
            poster,
            updatedAt: Date.now(),
          };
        }
      };

      await ingest(items.movies, "movie");
  
      await ingest((items as any).shows, "show");
      await ingest((items as any).tv_shows, "show");
      await ingest(items.anime, "show");

      replaceBookmarks(merged);
      setLastSync(activities.all);
    } catch (err) {
      console.error("Failed to sync Simkl watchlist to local", err);
    }
  }, [accessToken, replaceBookmarks, setLastSync]);

  const fullSync = useCallback(async () => {
    if (!accessToken || isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      await pushBookmarksToSimkl();
      await pullWatchlistFromSimkl();
    } finally {
      isSyncingRef.current = false;
    }
  }, [accessToken, pushBookmarksToSimkl, pullWatchlistFromSimkl]);

 
  useEffect(() => {
    const check = () => {
      if (useSimklAuthStore.persist?.hasHydrated?.()) {
        setHydrated(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const unsub = useSimklAuthStore.persist?.onFinishHydration?.(() => {
      setHydrated(true);
    });
    const t = setTimeout(() => setHydrated(true), 500);
    return () => {
      unsub?.();
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    const t = setTimeout(fullSync, INITIAL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [hydrated, accessToken, fullSync]);

  useInterval(fullSync, SIMKL_SYNC_INTERVAL_MS);

  return null;
}
