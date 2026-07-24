import { useCallback, useState } from "react";

import { Icon, Icons } from "@/components/Icon";
import { buildTasteProfile } from "@/pages/discover/lib/personalRecommendations";
import { useRatingsStore } from "@/stores/ratings";

function clearCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name) continue;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
  }
}

interface DebugAction {
  label: string;
  run: () => void;
}

/** Floating debug panel, dev builds only: cookie/ratings/local-data resets. */
export function DebugFab() {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 2000);
  }, []);

  const actions: DebugAction[] = [
    {
      label: "Clear cookies",
      run: () => {
        clearCookies();
        flash("Cookies cleared");
      },
    },
    {
      label: "Reset ratings (algorithm)",
      run: () => {
        useRatingsStore.getState().clear();
        flash("Ratings reset");
      },
    },
    {
      label: "Log taste profile",
      run: () => {
        const { ratings } = useRatingsStore.getState();
        const sources = Object.entries(ratings).map(([tmdbId, r]) => ({
          tmdbId,
          type: r.type,
          rating: r.rating,
          genreIds: r.genreIds,
          ratedAt: r.ratedAt,
        }));
        // eslint-disable-next-line no-console
        console.log("[debug] ratings:", ratings);
        // eslint-disable-next-line no-console
        console.log(
          "[debug] taste profile (genreId -> weight):",
          Object.fromEntries(buildTasteProfile(sources)),
        );
        flash("Logged to console");
      },
    },
    {
      label: "Clear ALL local data + reload",
      run: () => {
        clearCookies();
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.location.reload();
      },
    },
  ];

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
      {feedback && (
        <div className="rounded-lg bg-black/80 px-3 py-2 text-xs text-white shadow-lg">
          {feedback}
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-1 rounded-lg bg-black/80 p-2 shadow-lg backdrop-blur-sm">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.run}
              className="rounded px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/20"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        title="Debug tools"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition-transform hover:scale-110"
      >
        <Icon icon={Icons.GEAR} />
      </button>
    </div>
  );
}
