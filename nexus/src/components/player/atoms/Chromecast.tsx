import { useCasting } from "@/components/player/casting/useCasting";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";
import { Icons } from "@/components/Icon";

export function Chromecast() {
  const { isCasting, castType, chromecastAvailable, startChromecast, stop } =
    useCasting();
  const source = usePlayerStore((s) => s.source);

  const isCastable = (() => {
    if (!source) return false;
    if (source.type === "hls") return true;
    if (source.type === "file") {
      const hasHeaders =
        Object.keys(source.headers || {}).length > 0 ||
        Object.keys(source.preferredHeaders || {}).length > 0;
      return !hasHeaders;
    }
    return true;
  })();

  if (!chromecastAvailable || !isCastable) return null;
  if (isCasting && castType !== "chromecast") return null;

  return (
    <VideoPlayerButton
      onClick={() => (isCasting ? stop() : startChromecast())}
      icon={Icons.CASTING}
    />
  );
}
