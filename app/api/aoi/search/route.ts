import { NextRequest, NextResponse } from "next/server";
import { parseQuery } from "@/lib/parser";
import {
  buildMultiTypeQuery,
  buildOverpassQuery,
  calculateStats,
  executeQuery,
} from "@/lib/overpass";
import { filterAssetsToAoi } from "@/lib/aoi/search";
import { validateGeometry } from "@/lib/aoi/utils";
import type { SearchError, SearchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function isBbox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function toSearchBbox(
  bbox: [number, number, number, number],
): [number, number, number, number] {
  return [bbox[1], bbox[3], bbox[0], bbox[2]];
}

function isGeometry(
  value: unknown,
): value is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (!value || typeof value !== "object" || !("type" in value) || !("coordinates" in value)) {
    return false;
  }

  const candidate = value as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  return validateGeometry(candidate);
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<SearchResult | SearchError>> {
  try {
    const body = (await request.json()) as {
      aoiId?: unknown;
      query?: unknown;
      bbox?: unknown;
      geometry?: unknown;
    };

    if (typeof body.aoiId !== "string") {
      return NextResponse.json(
        { error: "AOI id is required", code: "MISSING_AOI_ID" },
        { status: 400 },
      );
    }

    if (typeof body.query !== "string" || body.query.trim().length === 0) {
      return NextResponse.json(
        { error: "Query parameter is required", code: "MISSING_QUERY" },
        { status: 400 },
      );
    }

    if (!isBbox(body.bbox)) {
      return NextResponse.json(
        { error: "Bounding box is required", code: "MISSING_BBOX" },
        { status: 400 },
      );
    }

    if (!isGeometry(body.geometry)) {
      return NextResponse.json(
        { error: "AOI geometry is required", code: "MISSING_GEOMETRY" },
        { status: 400 },
      );
    }

    const parsed = parseQuery(body.query);
    if (!parsed.type && !parsed.operator) {
      return NextResponse.json(
        {
          error: "Query must specify an asset type or operator.",
          code: "INVALID_QUERY",
        },
        { status: 400 },
      );
    }

    const bbox = body.bbox;
    const searchBbox = toSearchBbox(bbox);
    const overpassQuery = parsed.type
      ? buildOverpassQuery(parsed.type, searchBbox, parsed.operator, null)
      : buildMultiTypeQuery(searchBbox, parsed.operator!, null);

    const rawAssets = await executeQuery(overpassQuery);
    const assets = filterAssetsToAoi(rawAssets, body.geometry);
    const stats = calculateStats(assets);

    return NextResponse.json({
      results: assets,
      stats,
      bounds: searchBbox,
      query: {
        ...parsed,
        region: null,
        near: null,
        country: null,
      },
    });
  } catch (error) {
    console.error("AOI search error:", error);
    return NextResponse.json(
      { error: "Unable to search the selected area", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
