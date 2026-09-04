import { MWMediaType } from "@/backend/metadata/types/mw";
import { BookmarkMediaItem, useBookmarkStore } from "@/stores/bookmarks";

import { BookmarkStoreData } from "./types";
import { createVersionedStore } from "../migrations";
import type { OldBookmarks } from "../watched/migrations/v2";

const typeMap: Record<MWMediaType, "show" | "movie" | null> = {
  [MWMediaType.ANIME]: null,
  [MWMediaType.MOVIE]: "movie",
  [MWMediaType.SERIES]: "show",
};

export const BookmarkStore = createVersionedStore<BookmarkStoreData>()
  .setKey("mw-bookmarks")
  .addVersion({
    version: 0,
    async migrate(oldBookmarks: OldBookmarks) {
      // Lazily imported (keeps TMDB/fuse off the boot path).
      const { migrateV1Bookmarks } = await import("../watched/migrations/v2");
      return migrateV1Bookmarks(oldBookmarks);
    },
  })
  .addVersion({
    version: 1,
    async migrate(old: BookmarkStoreData) {
      const { migrateV2Bookmarks } = await import("../watched/migrations/v3");
      return migrateV2Bookmarks(old);
    },
  })
  .addVersion({
    version: 2,
    migrate(old: BookmarkStoreData): BookmarkStoreData {
      const newItems: Record<string, BookmarkMediaItem> = {};

      for (const oldBookmark of old.bookmarks) {
        const type = typeMap[oldBookmark.type];
        if (!type) continue;
        newItems[oldBookmark.id] = {
          title: oldBookmark.title,
          year: oldBookmark.year ? Number(oldBookmark.year) : undefined,
          poster: oldBookmark.poster,
          type,
          updatedAt: Date.now(),
        };
      }

      useBookmarkStore.getState().replaceBookmarks(newItems);

      return { bookmarks: [] };
    },
  })
  .addVersion({
    version: 3,
    create() {
      return {
        bookmarks: [],
      };
    },
  })
  .build();
