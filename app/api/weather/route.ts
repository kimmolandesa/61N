import { NextRequest, NextResponse } from "next/server";
import { getForecastByPlace } from "@/lib/intel/providers/fmi";
import { resolveLocation } from "@/lib/geo";
import { buildWeatherOverlayFeature, parseFmiForecastEntries } from "@/lib/intel/weather";
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

    const now = new Date();
    const end = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    const place =
      location.addressComponents.city ??
      location.displayName.split(",")[0]?.trim() ??
      normalizedQuery;

    const xml = await getForecastByPlace(place, {
      starttime: now.toISOString(),
      endtime: end.toISOString(),
      timestep: 60,
      parameters: "Temperature,TotalCloudCover,PrecipitationAmount",
    });

    const parsed = parseFmiForecastEntries(xml);
    const feature = buildWeatherOverlayFeature({
      location,
      locationName: parsed.locationName,
      entries: parsed.entries,
    });

    return NextResponse.json({
      location,
      features: feature ? [feature] : [],
    });
  } catch (error) {
    console.error("Weather error:", error);

    if (error instanceof Error) {
      if (error.message.includes("aborted") || error.message.includes("timeout")) {
        return NextResponse.json(
          { error: "Weather request timed out.", code: "TIMEOUT" },
          { status: 504 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to load weather forecast.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
