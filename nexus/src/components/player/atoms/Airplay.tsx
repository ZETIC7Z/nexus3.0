import { Icons } from "@/components/Icon";
import { useCasting } from "@/components/player/casting/useCasting";
import { VideoPlayerButton } from "@/components/player/internals/Button";
import { usePlayerStore } from "@/stores/player/store";

export function Airplay() {
  const { isCasting, castType, airplayAvailable, startAirplay } = useCasting();
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

  if (!airplayAvailable || !isCastable) return null;
  if (isCasting && castType !== "airplay") return null;

  return <VideoPlayerButton onClick={() => startAirplay()} icon={Icons.AIRPLAY} />;
}
