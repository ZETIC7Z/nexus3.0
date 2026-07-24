import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";

import { getMediaPoster, getPopularMovies } from "@/backend/metadata/tmdb";
import type { TMDBMovieSearchResult } from "@/backend/metadata/types/tmdb";
import { Button } from "@/components/buttons/Button";
import {
  FRANCHISES,
  GENRE_LABELS,
  MOODS,
} from "@/pages/discover/lib/personalRecommendations";
import { MediaRating, useRatingsStore } from "@/stores/ratings";

const RATE_CHOICES: Array<{ label: string; rating: MediaRating | null }> = [
  { label: "Loved it!", rating: "loved" },
  { label: "Liked it", rating: "liked" },
  { label: "Meh, it was okay", rating: "okay" },
  { label: "Didn't like it", rating: "disliked" },
  { label: "I haven't watched it", rating: null },
];

// Genres offered in the picker (movie-canonical ids with broad appeal).
const PICKABLE_GENRES = [
  28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 53,
  10752, 37,
];

type WizardStep = "movies" | "genres" | "moods" | "franchises" | "done";

function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: Array<{ id: string; label: string }>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onToggle(opt.id)}
          className={classNames(
            "rounded-full px-4 py-2 text-sm transition-colors",
            selected.has(opt.id)
              ? "bg-video-context-type-accent/30 text-white ring-1 ring-white/40"
              : "bg-white/5 text-white/80 hover:bg-white/10",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function CreateAlgorithmWizard({ onClose }: { onClose: () => void }) {
  const toggleRating = useRatingsStore((s) => s.toggleRating);
  const getRating = useRatingsStore((s) => s.getRating);
  const preferences = useRatingsStore((s) => s.preferences);
  const setPreferences = useRatingsStore((s) => s.setPreferences);

  const [step, setStep] = useState<WizardStep>("movies");
  const [movies, setMovies] = useState<TMDBMovieSearchResult[]>([]);
  const [movieIndex, setMovieIndex] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const [genres, setGenres] = useState<Set<string>>(
    () => new Set(preferences.favoriteGenres.map(String)),
  );
  const [moods, setMoods] = useState<Set<string>>(
    () => new Set(preferences.moods),
  );
  const [franchises, setFranchises] = useState<Set<string>>(
    () => new Set(preferences.franchises),
  );

  useEffect(() => {
    let cancelled = false;
    getPopularMovies(15)
      .then((items) => {
        if (cancelled) return;
        // Skip anything the user already rated.
        setMovies(items.filter((m) => !getRating(String(m.id))));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMovie = movies[movieIndex];

  const rateCurrent = (rating: MediaRating | null) => {
    if (currentMovie && rating) {
      toggleRating(
        {
          tmdbId: String(currentMovie.id),
          title: currentMovie.title,
          type: "movie",
          year: currentMovie.release_date
            ? new Date(currentMovie.release_date).getFullYear()
            : undefined,
          poster: currentMovie.poster_path
            ? getMediaPoster(currentMovie.poster_path)
            : undefined,
          genreIds: currentMovie.genre_ids,
        },
        rating,
      );
    }
    if (movieIndex + 1 >= movies.length) setStep("genres");
    else setMovieIndex(movieIndex + 1);
  };

  const toggleIn =
    (set: Set<string>, apply: (next: Set<string>) => void) => (id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      apply(next);
    };

  const finish = () => {
    setPreferences({
      favoriteGenres: Array.from(genres).map(Number),
      moods: Array.from(moods),
      franchises: Array.from(franchises),
      completedOnboarding: true,
    });
    setStep("done");
  };

  const genreOptions = useMemo(
    () =>
      PICKABLE_GENRES.map((id) => ({
        id: String(id),
        label: GENRE_LABELS[id] ?? `Genre ${id}`,
      })),
    [],
  );

  return (
    <div className="rounded-xl bg-white/5 p-6">
      {step === "movies" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            Have you seen these?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Rate the ones you&apos;ve watched — skip the rest. The more you
            rate, the better your suggestions get.
          </p>
          {loadError && (
            <p className="mb-4 text-sm text-type-secondary">
              Couldn&apos;t load popular movies. You can skip this step.
            </p>
          )}
          {currentMovie ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {currentMovie.poster_path ? (
                <img
                  src={getMediaPoster(currentMovie.poster_path)}
                  alt=""
                  className="w-36 shrink-0 rounded-lg"
                />
              ) : (
                <div className="h-52 w-36 shrink-0 rounded-lg bg-white/10" />
              )}
              <div className="w-full flex-1">
                <p className="mb-1 text-xs text-type-secondary">
                  {movieIndex + 1} / {movies.length}
                </p>
                <p className="mb-3 text-xl font-semibold text-white">
                  {currentMovie.title}
                  {currentMovie.release_date
                    ? ` (${new Date(currentMovie.release_date).getFullYear()})`
                    : ""}
                </p>
                <div className="flex flex-col gap-2">
                  {RATE_CHOICES.map((choice) => (
                    <button
                      key={choice.label}
                      type="button"
                      onClick={() => rateCurrent(choice.rating)}
                      className="rounded-lg bg-white/5 px-4 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/15"
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            !loadError && (
              <p className="text-sm text-type-secondary">Loading movies...</p>
            )
          )}
          <div className="mt-4 flex justify-end">
            <Button theme="secondary" onClick={() => setStep("genres")}>
              Skip this step
            </Button>
          </div>
        </div>
      )}

      {step === "genres" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            Which genres do you enjoy?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Pick as many as you like.
          </p>
          <ChipGrid
            options={genreOptions}
            selected={genres}
            onToggle={toggleIn(genres, setGenres)}
          />
          <div className="mt-6 flex justify-between">
            <Button theme="secondary" onClick={() => setStep("movies")}>
              Back
            </Button>
            <Button theme="purple" onClick={() => setStep("moods")}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "moods" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            What are you usually in the mood for?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Pick as many as you like.
          </p>
          <ChipGrid
            options={MOODS.map((m) => ({ id: m.id, label: m.label }))}
            selected={moods}
            onToggle={toggleIn(moods, setMoods)}
          />
          <div className="mt-6 flex justify-between">
            <Button theme="secondary" onClick={() => setStep("genres")}>
              Back
            </Button>
            <Button theme="purple" onClick={() => setStep("franchises")}>
              Next
            </Button>
          </div>
        </div>
      )}

      {step === "franchises" && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-white">
            Any favorite franchises?
          </h2>
          <p className="mb-4 text-sm text-type-secondary">
            Their movies and shows will get a head start in your
            suggestions.
          </p>
          <ChipGrid
            options={FRANCHISES.map((f) => ({ id: f.id, label: f.label }))}
            selected={franchises}
            onToggle={toggleIn(franchises, setFranchises)}
          />
          <div className="mt-6 flex justify-between">
            <Button theme="secondary" onClick={() => setStep("moods")}>
              Back
            </Button>
            <Button theme="purple" onClick={finish}>
              Finish
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center">
          <h2 className="mb-2 text-lg font-semibold text-white">
            Your algorithm is ready!
          </h2>
          <p className="mb-6 text-sm text-type-secondary">
            Your For You section now reflects your taste. Keep rating what
            you watch — every rating sharpens the suggestions.
          </p>
          <Button theme="purple" onClick={onClose}>
            See my taste profile
          </Button>
        </div>
      )}
    </div>
  );
}
