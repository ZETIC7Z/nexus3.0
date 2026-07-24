import { DetailedMeta, MWMediaType } from "./types/mw";
import { TMDBEpisodeShort } from "./types/tmdb";
import overrides from "./overrides.json";

const API_BASE = "https://api.balloonerismm.workers.dev";

const overrideMap: Record<string, string> = overrides;

export function hasImdbOverride(tmdbId: string): boolean {
  return tmdbId in overrideMap;
}

function getImdbIdForTmdb(tmdbId: string): string | null {
  return overrideMap[tmdbId] ?? null;
}

interface BalloonShowResponse {
  id: string;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  number_of_seasons: number | null;
  seasons: { season_number: number; label: string }[];
}

interface BalloonEpisode {
  air_date: string;
  episode_number: number;
  id: string;
  name: string;
  overview: string;
  runtime: number | null;
  season_number: number;
  still_path: string | null;
}

interface BalloonSeasonResponse {
  episodes: BalloonEpisode[];
  name: string;
  season_number: number;
}

async function fetchShowInfo(imdbId: string): Promise<BalloonShowResponse> {
  const res = await fetch(`${API_BASE}/tv/${imdbId}`);
  if (!res.ok) throw new Error(`Show API returned ${res.status}`);
  return res.json();
}

async function fetchSeasonData(
  imdbId: string,
  seasonNumber: number,
): Promise<BalloonSeasonResponse> {
  const res = await fetch(
    `${API_BASE}/tv/${imdbId}/season/${seasonNumber}`,
  );
  if (!res.ok) throw new Error(`Season API returned ${res.status}`);
  return res.json();
}

export async function getImdbOverride(
  tmdbId: string,
  seasonId?: string,
): Promise<DetailedMeta | null> {
  const imdbId = getImdbIdForTmdb(tmdbId);
  if (!imdbId) return null;

  try {
    const show = await fetchShowInfo(imdbId);

    const seasons = show.seasons
      .filter((s) => s.season_number > 0)
      .map((s) => ({
        id: `${tmdbId}-s${s.season_number}`,
        number: s.season_number,
        title: `Season ${s.season_number}`,
      }));

    if (seasons.length === 0) return null;

    let selectedSeasonNumber = seasons[0].number;
    if (seasonId) {
      const found = seasons.find((s) => s.id === seasonId);
      if (found) selectedSeasonNumber = found.number;
    }

    const seasonData = await fetchSeasonData(imdbId, selectedSeasonNumber);
    const selectedSeason = seasons.find(
      (s) => s.number === selectedSeasonNumber,
    )!;
    if (seasonData.name) {
      selectedSeason.title = seasonData.name;
    }

    return {
      meta: {
        type: MWMediaType.SERIES,
        title: show.name,
        originalTitle: show.original_name || undefined,
        id: tmdbId,
        year: show.first_air_date?.split("-")[0],
        poster: show.poster_path || undefined,
        overview: show.overview || undefined,
        seasons,
        seasonData: {
          id: selectedSeason.id,
          number: selectedSeason.number,
          title: selectedSeason.title,
          episodes: seasonData.episodes.map((ep) => ({
            id: ep.episode_number.toString(),
            number: ep.episode_number,
            title: ep.name,
            air_date: ep.air_date || "",
            still_path: ep.still_path,
            overview: ep.overview || "",
          })),
        },
      },
      imdbId,
      tmdbId,
    };
  } catch {
    return null;
  }
}

export async function getImdbEpisodes(
  tmdbId: string,
  seasonNumber: number,
): Promise<TMDBEpisodeShort[] | null> {
  const imdbId = getImdbIdForTmdb(tmdbId);
  if (!imdbId) return null;

  try {
    const seasonData = await fetchSeasonData(imdbId, seasonNumber);
    return seasonData.episodes.map((ep) => ({
      id: ep.episode_number,
      episode_number: ep.episode_number,
      title: ep.name,
      air_date: ep.air_date || "",
      still_path: ep.still_path,
      overview: ep.overview || "",
    }));
  } catch {
    return null;
  }
}
