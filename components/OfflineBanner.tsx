"use client";

import { useEffect } from "react";

import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { queueForecastRequest, syncQueuedForecastRequests } from "@/lib/offlineStorage";

type OfflineBannerProps = {
  className?: string;
};

export default function OfflineBanner({ className }: OfflineBannerProps) {
  const { online, catchQueue, forecastQueue } = useOfflineStatus();

  useEffect(() => {
    if (!online) return;
    void syncQueuedForecastRequests();
  }, [online]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js");
        await registration.update();
        await navigator.serviceWorker.ready;
      } catch (error) {
        console.error("Service worker registration failed", error);
      }
    };

    void registerServiceWorker();
  }, []);

  if (online && catchQueue === 0 && forecastQueue === 0) {
    return null;
  }

  const message = online
    ? `Syncing offline work… ${catchQueue} catches, ${forecastQueue} forecasts remaining.`
    : catchQueue || forecastQueue
      ? `Offline: ${catchQueue} catch${catchQueue === 1 ? "" : "es"} and ${forecastQueue} forecast${
          forecastQueue === 1 ? "" : "s"
        } queued.`
      : "You are offline. Some features may be unavailable.";

  return (
    <aside
      className={`sticky top-0 z-50 w-full bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 backdrop-blur ${
        className ?? ""
      }`}
      role="status"
      aria-live="polite"
    >
      {message}
    </aside>
  );
}

export function useQueueForecast(latitude: number, longitude: number, label?: string | null) {
  const { online } = useOfflineStatus();
  useEffect(() => {
    if (online) return;
    void queueForecastRequest({ latitude, longitude, locationLabel: label ?? null });
  }, [latitude, longitude, label, online]);
}
