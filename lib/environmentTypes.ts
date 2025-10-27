export type TimeOfDayBand = 'night' | 'dawn' | 'day' | 'dusk';
export type MoonPhaseBand = 'new' | 'waxing' | 'full' | 'waning';
export type PressureBand = 'low' | 'mid' | 'high';

export type EnvironmentBands = {
  timeOfDay: TimeOfDayBand;
  moonPhase: MoonPhaseBand;
  pressure: PressureBand;
};

export type EnvironmentSnapshot = {
  captureUtc: string;
  normalizedCaptureUtc: string;
  timezone: string;
  utcOffsetMinutes: number;
  localHour: number;
  timeOfDayBand: TimeOfDayBand;
  moonPhase: number | null;
  moonIllumination: number | null;
  moonPhaseBand: MoonPhaseBand;
  surfacePressure: number | null;
  pressureTrend: 'rising' | 'falling' | 'steady' | null;
  pressureBand: PressureBand;
  computedAtUtc: string;
  source: string;
};
