/* eslint-disable no-console */
import { useCallback, useEffect, useRef } from "react";

import { getRoomStatuses } from "@/backend/player/status";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";
import {
  RoomUser,
  useWatchPartySyncStore,
} from "@/stores/watchParty/sync";

const POLL_INTERVAL_MS = 2000;
const BACKOFF_MAX_MS = 15000;
const STALE_USER_MS = 12000;
const DRIFT_THRESHOLD_SECONDS = 5;
const SYNC_COOLDOWN_MS = 3000;
const SEEK_SETTLE_MS = 250;
const PLAY_SETTLE_MS = 350;

function toStringId(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

export function WatchPartyEngine() {
  const account = useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();

  const { roomCode, isHost, enabled, enableAsGuest } = useWatchPartyStore();

  const display = usePlayerStore((s) => s.display);
  const meta = usePlayerStore((s) => s.meta);

  const hostUser = useWatchPartySyncStore(
    (s) => s.roomUsers.find((u) => u.isHost) ?? null,
  );

  const engine = useRef({
    consecutiveErrors: 0,
    syncInProgress: false,
    hasInitialSynced: false,
    lastHostPlaying: null as boolean | null,
    pendingHostPlaying: null as boolean | null,
    confirmedHostPlaying: null as boolean | null,
    lastSyncAt: 0,
    lastFollowKey: null as string | null,
    checkedUrlParams: false,
  });

  useEffect(() => {
    if (!enabled) engine.current.checkedUrlParams = false;
  }, [enabled]);

  useEffect(() => {
    if (engine.current.checkedUrlParams) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("watchparty");
      if (code && !enabled && code.length > 0) enableAsGuest(code);
      engine.current.checkedUrlParams = true;
    } catch (err) {
      console.error("watchparty: url parse", err);
    }
  }, [enabled, enableAsGuest]);

  const refresh = useCallback(async () => {
    if (!enabled || !roomCode || !backendUrl) return;
    try {
      const response = await getRoomStatuses(backendUrl, account, roomCode);
      const now = Date.now();
      const users: RoomUser[] = [];

      Object.entries(response.users).forEach(([userId, statuses]) => {
        if (!statuses || statuses.length === 0) return;
        const latest = [...statuses].sort(
          (a, b) => b.timestamp - a.timestamp,
        )[0];
        if (now - latest.timestamp > STALE_USER_MS) return;
        users.push({
          userId,
          isHost: !!latest.isHost,
          lastUpdate: latest.timestamp,
          content: {
            title: latest.content.title,
            type: latest.content.type,
            tmdbId: toStringId(latest.content.tmdbId),
            seasonId: toStringId(latest.content.seasonId),
            episodeId: toStringId(latest.content.episodeId),
            seasonNumber: latest.content.seasonNumber,
            episodeNumber: latest.content.episodeNumber,
          },
          player: {
            isPlaying: !!latest.player.isPlaying,
            isPaused: !!latest.player.isPaused,
            isLoading: !!latest.player.isLoading,
            time: Number(latest.player.time) || 0,
            duration: Number(latest.player.duration) || 0,
          },
        });
      });

      users.sort((a, b) => {
        if (a.isHost && !b.isHost) return -1;
        if (!a.isHost && b.isHost) return 1;
        return b.lastUpdate - a.lastUpdate;
      });

      useWatchPartySyncStore.getState().setRoomState(users);
      useWatchPartySyncStore.getState().setOffline(false);
      engine.current.consecutiveErrors = 0;
    } catch (err) {
      engine.current.consecutiveErrors += 1;
      if (engine.current.consecutiveErrors >= 3) {
        useWatchPartySyncStore.getState().setOffline(true);
      }
      console.error("watchparty: refresh", err);
    }
  }, [backendUrl, account, roomCode, enabled]);

  useEffect(() => {
    if (!enabled || !roomCode) {
      useWatchPartySyncStore.getState().reset();
      const e = engine.current;
      e.hasInitialSynced = false;
      e.lastHostPlaying = null;
      e.lastFollowKey = null;
      e.consecutiveErrors = 0;
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      await refresh();
      if (cancelled) return;
      const errors = engine.current.consecutiveErrors;
      const interval =
        errors > 0
          ? Math.min(POLL_INTERVAL_MS * 2 ** errors, BACKOFF_MAX_MS)
          : POLL_INTERVAL_MS;
      timeoutId = setTimeout(tick, interval);
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, roomCode, refresh]);

  useEffect(() => {
    if (!enabled || isHost || !hostUser || !roomCode) return;

    const hostType = hostUser.content.type === "show" ? "show" : "movie";

    if (!hostUser.content.tmdbId) return;
    if (
      hostType === "show" &&
      (!hostUser.content.seasonId || !hostUser.content.episodeId)
    )
      return;

    const hostKey =
      hostType === "show"
        ? `show:${hostUser.content.tmdbId}:${hostUser.content.seasonId}:${hostUser.content.episodeId}`
        : `movie:${hostUser.content.tmdbId}`;

    if (engine.current.lastFollowKey === hostKey) return;

    const myType = meta?.type === "show" ? "show" : "movie";
    const myKey =
      meta && meta.tmdbId
        ? myType === "show"
          ? `show:${meta.tmdbId}:${meta.season?.tmdbId}:${meta.episode?.tmdbId}`
          : `movie:${meta.tmdbId}`
        : null;

    if (myKey === hostKey) {
      engine.current.lastFollowKey = hostKey;
      return;
    }

    const targetPath =
      hostType === "show"
        ? `/media/tmdb-tv-${hostUser.content.tmdbId}/${hostUser.content.seasonId}/${hostUser.content.episodeId}`
        : `/media/tmdb-movie-${hostUser.content.tmdbId}`;

    const currentPath = window.location.pathname;
    const mediaPrefix = `/media/tmdb-${hostType === "show" ? "tv" : "movie"}-${hostUser.content.tmdbId}`;
    let currentMatchesTarget = false;
    if (currentPath.startsWith(mediaPrefix)) {
      if (hostType === "movie") {
        currentMatchesTarget = true;
      } else if (
        currentPath.includes(`/${hostUser.content.seasonId}/`) &&
        currentPath.endsWith(`/${hostUser.content.episodeId}`)
      ) {
        currentMatchesTarget = true;
      }
    }

    if (currentMatchesTarget) {
      engine.current.lastFollowKey = hostKey;
      return;
    }

    engine.current.lastFollowKey = hostKey;
    engine.current.hasInitialSynced = false;

    const url = new URL(targetPath, window.location.origin);
    url.searchParams.set("watchparty", roomCode);
    window.location.assign(url.toString());
  }, [enabled, isHost, hostUser, roomCode, meta]);

  useEffect(() => {
    const e = engine.current;

    if (!enabled || isHost || !hostUser || !display) {
      return;
    }

    if (e.syncInProgress) return;
    if (Date.now() - e.lastSyncAt < SYNC_COOLDOWN_MS) return;

    const myMeta = meta;
    const myContentTmdb = myMeta?.tmdbId;
    if (!myContentTmdb || hostUser.content.tmdbId !== myContentTmdb) return;
    if (hostUser.content.type === "show") {
      if (
        hostUser.content.seasonId !== myMeta?.season?.tmdbId ||
        hostUser.content.episodeId !== myMeta?.episode?.tmdbId
      )
        return;
    }

    if (hostUser.player.isLoading) {
      return;
    }

    const hostIsPlaying =
      hostUser.player.isPlaying && !hostUser.player.isPaused;

    if (e.pendingHostPlaying === hostIsPlaying) {
      e.confirmedHostPlaying = hostIsPlaying;
    } else {
      e.pendingHostPlaying = hostIsPlaying;
    }

    const elapsed = Math.max(
      0,
      (Date.now() - hostUser.lastUpdate) / 1000,
    );
    const predictedRaw = hostIsPlaying
      ? hostUser.player.time + elapsed
      : hostUser.player.time;
    const predicted = Number.isFinite(predictedRaw) ? predictedRaw : 0;

    const myTime = usePlayerStore.getState().progress.time;
    const myDuration = usePlayerStore.getState().progress.duration;
    const hostDuration = hostUser.player.duration;

    if (
      hostDuration > 0 &&
      myDuration > 0 &&
      Math.abs(hostDuration - myDuration) > 30
    ) {
      return;
    }

    if (
      hostIsPlaying &&
      predicted < 0.5 &&
      hostUser.player.duration > 30 &&
      myTime > 1
    ) {
      return;
    }

    const drift = myTime - predicted;

    const needsInitial = !e.hasInitialSynced;
    const needsDrift =
      e.hasInitialSynced && Math.abs(drift) > DRIFT_THRESHOLD_SECONDS;
    const needsPlayState =
      e.confirmedHostPlaying !== null &&
      e.lastHostPlaying !== null &&
      e.confirmedHostPlaying !== e.lastHostPlaying;

    if (!needsInitial && !needsDrift && !needsPlayState) {
      return;
    }

    const targetPlaying = needsInitial
      ? hostIsPlaying
      : e.confirmedHostPlaying ?? hostIsPlaying;

    e.syncInProgress = true;
    e.lastSyncAt = Date.now();
    useWatchPartySyncStore.getState().setSyncing(true);

    try {
      if (needsInitial || needsDrift || needsPlayState) {
        display.setTime(predicted);
      }
    } catch (err) {
      console.error("watchparty: setTime", err);
    }

    setTimeout(() => {
      try {
        if (targetPlaying) display.play();
        else display.pause();
      } catch (err) {
        console.error("watchparty: play/pause", err);
      }
      setTimeout(() => {
        useWatchPartySyncStore.getState().setSyncing(false);
        e.syncInProgress = false;
        e.hasInitialSynced = true;
        e.lastHostPlaying = targetPlaying;
      }, PLAY_SETTLE_MS);
    }, SEEK_SETTLE_MS);
  }, [enabled, isHost, hostUser, display, meta]);

  return null;
}
