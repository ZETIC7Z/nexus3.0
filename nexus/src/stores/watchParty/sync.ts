import { create } from "zustand";

export interface RoomUserContent {
  title: string;
  type: "movie" | "show" | string;
  tmdbId?: string;
  seasonId?: string;
  episodeId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface RoomUserPlayer {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  time: number;
  duration: number;
}

export interface RoomUser {
  userId: string;
  isHost: boolean;
  lastUpdate: number;
  content: RoomUserContent;
  player: RoomUserPlayer;
}

interface WatchPartySyncStore {
  roomUsers: RoomUser[];
  userCount: number;
  isOffline: boolean;
  isSyncing: boolean;
  setRoomState(users: RoomUser[]): void;
  setOffline(offline: boolean): void;
  setSyncing(syncing: boolean): void;
  reset(): void;
}

export const useWatchPartySyncStore = create<WatchPartySyncStore>((set) => ({
  roomUsers: [],
  userCount: 1,
  isOffline: false,
  isSyncing: false,

  setRoomState(users) {
    set({ roomUsers: users, userCount: Math.max(1, users.length) });
  },
  setOffline(offline) {
    set({ isOffline: offline });
  },
  setSyncing(syncing) {
    set({ isSyncing: syncing });
  },
  reset() {
    set({ roomUsers: [], userCount: 1, isOffline: false, isSyncing: false });
  },
}));
