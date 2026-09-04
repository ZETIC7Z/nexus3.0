import { useProgressStore } from "@/stores/progress";

import { createVersionedStore } from "../migrations";
import type { OldData } from "./migrations/v2";
import { WatchedStoreData } from "./types";

export const VideoProgressStore = createVersionedStore<WatchedStoreData>()
  .setKey("video-progress")
  .addVersion({
    version: 0,
    migrate() {
      return {
        items: [], // dont migrate from version 0 to version 1, unmigratable
      };
    },
  })
  .addVersion({
    version: 1,
    async migrate(old: OldData) {
      // Lazily imported: migration code drags in the whole TMDB/fuse
      // metadata stack, which must not sit on the boot path. Only runs
      // for ancient store versions anyway.
      const { migrateV2Videos } = await import("./migrations/v2");
      return migrateV2Videos(old);
    },
  })
  .addVersion({
    version: 2,
    async migrate(old: WatchedStoreData) {
      const { migrateV3Videos } = await import("./migrations/v3");
      return migrateV3Videos(old);
    },
  })
  .addVersion({
    version: 3,
    async migrate(old: WatchedStoreData): Promise<WatchedStoreData> {
      const { migrateV4Videos } = await import("./migrations/v4");
      useProgressStore.getState().replaceItems(migrateV4Videos(old));

      return {
        items: [],
      };
    },
  })
  .addVersion({
    version: 4,
    create() {
      return {
        items: [],
      };
    },
  })
  .build();
