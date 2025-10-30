export type ForecastWeatherHour = {
  timestamp: string;
  temperatureC: number | null;
  temperatureF: number | null;
  apparentTemperatureC: number | null;
  apparentTemperatureF: number | null;
  pressureHpa: number | null;
  windSpeedMph: number | null;
  windDirection: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  weatherSummary: string | null;
};

export type TideTrend = "rising" | "falling" | "slack";

export type TidePrediction = {
  timestamp: string;
  heightMeters: number;
  trend: TideTrend;
};

export type ForecastConfidence = "low" | "medium" | "high";

export type ForecastProviderStatus = "ok" | "partial" | "error";

export type BiteWindow = {
  start: string;
  end: string;
  label: string;
  score: 1 | 2 | 3 | 4 | 5;
  rationale: string;
};

export type ForecastSourceSummary = {
  id: string;
  label: string;
  url: string | null;
  disclaimer?: string;
  updatedAt?: string | null;
  confidence?: ForecastConfidence;
  status?: ForecastProviderStatus;
  error?: string | null;
};

export type ForecastTelemetryEvent = {
  providerId: string;
  message: string;
  at: string;
};

export type ForecastBundle = {
  version: string;
  updatedAt: string;
  location: {
    latitude: number;
    longitude: number;
    timezone: string;
    sunrise: string | null;
    sunset: string | null;
    moonPhaseFraction: number | null;
    moonPhaseLabel: string | null;
  };
  weather: {
    hours: ForecastWeatherHour[];
    source: ForecastSourceSummary;
  };
  tides: {
    predictions: TidePrediction[];
    source: ForecastSourceSummary;
    fallbackUsed: boolean;
  };
  biteWindows: {
    windows: BiteWindow[];
    basis: string;
    provider?: ForecastSourceSummary;
  };
  telemetry: {
    errors: ForecastTelemetryEvent[];
    warnings: ForecastTelemetryEvent[];
    providerLatencyMs: Record<string, number>;
    usedPrefetch: boolean;
  };
};
