import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { get } from "@/backend/metadata/tmdb";
import { Icon, Icons } from "@/components/Icon";
import { MediaItem } from "@/utils/media/mediaTypes";
import { getCountryName } from "@/utils/locale/countryNames";
import { detectUserRegion } from "@/utils/locale/userRegion";

interface CountryPicksCarouselProps {
  onShowDetails: (media: MediaItem) => void;
}

interface CountryResponse {
  country_code?: string;
}

const COUNTRY_CACHE_KEY = "nexus-country-code";

async function detectCountry(): Promise<string> {
  try {
    const cached = localStorage.getItem(COUNTRY_CACHE_KEY);
    if (cached) return cached;
  } catch {
    // Private browsing/storage restrictions are harmless here.
  }

  // Try api.country.is first — fast, no key needed, returns { country: "US" }
  try {
    const res = await fetch("https://api.country.is/", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as { country?: string };
      const country = data.country?.toUpperCase();
      if (country && country.length === 2) {
        localStorage.setItem(COUNTRY_CACHE_KEY, country);
        return country;
      }
    }
  } catch {
    // Fall back to ipapi.co
  }

  try {
    const response = await fetch("https://ipapi.co/json/", {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const data = (await response.json()) as CountryResponse;
      const country = data.country_code?.toUpperCase();
      if (country && country.length === 2) {
        localStorage.setItem(COUNTRY_CACHE_KEY, country);
        return country;
      }
    }
  } catch {
    // Fall back to the existing locale/time-zone detector.
  }

  return detectUserRegion();
}

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

/**
 * Conflix-style numbered Top-10 row: the giant rank number is rendered as an
 * SVG behind the poster, with the poster overlapping its right edge — exactly
 * like Conflix's ranked country rows. The number and poster share one tile so
 * there is no blank space around them.
 */
export function CountryPicksCarousel({
  onShowDetails,
}: CountryPicksCarouselProps) {
  const { t } = useTranslation();
  const [country, setCountry] = useState<string>(detectUserRegion());
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const detected = await detectCountry();
      if (cancelled) return;
      setCountry(detected);

      try {
        const [movies, shows] = await Promise.all([
          get<any>("/discover/movie", {
            region: detected,
            sort_by: "popularity.desc",
            "vote_count.gte": 25,
            page: "1",
          }),
          get<any>("/discover/tv", {
            region: detected,
            sort_by: "popularity.desc",
            "vote_count.gte": 25,
            page: "1",
          }),
        ]);

        if (!cancelled) {
          const movieItems = (movies.results || [])
            .slice(0, 5)
            .map((item: any) => toMediaItem(item, "movie"));
          const showItems = (shows.results || [])
            .slice(0, 5)
            .map((item: any) => toMediaItem(item, "show"));
          setItems([...movieItems, ...showItems]);
        }
      } catch (error) {
        console.warn("Country picks unavailable:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && items.length === 0) return null;

  const countryName = getCountryName(country);
  const posterWidth = 8.5; // rem
  const numberHeight = 10; // rem — slightly taller than the poster so the
  // digit's overhang reads as Conflix does, with no gap at the bottom.

  return (
    <section className="mb-10" aria-label={`Top 10 in ${countryName}`}>
      <div className="mb-4 flex items-center gap-2 px-4 md:px-10">
        <Icon icon={Icons.GLOBE} className="text-base text-type-link" />
        <h2 className="text-xl font-bold text-white md:text-2xl">
          {t("discover.carousel.title.countryPicks", {
            country: countryName,
            defaultValue: `Top 10 in ${countryName}`,
          })}
        </h2>
      </div>
      <div className="flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none md:px-10">
        {loading
          ? Array.from({ length: 10 }, (_, index) => (
              <div
                key={index}
                className="relative flex-none overflow-hidden"
                style={{ width: `${posterWidth}rem`, height: `${numberHeight}rem` }}
              >
                <div className="absolute right-0 top-1/2 h-[92%] w-[62%] -translate-y-1/2 animate-pulse rounded-[4px] bg-white/10" />
              </div>
            ))
          : items.map((item, index) => (
              <button
                type="button"
                key={`${item.type}-${item.id}`}
                onClick={() => onShowDetails(item)}
                className="group relative flex-none overflow-hidden text-left"
                style={{ width: `${posterWidth}rem`, height: `${numberHeight}rem` }}
                aria-label={`${index + 1}: ${item.title}`}
              >
                {/* Giant rank number (Conflix SVG), tucked behind the poster */}
                <span
                  className="pointer-events-none absolute left-0 top-[8%] h-[84%] w-[68%] select-none bg-contain bg-left bg-no-repeat transition-transform duration-200 group-hover:scale-105"
                  style={{
                    backgroundImage: `url('${import.meta.env.BASE_URL}images/svgNum/num_${index + 1}.svg')`,
                  }}
                />
                {/* Poster overlapping the number's right edge */}
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
