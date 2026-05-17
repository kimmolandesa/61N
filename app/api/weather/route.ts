import { NextRequest, NextResponse } from "next/server";
import { resolveLocation } from "@/lib/geo";
import { buildWeatherOverlayFeature } from "@/lib/intel/weather";
import type { GeoResult } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface WeatherApiResponse {
  location: GeoResult;
  features: IntelFeature[];
}

function normalizeWeatherQuery(query: string): string {
  return query
    .trim()
    .replace(/^\s*weather\s+(?:in\s+)?/i, "")
    .replace(/^\s*forecast\s+(?:for\s+)?/i, "")
    .trim();
}

async function fetchForecast(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "temperature_2m,precipitation,cloud_cover",
    forecast_hours: "12",
    timezone: "UTC",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Weather upstream failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation?: number[];
      cloud_cover?: number[];
    };
  };

  const times = data.hourly?.time ?? [];
  const temperatures = data.hourly?.temperature_2m ?? [];
  const precipitation = data.hourly?.precipitation ?? [];
  const cloudCover = data.hourly?.cloud_cover ?? [];

  return times.map((time, index) => ({
    time,
    temperatureC: typeof temperatures[index] === "number" ? temperatures[index] : null,
    precipitationMm: typeof precipitation[index] === "number" ? precipitation[index] : null,
    cloudCoverPct: typeof cloudCover[index] === "number" ? cloudCover[index] : null,
  }));
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<WeatherApiResponse | { error: string; code: string }>> {
  try {
    const body = await request.json();
    const query = body.query;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query parameter is required", code: "MISSING_QUERY" },
        { status: 400 },
      );
    }

    const normalizedQuery = normalizeWeatherQuery(query);
    const location = await resolveLocation(normalizedQuery);

    if (!location) {
      return NextResponse.json(
        { error: `Could not resolve location: ${query}`, code: "LOCATION_NOT_FOUND" },
        { status: 400 },
      );
    }

    const entries = await fetchForecast(location.lat, location.lon);
    const feature = buildWeatherOverlayFeature({
      location,
      locationName: location.addressComponents.city ?? location.displayName.split(",")[0]?.trim(),
      entries,
    });

    return NextResponse.json({
      location,
      features: feature ? [feature] : [],
    });
  } catch (error) {
    console.error("Weather error:", error);
    return NextResponse.json(
      { error: "Failed to load weather forecast.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
