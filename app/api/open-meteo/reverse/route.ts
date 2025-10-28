import { NextResponse } from "next/server";

import { TtlCache } from "@/lib/server/ttlCache";

const OPEN_METEO_REVERSE_URL = "https://geocoding-api.open-meteo.com/v1/reverse";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

const reverseGeocodeCache = new TtlCache<{ status: number; data: unknown }>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const upstreamUrl = new URL(OPEN_METEO_REVERSE_URL);

    requestUrl.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.append(key, value);
    });

    const cacheKey = upstreamUrl.toString();
    const cached = reverseGeocodeCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached.data, {
        status: cached.status,
        headers: CORS_HEADERS,
      });
    }

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    const data = await upstreamResponse.json();

    if (upstreamResponse.ok) {
      reverseGeocodeCache.set(cacheKey, {
        status: upstreamResponse.status,
        data,
      });

      return NextResponse.json(data, {
        status: upstreamResponse.status,
        headers: CORS_HEADERS,
      });
    }

    console.warn(
      "Open-Meteo reverse geocoding upstream error",
      upstreamResponse.status,
      data,
    );

    return NextResponse.json(
      {
        error: "Reverse geocoding unavailable.",
        results: [],
        meta: { upstreamStatus: upstreamResponse.status },
      },
      {
        status: 200,
        headers: CORS_HEADERS,
      },
    );
  } catch (error) {
    console.error("Open-Meteo reverse geocoding proxy error", error);
    return NextResponse.json(
      {
        error: "Unable to complete reverse geocoding request.",
        results: [],
      },
      {
        status: 200,
        headers: CORS_HEADERS,
      },
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
