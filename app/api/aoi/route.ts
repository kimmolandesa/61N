import { NextRequest, NextResponse } from "next/server";
import { createAoiSelection, validateBounds, validatePolygon } from "@/lib/aoi/utils";
import type { AoiBounds, AoiGeometry, AoiInputMode, AoiSelection } from "@/lib/aoi/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBounds(value: unknown): value is AoiBounds {
  if (!isObject(value)) {
    return false;
  }

  return validateBounds({
    west: value.west as number,
    south: value.south as number,
    east: value.east as number,
    north: value.north as number,
  });
}

function isPolygonGeometry(value: unknown): value is AoiGeometry {
  if (!isObject(value)) {
    return false;
  }

  return validatePolygon({
    type: value.type as "Polygon",
    coordinates: value.coordinates as number[][][],
  });
}

function isMode(value: unknown): value is AoiInputMode {
  return value === "polygon" || value === "bbox" || value === "manual";
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AoiSelection | { error: string }>> {
  try {
    const body = (await request.json()) as {
      mode?: unknown;
      name?: unknown;
      bounds?: unknown;
      geometry?: unknown;
    };

    if (!isMode(body.mode)) {
      return NextResponse.json({ error: "Invalid AOI mode." }, { status: 400 });
    }

    const name = isString(body.name) ? body.name : undefined;

    if ((body.mode === "bbox" || body.mode === "manual") && isBounds(body.bounds)) {
      const selection = createAoiSelection({
        mode: body.mode,
        bounds: body.bounds,
        name,
      });

      return NextResponse.json(selection);
    }

    if (body.mode === "polygon" && isPolygonGeometry(body.geometry)) {
      const selection = createAoiSelection({
        mode: body.mode,
        geometry: body.geometry,
        name,
      });

      return NextResponse.json(selection);
    }

    return NextResponse.json({ error: "Invalid AOI payload." }, { status: 400 });
  } catch (error) {
    console.error("AOI API error:", error);

    return NextResponse.json(
      {
        error: "Unable to process AOI selection.",
      },
      { status: 500 },
    );
  }
}

// TODO: fan out the normalized AOI into area scraping/fetching pipelines for weather,
// terrain, infrastructure, telecom, population, and satellite intelligence sources.
