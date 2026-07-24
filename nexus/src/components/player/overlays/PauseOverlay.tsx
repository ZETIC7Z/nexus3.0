import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getEpisodeDetails,
  getMediaDetails,
  getMediaLogo,
} from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { useShouldShowControls } from "@/components/player/hooks/useShouldShowControls";
import { useIsMobile } from "@/hooks/useIsMobile";
import { playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";

interface PauseDetails {
  voteAverage: number | null;
  genres: string[];
  runtime: number | null;
}

export function PauseOverlay() {
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  const status = usePlayerStore((s) => s.status);
  const meta = usePlayerStore((s) => s.meta);
  const { duration } = usePlayerStore((s) => s.progress);
  const enablePauseOverlay = usePreferencesStore((s) => s.enablePauseOverlay);
  const enableImageLogos = usePreferencesStore((s) => s.enableImageLogos);
  const { isMobile } = useIsMobile();
  const { showTargets } = useShouldShowControls();
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [details, setDetails] = useState<PauseDetails>({
    voteAverage: null,
    genres: [],
    runtime: null,
  });

  const hasPlayedRef = useRef(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPaused && status === playerStatus.PLAYING) {
      hasPlayedRef.current = true;
    }
  }, [isPaused, status]);

  useEffect(() => {
    if (isPaused && hasPlayedRef.current && status === playerStatus.PLAYING) {
      timerRef.current = setTimeout(() => {
        setOverlayVisible(true);
      }, 2000);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setOverlayVisible(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPaused, status]);

  let shouldShow = overlayVisible && enablePauseOverlay;
  if (isMobile && status === playerStatus.SCRAPING) shouldShow = false;
  if (isMobile && showTargets) shouldShow = false;

  useEffect(() => {
    let mounted = true;
    const fetchLogo = async () => {
      if (!meta?.tmdbId || !enableImageLogos) {
        setLogoUrl(null);
        return;
      }
      try {
        const type =
          meta.type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;
        const url = await getMediaLogo(meta.tmdbId, type);
        if (mounted) setLogoUrl(url || null);
      } catch {
        if (mounted) setLogoUrl(null);
      }
    };
    fetchLogo();
    return () => {
      mounted = false;
    };
  }, [meta?.tmdbId, meta?.type, enableImageLogos]);

  useEffect(() => {
    let mounted = true;
    const fetchDetails = async () => {
      if (!meta?.tmdbId) {
        setDetails({ voteAverage: null, genres: [], runtime: null });
        return;
      }
      try {
        const type =
          meta.type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;

        const isShowWithEpisode =
          meta.type === "show" && meta.season && meta.episode;
        let voteAverage: number | null = null;

        if (isShowWithEpisode) {
          const episodeData = await getEpisodeDetails(
            meta.tmdbId,
            meta.season?.number ?? 0,
            meta.episode?.number ?? 0,
          );
          if (mounted && episodeData?.vote_average != null) {
            voteAverage = episodeData.vote_average;
          }
        }

        const data = await getMediaDetails(meta.tmdbId, type, false);
        if (mounted && data) {
          const genres = (data.genres ?? []).map(
            (g: { name: string }) => g.name,
          );
          const finalVoteAverage = isShowWithEpisode
            ? voteAverage
            : typeof data.vote_average === "number"
              ? data.vote_average
              : null;

          let runtime: number | null = null;
          if (isShowWithEpisode) {
            const epData = await getEpisodeDetails(
              meta.tmdbId,
              meta.season?.number ?? 0,
              meta.episode?.number ?? 0,
            );
            runtime = (epData as any)?.runtime ?? null;
          } else {
            runtime = (data as any)?.runtime ?? null;
          }

          setDetails({ voteAverage: finalVoteAverage, genres, runtime });
        }
      } catch {
        if (mounted)
          setDetails({ voteAverage: null, genres: [], runtime: null });
      }
    };

    fetchDetails();
    return () => {
      mounted = false;
    };
  }, [meta?.tmdbId, meta?.type, meta?.season, meta?.episode]);

  if (!meta) return null;

  const overview =
    meta.type === "show" ? meta.episode?.overview : meta.overview;

  const formatRuntime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const stagger = () =>
    `transition-[transform,opacity] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
      shouldShow ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
    }`;

  const staggerStyle = (i: number) => ({
    transitionDelay: shouldShow ? `${i * 80}ms` : "0ms",
  });

  return (
    <div
      className={`absolute inset-0 z-[60] flex flex-col justify-between transition-opacity duration-700 pointer-events-none ${
        shouldShow ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/20" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 70%, transparent 30%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <div className="relative flex-1 flex items-end pb-32 md:pb-44">
        <div className="ml-10 md:ml-20 lg:ml-32 max-w-xl lg:max-w-2xl">
          <div
            className={`flex items-center gap-3 mb-5 ${stagger()}`}
            style={staggerStyle(0)}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-300" />
            </span>
            <span className="text-[11px] font-semibold tracking-[0.3em] uppercase text-white/80">
              {t("player.pauseOverlay.youAreWatching", "Now Playing")}
            </span>
          </div>

          <div
            className={`mb-4 ${stagger()}`}
            style={staggerStyle(1)}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={meta.title}
                className="max-h-36 lg:max-h-40 object-contain object-left drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
              />
            ) : (
              <h1 className="text-5xl lg:text-7xl font-bold text-white leading-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)] [text-wrap:balance]">
                {meta.title}
              </h1>
            )}
          </div>

          {meta.type === "show" && meta.season && meta.episode && (
            <div
              className={`flex flex-wrap items-center gap-2 mb-3 ${stagger()}`}
              style={staggerStyle(2)}
            >
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase text-purple-100 bg-purple-500/20 ring-1 ring-purple-400/30 backdrop-blur-sm">
                S{meta.season.number} Â· E{meta.episode.number}
              </span>
            </div>
          )}

          {meta.type === "show" && meta.episode?.title && (
            <h2
              className={`mb-4 text-2xl lg:text-3xl font-semibold text-white/95 drop-shadow-md [text-wrap:balance] ${stagger()}`}
              style={staggerStyle(3)}
            >
              {meta.episode.title}
            </h2>
          )}

          {overview && (
            <p
              className={`text-[15px] lg:text-base text-white/70 leading-relaxed line-clamp-3 mb-5 max-w-xl drop-shadow-md ${stagger()}`}
              style={staggerStyle(4)}
            >
              {overview}
            </p>
          )}

          <div
            className={`flex flex-wrap items-center gap-2 ${stagger()}`}
            style={staggerStyle(5)}
          >
            {details.voteAverage !== null && details.voteAverage > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium text-white/90 bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-amber-300"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>{details.voteAverage.toFixed(1)}</span>
              </span>
            )}
            {(details.runtime ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium text-white/90 bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white/70"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                </svg>
                <span>{formatRuntime(details.runtime ?? 0)}</span>
              </span>
            )}
            {duration > 0 && !details.runtime && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium text-white/90 bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white/70"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                </svg>
                <span>{formatRuntime(Math.round(duration / 60))}</span>
              </span>
            )}
            {details.genres.slice(0, 2).map((g) => (
              <span
                key={g}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium text-white/85 bg-white/5 ring-1 ring-white/10 backdrop-blur-sm"
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`absolute bottom-24 right-8 md:right-14 flex flex-col items-end gap-2 ${stagger()}`}
        style={staggerStyle(6)}
      >
        <div className="flex items-center gap-3">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-white/60"
          >
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
          <span className="text-2xl md:text-3xl font-light tracking-[0.35em] uppercase text-white/70">
            {t("player.pauseOverlay.paused", "Paused")}
          </span>
        </div>
        <div className="h-[1.5px] w-32 rounded-full bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
      </div>
    </div>
  );
}

