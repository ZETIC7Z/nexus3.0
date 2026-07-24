import { useEffect, useMemo, useState } from "react";

import { getMediaPoster, multiSearch } from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import type {
  TMDBMovieSearchResult,
  TMDBShowSearchResult,
} from "@/backend/metadata/types/tmdb";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { WideContainer } from "@/components/layout/WideContainer";
import { MediaRatingCapsule } from "@/components/media/MediaRatingCapsule";
import { Heading1 } from "@/components/utils/Text";
import { CreateAlgorithmWizard } from "@/pages/algorithm/CreateAlgorithmWizard";
import {
  GENRE_LABELS,
  type RatingSource,
  buildTasteProfile,
} from "@/pages/discover/lib/personalRecommendations";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { useRatingsStore } from "@/stores/ratings";

// Validated categorical palette for dark surfaces.
const GENRE_COLORS = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];
// Soft fade width between donut slices, in percent of the circle.
const DONUT_FADE = 2.5;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Midpoint color between two hex colors, used to blend the donut seam. */
function mixColors(a: string, b: string): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return `rgb(${Math.round((r1 + r2) / 2)}, ${Math.round((g1 + g2) / 2)}, ${Math.round((b1 + b2) / 2)})`;
}

// Fixed genre id -> color, so a genre's color never changes with rank.
const GENRE_COLOR_MAP: Record<number, string> = Object.keys(GENRE_LABELS)
  .map(Number)
  .sort((a, b) => a - b)
  .reduce<Record<number, string>>((acc, id, i) => {
    acc[id] = GENRE_COLORS[i % GENRE_COLORS.length];
    return acc;
  }, {});

function colorForGenre(id: number): string {
  return GENRE_COLOR_MAP[id] ?? GENRE_COLORS[id % GENRE_COLORS.length];
}

interface GenreShare {
  id: number;
  label: string;
  share: number; // 0..100 among positive genres
  color: string;
}

function useTasteData() {
  const ratings = useRatingsStore((s) => s.ratings);
  const preferences = useRatingsStore((s) => s.preferences);

  return useMemo(() => {
    const sources: RatingSource[] = Object.entries(ratings).map(
      ([tmdbId, r]) => ({
        tmdbId,
        type: r.type,
        rating: r.rating,
        genreIds: r.genreIds,
        ratedAt: r.ratedAt,
      }),
    );
    const profile = buildTasteProfile(sources, preferences);

    const positive = Array.from(profile.entries())
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1]);
    const negative = Array.from(profile.entries())
      .filter(([, w]) => w < 0)
      .sort((a, b) => a[1] - b[1]);

    const positiveTotal = positive.reduce((acc, [, w]) => acc + w, 0);

    // Every genre with a positive weight gets its own slice, no "Other" bucket.
    const shares: GenreShare[] = positive.map(([id, w]) => ({
      id,
      label: GENRE_LABELS[id] ?? `Genre ${id}`,
      share: positiveTotal > 0 ? (w / positiveTotal) * 100 : 0,
      color: colorForGenre(id),
    }));

    const avoided = negative.map(([id, w]) => ({
      id,
      label: GENRE_LABELS[id] ?? `Genre ${id}`,
      strength: Math.abs(w) * 100,
    }));

    return { shares, avoided, ratingCount: Object.keys(ratings).length };
  }, [ratings, preferences]);
}

/** Donut built from a conic-gradient with soft fades between slices. */
function TasteDonut({
  shares,
  ratingCount,
}: {
  shares: GenreShare[];
  ratingCount: number;
}) {
  const gradient = useMemo(() => {
    if (shares.length === 0) return "";
    if (shares.length === 1) return shares[0].color;

    // Anchor both ends to the same blended color so the seam at 12
    // o'clock doesn't show a hard split.
    const seamColor = mixColors(
      shares[shares.length - 1].color,
      shares[0].color,
    );

    const stops: string[] = [`${seamColor} 0%`];
    let acc = 0;
    for (const s of shares) {
      const start = acc;
      const end = acc + s.share;
      const fade = Math.min(DONUT_FADE, s.share / 4);
      stops.push(`${s.color} ${(start + fade).toFixed(2)}%`);
      stops.push(`${s.color} ${(end - fade).toFixed(2)}%`);
      acc = end;
    }
    stops.push(`${seamColor} 100%`);
    return stops.join(", ");
  }, [shares]);

  if (shares.length === 0) return null;

  return (
    <div className="relative h-56 w-56 shrink-0">
      <div
        className="h-full w-full rounded-full"
        style={{
          background:
            shares.length === 1
              ? gradient
              : `conic-gradient(${gradient})`,
          WebkitMaskImage:
            "radial-gradient(closest-side, transparent 62%, black 63%)",
          maskImage:
            "radial-gradient(closest-side, transparent 62%, black 63%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white">{ratingCount}</span>
        <span className="text-sm text-type-secondary">
          {ratingCount === 1 ? "rating" : "ratings"}
        </span>
      </div>
    </div>
  );
}

function GenreBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm text-white/80">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-out"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-type-secondary">
        {Math.round(value)}%
      </span>
    </div>
  );
}

type SearchResult = TMDBMovieSearchResult | TMDBShowSearchResult;

function RateSearchRow({ item }: { item: SearchResult }) {
  const isMovie = item.media_type === TMDBContentTypes.MOVIE;
  const title = isMovie
    ? (item as TMDBMovieSearchResult).title
    : (item as TMDBShowSearchResult).name;
  const date = isMovie
    ? (item as TMDBMovieSearchResult).release_date
    : (item as TMDBShowSearchResult).first_air_date;
  const year = date ? new Date(date).getFullYear() : undefined;
  const poster = item.poster_path
    ? getMediaPoster(item.poster_path)
    : undefined;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2">
      {poster ? (
        <img
          src={poster}
          alt=""
          className="h-16 w-11 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-16 w-11 shrink-0 rounded bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-type-secondary">
          {year ?? "—"} · {isMovie ? "Movie" : "Show"}
        </p>
      </div>
      <MediaRatingCapsule
        media={{
          tmdbId: String(item.id),
          title,
          type: isMovie ? "movie" : "show",
          year,
          poster,
          genreIds: item.genre_ids,
        }}
      />
    </div>
  );
}

const RATING_LABELS: Record<string, string> = {
  loved: "Loved it",
  liked: "Liked it",
  okay: "It was okay",
  disliked: "Didn't like it",
  hated: "Hated it",
};

function RatedItemRow({ tmdbId }: { tmdbId: string }) {
  const item = useRatingsStore((s) => s.ratings[tmdbId]);
  const removeRating = useRatingsStore((s) => s.removeRating);
  if (!item) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2">
      {item.poster ? (
        <img
          src={item.poster}
          alt=""
          className="h-16 w-11 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-16 w-11 shrink-0 rounded bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{item.title}</p>
        <p className="text-xs text-type-secondary">
          {item.year ?? "—"} · {item.type === "movie" ? "Movie" : "Show"} ·{" "}
          {RATING_LABELS[item.rating] ?? item.rating}
        </p>
      </div>
      <MediaRatingCapsule
        media={{
          tmdbId,
          title: item.title,
          type: item.type,
          year: item.year,
          poster: item.poster,
          genreIds: item.genreIds,
        }}
      />
      <button
        type="button"
        title="Remove rating"
        onClick={() => removeRating(tmdbId)}
        className="p-2 text-type-secondary transition-colors hover:text-white"
      >
        <Icon icon={Icons.X} />
      </button>
    </div>
  );
}

export function MyAlgorithmPage() {
  const { shares, avoided, ratingCount } = useTasteData();
  const ratings = useRatingsStore((s) => s.ratings);
  const completedOnboarding = useRatingsStore(
    (s) => s.preferences.completedOnboarding,
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced search so users can rate titles they've seen elsewhere.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      multiSearch(trimmed)
        .then((items) => {
          if (!cancelled) setResults(items.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const ratedIds = useMemo(
    () =>
      Object.entries(ratings)
        .sort((a, b) => b[1].ratedAt - a[1].ratedAt)
        .map(([id]) => id),
    [ratings],
  );

  const maxShare = shares.length > 0 ? shares[0].share : 0;
  const maxAvoid =
    avoided.length > 0 ? Math.max(...avoided.map((a) => a.strength)) : 0;

  return (
    <SubPageLayout>
      <WideContainer>
        <Heading1>My Algorithm</Heading1>
        <p className="mb-6 text-type-secondary">
          Everything the recommendation algorithm knows about your taste.
          Rate more titles to sharpen your For You section — love and hate
          weigh about twice as much as like and dislike.
        </p>

        <div className="mb-8">
          {wizardOpen ? (
            <CreateAlgorithmWizard onClose={() => setWizardOpen(false)} />
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-white">
                  {completedOnboarding
                    ? "Tune your algorithm"
                    : "Create my algorithm"}
                </p>
                <p className="text-sm text-type-secondary">
                  {completedOnboarding
                    ? "Retake the quick quiz to refresh your genres, moods, and franchises."
                    : "Answer a quick quiz — rate popular movies, pick genres, moods, and franchises — to kick-start your suggestions."}
                </p>
              </div>
              <Button theme="purple" onClick={() => setWizardOpen(true)}>
                {completedOnboarding ? "Retake quiz" : "Get started"}
              </Button>
            </div>
          )}
        </div>

        {ratingCount === 0 ? (
          <div className="mb-10 rounded-xl bg-white/5 p-6 text-center text-type-secondary">
            No ratings yet. Take the quiz above or search below for movies
            or shows you&apos;ve seen and rate them to teach the algorithm
            what you enjoy.
          </div>
        ) : (
          <div className="mb-10 flex flex-col items-center gap-8 md:flex-row md:items-start">
            <TasteDonut shares={shares} ratingCount={ratingCount} />
            <div className="w-full flex-1 space-y-6">
              {shares.length > 0 && (
                <div>
                  <h2 className="mb-3 text-lg font-semibold text-white">
                    What you love
                  </h2>
                  <div className="space-y-2">
                    {shares.map((s) => (
                      <GenreBar
                        key={s.id}
                        label={s.label}
                        value={s.share}
                        max={maxShare}
                        color={s.color}
                      />
                    ))}
                  </div>
                </div>
              )}
              {avoided.length > 0 && (
                <div>
                  <h2 className="mb-3 text-lg font-semibold text-white">
                    What you avoid
                  </h2>
                  <div className="space-y-2">
                    {avoided.map((a) => (
                      <GenreBar
                        key={a.id}
                        label={a.label}
                        value={a.strength}
                        max={maxAvoid}
                        color="#6b7280"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-white">
            Rate something you&apos;ve watched
          </h2>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a movie or show..."
            className="mb-3 w-full rounded-xl bg-white/5 px-4 py-3 text-white placeholder:text-type-secondary focus:outline-none focus:ring-1 focus:ring-white/30"
          />
          {searching && (
            <p className="text-sm text-type-secondary">Searching...</p>
          )}
          <div className="space-y-2">
            {results.map((item) => (
              <RateSearchRow key={`${item.media_type}-${item.id}`} item={item} />
            ))}
          </div>
        </div>

        {ratedIds.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-3 text-lg font-semibold text-white">
              Your ratings
            </h2>
            <div className="space-y-2">
              {ratedIds.map((id) => (
                <RatedItemRow key={id} tmdbId={id} />
              ))}
            </div>
          </div>
        )}
      </WideContainer>
    </SubPageLayout>
  );
}

export default MyAlgorithmPage;
