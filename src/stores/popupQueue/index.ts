import { create } from "zustand";
import { useSyncExternalStore } from "react";

export type PopupId = "maintenance" | "update";

interface PopupQueueState {
  /** Popup currently allowed to render, null = none */
  active: PopupId | null;
  /** Who asked for the stage */
  claimed: Partial<Record<PopupId, boolean>>;
  claim: (id: PopupId) => void;
  release: (id: PopupId) => void;
}

/**
 * Single-stage popup coordination: both the maintenance notice and the
 * app-update notice want the same top-center slot. Instead of stacking,
 * the stage is granted to one popup at a time; the next in line takes it
 * only after the current one has fully closed (including its exit
 * animation). Claim order is the DOM/queue order, so the maintenance
 * popup always shows first.
 */
export const usePopupQueueStore = create<PopupQueueState>((set, get) => ({
  active: null,
  claimed: {},
  claim(id) {
    const claimed = { ...get().claimed, [id]: true };
    const active = get().active ?? firstClaimed(claimed);
    set({ claimed, active });
  },
  release(id) {
    const claimed = { ...get().claimed };
    delete claimed[id];
    const active =
      get().active === id ? firstClaimed(claimed) : get().active;
    set({ claimed, active });
  },
}));

function firstClaimed(
  claimed: Partial<Record<PopupId, boolean>>,
): PopupId | null {
  // Fixed priority: maintenance (popup 1) before update (popup 2).
  if (claimed.maintenance) return "maintenance";
  if (claimed.update) return "update";
  return null;
}

/** Read the popup stage as a react hook. */
export function useActivePopup(): PopupId | null {
  return useSyncExternalStore(
    usePopupQueueStore.subscribe,
    () => usePopupQueueStore.getState().active,
  );
}
