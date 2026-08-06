// allowed-providers.ts
// NEXUS — Per-Media Allowed Provider Registry
// ---------------------------------------------------------------------------
// Movie/TV sources: Zephyr, NoTorrent, VidCore, Videasy, VidUp, VidFast
// Anime sources:     Zephyr, AniKoto, AniKai
// ---------------------------------------------------------------------------

const MOVIE_TV_SOURCES = [
  "nexus-vidfast2",
  "nexus-notorrent",
  "nexus-vidcore",
  "nexus-videasy",
  "nexus-vidup",
  "nexus-vidfast",
];

const ANIME_SOURCES = [
  "nexus-vidfast2",
  "nexus-anikoto",
  "nexus-anikai",
];

export function isAnimeByTitle(title?: string, _tmdbId?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  const keywords = [
    "one piece", "naruto", "bleach", "dragon ball", "jujutsu kaisen",
    "demon slayer", "attack on titan", "my hero academia", "solo leveling",
    "chainsaw man", "death note", "hunter x hunter", "tokyo ghoul",
    "fullmetal alchemist", "sword art online", "gintama", "steins;gate",
    "code geass", "mob psycho", "haikyuu", "one punch man", "vinland saga",
  ];
  return keywords.some((kw) => t.includes(kw));
}

export async function checkIsAnime(media: {
  tmdbId: string;
  type: "movie" | "show";
  title?: string;
}): Promise<boolean> {
  if (isAnimeByTitle(media.title, media.tmdbId)) return true;
  try {
    const endpoint = media.type === "movie"
      ? `/api/tmdb/movie/${media.tmdbId}`
      : `/api/tmdb/tv/${media.tmdbId}`;
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data: any = await res.json();
      const genres: Array<{ id: number; name?: string }> = data.genres ?? [];
      const originCountry: string[] = data.origin_country ?? [];
      return genres.some((g: any) => g.id === 16) &&
        (originCountry.includes("JP") || data.original_language === "ja");
    }
  } catch { /* fall through */ }
  return false;
}

export function getAllowedSourceIds(
  _mediaType: "movie" | "show",
  isAnime: boolean,
): string[] {
  return isAnime ? ANIME_SOURCES : MOVIE_TV_SOURCES;
}
