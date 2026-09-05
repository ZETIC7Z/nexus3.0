import { Icons } from "@/components/Icon";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";

/**
 * Mobile Lock Button - shown in bottom controls during fullscreen
 * When clicked, locks the screen to prevent accidental touches (Netflix-style)
 */
export function MobileLockButton() {
  const isFullscreen = usePlayerStore((s) => s.interface.isFullscreen);
  const isScreenLocked = usePlayerStore((s) => s.interface.isScreenLocked);
  const setScreenLocked = usePlayerStore((s) => s.setScreenLocked);

  // Only show in fullscreen mode on mobile
  if (!isFullscreen) return null;

  const toggleLock = () => {
    setScreenLocked(!isScreenLocked);
  };

  return (
    <VideoPlayerButton
      onClick={toggleLock}
      icon={isScreenLocked ? Icons.LOCK : Icons.UNLOCK}
      iconSizeClass="text-xl"
      className="bg-black/40 hover:bg-black/60 rounded-full"
    />
  );
}
