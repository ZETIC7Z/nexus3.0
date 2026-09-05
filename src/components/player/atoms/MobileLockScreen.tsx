import { useEffect, useState } from "react";

import { Icon, Icons } from "@/components/Icon";
import { Transition } from "@/components/utils/Transition";
import { usePlayerStore } from "@/stores/player/store";

/**
 * Netflix-style Mobile Lock Screen Component
 *
 * When locked:
 * - Hides all player controls (play/pause, progress bar, settings)
 * - Blocks touch interactions to prevent accidental pauses/skips
 * - Shows only an unlock button
 *
 * Auto-unlocks when exiting fullscreen.
 */
export function MobileLockScreen() {
  const isFullscreen = usePlayerStore((s) => s.interface.isFullscreen);
  const isScreenLocked = usePlayerStore((s) => s.interface.isScreenLocked);
  const setScreenLocked = usePlayerStore((s) => s.setScreenLocked);
  const [showButton, setShowButton] = useState(true);
  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);

  // Check for landscape orientation
  useEffect(() => {
    const checkOrientation = () => {
      const landscape = window.innerWidth > window.innerHeight;
      setIsLandscape(landscape);
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Auto-unlock when exiting fullscreen
  useEffect(() => {
    if (!isFullscreen && isScreenLocked) {
      setScreenLocked(false);
    }
  }, [isFullscreen, isScreenLocked, setScreenLocked]);

  // Auto-hide lock button after 3 seconds when NOT locked
  useEffect(() => {
    if (!isScreenLocked && showButton) {
      const timer = setTimeout(() => {
        setShowButton(false);
      }, 3000);
      setHideTimer(timer);

      return () => {
        if (timer) clearTimeout(timer);
      };
    }
  }, [isScreenLocked, showButton]);

  // When locked, show unlock button briefly then hide
  useEffect(() => {
    if (isScreenLocked) {
      setShowButton(true);
      const timer = setTimeout(() => {
        setShowButton(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isScreenLocked]);

  const handleLockedScreenTap = () => {
    if (isScreenLocked) {
      // Show unlock button when tapping locked screen and restart auto-hide timer
      setShowButton(true);
      if (hideTimer) clearTimeout(hideTimer);
      const timer = setTimeout(() => {
        setShowButton(false);
      }, 3000);
      setHideTimer(timer);
    }
  };

  const toggleLock = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setScreenLocked(!isScreenLocked);
    setShowButton(true);
    // Reset auto-hide timer after toggling
    if (hideTimer) clearTimeout(hideTimer);
    const timer = setTimeout(() => {
      setShowButton(false);
    }, 3000);
    setHideTimer(timer);
  };

  // Only show in landscape fullscreen on mobile (not portrait)
  if (!isFullscreen || !isLandscape) return null;

  return (
    <>
      {/* Full-screen touch blocker when locked - prevents accidental controls */}
      {isScreenLocked && (
        <div
          className="absolute inset-0 z-[100] cursor-default"
          onClick={handleLockedScreenTap}
          onTouchStart={handleLockedScreenTap}
          aria-label="Screen is locked. Tap to show unlock button."
        />
      )}

      {/* Lock/Unlock button - positioned in middle-right of screen */}
      <Transition
        animation="fade"
        show={showButton}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-[101] lg:hidden"
      >
        <button
          type="button"
          onClick={toggleLock}
          onTouchEnd={toggleLock}
          className={`
            flex items-center justify-center 
            w-12 h-12 rounded-full 
            backdrop-blur-sm border border-white/20 
            transition-all duration-200
            bg-black/50 hover:bg-black/70
          `}
          aria-label={isScreenLocked ? "Unlock screen" : "Lock screen"}
        >
          <Icon
            icon={isScreenLocked ? Icons.LOCK : Icons.UNLOCK}
            className="text-white text-xl"
          />
        </button>
      </Transition>
    </>
  );
}
