import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DiscoverMedia } from "@/pages/discover/types/discover";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useProgressStore } from "@/stores/progress";
import { useRatingsStore } from "@/stores/ratings";
import { useWatchHistoryStore } from "@/stores/watchHistory";

import {
  type BookmarkSource,
  type HistorySource,
  type ProgressSource,
  type RatingSource,
  fetchPersonalRecommendations,
} from "../lib/personalRecommendations";

export interface UsePersonalRecommendationsOptions {
  isTVShow: boolean;
  enabled?: boolean;
}

export interface UsePersonalRecommendationsReturn {
  media: DiscoverMedia[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sectionTitle: string;
  hasRecommendations: boolean;
}

function getHistorySources(
  items: Record<string, { type: "movie" | "show"; watchedAt: number }>,
): HistorySource[] {
  const byKey: Map<string, HistorySource> = new Map();

  for (const [key, item] of Object.entries(items)) {
    const isEpisode = key.includes("-");
    const tmdbId = isEpisode ? key.split("-")[0]! : key;
    const existing = byKey.get(tmdbId);
    const watchedAt = item.watchedAt;
    if (!existing || watchedAt > existing.watchedAt) {
      byKey.set(tmdbId, { tmdbId, type: item.type, watchedAt });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.watchedAt - a.watchedAt);
}

export function usePersonalRecommendations({
  isTVShow,
  enabled = true,
}: UsePersonalRecommendationsOptions): UsePersonalRecommendationsReturn {
  const { t } = useTranslation();
  const [media, setMedia] = useState<DiscoverMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchHistoryItems = useWatchHistoryStore((s) => s.items);
  const progressItems = useProgressStore.getState().items;
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const ratingItems = useRatingsStore((s) => s.ratings);
  const preferences = useRatingsStore((s) => s.preferences);

  const buildExcludeSet = useCallback(() => {
    const exclude = new Set<string>();
    for (const key of Object.keys(watchHistoryItems)) {
      if (key.includes("-")) exclude.add(key.split("-")[0]!);
      else exclude.add(key);
    }
    for (const id of Object.keys(progressItems)) exclude.add(id);
    for (const id of Object.keys(bookmarks)) exclude.add(id);
    return exclude;
  }, [watchHistoryItems, progressItems, bookmarks]);

  const fetch = useCallback(async () => {
    const history: HistorySource[] = getHistorySources(watchHistoryItems);
    const progress: ProgressSource[] = Object.entries(progressItems).map(
      ([tmdbId, item]) => ({ tmdbId, type: item.type }),
    );
    const bookmarkList: BookmarkSource[] = Object.entries(bookmarks).map(
      ([tmdbId, item]) => ({
        tmdbId,
        type: item.type,
        title: item.title,
        year: item.year,
        poster: item.poster,
      }),
    );

    const ratings: RatingSource[] = Object.entries(ratingItems).map(
      ([tmdbId, item]) => ({
        tmdbId,
        type: item.type,
        rating: item.rating,
        genreIds: item.genreIds,
        ratedAt: item.ratedAt,
      }),
    );

    const wantedType = isTVShow ? "show" : "movie";
    const hasAnySource =
      history.some((h) => h.type === wantedType) ||
      progress.some((p) => p.type === wantedType) ||
      bookmarkList.some((b) => b.type === wantedType) ||
      // Ratings of either type count; the taste profile is cross-type.
      ratings.some((r) => r.rating === "liked" || r.rating === "loved") ||
      preferences.favoriteGenres.length > 0 ||
      preferences.moods.length > 0 ||
      preferences.franchises.length > 0;

    if (!hasAnySource) {
      setMedia([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const excludeIds = buildExcludeSet();
      const results = await fetchPersonalRecommendations(
        isTVShow,
        history,
        progress,
        bookmarkList,
        excludeIds,
        ratings,
        preferences,
      );
      setMedia(results);
    } catch (err) {
      setError((err as Error).message);
      setMedia([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    isTVShow,
    watchHistoryItems,
    progressItems,
    bookmarks,
    ratingItems,
    preferences,
    buildExcludeSet,
  ]);

  useEffect(() => {
    if (enabled) fetch();
  }, [enabled, fetch]);

  const historyCount = getHistorySources(watchHistoryItems).filter(
    (h) => h.type === (isTVShow ? "show" : "movie"),
  ).length;
  const progressCount = Object.values(progressItems).filter(
    (p) => p.type === (isTVShow ? "show" : "movie"),
  ).length;
  const bookmarkCount = Object.values(bookmarks).filter(
    (b) => b.type === (isTVShow ? "show" : "movie"),
  ).length;
  const likedCount = Object.values(ratingItems).filter(
    (r) => r.rating === "liked" || r.rating === "loved",
  ).length;
  const hasRecommendations =
    historyCount > 0 || progressCount > 0 || bookmarkCount > 0 || likedCount > 0;

  const sectionTitle = t("discover.carousel.title.forYou");

  return {
    media,
    isLoading,
    error,
    refetch: fetch,
    sectionTitle,
    hasRecommendations,
  };
}
