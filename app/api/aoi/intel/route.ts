import { NextRequest, NextResponse } from "next/server";
import { fetchAreaIntel } from "@/lib/aoi/fetchAreaIntel";
import type { AreaIntelReport } from "@/lib/aoi/intel";
import type { AoiSelection } from "@/lib/aoi/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAoiSelection(value: unknown): value is AoiSelection {
  if (!isObject(value)) {
    return false;
  }

  const candidate = value as Partial<AoiSelection>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.notes === "string" &&
    Array.isArray(candidate.comments) &&
    typeof candidate.shapeType === "string" &&
    Array.isArray(candidate.selectedFilters) &&
    isObject(candidate.bounds) &&
    typeof candidate.bounds.west === "number" &&
    typeof candidate.bounds.south === "number" &&
    typeof candidate.bounds.east === "number" &&
    typeof candidate.bounds.north === "number" &&
    isObject(candidate.geometry) &&
    (candidate.geometry.type === "Polygon" || candidate.geometry.type === "MultiPolygon") &&
    Array.isArray(candidate.geometry.coordinates)
  );
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AreaIntelReport | { error: string }>> {
  try {
    const body = (await request.json()) as { aoi?: unknown };

    if (!isAoiSelection(body.aoi)) {
      return NextResponse.json({ error: "Invalid AOI payload." }, { status: 400 });
    }

    const report = await fetchAreaIntel(body.aoi);
    return NextResponse.json(report);
  } catch (error) {
    console.error("AOI intel API error:", error);
    return NextResponse.json(
      { error: "Unable to fetch area intelligence." },
      { status: 500 },
    );
  }
}
