import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { usePopupQueueStore, PopupId } from "@/stores/popupQueue";

const AUTO_CLOSE_MS = 15000;
const EXIT_ANIMATION_MS = 280;

interface NoticePopupProps {
  /** Which popup this is in the shared queue */
  id: PopupId;
  /** False = component won't ask for the stage (e.g. dismissed already) */
  wantsStage: boolean;
  /** Called when the popup fully exits (auto-timeout or manual close) */
  onClosed: () => void;
  /** Extra classes for the inner card (colors etc.) */
  className?: string;
  children: (opts: { close: () => void }) => ReactNode;
}

/**
 * Shared single-slot popup shell. Renders top-center (the one place both
 * notices show, per design), claims the popup-queue stage, auto-closes
 * after 3.5s and animates in AND out. On mobile it spans nearly the full
 * width so the text never wraps into a cramped column.
 */
export function NoticePopup(props: NoticePopupProps) {
  const { id, wantsStage, onClosed, className, children } = props;
  const active = usePopupQueueStore((s) => s.active);
  const claim = usePopupQueueStore((s) => s.claim);
  const release = usePopupQueueStore((s) => s.release);

  const hasStage = active === id;

  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const closedRef = useRef(false);

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    release(id);
    onClosed();
  }, [id, onClosed, release]);

  // Ask for the stage while we want to be shown.
  useEffect(() => {
    if (!wantsStage) return;
    claim(id);
    return () => release(id);
  }, [wantsStage, id, claim, release]);

  // When granted the stage: mount + animate in, start the auto-close timer.
  useEffect(() => {
    if (!hasStage) return;
    closedRef.current = false;
    setMounted(true);
    const raf = requestAnimationFrame(() => setEntered(true));
    const timer = setTimeout(finishClose, AUTO_CLOSE_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [hasStage, finishClose]);

  // Exit animation, then unmount + hand the stage back.
  const leave = useCallback(() => {
    setEntered(false);
    setTimeout(finishClose, EXIT_ANIMATION_MS);
  }, [finishClose]);

  if (!mounted || !hasStage) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(max(1.25rem,env(safe-area-inset-top))_+_0.25rem)] z-[200] flex justify-center px-3 sm:px-4">
      <div
        className={[
          "pointer-events-auto group relative flex w-full max-w-[min(30rem,calc(100vw-1.5rem))] items-center gap-3 overflow-hidden rounded-2xl border border-white/10 sm:w-auto",
          "bg-[#12141c]/85 px-3 py-3 pr-1.5 shadow-soft-lg backdrop-blur-xl ring-1 ring-white/5 sm:px-4 sm:pr-2",
          "transition-[transform,opacity] duration-300 ease-out-quint will-change-transform",
          className ?? "",
          entered ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
        ].join(" ")}
      >
        {children({ close: leave })}
      </div>
    </div>
  );
}
