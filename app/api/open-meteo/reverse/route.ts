import { NextResponse } from "next/server";

const OPEN_METEO_REVERSE_URL = "https://geocoding-api.open-meteo.com/v1/reverse";

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

    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    const data = await upstreamResponse.json();

    return new NextResponse(JSON.stringify(data), {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Open-Meteo reverse geocoding proxy error", error);
    return NextResponse.json(
      { error: "Unable to complete reverse geocoding request." },
      {
        status: 500,
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
