// allowed-providers.ts
// NEXUS — Per-Media Allowed Provider Registry
// ---------------------------------------------------------------------------
// Every media type is served by the same two sources:
//   Zephyr 🔥  — movie + TV (CF Worker)
//   Embeds ⚡  — movie/TV and anime provider family (anime-aware internally)
// The "Embeds ⚡" source decides internally which embed providers apply, so
// anime providers never surface for movies/TV and vice versa.
// ---------------------------------------------------------------------------

export function isAnimeByTitle(_title?: string, _tmdbId?: string): boolean {
  return false;
}

export async function checkIsAnime(_media: {
  tmdbId: string;
  type: "movie" | "show";
  title?: string;
}): Promise<boolean> {
  return false;
}

export function getAllowedSourceIds(
  _mediaType: "movie" | "show",
  _isAnime: boolean,
): string[] {
  return ["nexus-vidfast2", "nexus-embeds"];
}
