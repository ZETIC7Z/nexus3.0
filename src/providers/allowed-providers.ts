// allowed-providers.ts
// NEXUS — Per-Media Allowed Provider Registry
// ---------------------------------------------------------------------------
// Only MovieBox is active. All media types (movies, TV shows, anime) go
// through MovieBox. Built-in subtitle sources (OpenSubtitles etc.) are used
// for movies and TV; anime has no external subtitles — player uses whatever
// captions MovieBox returns (if any).
// ---------------------------------------------------------------------------

const animeCache = new Map<string, boolean>();

export function isAnimeByTitle(title?: string, tmdbId?: string): boolean {
  if (tmdbId && String(tmdbId) === "111110") return false; // One Piece Netflix Live Action (not anime)
  if (!title) return false;
  const lower = title.toLowerCase();
  const animeKeywords = [
    "one piece",
    "naruto",
    "bleach",
    "dragon ball",
    "jujutsu kaisen",
    "demon slayer",
    "attack on titan",
    "my hero academia",
    "solo leveling",
    "chainsaw man",
    "pokémon",
    "pokemon",
    "death note",
    "hunter x hunter",
    "tokyo ghoul",
    "fullmetal alchemist",
    "sword art online",
    "fate/",
    "gintama",
    "steins;gate",
    "code geass",
    "mob psycho",
    "haikyuu",
    "one punch man",
    "vinland saga",
    "boku no hero",
    "kimetsu no yaiba",
    "shingeki no kyojin",
  ];
  return animeKeywords.some((kw) => lower.includes(kw));
}

export async function checkIsAnime(media: { tmdbId: string; type: "movie" | "show"; title?: string }): Promise<boolean> {
  if (String(media.tmdbId) === "111110") return false; // One Piece Live Action
  const key = `${media.type}-${media.tmdbId}`;
  if (animeCache.has(key)) return animeCache.get(key)!;

  if (isAnimeByTitle(media.title)) {
    animeCache.set(key, true);
    return true;
  }

  const tmdbKey = import.meta.env.VITE_TMDB_READ_API_KEY;
  // In production, /nexus-tmdb/3/ is not proxied — use direct TMDB API
  const tmdbBase = import.meta.env.DEV
    ? `/nexus-tmdb/3`
    : `https://api.themoviedb.org/3`;
  const endpoint = media.type === "movie" ? `${tmdbBase}/movie/${media.tmdbId}` : `${tmdbBase}/tv/${media.tmdbId}`;
  try {
    const res = await fetch(endpoint, {
      headers: {
        ...(tmdbKey ? { Authorization: `Bearer ${tmdbKey}` } : {}),
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const genres: Array<{ id: number; name: string }> = data.genres ?? [];
      const originCountry: string[] = data.origin_country ?? [];
      const origLang: string = data.original_language ?? "";
      const prodCountries: Array<{ iso_3166_1: string }> = data.production_countries ?? [];

      const isAnimation = genres.some((g) => g.id === 16 || g.name?.toLowerCase() === "animation");
      const isJapanese =
        originCountry.includes("JP") ||
        origLang === "ja" ||
        prodCountries.some((c) => c.iso_3166_1 === "JP");

      const result = isAnimation && isJapanese;
      animeCache.set(key, result);
      return result;
    }
  } catch {
    /* fallback */
  }

  animeCache.set(key, false);
  return false;
}

/**
 * Only MovieBox is active.
 * - Anime: MovieBox only (subtitles come from the built-in OpenSubtitles
 *   provider via the player's default subtitle system; MovieBox anime
 *   streams have no embedded subs so the player falls back gracefully).
 * - Movies / TV shows: MovieBox only.
 */
export function getAllowedSourceIds(_mediaType: "movie" | "show", _isAnime: boolean): string[] {
  return ["nexus-moviebox"];
}
