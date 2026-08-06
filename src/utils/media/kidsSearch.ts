import { get } from "@/backend/metadata/tmdb";
import { MediaItem } from "@/utils/media/mediaTypes";

/**
 * Core kid-safe TMDB genres. Only Animation (16), Family (10751) and Kids
 * (10762) are safe ON THEIR OWN — a title tagged Comedy (35), Action (28),
 * Mystery (9648), Sci-Fi (10765) etc. without one of these three can still be
 * aimed at adults (R-rated comedies, thrillers, …), so we never treat them as
 * kid content. This is the same lock that keeps Netflix kids mode safe.
 */
export const KID_SAFE_GENRES = new Set<number>([16, 10751, 10762]);

/** True when a TMDB search/discover result carries at least one core kids genre. */
export function isKidSafeResult(result: {
  genre_ids?: number[];
  adult?: boolean;
}): boolean {
  if (result.adult) return false;
  const genres = result.genre_ids ?? [];
  return genres.some((g) => KID_SAFE_GENRES.has(g));
}

function toMediaItem(item: any, type: "movie" | "show"): MediaItem {
  const date = type === "movie" ? item.release_date : item.first_air_date;
  return {
    id: String(item.id),
    title: item.title || item.name || "",
    poster: item.poster_path
      ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
      : "/placeholder.png",
    type,
    year: date ? Number.parseInt(date.slice(0, 4), 10) : undefined,
  };
}

/**
 * Kids-only search. Every result is verified to carry at least one kid-safe
 * genre, so adult / general-audience titles never surface in kids mode.
 */
export async function kidsSearchForMedia(
  query: string,
): Promise<MediaItem[]> {
  if (!query.trim()) return [];

  const [movieSearch, tvSearch] = await Promise.all([
    get<any>("/search/movie", {
      query,
      language: "en-US",
      include_adult: false,
    }),
    get<any>("/search/tv", {
      query,
      language: "en-US",
      include_adult: false,
    }),
  ]);

  const movies: MediaItem[] = (movieSearch.results ?? [])
    .filter(isKidSafeResult)
    .slice(0, 12)
    .map((m: any) => toMediaItem(m, "movie"));
  const shows: MediaItem[] = (tvSearch.results ?? [])
    .filter(isKidSafeResult)
    .slice(0, 12)
    .map((m: any) => toMediaItem(m, "show"));

  return [...movies, ...shows];
}
