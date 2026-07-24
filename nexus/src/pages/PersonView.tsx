import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import {
  getPersonCombinedCredits,
  getPersonDetails,
  getPersonProfileImage,
} from "@/backend/metadata/tmdb";
import {
  TMDBPerson,
  TMDBPersonCombinedCredits,
  TMDBPersonCreditItem,
} from "@/backend/metadata/types/tmdb";
import { Icon, Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { WideContainer } from "@/components/layout/WideContainer";
import { MediaGrid } from "@/components/media/MediaGrid";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { Heading1 } from "@/components/utils/Text";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { MediaItem } from "@/utils/media/mediaTypes";

function creditYear(c: TMDBPersonCreditItem): number | undefined {
  const date = c.release_date || c.first_air_date;
  if (!date) return undefined;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : undefined;
}

function dedupeAndSort(credits: TMDBPersonCreditItem[]): TMDBPersonCreditItem[] {
  const byId = new Map<string, TMDBPersonCreditItem>();
  for (const c of credits) {
    if (!c.poster_path) continue;
    const key = `${c.media_type}-${c.id}`;
    const existing = byId.get(key);
    if (!existing || (c.popularity ?? 0) > (existing.popularity ?? 0)) {
      byId.set(key, c);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const ya = creditYear(a) ?? 0;
    const yb = creditYear(b) ?? 0;
    if (yb !== ya) return yb - ya;
    return (b.popularity ?? 0) - (a.popularity ?? 0);
  });
}

function creditToMediaItem(c: TMDBPersonCreditItem): MediaItem {
  const year = creditYear(c);
  return {
    id: String(c.id),
    title: (c.title || c.name || c.original_title || c.original_name) ?? "",
    year,
    release_date: year ? new Date(year, 0, 1) : undefined,
    poster: c.poster_path
      ? `https://image.tmdb.org/t/p/w342${c.poster_path}`
      : undefined,
    type: c.media_type === "tv" ? "show" : "movie",
  };
}

export function PersonView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showModal } = useOverlayStack();
  const [person, setPerson] = useState<TMDBPerson | null>(null);
  const [credits, setCredits] = useState<TMDBPersonCombinedCredits | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPersonDetails(id),
      getPersonCombinedCredits(id),
    ])
      .then(([p, c]) => {
        if (cancelled) return;
        setPerson(p);
        setCredits(c);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const acting = useMemo(() => {
    if (!credits) return [] as TMDBPersonCreditItem[];
    return dedupeAndSort(credits.cast);
  }, [credits]);

  const directing = useMemo(() => {
    if (!credits) return [] as TMDBPersonCreditItem[];
    return dedupeAndSort(
      credits.crew.filter((c) => c.job === "Director"),
    );
  }, [credits]);

  const handleShowDetails = (media: MediaItem) => {
    showModal("details", {
      id: Number(media.id),
      type: media.type === "movie" ? "movie" : "show",
    });
  };

  if (loading) {
    return (
      <SubPageLayout>
        <WideContainer>
          <div className="flex h-64 items-center justify-center">
            <Icon icon={Icons.RISING_STAR} className="text-3xl animate-pulse text-type-link" />
          </div>
        </WideContainer>
      </SubPageLayout>
    );
  }

  if (error || !person) {
    return (
      <SubPageLayout>
        <WideContainer>
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <p className="text-type-text">{t("notFound.notFound")}</p>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
            >
              {t("discover.page.back")}
            </button>
          </div>
        </WideContainer>
      </SubPageLayout>
    );
  }

  const profile = getPersonProfileImage(person.profile_path);

  return (
    <SubPageLayout>
      <WideContainer>
        <div className="flex items-center gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center text-white hover:text-gray-300 transition-colors"
          >
            <Icon icon={Icons.ARROW_LEFT} className="text-xl" />
            <span className="ml-2">{t("discover.page.back")}</span>
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 pb-10">
          {profile ? (
            <img
              src={profile}
              alt={person.name}
              className="w-40 h-40 md:w-48 md:h-48 rounded-full object-cover ring-1 ring-white/10 shadow-lg shrink-0 mx-auto md:mx-0"
            />
          ) : (
            <div className="w-40 h-40 md:w-48 md:h-48 rounded-full bg-white/5 ring-1 ring-white/10 shrink-0 mx-auto md:mx-0" />
          )}
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <Heading1 className="text-3xl md:text-4xl font-bold text-white !mb-0">
              {person.name}
            </Heading1>
            {person.known_for_department && (
              <span className="text-sm text-type-secondary uppercase tracking-wider">
                {person.known_for_department}
              </span>
            )}
            {(person.birthday || person.place_of_birth) && (
              <p className="text-sm text-type-text">
                {person.birthday ? new Date(person.birthday).getFullYear() : ""}
                {person.birthday && person.place_of_birth ? " · " : ""}
                {person.place_of_birth ?? ""}
                {person.deathday ? ` – ${new Date(person.deathday).getFullYear()}` : ""}
              </p>
            )}
            {person.biography && (
              <p className="text-sm text-type-text leading-relaxed mt-2 line-clamp-6">
                {person.biography}
              </p>
            )}
          </div>
        </div>

        {acting.length > 0 && (
          <div className="mb-10">
            <SectionHeading
              title={t("details.cast", { defaultValue: "Cast" })}
              icon={Icons.RISING_STAR}
            />
            <MediaGrid>
              {acting.map((c) => (
                <WatchedMediaCard
                  key={`cast-${c.media_type}-${c.id}`}
                  media={creditToMediaItem(c)}
                  onShowDetails={handleShowDetails}
                />
              ))}
            </MediaGrid>
          </div>
        )}

        {directing.length > 0 && (
          <div className="mb-10">
            <SectionHeading
              title={t("details.director", { defaultValue: "Director" })}
              icon={Icons.RISING_STAR}
            />
            <MediaGrid>
              {directing.map((c) => (
                <WatchedMediaCard
                  key={`crew-${c.media_type}-${c.id}`}
                  media={creditToMediaItem(c)}
                  onShowDetails={handleShowDetails}
                />
              ))}
            </MediaGrid>
          </div>
        )}

        {acting.length === 0 && directing.length === 0 && (
          <div className="py-12 text-center text-type-secondary">
            {t("notFound.notFound")}
          </div>
        )}
      </WideContainer>
    </SubPageLayout>
  );
}
