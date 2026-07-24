
import {
  TMDBEpisode,
  TMDBMovieData,
  TMDBSeason,
  TMDBShowData,
} from "./types/tmdb";

const VALLEY_BASE = "https://valley.fontaine.lol";
const VALLEY_TIMEOUT = 8000;

const MOVIE_GENRE_IDS: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  "Science Fiction": 878,
  "TV Movie": 10770,
  Thriller: 53,
  War: 10752,
  Western: 37,
};

const TV_GENRE_IDS: Record<string, number> = {
  "Action & Adventure": 10759,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Kids: 10762,
  Mystery: 9648,
  News: 10763,
  Reality: 10764,
  "Sci-Fi & Fantasy": 10765,
  Soap: 10766,
  Talk: 10767,
  "War & Politics": 10768,
  Western: 37,
};

function mapGenres(
  names: string[] | undefined,
  table: Record<string, number>,
): { id: number; name: string }[] {
  return (names || []).map((name) => ({ id: table[name] ?? 0, name }));
}

interface ValleyMovie {
  tmdb_id: number;
  imdb_id: string;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number;
  genres: string[];
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  status: string;
  adult: boolean;
}

interface ValleySeason {
  show_id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string;
  poster_path: string;
  episode_count: number;
}

interface ValleyTVShow {
  tmdb_id: number;
  imdb_id: string;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  genres: string[];
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  status: string;
  seasons?: ValleySeason[];
}

interface ValleyEpisode {
  show_id: number;
  season_number: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string;
  still_path: string;
  vote_average: number;
  runtime: number;
}

interface ValleySeasonResponse {
  season: ValleySeason;
  episodes: ValleyEpisode[];
}

async function valleyFetch<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALLEY_TIMEOUT);
  try {
    const res = await fetch(`${VALLEY_BASE}${path}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`valley ${path}: status ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export type ValleyFallbackTarget =
  | { kind: "movie"; id: string }
  | { kind: "tv"; id: string }
  | { kind: "season"; id: string; season: number }
  | { kind: "episode"; id: string; season: number; episode: number };


export function resolveValleyFallbackTarget(
  url: string,
): ValleyFallbackTarget | null {
  const clean = url.replace(/^\/+/, "");

  let m = clean.match(/^movie\/(\d+)$/);
  if (m) return { kind: "movie", id: m[1] };

  m = clean.match(/^tv\/(\d+)\/season\/(\d+)\/episode\/(\d+)$/);
  if (m) return { kind: "episode", id: m[1], season: Number(m[2]), episode: Number(m[3]) };

  m = clean.match(/^tv\/(\d+)\/season\/(\d+)$/);
  if (m) return { kind: "season", id: m[1], season: Number(m[2]) };

  m = clean.match(/^tv\/(\d+)$/);
  if (m) return { kind: "tv", id: m[1] };

  return null;
}

function toTMDBMovie(m: ValleyMovie): TMDBMovieData {
  return {
    adult: m.adult,
    backdrop_path: m.backdrop_path || null,
    belongs_to_collection: null,
    budget: 0,
    genres: mapGenres(m.genres, MOVIE_GENRE_IDS),
    homepage: null,
    id: m.tmdb_id,
    imdb_id: m.imdb_id || null,
    original_language: m.original_language,
    original_title: m.original_title,
    overview: m.overview || null,
    popularity: m.popularity,
    poster_path: m.poster_path || null,
    production_companies: [],
    production_countries: [],
    release_date: m.release_date,
    revenue: 0,
    runtime: m.runtime || null,
    spoken_languages: [],
    status: m.status,
    tagline: null,
    title: m.title,
    video: false,
    vote_average: m.vote_average,
    vote_count: m.vote_count,
    external_ids: { imdb_id: m.imdb_id || null },
  };
}

function toTMDBShow(s: ValleyTVShow): TMDBShowData {
  return {
    adult: false,
    backdrop_path: s.backdrop_path || null,
    created_by: [],
    episode_run_time: [],
    first_air_date: s.first_air_date,
    genres: mapGenres(s.genres, TV_GENRE_IDS),
    homepage: "",
    id: s.tmdb_id,
    in_production: false,
    languages: [],
    last_air_date: s.last_air_date,
    last_episode_to_air: null,
    name: s.name,
    next_episode_to_air: null,
    networks: [],
    number_of_episodes: s.number_of_episodes,
    number_of_seasons: s.number_of_seasons,
    origin_country: [],
    original_language: s.original_language,
    original_name: s.original_name,
    overview: s.overview,
    popularity: s.popularity,
    poster_path: s.poster_path || null,
    production_companies: [],
    production_countries: [],
    seasons: (s.seasons || []).map((sn) => ({
      air_date: sn.air_date,
      episode_count: sn.episode_count,
      id: sn.season_number,
      name: sn.name,
      overview: sn.overview,
      poster_path: sn.poster_path || null,
      season_number: sn.season_number,
    })),
    spoken_languages: [],
    status: s.status,
    tagline: "",
    type: "",
    vote_average: s.vote_average,
    vote_count: s.vote_count,
    external_ids: { imdb_id: s.imdb_id || null },
  };
}

function toTMDBEpisode(e: ValleyEpisode): TMDBEpisode {
  return {
    air_date: e.air_date,
    episode_number: e.episode_number,

    id: e.episode_number,
    name: e.name,
    overview: e.overview,
    production_code: "",
    runtime: e.runtime,
    season_number: e.season_number,
    show_id: e.show_id,
    still_path: e.still_path || null,
    vote_average: e.vote_average,
    vote_count: 0,
    crew: [],
    guest_stars: [],
  };
}

function toTMDBSeason(s: ValleySeasonResponse): TMDBSeason {
  return {
    _id: "",
    air_date: s.season.air_date,
    episodes: s.episodes.map(toTMDBEpisode),
    name: s.season.name,
    overview: s.season.overview,
    id: s.season.season_number,
    poster_path: s.season.poster_path || null,
    season_number: s.season.season_number,
  };
}

export async function fetchValleyFallback<T>(
  target: ValleyFallbackTarget,
): Promise<T> {
  switch (target.kind) {
    case "movie": {
      const m = await valleyFetch<ValleyMovie>(`/movie/${target.id}`);
      return toTMDBMovie(m) as unknown as T;
    }
    case "tv": {
      const s = await valleyFetch<ValleyTVShow>(`/tv/${target.id}`);
      return toTMDBShow(s) as unknown as T;
    }
    case "season": {
      const s = await valleyFetch<ValleySeasonResponse>(
        `/tv/${target.id}/season/${target.season}`,
      );
      return toTMDBSeason(s) as unknown as T;
    }
    case "episode": {
      const s = await valleyFetch<ValleySeasonResponse>(
        `/tv/${target.id}/season/${target.season}`,
      );
      const ep = s.episodes.find((e) => e.episode_number === target.episode);
      if (!ep) throw new Error("valley: episode not found");
      return toTMDBEpisode(ep) as unknown as T;
    }
    default:
      throw new Error("valley: unsupported fallback target");
  }
}
