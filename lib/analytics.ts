export type AnalyticsPayload = Record<string, unknown>;

type AnalyticsStore = {
  event: string;
  payload?: AnalyticsPayload;
};

declare global {
  interface Window {
    __hookdAnalyticsEvents?: AnalyticsStore[];
    gtag?: (...args: unknown[]) => void;
    analytics?: { track?: (event: string, payload?: AnalyticsPayload) => void };
  }
}

export function trackForecastEvent(event: string, payload?: AnalyticsPayload) {
  if (typeof window === "undefined") return;
  const store = window.__hookdAnalyticsEvents ?? (window.__hookdAnalyticsEvents = []);
  store.push({ event, payload });
  if (typeof window.gtag === "function") {
    window.gtag("event", event, payload ?? {});
    return;
  }
  if (window.analytics?.track) {
    window.analytics.track(event, payload ?? {});
    return;
  }
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[analytics] ${event}` + (payload ? ` ${JSON.stringify(payload)}` : ""));
  }
}
