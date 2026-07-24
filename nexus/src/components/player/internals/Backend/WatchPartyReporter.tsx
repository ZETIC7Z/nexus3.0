/* eslint-disable no-console */
import { useEffect, useRef } from "react";

import { sendPlayerStatus } from "@/backend/player/status";
import { usePlayerStatusPolling } from "@/components/player/hooks/usePlayerStatusPolling";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";

const HOST_REPORT_INTERVAL_MS = 1500;
const GUEST_REPORT_INTERVAL_MS = 3000;
const MIN_CHANGE_INTERVAL_MS = 250;

export function WatchPartyReporter() {
  const { latestStatus } = usePlayerStatusPolling(3);
  const lastReportTime = useRef<number>(0);
  const lastFingerprint = useRef<string>("");

  const account = useAuthStore((s) => s.account);
  const userId = account?.userId || "guest";
  const backendUrl = useBackendUrl();

  const meta = usePlayerStore((s) => s.meta);
  const { enabled, roomCode, isHost } = useWatchPartyStore();

  useEffect(() => {
    if (!enabled || !roomCode || !meta || !latestStatus) return;
    if (!latestStatus.hasPlayedOnce && !isHost) return;

    const now = Date.now();
    const fingerprint = JSON.stringify({
      playing: latestStatus.isPlaying,
      paused: latestStatus.isPaused,
      loading: latestStatus.isLoading,
      timeBucket: Math.floor(latestStatus.time),
      rate: latestStatus.playbackRate,
    });

    const changed = fingerprint !== lastFingerprint.current;
    const minInterval = isHost
      ? HOST_REPORT_INTERVAL_MS
      : GUEST_REPORT_INTERVAL_MS;
    const dueByTime = now - lastReportTime.current >= minInterval;
    const dueByChange =
      changed && now - lastReportTime.current >= MIN_CHANGE_INTERVAL_MS;

    if (!dueByChange && !dueByTime) return;

    const send = async () => {
      try {
        await sendPlayerStatus(backendUrl, account, {
          userId,
          roomCode,
          isHost,
          content: {
            title: meta.title,
            type: meta.type,
            tmdbId: meta.tmdbId,
            seasonId: meta.season?.tmdbId,
            episodeId: meta.episode?.tmdbId,
            seasonNumber: meta.season?.number,
            episodeNumber: meta.episode?.number,
          },
          player: {
            isPlaying: latestStatus.isPlaying,
            isPaused: latestStatus.isPaused,
            isLoading: latestStatus.isLoading,
            hasPlayedOnce: latestStatus.hasPlayedOnce,
            time: latestStatus.time,
            duration: latestStatus.duration,
            playbackRate: latestStatus.playbackRate,
            buffered: latestStatus.buffered,
          },
        });
        lastReportTime.current = now;
        lastFingerprint.current = fingerprint;
      } catch (err) {
        console.error("watchparty: send", err);
      }
    };

    send();
  }, [
    latestStatus,
    enabled,
    roomCode,
    isHost,
    meta,
    backendUrl,
    account,
    userId,
  ]);

  return null;
}
