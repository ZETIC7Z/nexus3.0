import { useEffect, useState } from "react";

import { useShouldShowControls } from "@/components/player/hooks/useShouldShowControls";
import { Transition } from "@/components/utils/Transition";
import { usePlayerStore } from "@/stores/player/store";

export function MobilePlayerLogo() {
  const isFullscreen = usePlayerStore((s) => s.interface.isFullscreen);
  const isScreenLocked = usePlayerStore((s) => s.interface.isScreenLocked);
  const { showTargets } = useShouldShowControls();
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Check if screen is in landscape
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

  // Only show in fullscreen LANDSCAPE mode (not portrait)
  if (!isFullscreen || !isLandscape) return null;

  // Auto-hide with controls - don't show when screen is locked (unless controls are showing)
  const shouldShow = showTargets || (!isScreenLocked && showTargets);

  return (
    <Transition
      animation="fade"
      show={shouldShow}
      className="absolute z-[60] lg:hidden pointer-events-none top-1 right-4"
    >
      <img
        src="/nexus-logo-full.png"
        alt="NEXUS"
        className="h-10 w-auto opacity-90"
        style={{
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.7))",
        }}
      />
    </Transition>
  );
}
