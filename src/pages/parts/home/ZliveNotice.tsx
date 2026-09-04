import { useCallback, useEffect, useState } from "react";

import { Icon, Icons } from "@/components/Icon";
import { useTipJar } from "@/components/overlays/tipJarModal";
import { NoticePopup } from "@/components/popupShell/NoticePopup";

const STORAGE_KEY = "nexus::maintenance-notice-dismissed";

type Phase = "waiting" | "queued" | "done";

/**
 * Popup 1 of the shared top-center popup slot. Shows the "Platform Updates &
 * Support" notice, auto-closes after 3.5s (fade out), then hands the slot to
 * the update popup. The Tip Jar button opens the donation modal; only the
 * manual X dismisses it permanently.
 */
export function ZliveNotice() {
  const { openTipJar } = useTipJar();
  const [phase, setPhase] = useState<Phase>("waiting");

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    // Small delay so the page settles before popup 1 slides in.
    const t = setTimeout(() => setPhase("queued"), 1300);
    return () => clearTimeout(t);
  }, []);

  const dismissPermanently = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
  }, [phase]);

  if (phase !== "queued") return null;

  return (
    <NoticePopup
      id="maintenance"
      wantsStage
      onClosed={() => setPhase("done")}
      className="bg-[#12141c]/85"
    >
      {({ close }) => (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(251,113,36,0.18),transparent_70%)]" />

          <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fb7124] to-[#e0501a] text-white shadow-soft-sm">
            <span className="absolute inset-0 rounded-xl bg-[#fb7124]/40 animate-ping" />
            <Icon icon={Icons.PLAY} className="relative text-lg" />
          </div>

          <div className="relative min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[13px] font-semibold leading-tight text-white">
                Platform Updates &amp; Support
              </p>
              <span className="rounded-full bg-white/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white/50">
                NEXUS
              </span>
            </div>
            <p className="text-[11px] leading-snug text-white/65">
              We've integrated new providers! Please support our hosting
              expenses to keep this platform running maintained and ad-free.
              Any amount is welcome. — [DEV] ZETICUZ
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              close();
              openTipJar();
            }}
            className="relative flex-shrink-0 rounded-lg bg-[#fb7124] px-3 py-1.5 text-xs font-bold text-white transition-[background-color,transform] duration-150 ease-spring hover:-translate-y-0.5 hover:bg-[#e0501a] active:translate-y-0"
          >
            Tip Jar
          </button>

          <button
            type="button"
            onClick={() => {
              dismissPermanently();
              close();
            }}
            aria-label="Dismiss"
            className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors duration-150 hover:bg-white/5 hover:text-white/80"
          >
            <Icon icon={Icons.X} className="text-base" />
          </button>
        </>
      )}
    </NoticePopup>
  );
}
