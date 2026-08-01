import { t } from "i18next";
import { useEffect, useMemo, useRef } from "react";

import { Icon, Icons } from "@/components/Icon";
import { Flare } from "@/components/utils/Flare";
import { Transition } from "@/components/utils/Transition";
import { usePlayerStore } from "@/stores/player/store";

const POPOUT_DURATION_MS = 3500;

export function AutoFallbackPopout() {
  const show = usePlayerStore((s) => s.interface.showAutoFallbackPopout);
  const failedSourceName = usePlayerStore(
    (s) => s.interface.autoFallbackFailedSourceName,
  );
  const setAutoFallbackPopout = usePlayerStore(
    (s) => s.setAutoFallbackPopout,
  );
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss after a short interval so the toast doesn't linger.
  useEffect(() => {
    if (!show) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAutoFallbackPopout(false, null);
    }, POPOUT_DURATION_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [show, setAutoFallbackPopout]);

  // Clear the popout if the player status leaves the auto-switching path
  // (e.g., user opened settings during resume, or playback succeeded).
  const status = usePlayerStore((s) => s.status);
  useEffect(() => {
    if (show && status !== "playbackError" && status !== "scraping") {
      setAutoFallbackPopout(false, null);
    }
  }, [status, show, setAutoFallbackPopout]);

  const message = useMemo(() => {
    const name = failedSourceName || t("player.autoFallback.unknownSource");
    return t("player.autoFallback.message", { source: name });
  }, [failedSourceName]);

  return (
    <Transition
      animation="slide-down"
      show={show}
      className="absolute inset-x-0 top-4 flex justify-center pointer-events-none z-30"
    >
      <Flare.Base className="hover:flare-enabled pointer-events-auto bg-video-context-background pl-4 pr-6 py-3 max-w-md rounded-xl shadow-lg border border-white/10">
        <Flare.Light
          enabled
          flareSize={200}
          cssColorVar="--colors-video-context-light"
          backgroundClass="bg-video-context-background duration-100"
          className="rounded-xl"
        />
        <Flare.Child className="grid grid-cols-[auto,1fr] gap-3 items-center pointer-events-auto relative transition-transform">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
          </span>
          <Icon className="text-2xl text-amber-400" icon={Icons.WAND} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-white truncate">
              {t("player.autoFallback.title")}
            </span>
            <span className="text-xs text-video-context-type-secondary mt-0.5 truncate">
              {message}
            </span>
          </div>
        </Flare.Child>
      </Flare.Base>
    </Transition>
  );
}
