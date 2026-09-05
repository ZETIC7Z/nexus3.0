// notifications.ts
// NEXUS — Notification System
// Provides:
//   - In-app toast notifications
//   - Auto-update detection (new version available)
//   - Provider status updates
//   - New content announcements
// Mirrors the NEXUS notification pattern but branded for NEXUS

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | "update"       // New NEXUS version available
  | "provider"     // Provider status change
  | "content"      // New content added
  | "info"         // General announcement
  | "error"        // Error notification
  | "success";     // Success feedback

export interface NexusNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: number;
  read: boolean;
  /** Optional URL to open when notification is clicked */
  actionUrl?: string;
  /** Version string for update notifications */
  version?: string;
  /** Auto-dismiss after N ms (0 = never) */
  autoDismissMs?: number;
}

// ---------------------------------------------------------------------------
// Update feed — checked against GitHub releases
// ---------------------------------------------------------------------------

const NEXUS_RELEASES_URL =
  "https://api.github.com/repos/ZETIC7Z/nexus3.0/releases/latest";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Every 6 hours

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

interface NotificationState {
  notifications: NexusNotification[];
  lastUpdateCheck: number;
  lastSeenVersion: string;
  // Actions
  addNotification: (notif: Omit<NexusNotification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  setLastUpdateCheck: (ts: number) => void;
  setLastSeenVersion: (v: string) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    immer((set) => ({
      notifications: [],
      lastUpdateCheck: 0,
      lastSeenVersion: "",

      addNotification(notif) {
        set((state) => {
          // Auto-delete: drop anything older than 30 days while we're here.
          pruneOld(state);
          // Avoid duplicate notifications of the same type+version
          const isDuplicate = state.notifications.some(
            (n) =>
              n.type === notif.type &&
              n.version === notif.version &&
              !n.read,
          );
          if (isDuplicate) return;

          const newNotif: NexusNotification = {
            id: `nexus-notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            read: false,
            ...notif,
          };
          state.notifications.unshift(newNotif);
          // Keep max 50 notifications
          if (state.notifications.length > 50) {
            state.notifications = state.notifications.slice(0, 50);
          }
        });
      },

      markRead(id) {
        set((state) => {
          const n = state.notifications.find((x) => x.id === id);
          if (n) n.read = true;
        });
      },

      markAllRead() {
        set((state) => {
          state.notifications.forEach((n) => {
            n.read = true;
          });
        });
      },

      dismiss(id) {
        set((state) => {
          state.notifications = state.notifications.filter((n) => n.id !== id);
        });
      },

      dismissAll() {
        set((state) => {
          state.notifications = [];
        });
      },

      setLastUpdateCheck(ts) {
        set((state) => {
          state.lastUpdateCheck = ts;
        });
      },

      setLastSeenVersion(v) {
        set((state) => {
          state.lastSeenVersion = v;
        });
      },
    })),
    {
      name: "nexus-notifications",
      version: 1,
    },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectUnreadCount(state: NotificationState): number {
  return state.notifications.filter((n) => !n.read).length;
}

export function selectNotifications(state: NotificationState): NexusNotification[] {
  return [...state.notifications].sort((a, b) => b.timestamp - a.timestamp);
}

// ---------------------------------------------------------------------------
// 30-day auto-delete — notifications expire one month after their timestamp
// ---------------------------------------------------------------------------

const NOTIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Remove notifications older than 30 days (runs on boot + on every add). */
export function pruneOldNotifications(): void {
  useNotificationStore.setState((state) => {
    const cutoff = Date.now() - NOTIFICATION_MAX_AGE_MS;
    const kept = state.notifications.filter((n) => n.timestamp >= cutoff);
    if (kept.length === state.notifications.length) return state;
    return { ...state, notifications: kept };
  });
}

/** Immer-friendly in-place prune used inside store actions. */
function pruneOld(state: { notifications: NexusNotification[] }): void {
  const cutoff = Date.now() - NOTIFICATION_MAX_AGE_MS;
  if (state.notifications.some((n) => n.timestamp < cutoff)) {
    state.notifications = state.notifications.filter(
      (n) => n.timestamp >= cutoff,
    );
  }
}

// ---------------------------------------------------------------------------
// Update checker — auto-generates notifications when new NEXUS version found
// ---------------------------------------------------------------------------

function parseVersion(tag: string): number[] {
  return tag
    .replace(/^v/, "")
    .split(".")
    .map((p) => parseInt(p.replace(/\D/g, ""), 10) || 0);
}

function isNewerVersion(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] ?? 0;
    const cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export async function checkForUpdates(): Promise<void> {
  const store = useNotificationStore.getState();
  const now = Date.now();

  // Throttle checks
  if (now - store.lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
  store.setLastUpdateCheck(now);

  const currentVersion: string =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "0.0.0";

  try {
    const res = await fetch(NEXUS_RELEASES_URL, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return;

    const release = (await res.json()) as GitHubRelease;
    const latestVersion = release.tag_name;

    if (
      isNewerVersion(latestVersion, currentVersion) &&
      latestVersion !== store.lastSeenVersion
    ) {
      store.setLastSeenVersion(latestVersion);
      store.addNotification({
        type: "update",
        title: `NEXUS ${latestVersion} Available`,
        description: release.name || `A new version of NEXUS is ready. Update now for the latest features and fixes.`,
        actionUrl: release.html_url,
        version: latestVersion,
        autoDismissMs: 0,
      });
    }
  } catch {
    // Silently fail — non-critical
  }
}

// ---------------------------------------------------------------------------
// Predefined notification helpers
// ---------------------------------------------------------------------------

export function notifyProviderDown(providerName: string): void {
  const store = useNotificationStore.getState();
  store.addNotification({
    type: "provider",
    title: `${providerName} Unavailable`,
    description: `The ${providerName} provider is temporarily down. NEXUS is switching to a backup source automatically.`,
    autoDismissMs: 8000,
  });
}

export function notifyProviderRestored(providerName: string): void {
  const store = useNotificationStore.getState();
  store.addNotification({
    type: "success",
    title: `${providerName} Restored`,
    description: `${providerName} is back online and available as a streaming source.`,
    autoDismissMs: 5000,
  });
}

export function notifyStreamError(message: string): void {
  const store = useNotificationStore.getState();
  store.addNotification({
    type: "error",
    title: "Stream Error",
    description: message,
    autoDismissMs: 7000,
  });
}

export function notifyInfo(title: string, description: string, actionUrl?: string): void {
  const store = useNotificationStore.getState();
  store.addNotification({
    type: "info",
    title,
    description,
    actionUrl,
    autoDismissMs: 0,
  });
}

// ---------------------------------------------------------------------------
// v3.0 Changelog — auto-posted on first launch after update
// ---------------------------------------------------------------------------

const V3_CHANGELOG_VERSION = "3.2.1";

/** Format the current time in Philippine Standard Time (UTC+8). */
export function formatPHTime(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function announceV3Changelog(): void {
  const store = useNotificationStore.getState();
  if (store.lastSeenVersion === V3_CHANGELOG_VERSION) return;
  store.setLastSeenVersion(V3_CHANGELOG_VERSION);

  const phNow = formatPHTime();

  store.addNotification({
    type: "info",
    title: `🚫 NEXUS 3.2.1 — You can now turn ads off (${phNow})`,
    description:
      "What's new:\n" +
      "• 🚫 The \"Disable advertisements\" switch in Settings → Preferences now actually hides all ads: homepage banners, primary banner card, bookmarks/secondary slots, and the popunder\n" +
      "• 🔇 With ads off, no ad script loads at all — lighter pages, quieter browsing\n" +
      "• 💔 Turning ads off asks once for confirmation (ads pay for the servers); turning them back on is instant\n" +
      "• 🧹 No ad surfaces configured? The switch hides itself — no dead settings\n" +
      `Released: ${phNow}`,
    version: V3_CHANGELOG_VERSION,
    autoDismissMs: 0,
  });
}

// ---------------------------------------------------------------------------
// Bootstrap — call this once in your app root
// ---------------------------------------------------------------------------

export function initNotifications(): () => void {
  // Auto-delete expired notifications (older than 30 days) on boot.
  pruneOldNotifications();

  // Initial check
  void checkForUpdates();

  // Periodic checks
  const interval = setInterval(() => {
    void checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);

  // Cleanup
  return () => clearInterval(interval);
}
