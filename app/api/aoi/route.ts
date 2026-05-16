import { NextRequest, NextResponse } from "next/server";
import { createAoiSelection, validateBounds, validateGeometry } from "@/lib/aoi/utils";
import type { AoiBounds, AoiSelection, AoiShapeType } from "@/lib/aoi/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function isGeometry(value: unknown): value is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (!isObject(value) || !("type" in value) || !("coordinates" in value)) {
    return false;
  }

  return validateGeometry(value as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon);
}

function isShapeType(value: unknown): value is AoiShapeType {
  return value === "polygon" || value === "rectangle" || value === "circle" || value === "freehand";
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AoiSelection | { error: string }>> {
  try {
    const body = (await request.json()) as {
      shapeType?: unknown;
      name?: unknown;
      notes?: unknown;
      bounds?: unknown;
      geometry?: unknown;
    };

    if (!isShapeType(body.shapeType)) {
      return NextResponse.json({ error: "Invalid AOI shape type." }, { status: 400 });
    }

    const geometry =
      isGeometry(body.geometry)
        ? body.geometry
        : isBounds(body.bounds)
          ? {
              type: "Polygon" as const,
              coordinates: [[
                [body.bounds.west, body.bounds.south],
                [body.bounds.east, body.bounds.south],
                [body.bounds.east, body.bounds.north],
                [body.bounds.west, body.bounds.north],
                [body.bounds.west, body.bounds.south],
              ]],
            }
          : null;

    if (!geometry) {
      return NextResponse.json({ error: "Invalid AOI payload." }, { status: 400 });
    }

    const selection = createAoiSelection({
      index: 1,
      geometry,
      shapeType: body.shapeType,
      name: typeof body.name === "string" ? body.name : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });

    return NextResponse.json(selection);
  } catch (error) {
    console.error("AOI API error:", error);
    return NextResponse.json({ error: "Unable to process AOI selection." }, { status: 500 });
  }
}
