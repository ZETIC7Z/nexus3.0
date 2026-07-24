import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseSubtitles } from "@/components/player/utils/captions";
import {
  SyncEstimate,
  estimateSubtitleOffset,
} from "@/components/player/utils/subtitleSync";
import { whisperEstimateOffset } from "@/components/player/utils/whisperSync";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { useSubtitleStore } from "@/stores/subtitles";

const WHISPER_AUTO_CONFIDENCE = 0.55;
const WHISPER_MANUAL_CONFIDENCE = 0.4;

const VAD_AUTO_CONFIDENCE = 0.45;
const VAD_MANUAL_CONFIDENCE = 0.25;

const POLL_MS = 6000;
const MAX_AUTO_ATTEMPTS = 18;

const autoSyncedKeys = new Set<string>();

function captionKey(id?: string | null, srtLen?: number): string | null {
  if (!id) return null;
  return `${id}:${srtLen ?? 0}`;
}

export function useAutoSync() {
  const display = usePlayerStore((s) => s.display);
  const selectedCaption = usePlayerStore((s) => s.caption.selected);
  const enabled = usePreferencesStore((s) => s.enableAutoSubtitleSync);
  const setDelay = useSubtitleStore((s) => s.setDelay);
  const setShowDelayIndicator = useSubtitleStore(
    (s) => s.setShowDelayIndicator,
  );

  const [isSyncing, setIsSyncing] = useState(false);
  const indicatorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const srtData = selectedCaption?.srtData;
  const cues = useMemo(() => {
    if (!srtData || !srtData.trim()) return [];
    try {
      return parseSubtitles(srtData);
    } catch {
      return [];
    }
  }, [srtData]);

  const flashIndicator = useCallback(() => {
    setShowDelayIndicator(true);
    if (indicatorTimeout.current) clearTimeout(indicatorTimeout.current);
    indicatorTimeout.current = setTimeout(
      () => setShowDelayIndicator(false),
      3000,
    );
  }, [setShowDelayIndicator]);

  const vadEstimate = useCallback((): SyncEstimate | null => {
    const samples = display?.getAudioActivity?.() ?? [];
    if (!samples.length || cues.length === 0) return null;
    return estimateSubtitleOffset(samples, cues as any);
  }, [display, cues]);

  const runWhisper = useCallback(async (): Promise<SyncEstimate | null> => {
    if (!display?.getAudioWindow || cues.length === 0) return null;
    const audio = display.getAudioWindow(20);
    if (!audio) return null;
    try {
      const dec = await whisperEstimateOffset(audio, cues as any);
      if (!dec) return null;
      // eslint-disable-next-line no-console
      console.debug("[sync] whisper", dec);
      return { offset: dec.offset, confidence: dec.confidence };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[sync] whisper failed:", err);
      return null;
    }
  }, [display, cues]);

  const autoSync = useCallback(async (): Promise<SyncEstimate | null> => {
    if (!enabled) return null;
    if (inFlight.current) return null;
    inFlight.current = true;
    setIsSyncing(true);
    try {
      const whisper = await runWhisper();
      if (whisper && whisper.confidence >= WHISPER_MANUAL_CONFIDENCE) {
        setDelay(whisper.offset);
        flashIndicator();
        const key = captionKey(selectedCaption?.id, srtData?.length);
        if (key) autoSyncedKeys.add(key);
        return whisper;
      }
      const vad = vadEstimate();
      if (vad && vad.confidence >= VAD_MANUAL_CONFIDENCE) {
        setDelay(vad.offset);
        flashIndicator();
        const key = captionKey(selectedCaption?.id, srtData?.length);
        if (key) autoSyncedKeys.add(key);
        return vad;
      }
      return whisper ?? vad ?? null;
    } finally {
      inFlight.current = false;
      setIsSyncing(false);
    }
  }, [
    enabled,
    runWhisper,
    vadEstimate,
    setDelay,
    flashIndicator,
    selectedCaption?.id,
    srtData?.length,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const key = captionKey(selectedCaption?.id, srtData?.length);
    if (!key || cues.length === 0 || !display) return;
    if (autoSyncedKeys.has(key)) return;

    const hasEnoughAudio = (): boolean => {
      if (!display.getAudioWindow) return !!display.isAudioSyncAvailable?.();
      const w = display.getAudioWindow(8);
      return !!w && w.pcm.length >= w.sampleRate * 6;
    };

    let attempts = 0;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > MAX_AUTO_ATTEMPTS || autoSyncedKeys.has(key)) return;
      if (!hasEnoughAudio()) return;
      if (inFlight.current) return;

      inFlight.current = true;
      setIsSyncing(true);
      try {
        const whisper = await runWhisper();
        if (whisper && whisper.confidence >= WHISPER_AUTO_CONFIDENCE) {
          autoSyncedKeys.add(key);
          setDelay(whisper.offset);
          flashIndicator();
          return;
        }
        const vad = vadEstimate();
        if (vad && vad.confidence >= VAD_AUTO_CONFIDENCE) {
          autoSyncedKeys.add(key);
          setDelay(vad.offset);
          flashIndicator();
        }
      } finally {
        inFlight.current = false;
        setIsSyncing(false);
      }
    };

    const interval = setInterval(tick, POLL_MS);
    tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    selectedCaption?.id,
    srtData?.length,
    cues.length,
    display,
    runWhisper,
    vadEstimate,
    setDelay,
    flashIndicator,
    enabled,
  ]);

  useEffect(() => {
    return () => {
      if (indicatorTimeout.current) clearTimeout(indicatorTimeout.current);
    };
  }, []);

  const isAvailable = enabled && !!display;

  return { autoSync, isSyncing, isAvailable };
}
