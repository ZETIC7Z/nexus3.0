import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

/** Rating intensity: "loved"/"hated" weigh ~2x "liked"/"disliked"; "okay" is a weak signal. */
export type MediaRating = "loved" | "liked" | "okay" | "disliked" | "hated";

export interface RatedMediaItem {
  rating: MediaRating;
  type: "movie" | "show";
  title: string;
  year?: number;
  poster?: string;
  /** TMDB genre ids snapshotted at rating time. */
  genreIds?: number[];
  ratedAt: number;
}

export interface RateMediaMeta {
  tmdbId: string;
  title: string;
  type: "movie" | "show";
  year?: number;
  poster?: string;
  genreIds?: number[];
}

/** Taste preferences collected by the "create my algorithm" onboarding. */
export interface AlgorithmPreferences {
  favoriteGenres: number[];
  moods: string[];
  franchises: string[];
  completedOnboarding: boolean;
}

const DEFAULT_PREFERENCES: AlgorithmPreferences = {
  favoriteGenres: [],
  moods: [],
  franchises: [],
  completedOnboarding: false,
};

export interface RatingsStore {
  ratings: Record<string, RatedMediaItem>;
  preferences: AlgorithmPreferences;
  /** Sets the rating; rating the same value again removes it (toggle). */
  toggleRating(meta: RateMediaMeta, rating: MediaRating): void;
  removeRating(tmdbId: string): void;
  getRating(tmdbId: string): MediaRating | null;
  setPreferences(prefs: Partial<AlgorithmPreferences>): void;
  clear(): void;
}

export const useRatingsStore = create(
  persist(
    immer<RatingsStore>((set, get) => ({
      ratings: {},
      preferences: DEFAULT_PREFERENCES,
      toggleRating(meta, rating) {
        set((s) => {
          const existing = s.ratings[meta.tmdbId];
          if (existing?.rating === rating) {
            delete s.ratings[meta.tmdbId];
            return;
          }
          s.ratings[meta.tmdbId] = {
            rating,
            type: meta.type,
            title: meta.title,
            year: meta.year,
            poster: meta.poster,
            genreIds: meta.genreIds,
            ratedAt: Date.now(),
          };
        });
      },
      removeRating(tmdbId) {
        set((s) => {
          delete s.ratings[tmdbId];
        });
      },
      getRating(tmdbId) {
        return get().ratings[tmdbId]?.rating ?? null;
      },
      setPreferences(prefs) {
        set((s) => {
          s.preferences = { ...s.preferences, ...prefs };
        });
      },
      clear() {
        set((s) => {
          s.ratings = {};
          s.preferences = DEFAULT_PREFERENCES;
        });
      },
    })),
    {
      name: "__MW::ratings",
      merge: (persisted, current) => {
        // Older persisted states predate `preferences`.
        const merged = { ...current, ...(persisted as Partial<RatingsStore>) };
        merged.preferences = {
          ...DEFAULT_PREFERENCES,
          ...(persisted as Partial<RatingsStore>)?.preferences,
        };
        return merged;
      },
    },
  ),
);
