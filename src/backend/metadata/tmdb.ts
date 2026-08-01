import slugify from "slugify";

import { useLanguageStore } from "@/stores/language";
import { usePreferencesStore } from "@/stores/preferences";
import { SimpleCache } from "@/utils/common/cache";
import { getTmdbLanguageCode } from "@/utils/locale/language";
import { MediaItem } from "@/utils/media/mediaTypes";
import { getProxyUrls } from "@/utils/hosting/proxyUrls";

import { MWMediaMeta, MWMediaType, MWSeasonMeta } from "./types/mw";
import { getImdbEpisodes } from "./imdbMetadataProvider";
import {
  ExternalIdMovieSearchResult,
  TMDBContentTypes,
  TMDBCredits,
  TMDBEpisode,
  TMDBEpisodeShort,
  TMDBMediaResult,
  TMDBMovieData,
  TMDBMovieSearchResult,
  TMDBPerson,
  TMDBPersonImages,
  TMDBPersonCombinedCredits,
  TMDBSearchResult,
  TMDBSeason,
  TMDBSeasonMetaResult,
  TMDBShowData,
  TMDBShowSearchResult,
  TMDBVideo,
  TMDBVideosResponse,
} from "./types/tmdb";
import { mwFetch } from "../helpers/fetch";

export function mediaTypeToTMDB(type: MWMediaType): TMDBContentTypes {
  if (type === MWMediaType.MOVIE) return TMDBContentTypes.MOVIE;
  if (type === MWMediaType.SERIES) return TMDBContentTypes.TV;
  throw new Error("unsupported type");
}

export function mediaItemTypeToMediaType(type: MediaItem["type"]): MWMediaType {
  if (type === "movie") return MWMediaType.MOVIE;
  if (type === "show") return MWMediaType.SERIES;
  throw new Error("unsupported type");
}

export function TMDBMediaToMediaType(type: TMDBContentTypes): MWMediaType {
  if (type === TMDBContentTypes.MOVIE) return MWMediaType.MOVIE;
  if (type === TMDBContentTypes.TV) return MWMediaType.SERIES;
  throw new Error("unsupported type");
}

export function TMDBMediaToMediaItemType(
  type: TMDBContentTypes,
): MediaItem["type"] {
  if (type === TMDBContentTypes.MOVIE) return "movie";
  if (type === TMDBContentTypes.TV) return "show";
  throw new Error("unsupported type");
}

export function formatTMDBEpisode(v: TMDBEpisodeShort): {
  id: string;
  number: number;
  title: string;
  air_date: string;
  still_path: string | null;
  overview: string;
} {
  return {
    id: v.id.toString(),
    number: v.episode_number,
    title: v.title,
    air_date: v.air_date,
    still_path: v.still_path,
    overview: v.overview,
  };
}

export function formatTMDBMeta(
  media: TMDBMediaResult,
  season?: TMDBSeasonMetaResult,
): MWMediaMeta {
  const type = TMDBMediaToMediaType(media.object_type);
  let seasons: undefined | MWSeasonMeta[];
  if (type === MWMediaType.SERIES) {
    seasons = (media.seasons ?? [])
      .sort((a, b) => a.season_number - b.season_number)
      .map(
        (v): MWSeasonMeta => ({
          title: v.title,
          id: v.id.toString(),
          number: v.season_number,
        }),
      );
  }

  return {
    title: media.title,
    originalTitle: media.originalTitle,
    id: media.id.toString(),
    year: media.original_release_date?.getFullYear()?.toString(),
    poster: media.poster,
    type,
    overview: media.overview,
    seasons: seasons as any,
    seasonData: season
      ? {
          id: season.id.toString(),
          number: season.season_number,
          title: season.title,
          episodes: (season.episodes ?? [])
            .sort((a, b) => a.episode_number - b.episode_number)
            .map(formatTMDBEpisode),
        }
      : (undefined as any),
  };
}

export function formatTMDBMetaToMediaItem(media: TMDBMediaResult): MediaItem {
  const type = TMDBMediaToMediaItemType(media.object_type);

  return {
    title: media.title,
    id: media.id.toString(),
    year: media.original_release_date?.getFullYear() ?? 0,
    release_date: media.original_release_date,
    poster: media.poster,
    type,
  };
}

export function TMDBIdToUrlId(
  type: MWMediaType,
  tmdbId: string,
  title: string,
) {
  return [
    "tmdb",
    mediaTypeToTMDB(type),
    tmdbId,
    slugify(title, { lower: true, strict: true }),
  ].join("-");
}

export function TMDBMediaToId(media: MWMediaMeta): string {
  return TMDBIdToUrlId(media.type, media.id, media.title);
}

export function mediaItemToId(media: MediaItem): string {
  return TMDBIdToUrlId(
    mediaItemTypeToMediaType(media.type),
    media.id,
    media.title,
  );
}

export function decodeTMDBId(
  paramId: string,
): { id: string; type: MWMediaType } | null {
  const [prefix, type, id] = paramId.split("-", 3);
  if (prefix !== "tmdb" || !/^\d+$/.test(id ?? "")) return null;
  let mediaType;
  try {
    mediaType = TMDBMediaToMediaType(type as TMDBContentTypes);
  } catch {
    return null;
  }
  return {
    type: mediaType,
    id,
  };
}

// Cache for TMDB API responses
interface TMDBCacheKey {
  url: string;
  params: object;
  language: string;
}

const tmdbCache = new SimpleCache<TMDBCacheKey, any>();
tmdbCache.setCompare((a, b) => {
  return (
    a.url === b.url &&
    JSON.stringify(a.params) === JSON.stringify(b.params) &&
    a.language === b.language
  );
});
tmdbCache.initialize();

function abortOnTimeout(timeout: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}


let proxyRotationIndex = 0;

function getNextProxy(proxyUrls: string[]): string | undefined {
  if (!proxyUrls.length) return undefined;
  const proxy = proxyUrls[proxyRotationIndex % proxyUrls.length];
  proxyRotationIndex += 1;
  return proxy;
}

export async function get<T>(url: string, params?: object): Promise<T> {
  const userLanguage = useLanguageStore.getState().language;
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  const cacheKey: TMDBCacheKey = { url, params: params || {}, language: formattedLanguage };
  const cachedResult = tmdbCache.get(cacheKey);
  if (cachedResult) return cachedResult as T;

  // TMDB credentials are injected by /api/tmdb on the server. Keeping this
  // request same-origin prevents the token from entering the client bundle,
  // browser network requests, or third-party proxy URLs.
  const allParams = { ...params, language: formattedLanguage };
  const result = await mwFetch<T>(encodeURI(url), {
    headers: { accept: "application/json" },
    baseURL: "/api/tmdb/",
    params: allParams,
    signal: abortOnTimeout(10000),
  });

  tmdbCache.set(cacheKey, result, 3600);
  return result;
}


export async function multiSearch(
  query: string,
): Promise<(TMDBMovieSearchResult | TMDBShowSearchResult)[]> {
  const data = await get<TMDBSearchResult>("search/multi", {
    query,
    include_adult: false,
    page: 1,
  });
  // filter out results that aren't movies or shows
  const results = (Array.isArray(data.results) ? data.results : []).filter(
    (r) =>
      r.media_type === TMDBContentTypes.MOVIE ||
      r.media_type === TMDBContentTypes.TV,
  );
  return results;
}

export async function searchMovies(
  query: string,
): Promise<TMDBMovieSearchResult[]> {
  const data = await get<{
    results: TMDBMovieSearchResult[];
  }>("search/movie", {
    query,
    include_adult: false,
    page: 1,
  });
  return (Array.isArray(data.results) ? data.results : []).map((result) => ({
    ...result,
    media_type: TMDBContentTypes.MOVIE,
  }));
}

export async function searchTVShows(
  query: string,
): Promise<TMDBShowSearchResult[]> {
  const data = await get<{
    results: TMDBShowSearchResult[];
  }>("search/tv", {
    query,
    include_adult: false,
    page: 1,
  });
  return (Array.isArray(data.results) ? data.results : []).map((result) => ({
    ...result,
    media_type: TMDBContentTypes.TV,
  }));
}

export async function generateQuickSearchMediaUrl(
  query: string,
): Promise<string | undefined> {
  const data = await multiSearch(query);
  if (data.length === 0) return undefined;
  const result = data[0];
  const title =
    result.media_type === TMDBContentTypes.MOVIE ? result.title : result.name;

  return `/media/${TMDBIdToUrlId(
    TMDBMediaToMediaType(result.media_type),
    result.id.toString(),
    title,
  )}`;
}

// Conditional type which for inferring the return type based on the content type
type MediaDetailReturn<T extends TMDBContentTypes> =
  T extends TMDBContentTypes.MOVIE
    ? TMDBMovieData
    : T extends TMDBContentTypes.TV
      ? TMDBShowData
      : never;

export async function getEpisodeDetails(
  showId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<{ vote_average: number } | null> {
  try {
    const data = await get<TMDBEpisode>(
      `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`,
    );
    return {
      vote_average:
        typeof data.vote_average === "number" ? data.vote_average : 0,
    };
  } catch {
    return null;
  }
}

export async function getSeasonDetails(
  id: string,
  season: number,
): Promise<
  Array<{
    id: number;
    name: string;
    episode_number: number;
    overview: string;
    still_path: string | null;
    air_date: string;
    season_number: number;
  }>
> {
  const seasonData = await get<TMDBSeason>(`/tv/${id}/season/${season}`);
  return seasonData.episodes.map((episode) => ({
    id: episode.id,
    name: episode.name,
    episode_number: episode.episode_number,
    overview: episode.overview,
    still_path: episode.still_path || seasonData.poster_path,
    air_date: episode.air_date,
    season_number: season,
  }));
}

export async function getMediaDetails<
  T extends TMDBContentTypes,
  TReturn = MediaDetailReturn<T>,
>(id: string, type: T, fetchEpisodes: boolean = true): Promise<TReturn> {
  if (type === TMDBContentTypes.MOVIE) {
    return get<TReturn>(`/movie/${id}`, {
      append_to_response: "external_ids,credits,release_dates",
    });
  }
  if (type === TMDBContentTypes.TV) {
    const showData = await get<TReturn>(`/tv/${id}`, {
      append_to_response: "external_ids,credits,content_ratings",
    });

    if (!fetchEpisodes) {
      return {
        ...showData,
        episodes: [],
      } as TReturn;
    }

    // Fetch episodes for each season
    const showDetails = showData as TMDBShowData;
    const seasons = Array.isArray(showDetails.seasons)
      ? showDetails.seasons
      : [];
    const allEpisodesBySeason = new Array(seasons.length);
    const seasonsQueue = seasons.map((season, index) => ({
      season,
      index,
    }));
    const concurrencyLimit = 5;

    const workers = Array.from(
      { length: Math.min(concurrencyLimit, seasonsQueue.length) },
      async () => {
        while (seasonsQueue.length > 0) {
          const item = seasonsQueue.shift();
          if (!item) break;
          const { season, index } = item;
          const seasonData = await get<TMDBSeason>(
            `/tv/${id}/season/${season.season_number}`,
          );
          allEpisodesBySeason[index] = seasonData.episodes.map((episode) => ({
            id: episode.id,
            name: episode.name,
            episode_number: episode.episode_number,
            overview: episode.overview,
            still_path: episode.still_path || seasonData.poster_path,
            air_date: episode.air_date,
            season_number: season.season_number,
          }));
        }
      },
    );

    await Promise.all(workers);
    const allEpisodes = allEpisodesBySeason.flat();

    return {
      ...showData,
      episodes: allEpisodes,
    } as TReturn;
  }
  throw new Error("Invalid media type");
}

export function getMediaBackdrop(
  backdropPath: string | null,
): string | undefined {
  const shouldProxyTmdb = usePreferencesStore.getState().proxyTmdb;
  const imgUrl = `https://image.tmdb.org/t/p/original${backdropPath}`;
  const proxyUrl = getProxyUrls()[0];
  if (proxyUrl && shouldProxyTmdb) {
    return `${proxyUrl}/?destination=${imgUrl}`;
  }
  if (backdropPath) return imgUrl;
}

export function getMediaPoster(posterPath: string | null): string | undefined {
  const shouldProxyTmdb = usePreferencesStore.getState().proxyTmdb;
  const imgUrl = `https://image.tmdb.org/t/p/w342/${posterPath}`;

  if (shouldProxyTmdb) {
    const proxyUrls = getProxyUrls();
    const proxy = getNextProxy(proxyUrls);
    if (proxy) {
      return `${proxy}/?destination=${imgUrl}`;
    }
  }

  if (posterPath) return imgUrl;
}

/**
 * Fetches the poster URL for a movie or show from TMDB by ID.
 * Use this when importing from external sources (e.g. Trakt) that may not have poster URLs.
 */
export async function getPosterForMedia(
  tmdbId: string,
  type: "movie" | "show",
): Promise<string | undefined> {
  try {
    const tmdbType =
      type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;
    const details = await getMediaDetails(tmdbId, tmdbType, false);
    const posterPath =
      (details as TMDBMovieData | TMDBShowData).poster_path ?? null;
    return getMediaPoster(posterPath);
  } catch {
    return undefined;
  }
}

export async function getCollectionDetails(collectionId: number): Promise<any> {
  return get<any>(`/collection/${collectionId}`);
}

export interface TMDBCollectionSearchResult {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

/** Searches TMDB collections (franchises) by name. */
export async function searchCollections(
  query: string,
): Promise<TMDBCollectionSearchResult[]> {
  const data = await get<{ results: TMDBCollectionSearchResult[] }>(
    "search/collection",
    {
      query,
      include_adult: false,
      page: 1,
    },
  );
  return data.results ?? [];
}

/** Returns a collection's films, shaped like movie search results. */
export async function getCollectionParts(
  collectionId: number,
): Promise<TMDBMovieSearchResult[]> {
  const data = await get<{ parts?: TMDBMovieSearchResult[] }>(
    `/collection/${collectionId}`,
  );
  return (data.parts ?? []).map((p) => ({
    ...p,
    media_type: TMDBContentTypes.MOVIE,
  }));
}

export async function getEpisodes(
  id: string,
  season: number,
): Promise<TMDBEpisodeShort[]> {
  const overrideEps = await getImdbEpisodes(id, season);
  if (overrideEps) return overrideEps;

  const data = await get<TMDBSeason>(`/tv/${id}/season/${season}`);
  return (data.episodes || []).map((e) => ({
    id: e.id,
    episode_number: e.episode_number,
    title: e.name,
    air_date: e.air_date,
    still_path: e.still_path || data.poster_path,
    overview: e.overview,
  }));
}

/**
 * Resolve TMDB season and episode IDs for a show. Use when external sources
 * (e.g. Trakt) only provide season/episode numbers.
 */
export async function getEpisodeIds(
  showTmdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<{ seasonId: string; episodeId: string } | null> {
  try {
    const data = await get<TMDBSeason>(
      `/tv/${showTmdbId}/season/${seasonNumber}`,
    );
    const episode = data.episodes.find(
      (e) => e.episode_number === episodeNumber,
    );
    if (!episode) return null;
    return {
      seasonId: data.id.toString(),
      episodeId: episode.id.toString(),
    };
  } catch {
    return null;
  }
}

export async function getMovieFromExternalId(
  imdbId: string,
): Promise<string | undefined> {
  const data = await get<ExternalIdMovieSearchResult>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const movie = data.movie_results[0];
  if (!movie) return undefined;

  return movie.id.toString();
}

export function formatTMDBSearchResult(
  result: TMDBMovieSearchResult | TMDBShowSearchResult,
  mediatype: TMDBContentTypes,
): TMDBMediaResult {
  const type = TMDBMediaToMediaType(mediatype);
  if (type === MWMediaType.SERIES) {
    const show = result as TMDBShowSearchResult;
    return {
      title: show.name,
      originalTitle: show.original_name,
      poster: getMediaPoster(show.poster_path),
      id: show.id,
      original_release_date: new Date(show.first_air_date),
      object_type: mediatype,
    };
  }

  const movie = result as TMDBMovieSearchResult;

  return {
    title: movie.title,
    originalTitle: movie.original_title,
    poster: getMediaPoster(movie.poster_path),
    id: movie.id,
    original_release_date: new Date(movie.release_date),
    object_type: mediatype,
  };
}

/**
 * Fetches the clear logo for a movie or show from TMDB images endpoint.
 */
export async function getMediaLogo(
  id: string,
  type: TMDBContentTypes,
  language?: string,
): Promise<string | undefined> {
  const userLanguage = language || useLanguageStore.getState().language;
  const formattedLanguage = getTmdbLanguageCode(userLanguage);
  const url =
    type === TMDBContentTypes.MOVIE
      ? `/movie/${id}/images`
      : `/tv/${id}/images`;
  try {
    const data = await get<any>(url, {
      include_image_language: `${formattedLanguage},en,null`,
    });
    // Try to find a logo in the user's language, then English, then any
    const logo =
      data.logos?.find((l: any) => l.iso_639_1 === formattedLanguage) ||
      data.logos?.find((l: any) => l.iso_639_1 === "en") ||
      data.logos?.[0];
    if (logo && logo.file_path) {
      return `https://image.tmdb.org/t/p/original${logo.file_path}`;
    }
    return undefined;
  } catch (err) {
    console.error("Failed to fetch TMDB logo:", err);
    return undefined;
  }
}

export async function getMediaCredits(
  id: string,
  type: TMDBContentTypes,
): Promise<TMDBCredits> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  return get<TMDBCredits>(`/${endpoint}/${id}/credits`);
}

export async function getMediaVideos(
  id: string,
  type: TMDBContentTypes,
): Promise<TMDBVideo[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<TMDBVideosResponse>(`/${endpoint}/${id}/videos`);
  return (Array.isArray(data.results) ? data.results : []).filter(
    (video) =>
      video.site === "YouTube" &&
      (video.type === "Trailer" || video.type === "Teaser"),
  );
}

/**
 * Fetches recommended media from TMDB recommendations endpoint.
 * Returns media that users commonly watch together based on ratings and popularity.
 */
export async function getRelatedMedia(
  id: string,
  type: TMDBContentTypes,
  limit: number = 10,
): Promise<TMDBMovieSearchResult[] | TMDBShowSearchResult[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<{
    results: TMDBMovieSearchResult[] | TMDBShowSearchResult[];
  }>(`/${endpoint}/${id}/recommendations`);

  return (Array.isArray(data.results) ? data.results : []).slice(0, limit);
}

/** Fetches popular, well-voted media matching the given genres. */
export async function getMediaByGenres(
  genreIds: number[],
  type: TMDBContentTypes,
  limit: number = 12,
): Promise<TMDBMovieSearchResult[] | TMDBShowSearchResult[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<{
    results: TMDBMovieSearchResult[] | TMDBShowSearchResult[];
  }>(`/discover/${endpoint}`, {
    with_genres: genreIds.join(","),
    sort_by: "popularity.desc",
    "vote_count.gte": 200,
    include_adult: false,
  });

  // discover results lack media_type; stamp it back on.
  const mediaType =
    type === TMDBContentTypes.MOVIE ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;
  return (Array.isArray(data.results) ? data.results : []).slice(0, limit).map((r) => ({
    ...r,
    media_type: mediaType,
  })) as TMDBMovieSearchResult[] | TMDBShowSearchResult[];
}

/** Fetches the current most popular movies (for taste onboarding). */
export async function getPopularMovies(
  limit: number = 15,
): Promise<TMDBMovieSearchResult[]> {
  const data = await get<{ results: TMDBMovieSearchResult[] }>(
    "/movie/popular",
    { page: 1 },
  );
  return (data.results ?? []).slice(0, limit).map((r) => ({
    ...r,
    media_type: TMDBContentTypes.MOVIE,
  }));
}

/** Fetches popular media from any of the given production companies. */
export async function getMediaByCompanies(
  companyIds: number[],
  type: TMDBContentTypes,
  limit: number = 12,
): Promise<TMDBMovieSearchResult[] | TMDBShowSearchResult[]> {
  const endpoint = type === TMDBContentTypes.MOVIE ? "movie" : "tv";
  const data = await get<{
    results: TMDBMovieSearchResult[] | TMDBShowSearchResult[];
  }>(`/discover/${endpoint}`, {
    with_companies: companyIds.join("|"),
    sort_by: "popularity.desc",
    "vote_count.gte": 200,
    include_adult: false,
  });
  return (Array.isArray(data.results) ? data.results : []).slice(0, limit).map((r) => ({
    ...r,
    media_type: type,
  })) as TMDBMovieSearchResult[] | TMDBShowSearchResult[];
}

export async function getPersonDetails(id: string): Promise<TMDBPerson> {
  return get<TMDBPerson>(`/person/${id}`);
}

export async function getPersonImages(id: string): Promise<TMDBPersonImages> {
  return get<TMDBPersonImages>(`/person/${id}/images`);
}

export async function getPersonCombinedCredits(
  id: string,
): Promise<TMDBPersonCombinedCredits> {
  return get<TMDBPersonCombinedCredits>(`/person/${id}/combined_credits`);
}

export function getPersonProfileImage(
  profilePath: string | null,
): string | undefined {
  const shouldProxyTmdb = usePreferencesStore.getState().proxyTmdb;
  const imgUrl = `https://image.tmdb.org/t/p/w185/${profilePath}`;

  if (shouldProxyTmdb) {
    const proxyUrls = getProxyUrls();
    const proxy = getNextProxy(proxyUrls);
    if (proxy) {
      return `${proxy}/?destination=${imgUrl}`;
    }
  }

  if (profilePath) return imgUrl;
}
