// allowed-providers.ts
// NEXUS — Per-Media Allowed Provider Registry
// ---------------------------------------------------------------------------
// Movies / TV shows :  VidFast → NoTorrent → VidUp → MovieBox
// Anime              :  AniKai → AniKoto → MovieBox
// ---------------------------------------------------------------------------

const animeCache = new Map<string, boolean>();

export function isAnimeByTitle(title?: string, tmdbId?: string): boolean {
  if (tmdbId && String(tmdbId) === "111110") return false;
  if (!title) return false;
  const lower = title.toLowerCase();
  const animeKeywords = [
    "one piece", "naruto", "bleach", "dragon ball",
    "jujutsu kaisen", "demon slayer", "attack on titan",
    "my hero academia", "solo leveling", "chainsaw man",
    "pokémon", "pokemon", "death note", "hunter x hunter",
    "tokyo ghoul", "fullmetal alchemist", "sword art online",
    "fate/", "gintama", "steins;gate", "code geass",
    "mob psycho", "haikyuu", "one punch man", "vinland saga",
    "boku no hero", "kimetsu no yaiba", "shingeki no kyojin",
  ];
  return animeKeywords.some((kw) => lower.includes(kw));
}

export async function checkIsAnime(media: { tmdbId: string; type: "movie" | "show"; title?: string }): Promise<boolean> {
  if (String(media.tmdbId) === "111110") return false;
  const key = `${media.type}-${media.tmdbId}`;
  if (animeCache.has(key)) return animeCache.get(key)!;

  if (isAnimeByTitle(media.title)) {
    animeCache.set(key, true);
    return true;
  }

  // Always use the same-origin function so the TMDB token never ships in
  // browser requests or production bundles.
  const tmdbBase = `/api/tmdb`;
  const endpoint = media.type === "movie"
    ? `${tmdbBase}/movie/${media.tmdbId}`
    : `${tmdbBase}/tv/${media.tmdbId}`;
  try {
    const res = await fetch(endpoint, {
      headers: {
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
      const isJapanese = originCountry.includes("JP") || origLang === "ja" || prodCountries.some((c) => c.iso_3166_1 === "JP");
      const result = isAnimation && isJapanese;
      animeCache.set(key, result);
      return result;
    }
  } catch { /* fallback */ }

  animeCache.set(key, false);
  return false;
}

export function getAllowedSourceIds(_mediaType: "movie" | "show", isAnime: boolean): string[] {
  return isAnime
    ? ["nexus-anikai", "nexus-anikoto", "nexus-moviebox"]
    : [
        "nexus-vidfast",
        "nexus-notorrent",
        "nexus-vidup",
        "nexus-moviebox",
      ];
}
