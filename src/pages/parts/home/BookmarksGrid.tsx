import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Popover, Transition } from "@headlessui/react";
import { useEffect, useMemo, useState, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getMediaDetails } from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { Icon, Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { Flare } from "@/components/utils/Flare";
import { FolderCard } from "@/components/media/FolderCard";
import { MediaGrid } from "@/components/media/MediaGrid";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { EditBookmarkModal } from "@/components/overlays/EditBookmarkModal";
import { EditGroupModal } from "@/components/overlays/EditGroupModal";
import { FolderModal } from "@/components/overlays/FolderModal";
import { useModal } from "@/components/overlays/Modal";
import { useBookmarkStore } from "@/stores/bookmarks";
import { useGroupOrderStore } from "@/stores/groupOrder";
import { usePreferencesStore } from "@/stores/preferences";
import { useProgressStore } from "@/stores/progress";
import { useMediaGridColumns } from "@/hooks/useMediaGridColumns";
import { parseGroupString } from "@/utils/media/bookmarkModifications";
import { SortOption } from "@/utils/media/mediaSorting";
import { MediaItem } from "@/utils/media/mediaTypes";

import { getList, sortMedia } from "./utils";
import { OptionItem } from "@/components/form/Dropdown";

export function MoreCard({ link, className }: { link: string; className?: string }) {
  const { t } = useTranslation();

  return (
    <div className={className ?? "relative mt-4 group cursor-pointer user-select-none rounded-xl p-2 bg-transparent transition-colors duration-300 w-[10rem] md:w-[11.5rem] h-auto"}>
      <Link to={link} className="block">
        <Flare.Base className="group -m-[0.705em] hover:scale-95 transition-all rounded-xl bg-background-main duration-300 hover:bg-mediaCard-hoverBackground tabbable">
          <Flare.Light
            flareSize={300}
            cssColorVar="--colors-mediaCard-hoverAccent"
            backgroundClass="bg-mediaCard-hoverBackground duration-100"
            className="rounded-xl bg-background-main group-hover:opacity-100"
          />
          <Flare.Child className="pointer-events-auto relative mb-2 p-[0.4em] transition-transform duration-300">
            <div className="relative pb-[150%] w-full flex items-center justify-center">
              <div className="flex absolute inset-0 flex-col items-center justify-center">
                <Icon
                  icon={Icons.ARROW_RIGHT}
                  className="text-4xl mb-2 transition-transform duration-300"
                />
                <span className="text-sm text-center px-2">
                  {t("discover.carousel.more")}
                </span>
              </div>
            </div>
          </Flare.Child>
        </Flare.Base>
      </Link>
    </div>
  );
}

export function BookmarksGrid({
  onItemsChange,
  onShowDetails,
}: {
  onItemsChange: (hasItems: boolean) => void;
  onShowDetails?: (media: MediaItem) => void;
}) {
  const { t } = useTranslation();
  const progressItems = useProgressStore((s) => s.items);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const groupOrder = useGroupOrderStore((s) => s.groupOrder);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const [editing, setEditing] = useState(() => {
    return localStorage.getItem("__MW::bookmarksEditing") === "true";
  });
  
  useEffect(() => {
    localStorage.setItem("__MW::bookmarksEditing", editing.toString());
  }, [editing]);

  const bookmarkRowsToShow = usePreferencesStore((s) => s.bookmarkRowsToShow);
  const setBookmarkRowsToShow = usePreferencesStore((s) => s.setBookmarkRowsToShow);
  const columns = useMediaGridColumns();
  const [gridRef, enableAnimations] = useAutoAnimate<HTMLDivElement>();

  // Only enable animations for a short window after changing row counts
  // to keep transitions smooth but prevent scrolling bugs when bookmarking out of view.
  useEffect(() => {
    if (editing) {
      enableAnimations(true);
      return;
    }
    enableAnimations(true);
    const timeout = setTimeout(() => enableAnimations(false), 500);
    return () => clearTimeout(timeout);
  }, [bookmarkRowsToShow, editing, enableAnimations]);

  const editBookmarkModal = useModal("bookmark-edit");
  const editGroupModal = useModal("bookmark-edit-group");
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(
    null,
  );
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const modifyBookmarks = useBookmarkStore((s) => s.modifyBookmarks);
  const modifyBookmarksByGroup = useBookmarkStore(
    (s) => s.modifyBookmarksByGroup,
  );
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    const saved = localStorage.getItem("__MW::bookmarksSort");
    return (saved as SortOption) || "date";
  });
  const [runtimeData, setRuntimeData] = useState<Record<string, number>>({});
  const [activeFolderModal, setActiveFolderModal] = useState<string | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // require 8px movement before drag starts
      },
    }),
  );

  useEffect(() => {
    localStorage.setItem("__MW::bookmarksSort", sortBy);
  }, [sortBy]);

  useEffect(() => {
    if (sortBy !== "length-asc" && sortBy !== "length-desc") return;
    const ids = Object.keys(bookmarks);
    const missing = ids.filter((id) => !(id in runtimeData));
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (id) => {
        const type = bookmarks[id].type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV;
        try {
          const data = await getMediaDetails(id, type, false);
          const value = type === TMDBContentTypes.MOVIE
            ? (data as any).runtime ?? 0
            : (data as any).number_of_episodes ?? 0;
          return [id, value] as [string, number];
        } catch {
          return [id, 0] as [string, number];
        }
      }),
    ).then((results) => {
      setRuntimeData((prev: Record<string, number>) => {
        const next = { ...prev };
        results.forEach(([id, val]) => { next[id] = val; });
        return next;
      });
    });
  }, [sortBy, bookmarks, runtimeData]);

  const { allGroups, rootMediaItems } = useMemo(() => {
    const list = getList(bookmarks);

    const groupSet = new Set<string>();
    const rootItems: MediaItem[] = [];

    list.forEach((b) => {
      const bookmark = bookmarks[b.id];
      if (bookmark?.group && bookmark.group.length > 0) {
        // Bookmark is in at least one folder — add all its groups to the set
        bookmark.group.forEach((g: string) => groupSet.add(g));
      } else {
        // No group → show in root
        rootItems.push(b);
      }
    });

    const unsortedGroups = Array.from(groupSet);
    const sortedGroups = [...unsortedGroups].sort((a, b) => {
      const idxA = groupOrder.indexOf(a);
      const idxB = groupOrder.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    return {
      allGroups: sortedGroups,
      rootMediaItems: sortMedia(rootItems, sortBy, bookmarks, progressItems, runtimeData),
    };
  }, [bookmarks, groupOrder, sortBy, progressItems, runtimeData]);

  useEffect(() => {
    onItemsChange(Object.keys(bookmarks).length > 0);
  }, [bookmarks, onItemsChange]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const bookmarkId = active.id as string;
    const targetGroupName = over.id as string;

    // Only act if the target is a known folder
    if (!allGroups.includes(targetGroupName)) return;
    // Don't add to a folder that bookmark is already in
    const existingGroups = bookmarks[bookmarkId]?.group || [];
    if (existingGroups.includes(targetGroupName)) return;

    // Add the bookmark to that folder (addGroups merges without duplication)
    modifyBookmarks([bookmarkId], { addGroups: [targetGroupName] });
  };

  const handleEditBookmark = (bookmarkId: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setEditingBookmarkId(bookmarkId);
    editBookmarkModal.show();
  };

  const handleSaveBookmark = (bookmarkId: string, changes: any) => {
    modifyBookmarks([bookmarkId], changes);
    editBookmarkModal.hide();
    setEditingBookmarkId(null);
  };

  const handleSaveGroup = (oldGroupName: string, newGroupName: string) => {
    modifyBookmarksByGroup({ oldGroupName, newGroupName });
    editGroupModal.hide();
    setEditingGroupName(null);
  };

  const handleCancelEditBookmark = () => {
    editBookmarkModal.hide();
    setEditingBookmarkId(null);
  };

  const handleCancelEditGroup = () => {
    editGroupModal.hide();
    setEditingGroupName(null);
  };

  const sortOptions: OptionItem[] = [
    { id: "date", name: t("home.bookmarks.sorting.options.date") },
    { id: "title-asc", name: t("home.bookmarks.sorting.options.titleAsc") },
    { id: "title-desc", name: t("home.bookmarks.sorting.options.titleDesc") },
    { id: "year-asc", name: t("home.bookmarks.sorting.options.yearAsc") },
    { id: "year-desc", name: t("home.bookmarks.sorting.options.yearDesc") },
    { id: "length-asc", name: t("home.bookmarks.sorting.options.lengthAsc") },
    { id: "length-desc", name: t("home.bookmarks.sorting.options.lengthDesc") },
  ];

  if (Object.keys(bookmarks).length === 0) return null;

  const maxItems = bookmarkRowsToShow * columns;
  const totalItems = allGroups.length + rootMediaItems.length;

  let displayGroups = allGroups;
  let displayMedia = rootMediaItems;
  let showViewAll = false;

  if (!editing && totalItems > maxItems) {
    showViewAll = true;
    const allowedItems = maxItems - 1;
    if (allGroups.length >= allowedItems) {
      displayGroups = allGroups.slice(0, allowedItems);
      displayMedia = [];
    } else {
      displayGroups = allGroups;
      displayMedia = rootMediaItems.slice(0, allowedItems - allGroups.length);
    }
  }

  return (
    <div className="relative">
      <SectionHeading
        title={t("home.bookmarks.sectionTitle")}
        icon={Icons.BOOKMARK}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              editing
                ? "bg-type-link text-white shadow-lg shadow-type-link/20"
                : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            {editing ? (
              <>
                <Icon icon={Icons.CHECKMARK} className="text-lg" />
                <span>Done</span>
              </>
            ) : (
              <>
                <Icon icon={Icons.EDIT} className="text-lg" />
                <span className="hidden sm:inline">Edit</span>
              </>
            )}
          </button>
          <Popover className="relative">
            {({ open }) => (
              <>
                <Popover.Button
                  className={`p-2 rounded-full transition-colors outline-none focus:ring-2 focus:ring-type-link ${open ? "bg-white/20 text-white" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`}
                >
                  <Icon icon={Icons.SETTINGS} className="text-xl" />
                </Popover.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-200"
                  enterFrom="opacity-0 translate-y-1"
                  enterTo="opacity-100 translate-y-0"
                  leave="transition ease-in duration-150"
                  leaveFrom="opacity-100 translate-y-0"
                  leaveTo="opacity-0 translate-y-1"
                >
                  <Popover.Panel className="absolute right-full top-full mt-2 w-64 z-50 rounded-xl bg-dropdown-background p-4 shadow-lg ring-1 ring-white/10 select-none">
                    <div className="space-y-4">
                      { /** Rows to show */ }
                      <div className="flex gap-2 text-sm font-medium text-white">
                        <span className="flex-1 whitespace-nowrap">Rows to show</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={bookmarkRowsToShow === 1}
                            onClick={() => setBookmarkRowsToShow(bookmarkRowsToShow - 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            -
                          </button>
                          <span className="w-5 text-center tabular-nums">{bookmarkRowsToShow}</span>
                          <button
                            type="button"
                            disabled={bookmarkRowsToShow === 10}
                            onClick={() => setBookmarkRowsToShow(bookmarkRowsToShow + 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      { /** Separator */}
                      <div className="border-t border-white/10" />
                      { /** Sorting Options */}
                      <label className="block text-sm font-medium text-white mb-2">Sort By</label>
                        <div className="bg-background-secondaryHover rounded-lg overflow-hidden flex flex-col">
                          {sortOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                const newSort = opt.id as SortOption;
                                setSortBy(newSort);
                                localStorage.setItem("__MW::bookmarksSort", newSort);
                              }}
                              className={`
                                w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between
                                ${sortBy === opt.id
                                  ? "text-type-emphasis"
                                  : "text-type-text hover:bg-white/5 hover:text-type-emphasis"}`}
                            >
                              <span>{opt.name}</span>
                              {sortBy === opt.id && <Icon icon={Icons.CHECKMARK} className="text-type-link" />}
                            </button>
                          ))}
                        </div>
                    </div>
                  </Popover.Panel>
                </Transition>
              </>
            )}
          </Popover>
        </div>
      </SectionHeading>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <MediaGrid ref={gridRef}>
          {/* Folder cards */}
          {displayGroups.map((group) => {
            const { name, icon } = parseGroupString(group);
            return (
              <div key={`folder-${group}`}>
                <FolderCard
                  groupName={group}
                  displayName={name}
                  folderIcon={icon}
                  editable={editing}
                  onClick={() => {
                    if (!editing) {
                      setActiveFolderModal(group);
                    }
                  }}
                  onEdit={() => {
                    setEditingGroupName(group);
                    editGroupModal.show();
                  }}
                />
              </div>
            );
          })}

          {/* Root (un-grouped) bookmarks */}
          {displayMedia.map((media) => (
            <div key={`media-${media.id}`}>
              <WatchedMediaCard
                key={media.id}
                media={media}
                onShowDetails={onShowDetails}
                closable={editing}
                onClose={() => removeBookmark(media.id)}
                editable={editing}
                onEdit={(e) => handleEditBookmark(media.id, e)}
              />
            </div>
          ))}

          {/* View All Card */}
          {showViewAll && (
            <div key="view-all-bookmarks">
              <MoreCard
                link="/bookmarks"
                className="relative group cursor-pointer user-select-none rounded-xl bg-transparent transition-colors duration-300 w-full h-full"
              />
            </div>
          )}
        </MediaGrid>
      </DndContext>

      {/* Folder modal – always rendered, visibility controlled via isShown */}
      <FolderModal
        isShown={!!activeFolderModal}
        groupName={activeFolderModal ?? ""}
        onClose={() => setActiveFolderModal(null)}
        onShowDetails={onShowDetails}
      />

      <EditBookmarkModal
        id="edit-bookmark"
        isShown={editBookmarkModal.isShown}
        bookmarkId={editingBookmarkId}
        onCancel={handleCancelEditBookmark}
        onSave={handleSaveBookmark}
      />

      <EditGroupModal
        id={editGroupModal.id}
        isShown={editGroupModal.isShown}
        groupName={editingGroupName}
        onCancel={handleCancelEditGroup}
        onSave={handleSaveGroup}
      />
    </div>
  );
}
