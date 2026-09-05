import { ReactNode, RefObject, useEffect, useRef } from "react";

import { OverlayDisplay } from "@/components/overlays/OverlayDisplay";
import { AutoSkipSegments } from "@/components/player/internals/AutoSkipSegments";
import { SkipTracker } from "@/components/player/internals/Backend/SkipTracker";
import { GamepadEvents } from "@/components/player/internals/GamepadEvents";
import { HeadUpdater } from "@/components/player/internals/HeadUpdater";
import { KeyboardEvents } from "@/components/player/internals/KeyboardEvents";
import { MediaSession } from "@/components/player/internals/MediaSession";
import { MetaReporter } from "@/components/player/internals/MetaReporter";
import { ProgressSaver } from "@/components/player/internals/ProgressSaver";
import { ThumbnailScraper } from "@/components/player/internals/ThumbnailScraper";
import { VideoClickTarget } from "@/components/player/internals/VideoClickTarget";
import { VideoContainer } from "@/components/player/internals/VideoContainer";
import { WatchPartyResetter } from "@/components/player/internals/WatchPartyResetter";
import { PlayerHoverState } from "@/stores/player/slices/interface";
import { usePlayerStore } from "@/stores/player/store";

import { WatchPartyEngine } from "../internals/Backend/WatchPartyEngine";
import { WatchPartyReporter } from "../internals/Backend/WatchPartyReporter";

export interface PlayerProps {
  children?: ReactNode;
  showingControls: boolean;
  onLoad?: () => void;
}

function useHovering(containerEl: RefObject<HTMLDivElement>) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateInterfaceHovering = usePlayerStore(
    (s) => s.updateInterfaceHovering,
  );
  const hovering = usePlayerStore((s) => s.interface.hovering);

  useEffect(() => {
    if (!containerEl.current) return;
    const el = containerEl.current;

    function pointerMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      updateInterfaceHovering(PlayerHoverState.MOUSE_HOVER);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        updateInterfaceHovering(PlayerHoverState.NOT_HOVERING);
        timeoutRef.current = null;
      }, 3000);
    }

    function pointerLeave(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      updateInterfaceHovering(PlayerHoverState.NOT_HOVERING);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }

    el.addEventListener("pointermove", pointerMove);
    el.addEventListener("pointerleave", pointerLeave);

    return () => {
      el.removeEventListener("pointermove", pointerMove);
      el.removeEventListener("pointerleave", pointerLeave);
    };
  }, [containerEl, hovering, updateInterfaceHovering]);
}

function BaseContainer(props: { children?: ReactNode }) {
  const containerEl = useRef<HTMLDivElement | null>(null);
  const display = usePlayerStore((s) => s.display);
  useHovering(containerEl);

  // report container element to display interface
  useEffect(() => {
    if (display && containerEl.current) {
      display.processContainerElement(containerEl.current);
    }
  }, [display, containerEl]);

  return (
    <div ref={containerEl}>
      <OverlayDisplay>
        <div className="h-screen select-none">{props.children}</div>
      </OverlayDisplay>
    </div>
  );
}

export function Container(props: PlayerProps) {
  const isFullscreen = usePlayerStore((s) => s.interface.isFullscreen);
  const propRef = useRef(props.onLoad);
  useEffect(() => {
    propRef.current?.();
  }, []);

  // Auto-rotation for mobile fullscreen (ported from the legacy NEXUS player):
  // entering fullscreen on a phone locks landscape; leaving unlocks.
  useEffect(() => {
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) || window.innerWidth <= 768;

    if (isMobile && isFullscreen) {
      if (
        window.screen.orientation &&
        (window.screen.orientation as unknown as {
          lock: (o: string) => Promise<void>;
        }).lock
      ) {
        (window.screen.orientation as unknown as {
          lock: (o: string) => Promise<void>;
        })
          .lock("landscape")
          .catch((err: unknown) => {
            console.error("Failed to lock orientation:", err);
          });
      }
    } else if (isMobile && !isFullscreen) {
      if (
        window.screen.orientation &&
        (window.screen.orientation as unknown as { unlock: () => void }).unlock
      ) {
        window.screen.orientation.unlock();
      }
    }
  }, [isFullscreen]);

  return (
    <div className="relative">
      <BaseContainer>
        <MetaReporter />
        <ThumbnailScraper />
        <VideoContainer />
        <ProgressSaver />
        <KeyboardEvents />
        <GamepadEvents />
        <MediaSession />
        <WatchPartyEngine />
        <WatchPartyReporter />
        <SkipTracker />
        <WatchPartyResetter />
        <AutoSkipSegments />
        <div className="relative h-screen overflow-hidden">
          <VideoClickTarget showingControls={props.showingControls} />
          <HeadUpdater />
          {props.children}
        </div>
      </BaseContainer>
    </div>
  );
}
