import { getMediaPoster, searchMovies } from "@/backend/metadata/tmdb";
import { PlayerMeta } from "@/stores/player/slices/source";

/**
 * Letterboxd watchlist CSV import helpers.
 *
 * Letterboxd lets you export your watchlist as a CSV with the columns:
 *   Date,Name,Year,Letterboxd URI
 *
 * The watchlist only ever contains films, so every resolved item is a movie.
 * We parse the CSV, then resolve each row to a TMDB movie so it can be stored
 * as a bookmark (bookmarks are keyed by tmdbId).
 */

export interface LetterboxdWatchlistRow {
  name: string;
  year?: number;
  uri?: string;
}

export type LetterboxdImportStatus =
  | "added"
  | "duplicate"
  | "notfound"
  | "error";

export interface LetterboxdImportItemResult {
  row: LetterboxdWatchlistRow;
  status: LetterboxdImportStatus;
  meta?: PlayerMeta;
}

/**
 * Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes
 * (""), and both \n and \r\n line endings. Returns a list of rows, each a
 * list of cell strings. Fully blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a leading UTF-8 BOM if present.
  const s = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      current.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Handle \r\n as a single break.
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function toYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/\d{4}/);
  if (!match) return undefined;
  const year = parseInt(match[0], 10);
  return Number.isFinite(year) ? year : undefined;
}

/**
 * Parse a Letterboxd watchlist CSV export into rows. Tolerates missing or
 * reordered headers by falling back to Letterboxd's fixed column order
 * (Date, Name, Year, Letterboxd URI).
 */
export function parseLetterboxdWatchlist(
  content: string,
): LetterboxdWatchlistRow[] {
  const table = parseCsv(content);
  if (table.length === 0) return [];

  const header = table[0].map((h) => h.trim().toLowerCase());
  const hasHeader =
    header.includes("name") ||
    header.includes("title") ||
    header.some((h) => h.includes("letterboxd uri"));

  let nameIdx = header.indexOf("name");
  if (nameIdx === -1) nameIdx = header.indexOf("title");
  let yearIdx = header.indexOf("year");
  let uriIdx = header.findIndex((h) => h.includes("uri"));

  // Fall back to Letterboxd's documented column order.
  if (nameIdx === -1) nameIdx = 1;
  if (yearIdx === -1) yearIdx = 2;
  if (uriIdx === -1) uriIdx = 3;

  const dataRows = hasHeader ? table.slice(1) : table;
  const out: LetterboxdWatchlistRow[] = [];
  const seen = new Set<string>();

  for (const cols of dataRows) {
    const name = (cols[nameIdx] ?? "").trim();
    if (!name) continue;

    const year = toYear(cols[yearIdx]);
    const uri = (cols[uriIdx] ?? "").trim() || undefined;

    // De-duplicate identical name+year pairs within the file.
    const dedupeKey = `${name.toLowerCase()}::${year ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({ name, year, uri });
  }

  return out;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve a single watchlist row to a TMDB movie and build the PlayerMeta used
 * to create a bookmark. Prefers an exact title match with the matching release
 * year, then any result with the matching year, then an exact title match, and
 * finally the most relevant (first) result. Returns null when nothing matches.
 */
export async function resolveLetterboxdRow(
  row: LetterboxdWatchlistRow,
): Promise<PlayerMeta | null> {
  const results = await searchMovies(row.name);
  if (!results || results.length === 0) return null;

  const want = normalizeTitle(row.name);
  const yearOf = (releaseDate: string | undefined): number | undefined => {
    if (!releaseDate) return undefined;
    const y = new Date(releaseDate).getFullYear();
    return Number.isFinite(y) ? y : undefined;
  };

  let best =
    (row.year !== undefined
      ? results.find(
          (r) =>
            normalizeTitle(r.title) === want &&
            yearOf(r.release_date) === row.year,
        )
      : undefined) ??
    (row.year !== undefined
      ? results.find((r) => yearOf(r.release_date) === row.year)
      : undefined) ??
    results.find((r) => normalizeTitle(r.title) === want) ??
    results[0];

  if (!best) return null;

  return {
    type: "movie",
    title: best.title,
    tmdbId: best.id.toString(),
    releaseYear: yearOf(best.release_date) ?? row.year ?? 0,
    poster: getMediaPoster(best.poster_path),
  };
}

/**
 * Resolve and import an entire watchlist. Runs a small concurrency pool to stay
 * friendly to the TMDB API, reports progress after each item, and skips films
 * that are already bookmarked.
 */
export async function importLetterboxdWatchlist(options: {
  rows: LetterboxdWatchlistRow[];
  isAlreadyBookmarked: (tmdbId: string) => boolean;
  addBookmark: (meta: PlayerMeta) => void;
  onProgress?: (done: number, total: number) => void;
  concurrency?: number;
}): Promise<LetterboxdImportItemResult[]> {
  const {
    rows,
    isAlreadyBookmarked,
    addBookmark,
    onProgress,
    concurrency = 5,
  } = options;

  const results: LetterboxdImportItemResult[] = new Array(rows.length);
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      const row = rows[index];
      try {
        const meta = await resolveLetterboxdRow(row);
        if (!meta) {
          results[index] = { row, status: "notfound" };
        } else if (isAlreadyBookmarked(meta.tmdbId)) {
          results[index] = { row, status: "duplicate", meta };
        } else {
          addBookmark(meta);
          results[index] = { row, status: "added", meta };
        }
      } catch (err) {
        results[index] = { row, status: "error" };
      } finally {
        done += 1;
        onProgress?.(done, rows.length);
      }
    }
  };

  const pool = Array.from(
    { length: Math.min(concurrency, Math.max(rows.length, 1)) },
    () => worker(),
  );
  await Promise.all(pool);

  return results;
}
