"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getOfflineQueueState,
  subscribeOfflineQueue,
  syncQueuedForecastRequests,
} from "@/lib/offlineStorage";

type OfflineStatus = {
  online: boolean;
  catchQueue: number;
  forecastQueue: number;
};

export function useOfflineStatus(): OfflineStatus {
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queueCounts, setQueueCounts] = useState<{ catchQueue: number; forecastQueue: number }>({
    catchQueue: 0,
    forecastQueue: 0,
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getOfflineQueueState().then((state) => {
      if (cancelled) return;
      setQueueCounts({ catchQueue: state.catchCount, forecastQueue: state.forecastCount });
    });
    const unsubscribe = subscribeOfflineQueue((state) => {
      if (cancelled) return;
      setQueueCounts({ catchQueue: state.catchCount, forecastQueue: state.forecastCount });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    void syncQueuedForecastRequests();
  }, [online]);

  return useMemo(
    () => ({
      online,
      catchQueue: queueCounts.catchQueue,
      forecastQueue: queueCounts.forecastQueue,
    }),
    [online, queueCounts.catchQueue, queueCounts.forecastQueue],
  );
}
