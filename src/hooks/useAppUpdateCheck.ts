import { useEffect, useState } from "react";

const DISMISSED_KEY = "nexus::update-dismissed-version";
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}


export function useAppUpdateCheck() {
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const latest = await fetchLatestVersion();
      if (cancelled || !latest || latest === __BUILD_ID__) return;
      let dismissed = "";
      try {
        dismissed = localStorage.getItem(DISMISSED_KEY) ?? "";
      } catch {
        dismissed = "";
      }
      if (latest === dismissed) return;
      setNewVersion(latest);
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const dismiss = () => {
    if (newVersion) {
      try {
        localStorage.setItem(DISMISSED_KEY, newVersion);
      } catch {
        // ignore
      }
    }
    setNewVersion(null);
  };

  return { updateAvailable: newVersion !== null, dismiss };
}
