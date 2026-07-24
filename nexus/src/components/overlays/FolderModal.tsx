import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon, Icons } from "@/components/Icon";
import { MediaGrid } from "@/components/media/MediaGrid";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { OverlayPortal } from "@/components/overlays/OverlayDisplay";
import { useBookmarkStore } from "@/stores/bookmarks";
import { parseGroupString } from "@/utils/media/bookmarkModifications";
import { MediaItem } from "@/utils/media/mediaTypes";

export interface FolderModalProps {
  isShown: boolean;
  groupName: string;
  onClose: () => void;
  onShowDetails?: (media: MediaItem) => void;
}

export function FolderModal({
  isShown,
  groupName,
  onClose,
  onShowDetails,
}: FolderModalProps) {
  const { t } = useTranslation();
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const modifyBookmarks = useBookmarkStore((s) => s.modifyBookmarks);
  const [localEditing, setLocalEditing] = useState(false);

  const items = useMemo(() => {
    return Object.entries(bookmarks)
      .filter(([, b]) => b.group?.includes(groupName))
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([itemId, b]) => ({ id: itemId, ...b }) as MediaItem);
  }, [bookmarks, groupName]);

  const { name: displayName } = parseGroupString(groupName || "");

  const handleRemoveFromFolder = (mediaId: string) => {
    modifyBookmarks([mediaId], { removeGroups: [groupName] });
  };

  const handleClose = () => {
    setLocalEditing(false);
    onClose();
  };

  return (
    <OverlayPortal show={isShown} darken close={handleClose}>
      <div className="flex absolute inset-0 items-center justify-center pointer-events-none p-4 sm:p-8">
        <div className="w-full max-w-[56rem] pointer-events-auto">
          <div className="w-full bg-modal-background rounded-xl p-8">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">{displayName}</h2>
                <p className="text-sm text-type-dimmed mt-0.5">
                  {items.length} {t("home.bookmarks.sectionTitle")}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                {/* Edit toggle */}
                <button
                  type="button"
                  title={
                    localEditing
                      ? t("home.mediaList.stopEditing")
                      : t("home.mediaList.editMode")
                  }
                  onClick={() => setLocalEditing((v) => !v)}
                  className={[
                    "h-10 flex items-center gap-2 px-4 rounded-full text-sm font-medium transition-colors",
                    localEditing
                      ? "bg-background-secondaryHover text-white"
                      : "bg-background-secondary text-white hover:bg-background-secondaryHover",
                  ].join(" ")}
                >
                  <Icon icon={localEditing ? Icons.CHECKMARK : Icons.EDIT} />
                  {localEditing
                    ? t("home.mediaList.stopEditing")
                    : t("home.mediaList.editMode")}
                </button>
                {/* Close */}
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-10 w-10 flex items-center justify-center rounded-full bg-background-secondary text-type-secondary hover:text-white hover:bg-background-secondaryHover transition-colors"
                >
                  <Icon icon={Icons.X} />
                </button>
              </div>
            </div>

            {/* Content */}
            {items.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-type-dimmed text-center italic text-sm">
                {t("bookmarks.folders.empty")}
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-y-auto -mx-2 px-2">
                <MediaGrid className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((media) => (
                    <div key={media.id} className="relative">
                      <WatchedMediaCard
                        media={media}
                        onShowDetails={onShowDetails}
                        closable={localEditing}
                        onClose={() => removeBookmark(media.id)}
                        editable={localEditing}
                      />
                      {localEditing && (
                        <button
                          type="button"
                          title={t("bookmarks.folders.removeFromFolder")}
                          onClick={() => handleRemoveFromFolder(media.id)}
                          className="absolute bottom-2 left-2 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white hover:bg-pill-activeBackground transition-colors"
                        >
                          <Icon icon={Icons.ARROW_LEFT} />
                        </button>
                      )}
                    </div>
                  ))}
                </MediaGrid>
              </div>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
