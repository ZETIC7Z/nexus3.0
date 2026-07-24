import {
  getCollectionParts,
  getMediaByCompanies,
  getMediaByGenres,
  getRelatedMedia,
} from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import type {
  TMDBMovieSearchResult,
  TMDBShowSearchResult,
} from "@/backend/metadata/types/tmdb";
import type { DiscoverMedia } from "@/pages/discover/types/discover";
import type { MediaRating } from "@/stores/ratings";

// Tuning constants for the recommendation algorithm
export const MAX_LIKED_FOR_RELATED = 6;
export const MAX_HISTORY_FOR_RELATED = 5;
export const MAX_CURRENT_FOR_RELATED = 2;
export const MAX_BOOKMARK_FOR_RELATED = 1;
export const MAX_BOOKMARK_REMINDERS = 2;
export const RELATED_PER_ITEM_LIMIT = 10;
export const RELATED_PER_LIKED_LIMIT = 14;
export const MAX_RESULTS = 40;

// Seed weights: trust per signal source; candidates from multiple seeds
// accumulate weight.
const SEED_WEIGHT_LOVED = 4.0;
const SEED_WEIGHT_LIKED = 3.0;
const SEED_WEIGHT_HISTORY = 1.5;
const SEED_WEIGHT_PROGRESS = 1.2;
const SEED_WEIGHT_BOOKMARK = 1.0;
const SEED_WEIGHT_GENRE_DISCOVER = 1.6;
const GENRE_DISCOVER_LIMIT = 14;
// Max results in the feed attributable to one seed.
const MAX_PER_SEED = 3;

// Genre profile deltas per rating level; negatives push harder than
// positives pull.
const RATING_GENRE_DELTAS: Record<MediaRating, number> = {
  loved: 1.75,
  liked: 1.0,
  okay: 0.25,
  disliked: -1.25,
  hated: -2.25,
};

// Onboarding preference weights: enough to shape a fresh profile, weak
// enough that real ratings take over.
const FAVORITE_GENRE_WEIGHT = 0.75;
const MOOD_GENRE_WEIGHT = 0.5;
const SEED_WEIGHT_FRANCHISE = 2.0;
const FRANCHISE_FETCH_LIMIT = 10;
const MAX_FRANCHISE_FETCHES = 4;

// Score component multipliers
const GENRE_AFFINITY_WEIGHT = 2.0;
const QUALITY_WEIGHT = 0.4;
const POPULARITY_WEIGHT = 0.1;

// Bayesian prior: shrinks low-vote-count ratings toward the mean.
const QUALITY_PRIOR_MEAN = 6.5;
const QUALITY_PRIOR_VOTES = 50;

// Ratings older than this still count, at half weight.
const RATING_HALF_LIFE_DAYS = 90;

export interface HistorySource {
  tmdbId: string;
  type: "movie" | "show";
  watchedAt: number;
}

export interface ProgressSource {
  tmdbId: string;
  type: "movie" | "show";
}

export interface BookmarkSource {
  tmdbId: string;
  type: "movie" | "show";
  title: string;
  year?: number;
  poster?: string;
}

export interface RatingSource {
  tmdbId: string;
  type: "movie" | "show";
  rating: MediaRating;
  genreIds?: number[];
  ratedAt: number;
}

/** genreId -> affinity weight (positive = liked, negative = disliked) */
export type TasteProfile = Map<number, number>;

// TMDB uses composite genre ids for TV; map to movie-canonical ones so
// ratings on shows and movies share one genre space.
const TV_TO_MOVIE_GENRES: Record<number, number[]> = {
  10759: [28, 12], // Action & Adventure -> Action, Adventure
  10762: [10751], // Kids -> Family
  10765: [878, 14], // Sci-Fi & Fantasy -> Science Fiction, Fantasy
  10766: [18], // Soap -> Drama
  10768: [10752], // War & Politics -> War
};

// Reverse mapping, for targeting the TV discover endpoint.
const MOVIE_TO_TV_GENRES: Record<number, number> = {
  28: 10759,
  12: 10759,
  10751: 10762,
  878: 10765,
  14: 10765,
  10752: 10768,
};

/** English labels for the movie-canonical genre space. */
export const GENRE_LABELS: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10763: "News",
  10764: "Reality",
  10767: "Talk",
};

/** Moods the onboarding wizard offers, each mapped to genres. */
export interface MoodDefinition {
  id: string;
  label: string;
  genres: number[];
}

export const MOODS: MoodDefinition[] = [
  { id: "mindblowing", label: "Mind-blowing stories", genres: [878, 9648, 53] },
  { id: "action", label: "Action-packed", genres: [28, 12] },
  { id: "emotional", label: "Emotional & moving", genres: [18, 10749] },
  { id: "horror", label: "Horror & scares", genres: [27] },
  { id: "suspense", label: "Suspense & mystery", genres: [9648, 53, 80] },
  { id: "laughs", label: "Comedy & laughs", genres: [35] },
  { id: "feelgood", label: "Feel-good & family", genres: [10751, 16, 35] },
  { id: "epic", label: "Epic adventures & fantasy", genres: [14, 12, 36] },
];

/** Franchises the onboarding wizard offers, mapped to TMDB collection/company ids. */
export interface FranchiseDefinition {
  id: string;
  label: string;
  collections?: number[];
  companies?: number[];
}

export const FRANCHISES: FranchiseDefinition[] = [
  { id: "marvel", label: "Marvel", companies: [420] },
  { id: "dc", label: "DC", companies: [9993, 429] },
  { id: "starwars", label: "Star Wars", collections: [10], companies: [1634] },
  { id: "harrypotter", label: "Harry Potter", collections: [1241, 435259] },
  { id: "lotr", label: "Lord of the Rings", collections: [119, 121938] },
  { id: "bond", label: "James Bond", collections: [645] },
  { id: "fastfurious", label: "Fast & Furious", collections: [9485] },
  {
    id: "missionimpossible",
    label: "Mission: Impossible",
    collections: [87359],
  },
  { id: "jurassic", label: "Jurassic Park", collections: [328] },
  { id: "pixar", label: "Pixar", companies: [3] },
];

/** The slice of AlgorithmPreferences the engine cares about. */
export interface TastePreferences {
  favoriteGenres?: number[];
  moods?: string[];
  franchises?: string[];
}

/** Expands TV composite genre ids into the movie-canonical space. */
export function normalizeGenreIds(ids: number[] | undefined): number[] {
  if (!ids || ids.length === 0) return [];
  const out = new Set<number>();
  for (const id of ids) {
    const mapped = TV_TO_MOVIE_GENRES[id];
    if (mapped) mapped.forEach((m) => out.add(m));
    else out.add(id);
  }
  return Array.from(out);
}

function ratingRecencyFactor(ratedAt: number): number {
  const ageDays = Math.max(0, (Date.now() - ratedAt) / (1000 * 60 * 60 * 24));
  return 1 / (1 + ageDays / RATING_HALF_LIFE_DAYS);
}

/** Builds a genre affinity map from ratings (movies + shows) and onboarding prefs. */
export function buildTasteProfile(
  ratings: RatingSource[],
  prefs?: TastePreferences,
): TasteProfile {
  const profile: TasteProfile = new Map();

  for (const r of ratings) {
    const genreIds = normalizeGenreIds(r.genreIds);
    if (genreIds.length === 0) continue;
    const recency = 0.5 + 0.5 * ratingRecencyFactor(r.ratedAt);
    const delta = (RATING_GENRE_DELTAS[r.rating] ?? 0) * recency;
    for (const genreId of genreIds) {
      profile.set(genreId, (profile.get(genreId) ?? 0) + delta);
    }
  }

  // Onboarding genres/moods give a fresh profile some shape.
  for (const genreId of prefs?.favoriteGenres ?? []) {
    profile.set(
      genreId,
      (profile.get(genreId) ?? 0) + FAVORITE_GENRE_WEIGHT,
    );
  }
  for (const moodId of prefs?.moods ?? []) {
    const mood = MOODS.find((m) => m.id === moodId);
    if (!mood) continue;
    for (const genreId of mood.genres) {
      profile.set(genreId, (profile.get(genreId) ?? 0) + MOOD_GENRE_WEIGHT);
    }
  }

  // Normalize to [-1, 1] so strength doesn't grow unbounded.
  let maxAbs = 0;
  for (const w of profile.values()) maxAbs = Math.max(maxAbs, Math.abs(w));
  if (maxAbs > 0) {
    for (const [id, w] of profile) profile.set(id, w / maxAbs);
  }

  return profile;
}

function genreAffinity(
  rawGenreIds: number[] | undefined,
  profile: TasteProfile,
): number {
  const genreIds = normalizeGenreIds(rawGenreIds);
  if (genreIds.length === 0 || profile.size === 0) return 0;
  let sum = 0;
  let matched = 0;
  for (const id of genreIds) {
    const w = profile.get(id);
    if (w !== undefined) {
      sum += w;
      matched += 1;
    }
  }
  if (matched === 0) return 0;
  // Damped by coverage so one matched genre counts less than a full match.
  return (sum / matched) * (matched / genreIds.length);
}

function qualityScore(voteAverage: number, voteCount: number): number {
  const shrunk =
    (voteAverage * voteCount + QUALITY_PRIOR_MEAN * QUALITY_PRIOR_VOTES) /
    (voteCount + QUALITY_PRIOR_VOTES);
  return shrunk - QUALITY_PRIOR_MEAN;
}

function toDiscoverMedia(
  item: TMDBMovieSearchResult | TMDBShowSearchResult,
  isTVShow: boolean,
): DiscoverMedia {
  const isMovie = !isTVShow;
  return {
    id: item.id,
    title: isMovie
      ? (item as TMDBMovieSearchResult).title
      : (item as TMDBShowSearchResult).name,
    name: isTVShow ? (item as TMDBShowSearchResult).name : undefined,
    poster_path: item.poster_path ?? "",
    backdrop_path: item.backdrop_path ?? "",
    overview: item.overview ?? "",
    vote_average: item.vote_average ?? 0,
    vote_count: item.vote_count ?? 0,
    type: isTVShow ? "show" : "movie",
    release_date: isMovie
      ? (item as TMDBMovieSearchResult).release_date
      : undefined,
    first_air_date: isTVShow
      ? (item as TMDBShowSearchResult).first_air_date
      : undefined,
  };
}

function bookmarkToDiscoverMedia(b: BookmarkSource): DiscoverMedia {
  return {
    id: Number(b.tmdbId),
    title: b.title,
    poster_path: b.poster ?? "",
    backdrop_path: "",
    overview: "",
    vote_average: 0,
    vote_count: 0,
    type: b.type,
    release_date: b.year ? `${b.year}-01-01` : undefined,
    first_air_date: b.year ? `${b.year}-01-01` : undefined,
  };
}

interface Seed {
  tmdbId: string;
  weight: number;
  limit: number;
}

interface ScoredCandidate {
  item: TMDBMovieSearchResult | TMDBShowSearchResult;
  sourceScore: number;
  /** Seed that first surfaced this candidate. */
  primarySeed: string;
}

/** Top positive genres of a profile, in movie-canonical ids. */
export function topPositiveGenres(
  profile: TasteProfile,
  count: number,
): number[] {
  return Array.from(profile.entries())
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([id]) => id);
}

/** Translates movie-canonical genre ids for the given discover target. */
function genresForType(genreIds: number[], isTVShow: boolean): number[] {
  if (!isTVShow) return genreIds;
  const out = new Set<number>();
  for (const id of genreIds) out.add(MOVIE_TO_TV_GENRES[id] ?? id);
  return Array.from(out);
}

/**
 * Fetches personal recommendations: builds a cross-type taste profile,
 * seeds candidates from ratings/history/bookmarks/genres/franchises,
 * scores them, and returns the top results with a per-seed diversity cap.
 */
export async function fetchPersonalRecommendations(
  isTVShow: boolean,
  history: HistorySource[],
  progress: ProgressSource[],
  bookmarks: BookmarkSource[],
  excludeIds: Set<string>,
  ratings: RatingSource[] = [],
  prefs: TastePreferences = {},
): Promise<DiscoverMedia[]> {
  const type = isTVShow ? TMDBContentTypes.TV : TMDBContentTypes.MOVIE;
  const wantedType = isTVShow ? "show" : "movie";

  const ratingsFiltered = ratings.filter((r) => r.type === wantedType);
  const positiveFiltered = ratingsFiltered
    .filter((r) => r.rating === "loved" || r.rating === "liked")
    // Loved first, then most recent.
    .sort((a, b) => {
      if (a.rating !== b.rating) return a.rating === "loved" ? -1 : 1;
      return b.ratedAt - a.ratedAt;
    })
    .slice(0, MAX_LIKED_FOR_RELATED);

  const historyFiltered = history
    .filter((h) => h.type === wantedType)
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, MAX_HISTORY_FOR_RELATED);

  const progressFiltered = progress
    .filter((p) => p.type === wantedType)
    .slice(0, MAX_CURRENT_FOR_RELATED);

  const bookmarksFiltered = bookmarks.filter((b) => b.type === wantedType);

  // Each media item seeds once, at its highest weight.
  const seeds: Seed[] = [];
  const seenSources = new Set<string>();
  const addSeed = (tmdbId: string, weight: number, limit: number) => {
    if (seenSources.has(tmdbId)) return;
    seenSources.add(tmdbId);
    seeds.push({ tmdbId, weight, limit });
  };

  for (const r of positiveFiltered)
    addSeed(
      r.tmdbId,
      r.rating === "loved" ? SEED_WEIGHT_LOVED : SEED_WEIGHT_LIKED,
      RELATED_PER_LIKED_LIMIT,
    );
  for (const h of historyFiltered)
    addSeed(h.tmdbId, SEED_WEIGHT_HISTORY, RELATED_PER_ITEM_LIMIT);
  for (const p of progressFiltered)
    addSeed(p.tmdbId, SEED_WEIGHT_PROGRESS, RELATED_PER_ITEM_LIMIT);
  for (const b of bookmarksFiltered.slice(0, MAX_BOOKMARK_FOR_RELATED))
    addSeed(b.tmdbId, SEED_WEIGHT_BOOKMARK, RELATED_PER_ITEM_LIMIT);

  const profile = buildTasteProfile(ratings, prefs);

  // Never recommend anything already rated.
  const ratedIds = new Set(ratingsFiltered.map((r) => r.tmdbId));

  // Also seed from the taste profile's top genres directly, so the
  // profile can generate candidates beyond same-type watched/rated items.
  const topGenres = genresForType(
    topPositiveGenres(profile, 2),
    isTVShow,
  );

  const fetches: Promise<
    TMDBMovieSearchResult[] | TMDBShowSearchResult[]
  >[] = seeds.map((s) => getRelatedMedia(s.tmdbId, type, s.limit));
  const seedKeys = seeds.map((s) => s.tmdbId);
  const seedWeights = seeds.map((s) => s.weight);

  if (topGenres.length > 0) {
    fetches.push(getMediaByGenres(topGenres, type, GENRE_DISCOVER_LIMIT));
    seedKeys.push("genre-discover");
    seedWeights.push(SEED_WEIGHT_GENRE_DISCOVER);
  }

  // Collections contribute films (movies only); companies feed discover
  // for either media type. Each franchise counts as one seed.
  const selectedFranchises = (prefs?.franchises ?? [])
    .map((id) => FRANCHISES.find((f) => f.id === id))
    .filter((f): f is FranchiseDefinition => Boolean(f))
    .slice(0, MAX_FRANCHISE_FETCHES);

  for (const franchise of selectedFranchises) {
    if (!isTVShow && franchise.collections?.length) {
      for (const collectionId of franchise.collections) {
        fetches.push(getCollectionParts(collectionId));
        seedKeys.push(`franchise-${franchise.id}`);
        seedWeights.push(SEED_WEIGHT_FRANCHISE);
      }
    }
    if (franchise.companies?.length) {
      fetches.push(
        getMediaByCompanies(franchise.companies, type, FRANCHISE_FETCH_LIMIT),
      );
      seedKeys.push(`franchise-${franchise.id}`);
      seedWeights.push(SEED_WEIGHT_FRANCHISE);
    }
  }

  const tmdbResults = await Promise.allSettled(fetches);

  const candidates = new Map<number, ScoredCandidate>();
  for (let i = 0; i < tmdbResults.length; i += 1) {
    const result = tmdbResults[i];
    if (result.status !== "fulfilled") continue;

    for (const item of result.value) {
      const idStr = String(item.id);
      if (excludeIds.has(idStr) || ratedIds.has(idStr)) continue;
      // Skip unreleased/announced films with no real audience yet.
      if (
        seedKeys[i].startsWith("franchise-") &&
        (item.vote_count ?? 0) < 50
      )
        continue;
      const existing = candidates.get(item.id);
      if (existing) {
        // Multiple seeds agreeing is a signal, with diminishing returns.
        existing.sourceScore += seedWeights[i] * 0.5;
      } else {
        candidates.set(item.id, {
          item,
          sourceScore: seedWeights[i],
          primarySeed: seedKeys[i],
        });
      }
    }
  }

  const scored = Array.from(candidates.values()).map((c) => {
    const genre = genreAffinity(c.item.genre_ids, profile);
    const quality = qualityScore(
      c.item.vote_average ?? 0,
      c.item.vote_count ?? 0,
    );
    const popularity = Math.log10(1 + (c.item.popularity ?? 0));
    const score =
      c.sourceScore +
      genre * GENRE_AFFINITY_WEIGHT +
      quality * QUALITY_WEIGHT +
      popularity * POPULARITY_WEIGHT;
    return { item: c.item, score, primarySeed: c.primarySeed };
  });

  scored.sort((a, b) => b.score - a.score);

  // Diversity cap: overflow only backfills after all seeds get a turn.
  const perSeedCount = new Map<string, number>();
  const picked: typeof scored = [];
  const overflow: typeof scored = [];
  for (const s of scored) {
    const count = perSeedCount.get(s.primarySeed) ?? 0;
    if (count < MAX_PER_SEED) {
      perSeedCount.set(s.primarySeed, count + 1);
      picked.push(s);
    } else {
      overflow.push(s);
    }
  }

  const merged = picked
    .concat(overflow)
    .slice(0, MAX_RESULTS)
    .map((s) => toDiscoverMedia(s.item, isTVShow));
  const mergedIds = new Set(merged.map((m) => m.id));

  const reminders: DiscoverMedia[] = [];
  for (const b of bookmarksFiltered) {
    const idNum = Number(b.tmdbId);
    if (excludeIds.has(b.tmdbId) || ratedIds.has(b.tmdbId)) continue;
    if (mergedIds.has(idNum)) continue;
    if (reminders.length >= MAX_BOOKMARK_REMINDERS) break;
    mergedIds.add(idNum);
    reminders.push(bookmarkToDiscoverMedia(b));
  }

  return [...reminders, ...merged];
}
