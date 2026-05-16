import { NextRequest, NextResponse } from "next/server";
import type { AoiDataFilter } from "@/lib/aoi/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_FILTERS: AoiDataFilter[] = [
  "terrain",
  "weather",
  "roads",
  "bridges",
  "population",
  "telecom",
  "satellite",
  "healthcare",
  "power",
  "water",
  "logistics",
];

function isBoundsTuple(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isGeometry(value: unknown): value is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return (
    !!value &&
    typeof value === "object" &&
    "type" in value &&
    (value.type === "Polygon" || value.type === "MultiPolygon") &&
    "coordinates" in value &&
    Array.isArray(value.coordinates)
  );
}

function isFilters(value: unknown): value is AoiDataFilter[] {
  return Array.isArray(value) && value.every((entry) => VALID_FILTERS.includes(entry as AoiDataFilter));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      aoiId?: unknown;
      geometry?: unknown;
      bbox?: unknown;
      filters?: unknown;
    };

    if (
      typeof body.aoiId !== "string" ||
      !isGeometry(body.geometry) ||
      !isBoundsTuple(body.bbox) ||
      !isFilters(body.filters)
    ) {
      return NextResponse.json({ error: "Invalid intel request payload." }, { status: 400 });
    }

    return NextResponse.json({
      aoiId: body.aoiId,
      requestedFilters: body.filters,
      bbox: body.bbox,
      message: "Selected data request accepted. Area-specific source fetching is the next backend step.",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Intel API error:", error);
    return NextResponse.json({ error: "Unable to process intel request." }, { status: 500 });
  }
}
