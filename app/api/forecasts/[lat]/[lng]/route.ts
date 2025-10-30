import { NextResponse } from "next/server";

import { getForecastBundle } from "@/lib/server/forecastService";

function parseCoordinate(value: string | undefined) {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < -180 || parsed > 180) return null;
  return parsed;
}

export async function GET(_request: Request, context: unknown) {
  const params =
    typeof context === "object" && context != null && "params" in context
      ? (context as { params: Record<string, string | undefined> }).params
      : {};
  const latitude = parseCoordinate(params.lat);
  const longitude = parseCoordinate(params.lng);
  if (latitude == null || longitude == null || Math.abs(latitude) > 90) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const payload = await getForecastBundle({ latitude, longitude });
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Failed to generate forecast", error);
    return NextResponse.json(
      {
        error: "Unable to load forecast data",
      },
      { status: 502 }
    );
  }
}
