/* eslint-disable no-console */
import { useCallback } from "react";

import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";
import {
  RoomUser,
  useWatchPartySyncStore,
} from "@/stores/watchParty/sync";

export type { RoomUser };

export interface WatchPartySyncResult {
  roomUsers: RoomUser[];
  hostUser: RoomUser | null;
  isBehindHost: boolean;
  isAheadOfHost: boolean;
  timeDifferenceFromHost: number;
  syncWithHost: () => void;
  isSyncing: boolean;
  userCount: number;
  isOffline: boolean;
}

const DRIFT_THRESHOLD_SECONDS = 3;

export function useWatchPartySync(): WatchPartySyncResult {
  const roomUsers = useWatchPartySyncStore((s) => s.roomUsers);
  const isOffline = useWatchPartySyncStore((s) => s.isOffline);
  const userCount = useWatchPartySyncStore((s) => s.userCount);
  const isSyncing = useWatchPartySyncStore((s) => s.isSyncing);

  const myTime = usePlayerStore((s) => s.progress.time);
  const display = usePlayerStore((s) => s.display);
  const { isHost } = useWatchPartyStore();

  const hostUser = roomUsers.find((u) => u.isHost) ?? null;

  const predictedHostTime = (() => {
    if (!hostUser) return 0;
    const elapsed = (Date.now() - hostUser.lastUpdate) / 1000;
    return hostUser.player.isPlaying && !hostUser.player.isPaused
      ? hostUser.player.time + elapsed
      : hostUser.player.time;
  })();

  const timeDifferenceFromHost = hostUser ? myTime - predictedHostTime : 0;
  const isBehindHost =
    !!hostUser && !isHost && timeDifferenceFromHost < -DRIFT_THRESHOLD_SECONDS;
  const isAheadOfHost =
    !!hostUser && !isHost && timeDifferenceFromHost > DRIFT_THRESHOLD_SECONDS;

  const syncWithHost = useCallback(() => {
    if (!hostUser || isHost || !display) return;
    const hostIsPlaying =
      hostUser.player.isPlaying && !hostUser.player.isPaused;
    try {
      display.setTime(predictedHostTime);
    } catch (err) {
      console.error("watchparty: manual sync setTime", err);
    }
    setTimeout(() => {
      try {
        if (hostIsPlaying) display.play();
        else display.pause();
      } catch (err) {
        console.error("watchparty: manual sync play/pause", err);
      }
    }, 200);
  }, [hostUser, isHost, display, predictedHostTime]);

  return {
    roomUsers,
    hostUser,
    isBehindHost,
    isAheadOfHost,
    timeDifferenceFromHost,
    syncWithHost,
    isSyncing,
    userCount,
    isOffline,
  };
}
