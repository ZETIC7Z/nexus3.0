import Fuse from "fuse.js";

import { SimpleCache } from "@/utils/common/cache";
import { MediaItem } from "@/utils/media/mediaTypes";

import {
  formatTMDBMetaToMediaItem,
  formatTMDBSearchResult,
  getCollectionParts,
  getMediaDetails,
  getMediaPoster,
  multiSearch,
  searchCollections,
} from "./tmdb";
import {
  TMDBContentTypes,
  TMDBMovieSearchResult,
  TMDBShowSearchResult,
} from "./types/tmdb";

export interface MWQuery {
  searchQuery: string;
}

const cache = new SimpleCache<MWQuery, MediaItem[]>();
cache.setCompare((a, b) => {
  return a.searchQuery.trim() === b.searchQuery.trim();
});
cache.initialize();

// detect "tmdb:123456" or "tmdb:123456:movie" or "tmdb:123456:tv"
const tmdbIdPattern = /^tmdb:(\d+)(?::(movie|tv))?$/i;
const trailingYearPattern = /\s+\b(19|20)\d{2}\b$/;

function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLenientQueries(searchQuery: string): string[] {
  const base = searchQuery.trim();
  if (base.length < 3) return [base];

  const normalized = normalizeQuery(base);
  const withoutTrailingYear = base.replace(trailingYearPattern, "").trim();
  const normalizedWithoutYear = normalizeQuery(withoutTrailingYear);

  const variants = [
    ...new Set([base, normalized, withoutTrailingYear, normalizedWithoutYear]),
  ].filter((q) => q.length > 0);

  // Keep fanout small to avoid TMDB rate-limit pressure.
  return variants.slice(0, 2);
}

function dedupeTMDBResults(
  items: (TMDBMovieSearchResult | TMDBShowSearchResult)[],
): (TMDBMovieSearchResult | TMDBShowSearchResult)[] {
  const deduped = new Map<
    string,
    TMDBMovieSearchResult | TMDBShowSearchResult
  >();

  items.forEach((item) => {
    deduped.set(`${item.media_type}:${item.id}`, item);
  });

  return Array.from(deduped.values());
}

// Weighted score: title match + audience signals (popularity, votes,
// recency), tuned so franchise/popular results beat obscure exact matches.
const WEIGHT_EXACT_TITLE = 0.2;
const WEIGHT_SIMILARITY = 0.2;
const WEIGHT_POPULARITY = 0.3;
const WEIGHT_VOTE_COUNT = 0.12;
const WEIGHT_RECENCY = 0.08;
const WEIGHT_RATING = 0.05;
// Boost when the query contains a year matching the result ("avatar 2009").
const QUERY_YEAR_MATCH_BOOST = 0.35;
// Boost for results in a franchise collection matched by name.
const FRANCHISE_BOOST = 0.1;
// Max name-matching collections to expand into the result pool.
const MAX_COLLECTIONS = 2;
// Credit for a title that starts with the query (e.g. "...: Tokyo Drift").
const PREFIX_MATCH_FRACTION = 0.6;
// Fallback similarity for items Fuse didn't match at all.
const UNMATCHED_SIMILARITY = 0.05;
const RECENCY_FLOOR_YEAR = 1970;

/** Normalizes a title for exact-match comparison ("&" -> "and", no articles). */
function canonicalTitle(input: string): string {
  return normalizeQuery(input.replace(/&/g, " and "))
    .split(" ")
    .filter((w) => w !== "the" && w !== "a" && w !== "an")
    .join(" ");
}

function itemTitle(item: TMDBMovieSearchResult | TMDBShowSearchResult): string {
  return item.media_type === TMDBContentTypes.MOVIE
    ? (item as TMDBMovieSearchResult).title
    : (item as TMDBShowSearchResult).name;
}

function itemYear(
  item: TMDBMovieSearchResult | TMDBShowSearchResult,
): number | null {
  const date =
    item.media_type === TMDBContentTypes.MOVIE
      ? (item as TMDBMovieSearchResult).release_date
      : (item as TMDBShowSearchResult).first_air_date;
  if (!date) return null;
  const year = new Date(date).getFullYear();
  return Number.isNaN(year) ? null : year;
}

/** Finds franchise collections matching the query and returns their films. */
async function expandWithCollections(query: string): Promise<{
  parts: TMDBMovieSearchResult[];
  franchiseIds: Set<number>;
}> {
  const franchiseIds = new Set<number>();
  const canonicalQuery = canonicalTitle(query);
  if (canonicalQuery.length < 3) return { parts: [], franchiseIds };

  let collections;
  try {
    collections = await searchCollections(query);
  } catch {
    return { parts: [], franchiseIds };
  }

  const matching = collections
    .filter((c) => {
      const name = canonicalTitle(c.name).replace(/\bcollection\b/g, "").trim();
      return (
        name.length > 0 &&
        (name.includes(canonicalQuery) || canonicalQuery.includes(name))
      );
    })
    .slice(0, MAX_COLLECTIONS);

  const settled = await Promise.allSettled(
    matching.map((c) => getCollectionParts(c.id)),
  );
  const parts: TMDBMovieSearchResult[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const part of result.value) {
      franchiseIds.add(part.id);
      parts.push(part);
    }
  }
  return { parts, franchiseIds };
}

function rankTMDBResults(
  items: (TMDBMovieSearchResult | TMDBShowSearchResult)[],
  query: string,
  franchiseIds: Set<number> = new Set(),
): (TMDBMovieSearchResult | TMDBShowSearchResult)[] {
  if (items.length <= 1) return items;

  // A year in the query is a filter intent, not title text.
  const queryYearMatch = query.match(/\b((?:19|20)\d{2})\b/);
  const queryYear = queryYearMatch ? Number(queryYearMatch[1]) : null;
  const textQuery = queryYear
    ? query.replace(queryYearMatch![0], " ").trim()
    : query;
  const canonicalQuery = canonicalTitle(textQuery);

  const fuse = new Fuse(items, {
    includeScore: true,
    ignoreLocation: true,
    // Lenient threshold so typo'd queries still match their target.
    threshold: 0.6,
    minMatchCharLength: 2,
    keys: [
      { name: "title", weight: 0.6 },
      { name: "name", weight: 0.6 },
      { name: "original_title", weight: 0.2 },
      { name: "original_name", weight: 0.2 },
    ],
  });

  const similarityByKey = new Map<string, number>();
  for (const result of fuse.search(textQuery)) {
    similarityByKey.set(
      `${result.item.media_type}:${result.item.id}`,
      1 - (result.score ?? 0.5),
    );
  }

  const currentYear = new Date().getFullYear();

  const scored = items.map((item) => {
    const canonical = canonicalTitle(itemTitle(item) ?? "");

    let exactScore = 0;
    if (canonicalQuery.length > 0 && canonical === canonicalQuery)
      exactScore = 1;
    else if (
      canonicalQuery.length > 0 &&
      canonical.startsWith(`${canonicalQuery} `)
    )
      exactScore = PREFIX_MATCH_FRACTION;

    const similarity =
      similarityByKey.get(`${item.media_type}:${item.id}`) ??
      UNMATCHED_SIMILARITY;

    // popularity = current interest, vote_count = lifetime audience.
    const popScore = Math.min(1, Math.log10(1 + (item.popularity ?? 0)) / 2);
    const voteScore = Math.min(1, Math.log10(1 + (item.vote_count ?? 0)) / 4);

    const year = itemYear(item);
    const recencyScore = year
      ? Math.min(
          1,
          Math.max(
            0,
            (year - RECENCY_FLOOR_YEAR) / (currentYear - RECENCY_FLOOR_YEAR),
          ),
        )
      : 0;

    // Average rating, shrunk so a 9.0 with a dozen votes doesn't count.
    const ratingScore =
      ((item.vote_average ?? 0) / 10) *
      Math.min(1, (item.vote_count ?? 0) / 200);

    // Gate title-match credit by audience confidence, so an obscure
    // exact match can't outrank a popular franchise entry on text alone.
    const textConfidence = 0.3 + 0.7 * voteScore;

    let score =
      (exactScore * WEIGHT_EXACT_TITLE + similarity * WEIGHT_SIMILARITY) *
        textConfidence +
      popScore * WEIGHT_POPULARITY +
      voteScore * WEIGHT_VOTE_COUNT +
      recencyScore * WEIGHT_RECENCY +
      ratingScore * WEIGHT_RATING;

    if (queryYear && year === queryYear) score += QUERY_YEAR_MATCH_BOOST;
    if (
      item.media_type === TMDBContentTypes.MOVIE &&
      franchiseIds.has(item.id)
    )
      score += FRANCHISE_BOOST;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/** Typo fallback: drop one word at a time so TMDB can match the rest. */
function getTypoFallbackQueries(searchQuery: string): string[] {
  const words = normalizeQuery(searchQuery).split(" ");
  if (words.length < 2 || words.length > 6) return [];

  const fallbacks: string[] = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const query = words.filter((_, j) => j !== i).join(" ");
    if (query.length >= 3) fallbacks.push(query);
  }
  return fallbacks.slice(0, 4);
}

export async function searchForMedia(query: MWQuery): Promise<MediaItem[]> {
  if (cache.has(query)) return cache.get(query) as MediaItem[];
  const { searchQuery } = query;

  // Check if query is a TMDB ID
  const tmdbMatch = searchQuery.match(tmdbIdPattern);
  if (tmdbMatch) {
    const id = tmdbMatch[1];
    const type =
      tmdbMatch[2]?.toLowerCase() === "tv"
        ? TMDBContentTypes.TV
        : TMDBContentTypes.MOVIE;

    try {
      const details = await getMediaDetails(id, type);
      if (details) {
        // Format the media details to our common format
        const mediaResult =
          type === TMDBContentTypes.MOVIE
            ? {
                id: details.id,
                title: (details as any).title,
                poster: getMediaPoster((details as any).poster_path),
                object_type: type,
                original_release_date: new Date((details as any).release_date),
              }
            : {
                id: details.id,
                title: (details as any).name,
                poster: getMediaPoster((details as any).poster_path),
                object_type: type,
                original_release_date: new Date(
                  (details as any).first_air_date,
                ),
              };

        const mediaItem = formatTMDBMetaToMediaItem(mediaResult);
        const result = [mediaItem];
        cache.set(query, result, 3600);
        return result;
      }
    } catch (error) {
      console.error("Error fetching by TMDB ID:", error);
    }
  }

  const runQueries = async (queries: string[]) => {
    const settled = await Promise.allSettled(
      queries.map((q) => multiSearch(q)),
    );
    return settled
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          (TMDBMovieSearchResult | TMDBShowSearchResult)[]
        > => result.status === "fulfilled",
      )
      .flatMap((result) => result.value);
  };

  // Runs in parallel with the title search; matches franchise films
  // that share no words with the query (e.g. "F9" for "fast and furious").
  const collectionsPromise = expandWithCollections(
    searchQuery.replace(trailingYearPattern, "").trim(),
  );

  let pool = await runQueries(getLenientQueries(searchQuery));

  // No matches — retry as a typo.
  if (pool.length === 0) {
    const fallbackQueries = getTypoFallbackQueries(searchQuery);
    if (fallbackQueries.length > 0) {
      pool = await runQueries(fallbackQueries);
    }
  }

  const { parts: collectionParts, franchiseIds } = await collectionsPromise;
  pool = pool.concat(collectionParts);

  if (pool.length === 0) {
    return [];
  }

  const data = dedupeTMDBResults(pool);
  const rankedData = rankTMDBResults(data, searchQuery, franchiseIds);

  const results = rankedData.map((v) => {
    const formattedResult = formatTMDBSearchResult(v, v.media_type);
    return formatTMDBMetaToMediaItem(formattedResult);
  });

  const movieWithPosters = results.filter((movie) => movie.poster);
  const movieWithoutPosters = results.filter((movie) => !movie.poster);

  const sortedresult = movieWithPosters.concat(movieWithoutPosters);

  // cache results for 1 hour
  cache.set(query, sortedresult, 3600);
  return sortedresult;
}
