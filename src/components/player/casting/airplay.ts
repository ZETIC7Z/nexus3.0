import { isSafari } from "@/utils/browser/detectFeatures";

// Minimal AirPlay wrapper. v1 scope: trigger the native picker on whatever
// the local <video> element is already playing — no proxied-URL swap/restore
// dance (that ~120-line mechanism in the old implementation was a likely
// contributor to the unresolved black-screen bug and is deliberately dropped
// for this rebuild). Known limitation: sources requiring custom headers may
// not play correctly on an AirPlay receiver.

function getVideoElement(): (HTMLVideoElement & Record<string, any>) | null {
  return document.getElementById("video-element") as HTMLVideoElement | null;
}

export function isAirplayAvailable(): boolean {
  const proto = (window as any).HTMLVideoElement?.prototype;
  return isSafari || !!proto?.webkitShowPlaybackTargetPicker;
}

export function triggerAirplayPicker() {
  const video = getVideoElement();
  if (!video?.webkitShowPlaybackTargetPicker) return;
  video.webkitShowPlaybackTargetPicker();
}

export function onAirplayConnectionChange(cb: (connected: boolean) => void) {
  const video = getVideoElement();
  if (!video) return () => {};

  const handler = () => cb(!!video.webkitCurrentPlaybackTargetIsWireless);
  video.addEventListener("webkitcurrentplaybacktargetiswireless", handler);
  return () =>
    video.removeEventListener("webkitcurrentplaybacktargetiswireless", handler);
}
