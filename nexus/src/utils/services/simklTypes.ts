
export interface SimklIds {
  simkl?: number;
  simkl_id?: number;
  imdb?: string;
  tmdb?: string | number;
  tvdb?: string | number;
  mal?: number;
  anidb?: number;
  anilist?: number;
  slug?: string;
}

export interface SimklMediaRef {
  title: string;
  poster?: string;
  fanart?: string;
  year?: number;
  type?: string;
  ids: SimklIds;
}

export interface SimklActivityBucket {
  all?: string;
  watching?: string;
  plantowatch?: string;
  hold?: string;
  completed?: string;
  dropped?: string;
  rated_at?: string;
  playback?: string;
  removed_from_list?: string;
}

export interface SimklUser {
  user: {
    name: string;
    joined_at?: string;
    gender?: string;
    avatar?: string;
    bio?: string;
    loc?: string;
    age?: string;
  };
  account: {
    id: number;
    timezone?: string;
    type?: string; // "free" | "pro" | "vip"
    api_regen?: boolean;
  };
  connections?: Record<string, unknown>;
}

export type SimklListType = "shows" | "movies" | "anime";


export interface SimklActivities {
  all: string;
  settings?: { all: string };
  tv_shows?: SimklActivityBucket;
  anime?: SimklActivityBucket;
  movies?: SimklActivityBucket;
}


export interface SimklSyncItem {
  user_rating?: number;
  status?: string; // "watching" | "plantowatch" | "hold" | "completed" | "dropped"
  last_watched_at?: string;
  added_to_watchlist_at?: string;
  watched_episodes_count?: number;
  total_episodes_count?: number;
  show?: SimklMediaRef;
  movie?: SimklMediaRef;
  anime?: SimklMediaRef;
}


export interface SimklSyncBody {
  movies?: Array<{
    ids: Partial<SimklIds>;
    title?: string;
    year?: number;
    watched_at?: string;
  }>;
  shows?: Array<{
    ids: Partial<SimklIds>;
    title?: string;
    year?: number;
    seasons?: Array<{
      number: number;
      episodes?: Array<{ number: number; watched_at?: string }>;
    }>;
    watched_at?: string;
  }>;
  anime?: Array<{
    ids: Partial<SimklIds>;
    title?: string;
    year?: number;
    watched_at?: string;
  }>;
  episodes?: Array<{
    ids: Partial<SimklIds>;
    watched_at?: string;
  }>;
}

export interface SimklAddToListBody extends SimklSyncBody {
  to: "watching" | "plantowatch" | "hold" | "dropped" | "completed";
}

export interface SimklContentData {
  type: "movie" | "show" | "episode";
  tmdbId?: string;
  imdbId?: string;
  simklId?: number;
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  showTmdbId?: string;
  showTitle?: string;
  showYear?: number;
}
