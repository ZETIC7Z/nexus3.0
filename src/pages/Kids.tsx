import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import { Icon, Icons } from "@/components/Icon";
import { MediaCard } from "@/components/media/MediaCard";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { FeaturedCarousel } from "@/pages/discover/components/FeaturedCarousel";
import type { FeaturedMedia } from "@/pages/discover/components/FeaturedCarousel";
import { HomeLayout } from "@/pages/layouts/HomeLayout";
import { get } from "@/backend/metadata/tmdb";
import { MediaItem } from "@/utils/media/mediaTypes";
import {
  kidsSearchForMedia,
  KID_SAFE_GENRES,
} from "@/utils/media/kidsSearch";
import { getCountryName } from "@/utils/locale/countryNames";
import { detectUserRegion } from "@/utils/locale/userRegion";

interface KidsRowConfig {
  id: number;
  title: string;
  type: "movie" | "show";
  shortList: boolean; // numbered Top-10 row
  params: Record<string, string>;
}

// Rows mirror the Conflix kids backend config exactly: every discover query is
// restricted to kid-safe genres with include_adult=false, so NO adult or
// general-audience content can ever appear in kids mode.
const KIDS_MOVIE_ROWS: KidsRowConfig[] = [
  {
    id: 0,
    title: "Top 10 Kids Movies",
    type: "movie",
    shortList: true,
    params: {
      with_genres: "10751,18,16",
      "primary_release_date.gte": "2020-01-01",
      "vote_average.gte": "7.5",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 1,
    title: "Your Next Watch",
    type: "movie",
    shortList: false,
    params: { with_genres: "18,16", sort_by: "popularity.desc" },
  },
  {
    id: 2,
    title: "Fantasy",
    type: "movie",
    shortList: false,
    params: {
      with_genres: "14,16",
      "primary_release_date.gte": "2023-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 3,
    title: "Family Viewing",
    type: "movie",
    shortList: false,
    params: { with_genres: "16,10751", sort_by: "popularity.desc" },
  },
  {
    id: 4,
    title: "Mystery",
    type: "movie",
    shortList: false,
    params: { with_genres: "9648,16,10751", sort_by: "popularity.desc" },
  },
  {
    id: 5,
    title: "Action",
    type: "movie",
    shortList: false,
    params: { with_genres: "28,16,10751", sort_by: "popularity.desc" },
  },
  {
    id: 6,
    title: "Music",
    type: "movie",
    shortList: false,
    params: {
      with_genres: "10402,16",
      "primary_release_date.gte": "2023-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 7,
    title: "Only on Conflix",
    type: "movie",
    shortList: false,
    params: { with_genres: "16,10751", sort_by: "popularity.desc" },
  },
  {
    id: 8,
    title: "Adventures",
    type: "movie",
    shortList: false,
    params: {
      with_genres: "16,12,18",
      "primary_release_date.gte": "2023-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 9,
    title: "Funny",
    type: "movie",
    shortList: false,
    params: { with_genres: "18,16,35", sort_by: "popularity.desc" },
  },
];

const KIDS_TV_ROWS: KidsRowConfig[] = [
  {
    id: 0,
    title: "Top 10 Kids TV",
    type: "show",
    shortList: true,
    params: {
      with_genres: "10762",
      "first_air_date.gte": "2020-01-01",
      "vote_average.gte": "7.5",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 1,
    title: "We Think You'll Love These",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10762,16",
      "first_air_date.gte": "2020-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 2,
    title: "Family Viewing",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10762,10751",
      "first_air_date.gte": "2019-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 3,
    title: "Funny",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10762,35",
      "first_air_date.gte": "2018-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 4,
    title: "Adventure",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10762,10759",
      "first_air_date.gte": "2021-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 5,
    title: "Action",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10759,10762",
      "first_air_date.gte": "2020-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 6,
    title: "Only on Conflix",
    type: "show",
    shortList: false,
    params: {
      with_genres: "18,10762",
      "first_air_date.gte": "2021-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 7,
    title: "Animated",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10762,16",
      "first_air_date.gte": "2024-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 8,
    title: "Today's Top Picks for You",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10762",
      "first_air_date.gte": "2023-01-01",
      "vote_average.gte": "8",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 9,
    title: "Sci-Fi",
    type: "show",
    shortList: false,
    params: {
      with_genres: "10765,10762",
      "first_air_date.gte": "2021-01-01",
      sort_by: "popularity.desc",
    },
  },
  {
    id: 10,
    title: "Mystery",
    type: "show",
    shortList: false,
    params: {
      with_genres: "9648,10762",
      "first_air_date.gte": "2020-01-01",
      sort_by: "popularity.desc",
    },
  },
];

function toMediaItem(item: any, type: "movie" | "show"): MediaItem {
  const date = type === "movie" ? item.release_date : item.first_air_date;
  return {
    id: String(item.id),
    title: item.title || item.name || "",
    poster: item.poster_path
      ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
      : "/placeholder.png",
    type,
    year: date ? Number.parseInt(date.slice(0, 4), 10) : undefined,
  };
}

const COUNTRY_CACHE_KEY = "nexus-country-code";

async function detectCountry(): Promise<string> {
  try {
    const cached = localStorage.getItem(COUNTRY_CACHE_KEY);
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  try {
    const response = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = (await response.json()) as { country_code?: string };
      const country = data.country_code?.toUpperCase();
      if (country && country.length === 2) {
        localStorage.setItem(COUNTRY_CACHE_KEY, country);
        return country;
      }
    }
  } catch {
    /* fall back below */
  }
  return detectUserRegion();
}

function decodeQuery(query: string | undefined): string {
  if (!query) return "";
  try {
    return decodeURIComponent(query);
  } catch {
    return "";
  }
}

export function KidsPage() {
  const { t } = useTranslation();
  const { query: urlQuery } = useParams<{ query?: string }>();
  const { showModal } = useOverlayStack();
  const [country, setCountry] = useState<string>(detectUserRegion());
  const [searchQuery, setSearchQuery] = useState<string>(decodeQuery(urlQuery));
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [rows, setRows] = useState<Array<{ config: KidsRowConfig; items: MediaItem[] }>>(
    [],
  );
  const [loading, setLoading] = useState(true);

  // Fetch the region + all kid-safe rows (Conflix config). Batched so we never
  // fire more than ~12 concurrent TMDB requests at once.
  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      const region = await detectCountry();
      if (cancelled) return;
      setCountry(region);

      const fetched: Array<{ config: KidsRowConfig; items: MediaItem[] }> = [];

      const movieBatch = await Promise.allSettled(
        KIDS_MOVIE_ROWS.map((config) =>
          get<any>("/discover/movie", {
            ...config.params,
            include_adult: "false",
            language: "en-US",
            page: "1",
          }),
        ),
      );
      if (cancelled) return;
      movieBatch.forEach((res, index) => {
        const config = KIDS_MOVIE_ROWS[index];
        if (res.status === "fulfilled" && Array.isArray(res.value.results)) {
          fetched.push({
            config,
            items: res.value.results
              .filter((r: any) => r.genre_ids?.some((g: number) => KID_SAFE_GENRES.has(g)))
              .slice(0, config.shortList ? 10 : 18)
              .map((r: any) => toMediaItem(r, "movie")),
          });
        }
      });

      const tvBatch = await Promise.allSettled(
        KIDS_TV_ROWS.map((config) =>
          get<any>("/discover/tv", {
            ...config.params,
            include_adult: "false",
            language: "en-US",
            page: "1",
          }),
        ),
      );
      if (cancelled) return;
      tvBatch.forEach((res, index) => {
        const config = KIDS_TV_ROWS[index];
        if (res.status === "fulfilled" && Array.isArray(res.value.results)) {
          fetched.push({
            config,
            items: res.value.results
              .filter((r: any) => r.genre_ids?.some((g: number) => KID_SAFE_GENRES.has(g)))
              .slice(0, config.shortList ? 10 : 18)
              .map((r: any) => toMediaItem(r, "show")),
          });
        }
      });

      if (!cancelled) {
        setRows(fetched.filter((row) => row.items.length > 0));
        setLoading(false);
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  // Search comes from the URL (/kids/:query) — same pattern as the main
  // profile. Results are verified against kid-safe genres. Debounced so fast
  // typing doesn't fire a TMDB request per keystroke (same as the homepage).
  useEffect(() => {
    const query = decodeQuery(urlQuery);
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      kidsSearchForMedia(query.trim()).then((results) => {
        if (!cancelled) setSearchResults(results);
      }).catch((error) => {
        console.error("Kids search failed:", error);
        if (!cancelled) setSearchResults([]);
      }).finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [urlQuery]);

  const handleDetails = (media: MediaItem) => {
    showModal("details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  };

  const handleFeaturedDetails = (media: FeaturedMedia) => {
    showModal("details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  };

  const posterWidth = 8.5; // rem
  const numberHeight = 10; // rem

  const renderRow = (row: { config: KidsRowConfig; items: MediaItem[] }) => {
    if (row.items.length === 0) return null;
    const isTop10 = row.config.shortList;

    if (isTop10) {
      return (
        <section key={`${row.config.type}-${row.config.id}`} className="mb-10">
          <div className="mb-3 flex items-center gap-2 px-4 md:px-10">
            <Icon icon={Icons.GLOBE} className="text-base text-type-link" />
            <h2 className="text-xl font-bold text-white md:text-2xl">
              {row.config.title === "Top 10 Kids Movies" ||
              row.config.title === "Top 10 Kids TV"
                ? `${row.config.title} in ${getCountryName(country)} Today`
                : row.config.title}
            </h2>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none md:px-10">
            {row.items.map((item, index) => (
              <button
                type="button"
                key={`${row.config.type}-${item.id}`}
                onClick={() => handleDetails(item)}
                className="group relative flex-none overflow-hidden text-left"
                style={{ width: `${posterWidth}rem`, height: `${numberHeight}rem` }}
                aria-label={`${index + 1}: ${item.title}`}
              >
                <span
                  className="pointer-events-none absolute left-0 top-[8%] h-[84%] w-[68%] select-none bg-contain bg-left bg-no-repeat transition-transform duration-200 group-hover:scale-105"
                  style={{
                    backgroundImage: `url('${import.meta.env.BASE_URL}images/svgNum/num_${index + 1}.svg')`,
                  }}
                />
                <span className="absolute right-0 top-1/2 block h-[92%] w-[62%] -translate-y-1/2 overflow-hidden rounded-[4px] shadow-xl transition-transform duration-200 group-hover:scale-[1.04]">
                  <img
                    src={item.poster}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  <span className="absolute bottom-1 left-1.5 right-1.5 line-clamp-1 text-xs font-semibold text-white opacity-0 drop-shadow transition-opacity duration-200 group-hover:opacity-100">
                    {item.title}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section key={`${row.config.type}-${row.config.id}`} className="mb-10">
        <h2 className="mb-3 px-4 text-xl font-bold text-white md:px-10 md:text-2xl">
          {row.config.title}
        </h2>
        <div className="flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-none md:px-10">
          {row.items.map((item) => (
            <div key={`${row.config.type}-${item.id}`} className="w-36 flex-none sm:w-40">
              <MediaCard media={item} linkable onShowDetails={handleDetails} />
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <HomeLayout showBg={false}>
      <Helmet>
        <title>NEXUS Kids</title>
      </Helmet>

      {/* Trailer hero — kid-safe via OR (Animation | Family | Kids) — comma
          means AND in TMDB which returns almost nothing for 10762+16 */}
      <FeaturedCarousel
        onShowDetails={handleFeaturedDetails}
        shorter
        forcedCategory="movies"
        withGenres="16|10751|10762"
        includeAdult="false"
      />

      {/* Content area */}
      <div className="mt-8">
        {searchQuery.trim() ? (
          <div className="px-4 md:px-10">
            <h2 className="text-white text-xl font-bold mb-4">
              {t("kids.searchResults") || "Search Results"}
            </h2>
            {isSearching ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {searchResults.map((media) => (
                  <MediaCard
                    key={`${media.type}-${media.id}`}
                    media={media}
                    linkable
                    onShowDetails={handleDetails}
                  />
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm py-16 text-center">
                No kids content found for that search. Try something else!
              </p>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
              <p className="text-white/40 text-sm">
                {t("kids.loading") || "Finding great stuff for you..."}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {rows.map((row) => renderRow(row))}
            {rows.length === 0 && (
              <p className="text-white/50 text-sm py-16 text-center">
                Nothing here yet — check back soon!
              </p>
            )}
          </div>
        )}
      </div>
    </HomeLayout>
  );
}
