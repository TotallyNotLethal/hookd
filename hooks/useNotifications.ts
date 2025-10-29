'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Notification,
  clearNotifications as clearNotificationsInFirestore,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToNotifications,
} from '@/lib/firestore';

export type UseNotificationsResult = {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  clearNotifications: () => Promise<void>;
};

export function useNotifications(uid: string | null | undefined): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToNotifications(uid, (items) => {
      setNotifications(items);
      setIsLoading(false);
    }, {
      onError: () => {
        setIsLoading(false);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [uid]);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, notification) => (notification.isRead ? acc : acc + 1), 0),
    [notifications],
  );

  const handleMarkNotificationAsRead = useCallback(async (notificationId: string) => {
    if (!uid || !notificationId) return;
    try {
      await markNotificationAsRead(uid, notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  }, [uid]);

  const handleMarkAllNotificationsAsRead = useCallback(async () => {
    if (!uid) return;
    try {
      await markAllNotificationsAsRead(uid);
    } catch (error) {
      console.error('Failed to mark notifications as read', error);
    }
  }, [uid]);

  const handleClearNotifications = useCallback(async () => {
    if (!uid) return;
    try {
      await clearNotificationsInFirestore(uid);
      setNotifications([]);
    } catch (error) {
      console.error('Failed to clear notifications', error);
    }
  }, [uid]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markNotificationAsRead: handleMarkNotificationAsRead,
    markAllNotificationsAsRead: handleMarkAllNotificationsAsRead,
    clearNotifications: handleClearNotifications,
  };
}
