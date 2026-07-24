// useNotifications.ts
// NEXUS — React hook for the notification system

import { useEffect, useCallback } from "react";
import {
  useNotificationStore,
  selectUnreadCount,
  selectNotifications,
  initNotifications,
  type NexusNotification,
} from "@/utils/notifications";

interface UseNotificationsReturn {
  notifications: NexusNotification[];
  unreadCount: number;
  hasUnread: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const store = useNotificationStore();
  const notifications = selectNotifications(store);
  const unreadCount = selectUnreadCount(store);

  const markRead = useCallback(
    (id: string) => store.markRead(id),
    [store],
  );

  const markAllRead = useCallback(() => store.markAllRead(), [store]);
  const dismiss = useCallback((id: string) => store.dismiss(id), [store]);
  const dismissAll = useCallback(() => store.dismissAll(), [store]);

  return {
    notifications,
    unreadCount,
    hasUnread: unreadCount > 0,
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
  };
}

// Hook that initializes notifications (call in App root)
export function useNotificationInit(): void {
  useEffect(() => {
    const cleanup = initNotifications();
    return cleanup;
  }, []);
}
