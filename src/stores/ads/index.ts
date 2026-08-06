import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export interface AdsStore {
  adsDisabled: boolean;
  disableAds(): void;
  enableAds(): void;
}

export const useAdsStore = create(
  persist(
    immer<AdsStore>((set) => ({
      adsDisabled: false,
      disableAds() {
        set((s) => {
          s.adsDisabled = true;
        });
      },
      enableAds() {
        set((s) => {
          s.adsDisabled = false;
        });
      },
    })),
    {
      name: "__MW::ads",
    },
  ),
);
