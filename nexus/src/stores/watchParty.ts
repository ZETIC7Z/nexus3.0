import { create } from "zustand";
import { persist } from "zustand/middleware";

import { usePlayerStore } from "@/stores/player/store";

interface WatchPartyStore {
  enabled: boolean;
  roomCode: string | null;
  isHost: boolean;
  showStatusOverlay: boolean;
  enableAsHost(): void;
  enableAsGuest(code: string): void;
  updateRoomCode(code: string): void;
  disable(): void;
  setShowStatusOverlay(show: boolean): void;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateRoomCode = (): string => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < bytes.length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
};

const resetPlaybackRate = () => {
  const display = usePlayerStore.getState().display;
  if (display) display.setPlaybackRate(1);
};

export const useWatchPartyStore = create<WatchPartyStore>()(
  persist(
    (set) => ({
      enabled: false,
      roomCode: null,
      isHost: false,
      showStatusOverlay: false,

      enableAsHost: () => {
        resetPlaybackRate();
        set(() => ({
          enabled: true,
          roomCode: generateRoomCode(),
          isHost: true,
        }));
      },

      enableAsGuest: (code: string) => {
        resetPlaybackRate();
        set(() => ({
          enabled: true,
          roomCode: code.toUpperCase(),
          isHost: false,
        }));
      },

      updateRoomCode: (code: string) =>
        set((state) => ({ ...state, roomCode: code.toUpperCase() })),

      disable: () =>
        set(() => ({
          enabled: false,
          roomCode: null,
          isHost: false,
        })),

      setShowStatusOverlay: (show: boolean) =>
        set(() => ({ showStatusOverlay: show })),
    }),
    { name: "watch-party-storage" },
  ),
);
