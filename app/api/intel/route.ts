import { NextRequest, NextResponse } from "next/server";
import type { AoiDataFilter } from "@/lib/aoi/types";
import type { SectionIntelResponse, SectionIntelSourceSummary } from "@/lib/aoi/sectionIntel";
import type { IntelFeature, IntelGeometry } from "@/lib/intel/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_BASE_URL = "https://api.kebabkartta.fi";

const VALID_FILTERS: AoiDataFilter[] = [
  "terrain",
  "weather",
  "infrastructure",
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

type GeoJsonFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  Record<string, unknown>
>;

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

function bboxToQuery(bbox: [number, number, number, number]): string {
  return `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
}

function isIntelGeometry(geometry: GeoJSON.Geometry): geometry is IntelGeometry {
  return (
    geometry.type === "Point" ||
    geometry.type === "LineString" ||
    geometry.type === "Polygon" ||
    geometry.type === "MultiPolygon" ||
    geometry.type === "MultiLineString"
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`${path} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizeFeatureCollection(args: {
  collection: GeoJsonFeatureCollection;
  source: string;
  category: IntelFeature["category"];
  idPrefix: string;
  defaultName: string;
  propertyMapper?: (properties: Record<string, unknown>) => Record<string, unknown>;
}): IntelFeature[] {
  return args.collection.features.flatMap((feature, index) => {
    if (!feature.geometry || !isIntelGeometry(feature.geometry)) {
      return [];
    }

    const properties = feature.properties ?? {};
    const nameCandidate = properties.name;

    return [
      {
        id: `${args.idPrefix}-${feature.id ?? properties.osm_id ?? index}`,
        name: typeof nameCandidate === "string" && nameCandidate.length > 0 ? nameCandidate : args.defaultName,
        source: args.source,
        category: args.category,
        geometry: feature.geometry,
        properties: args.propertyMapper ? args.propertyMapper(properties) : properties,
      },
    ];
  });
}

function summary(args: {
  sourceId: AoiDataFilter;
  label: string;
  status: "success" | "error";
  featureCount: number;
  message?: string;
}): SectionIntelSourceSummary {
  return args;
}

async function fetchWeather(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes: string[] }> {
  const query = bboxToQuery(bbox);
  const [current, impact] = await Promise.all([
    fetchJson<{
      observations?: Array<Record<string, unknown> & { station?: string; lat: number; lon: number }>;
    }>(`/api/weather/current?bbox=${query}`),
    fetchJson<Record<string, unknown>>(`/api/weather/impact?bbox=${query}`),
  ]);

  const features: IntelFeature[] = (current.observations ?? []).flatMap((item, index) => {
    if (typeof item.lon !== "number" || typeof item.lat !== "number") {
      return [];
    }

    return [
      {
        id: `weather-${index}`,
        name: typeof item.station === "string" ? item.station : "Weather observation",
        source: "weather",
        category: "weather",
        geometry: {
          type: "Point",
          coordinates: [item.lon, item.lat],
        },
        properties: {
          ...item,
          conditionLabel: "Current weather",
          forecast: [],
        },
      },
    ];
  });

  const reason = typeof impact.reason === "string" ? impact.reason : undefined;
  return {
    features,
    summary: summary({
      sourceId: "weather",
      label: "Weather",
      status: "success",
      featureCount: features.length,
      message: reason ?? "Weather observations and impact assessment loaded.",
    }),
    notes: reason ? [reason] : [],
  };
}

async function fetchTerrain(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(`/api/terrain/cover?bbox=${bboxToQuery(bbox)}`);
  const features = normalizeFeatureCollection({
    collection,
    source: "terrain",
    category: "terrain",
    idPrefix: "terrain",
    defaultName: "Terrain cell",
  });
  return {
    features,
    summary: summary({
      sourceId: "terrain",
      label: "Terrain",
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchFeatureLayer(args: {
  filter: AoiDataFilter;
  layer: "all" | "military" | "roads" | "water" | "buildings" | "infrastructure";
  bbox: [number, number, number, number];
  source: string;
  defaultName: string;
  propertyFilter?: (properties: Record<string, unknown>) => boolean;
}): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(
    `/api/features/bbox?minx=${args.bbox[0]}&miny=${args.bbox[1]}&maxx=${args.bbox[2]}&maxy=${args.bbox[3]}&layer=${args.layer}&limit=1000`,
  );

  const filteredCollection: GeoJsonFeatureCollection = {
    ...collection,
    features: args.propertyFilter
      ? collection.features.filter((feature) => args.propertyFilter?.(feature.properties ?? {}))
      : collection.features,
  };

  const features = normalizeFeatureCollection({
    collection: filteredCollection,
    source: args.source,
    category: "infrastructure",
    idPrefix: args.filter,
    defaultName: args.defaultName,
  });

  return {
    features,
    summary: summary({
      sourceId: args.filter,
      label: args.defaultName,
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchBridges(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(`/api/logistics/bridges?bbox=${bboxToQuery(bbox)}`);
  const features = normalizeFeatureCollection({
    collection,
    source: "bridges",
    category: "infrastructure",
    idPrefix: "bridges",
    defaultName: "Bridge",
  });
  return {
    features,
    summary: summary({
      sourceId: "bridges",
      label: "Bridges",
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchPopulation(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(`/api/intel/population?bbox=${bboxToQuery(bbox)}`);
  const features = normalizeFeatureCollection({
    collection,
    source: "population",
    category: "population",
    idPrefix: "population",
    defaultName: "Population cell",
  });
  return {
    features,
    summary: summary({
      sourceId: "population",
      label: "Population",
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchTelecom(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes: string[] }> {
  const data = await fetchJson<{
    towers?: GeoJsonFeatureCollection;
    coverage_grid?: GeoJsonFeatureCollection;
    summary?: string;
    dead_zone_ratio?: number;
  }>(`/api/intel/comms?bbox=${bboxToQuery(bbox)}`);

  const towerFeatures = data.towers
    ? normalizeFeatureCollection({
        collection: data.towers,
        source: "telecom",
        category: "telecom",
        idPrefix: "telecom-tower",
        defaultName: "Cell tower",
      })
    : [];

  const coverageFeatures = data.coverage_grid
    ? normalizeFeatureCollection({
        collection: data.coverage_grid,
        source: "telecom",
        category: "telecom",
        idPrefix: "telecom-grid",
        defaultName: "Coverage cell",
      })
    : [];

  const features = [...towerFeatures, ...coverageFeatures];
  return {
    features,
    summary: summary({
      sourceId: "telecom",
      label: "Telecom",
      status: "success",
      featureCount: features.length,
      message: typeof data.summary === "string" ? data.summary : undefined,
    }),
    notes: typeof data.summary === "string" ? [data.summary] : [],
  };
}

async function fetchSatellites(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes: string[] }> {
  const centerLon = (bbox[0] + bbox[2]) / 2;
  const centerLat = (bbox[1] + bbox[3]) / 2;
  const data = await fetchJson<{
    passes?: Array<Record<string, unknown> & { satellite?: string; type?: string }>;
  }>(`/api/intel/satellites?lat=${centerLat}&lon=${centerLon}&alt_m=0&days=3`);

  const passes = data.passes ?? [];
  const features: IntelFeature[] = [
    {
      id: "satellite-passes",
      name: "Satellite pass forecast",
      source: "satellite",
      category: "satellite",
      geometry: {
        type: "Point",
        coordinates: [centerLon, centerLat],
      },
      properties: {
        passes,
      },
    },
  ];

  return {
    features,
    summary: summary({
      sourceId: "satellite",
      label: "Satellite",
      status: "success",
      featureCount: features.length,
      message: `${passes.length} upcoming pass${passes.length === 1 ? "" : "es"} found.`,
    }),
    notes: [`${passes.length} upcoming satellite pass${passes.length === 1 ? "" : "es"} over the area centre.`],
  };
}

async function fetchSupportNodes(
  args: {
    filter: "healthcare" | "water";
    type: "medical" | "water";
    bbox: [number, number, number, number];
    label: string;
  },
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(
    `/api/logistics/support_nodes?bbox=${bboxToQuery(args.bbox)}&type=${args.type}`,
  );
  const features = normalizeFeatureCollection({
    collection,
    source: args.filter,
    category: "infrastructure",
    idPrefix: args.filter,
    defaultName: args.label,
  });
  return {
    features,
    summary: summary({
      sourceId: args.filter,
      label: args.label,
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchLogistics(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(`/api/logistics/chokepoints?bbox=${bboxToQuery(bbox)}`);
  const features = normalizeFeatureCollection({
    collection,
    source: "logistics",
    category: "infrastructure",
    idPrefix: "logistics",
    defaultName: "Chokepoint",
  });
  return {
    features,
    summary: summary({
      sourceId: "logistics",
      label: "Logistics",
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchByFilter(
  filter: AoiDataFilter,
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes?: string[] }> {
  switch (filter) {
    case "weather":
      return fetchWeather(bbox);
    case "terrain":
      return fetchTerrain(bbox);
    case "infrastructure":
      return fetchFeatureLayer({
        filter,
        layer: "infrastructure",
        bbox,
        source: "infrastructure",
        defaultName: "Infrastructure",
      });
    case "roads":
      return fetchFeatureLayer({
        filter,
        layer: "roads",
        bbox,
        source: "roads",
        defaultName: "Road",
      });
    case "bridges":
      return fetchBridges(bbox);
    case "population":
      return fetchPopulation(bbox);
    case "telecom":
      return fetchTelecom(bbox);
    case "satellite":
      return fetchSatellites(bbox);
    case "healthcare":
      return fetchSupportNodes({
        filter,
        type: "medical",
        bbox,
        label: "Healthcare node",
      });
    case "power":
      return fetchFeatureLayer({
        filter,
        layer: "infrastructure",
        bbox,
        source: "power",
        defaultName: "Power asset",
        propertyFilter: (properties) => "power" in properties,
      });
    case "water":
      return fetchSupportNodes({
        filter,
        type: "water",
        bbox,
        label: "Water source",
      });
    case "logistics":
      return fetchLogistics(bbox);
    default:
      return {
        features: [],
        summary: summary({
          sourceId: filter,
          label: filter,
          status: "error",
          featureCount: 0,
          message: "Unsupported filter.",
        }),
      };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<SectionIntelResponse | { error: string }>> {
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

    const bbox = body.bbox;
    const filters = body.filters;

    const jobs = await Promise.all(
      filters.map(async (filter) => {
        try {
          return await fetchByFilter(filter, bbox);
        } catch (error) {
          return {
            features: [] as IntelFeature[],
            summary: summary({
              sourceId: filter,
              label: filter,
              status: "error",
              featureCount: 0,
              message: error instanceof Error ? error.message : "Unknown source error",
            }),
            notes: [] as string[],
          };
        }
      }),
    );

    const overlays = jobs.flatMap((job) => job.features);
    const sourceSummaries = jobs.map((job) => job.summary);
    const notes = jobs.flatMap((job) => job.notes ?? []);

    return NextResponse.json({
      aoiId: body.aoiId,
      requestedFilters: filters,
      bbox,
      generatedAt: new Date().toISOString(),
      message:
        overlays.length > 0
          ? "Area intelligence fetched successfully."
          : "No overlay features were returned from the selected sources.",
      notes,
      totals: {
        features: overlays.length,
        sourcesSuccessful: sourceSummaries.filter((item) => item.status === "success").length,
        sourcesFailed: sourceSummaries.filter((item) => item.status === "error").length,
      },
      sourceSummaries,
      overlays,
    });
  } catch (error) {
    console.error("Intel API error:", error);
    return NextResponse.json({ error: "Unable to process intel request." }, { status: 500 });
  }
}
