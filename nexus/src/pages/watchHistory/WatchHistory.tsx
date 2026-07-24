import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/buttons/Button";
import { EditButton } from "@/components/buttons/EditButton";
import { Icon, Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { WideContainer } from "@/components/layout/WideContainer";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Heading1 } from "@/components/utils/Text";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { useProgressStore } from "@/stores/progress";
import { shouldShowProgress } from "@/stores/progress/utils";
import { MediaItem } from "@/utils/media/mediaTypes";

interface WatchHistoryProps {
  onShowDetails?: (media: MediaItem) => void;
}

export function WatchHistory({ onShowDetails }: WatchHistoryProps) {
  const { t } = useTranslation();
  const { t: randomT } = useRandomTranslation();
  const emptyText = randomT(`home.search.empty`);
  const navigate = useNavigate();
  const progressItems = useProgressStore((s) => s.items);
  const removeItem = useProgressStore((s) => s.removeItem);
  const [editing, setEditing] = useState(false);
  const [gridRef] = useAutoAnimate<HTMLDivElement>();
  const { showModal } = useOverlayStack();

  const handleShowDetails = async (media: MediaItem) => {
    if (onShowDetails) {
      onShowDetails(media);
    } else {
      showModal("details", {
        id: Number(media.id),
        type: media.type === "movie" ? "movie" : "show",
      });
    }
  };

  const items = useMemo(() => {
    const output: MediaItem[] = [];
    Object.entries(progressItems)
      .filter((entry) => shouldShowProgress(entry[1]).show)
      .forEach((entry) => {
        output.push({
          id: entry[0],
          ...entry[1],
        });
      });

    output.sort((a, b) => {
      const aItem = progressItems[a.id];
      const bItem = progressItems[b.id];
      return (bItem?.updatedAt ?? 0) - (aItem?.updatedAt ?? 0);
    });

    return output;
  }, [progressItems]);

  if (items.length === 0) {
    return (
      <SubPageLayout>
        <WideContainer>
          <div className="flex flex-col items-center justify-center translate-y-1/2">
            <p className="text-[18.5px] pb-3">{emptyText}</p>
            <Button
              theme="purple"
              onClick={() => navigate("/")}
              className="mt-4"
            >
              {t("notFound.goHome")}
            </Button>
          </div>
        </WideContainer>
      </SubPageLayout>
    );
  }

  return (
    <SubPageLayout>
      <WideContainer>
        <div className="flex items-center justify-between gap-8">
          <Heading1 className="text-2xl font-bold text-white">
            {t("home.watchHistory.sectionTitle")}
          </Heading1>
        </div>

        <div className="flex items-center gap-4 pb-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center text-white hover:text-gray-300 transition-colors"
          >
            <Icon icon={Icons.ARROW_LEFT} className="text-xl" />
            <span className="ml-2">{t("discover.page.back")}</span>
          </button>
        </div>

        <SectionHeading
          title={t("home.watchHistory.recentlyWatched")}
          icon={Icons.CLOCK}
        >
          <div className="flex items-center gap-2">
            <EditButton
              editing={editing}
              onEdit={setEditing}
              id="edit-button-watch-history"
            />
          </div>
        </SectionHeading>

        <MediaGrid ref={gridRef}>
          {items.map((v) => (
            <div
              key={v.id}
              style={{ userSelect: "none" }}
              onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                e.preventDefault()
              }
            >
              <WatchedMediaCard
                media={v}
                closable={editing}
                onClose={() => removeItem(v.id)}
                onShowDetails={handleShowDetails}
              />
            </div>
          ))}
        </MediaGrid>
      </WideContainer>
    </SubPageLayout>
  );
}
