import { NextRequest, NextResponse } from "next/server";
import { circle as turfCircle } from "@turf/turf";
import type { AoiDataFilter } from "@/lib/aoi/types";
import type { SectionIntelResponse, SectionIntelSourceSummary } from "@/lib/aoi/sectionIntel";
import { INTEL_CATEGORIES } from "@/lib/intel/categories";
import type { IntelFeature, IntelGeometry } from "@/lib/intel/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_BASE_URL = "https://api.kebabkartta.fi";

const VALID_FILTERS: AoiDataFilter[] = INTEL_CATEGORIES.map((category) => category.id);

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

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
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

function makeCenterPointFeature(args: {
  id: string;
  name: string;
  source: string;
  category: IntelFeature["category"];
  bbox: [number, number, number, number];
  properties: Record<string, unknown>;
}): IntelFeature {
  const [lon, lat] = bboxCenter(args.bbox);

  return {
    id: args.id,
    name: args.name,
    source: args.source,
    category: args.category,
    geometry: {
      type: "Point",
      coordinates: [lon, lat],
    },
    properties: args.properties,
  };
}

function hasTextMatch(properties: Record<string, unknown>, terms: string[]): boolean {
  const haystack = Object.values(properties)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return terms.some((term) => haystack.includes(term));
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
          category: "weather",
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

async function fetchVisibility(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes: string[] }> {
  const impact = await fetchJson<Record<string, unknown>>(`/api/weather/impact?bbox=${bboxToQuery(bbox)}`);
  const reason = typeof impact.reason === "string" ? impact.reason : "Weather impact summary available.";

  return {
    features: [
      makeCenterPointFeature({
        id: "visibility-summary",
        name: "Visibility summary",
        source: "weather-impact",
        category: "weather",
        bbox,
        properties: {
          ...impact,
          category: "visibility",
          source: "weather-impact",
          description: reason,
          timestamp: new Date().toISOString(),
        },
      }),
    ],
    summary: summary({
      sourceId: "visibility",
      label: "Visibility",
      status: "success",
      featureCount: 1,
      message: reason,
    }),
    notes: [reason],
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
    propertyMapper: (properties) => ({
      ...properties,
      category: "terrain",
    }),
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

async function fetchTerrainVariant(args: {
  filter: "landCover" | "forestDensity";
  bbox: [number, number, number, number];
}): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(`/api/terrain/cover?bbox=${bboxToQuery(args.bbox)}`);
  const filteredCollection: GeoJsonFeatureCollection = {
    ...collection,
    features:
      args.filter === "forestDensity"
        ? collection.features.filter((feature) =>
            hasTextMatch(feature.properties ?? {}, ["forest", "wood", "tree", "conifer", "broadleaf"]),
          )
        : collection.features,
  };

  const features = normalizeFeatureCollection({
    collection: filteredCollection,
    source: args.filter,
    category: "terrain",
    idPrefix: args.filter,
    defaultName: args.filter === "landCover" ? "Land cover cell" : "Forest density cell",
    propertyMapper: (properties) => ({
      ...properties,
      category: args.filter,
    }),
  });

  return {
    features,
    summary: summary({
      sourceId: args.filter,
      label: args.filter === "landCover" ? "Land cover" : "Forest density",
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchTopography(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const collection = await fetchJson<GeoJsonFeatureCollection>(`/api/terrain/soil?bbox=${bboxToQuery(bbox)}`);
  const features = normalizeFeatureCollection({
    collection,
    source: "topography",
    category: "terrain",
    idPrefix: "topography",
    defaultName: "Soil deposit",
    propertyMapper: (properties) => ({
      ...properties,
      category: "topography",
      description:
        typeof properties.deposit_type === "string"
          ? `Soil deposit: ${properties.deposit_type}`
          : "Topographic soil unit",
    }),
  });

  return {
    features,
    summary: summary({
      sourceId: "topography",
      label: "Topography",
      status: "success",
      featureCount: features.length,
    }),
  };
}

async function fetchElevation(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary }> {
  const [lon, lat] = bboxCenter(bbox);
  const data = await fetchJson<{
    lat?: number;
    lon?: number;
    elevation_m?: number;
  }>(`/api/terrain/elevation?lat=${lat}&lon=${lon}`);

  const feature = makeCenterPointFeature({
    id: "elevation-centre",
    name: "Section centre elevation",
    source: "elevation",
    category: "terrain",
    bbox,
    properties: {
      category: "elevation",
      source: "elevation",
      elevation_m: typeof data.elevation_m === "number" ? data.elevation_m : null,
      lat: data.lat ?? lat,
      lon: data.lon ?? lon,
      description:
        typeof data.elevation_m === "number"
          ? `Elevation at the selected section centre is ${data.elevation_m.toFixed(1)} m.`
          : "Elevation summary for the selected section centre.",
      timestamp: new Date().toISOString(),
    },
  });

  return {
    features: [feature],
    summary: summary({
      sourceId: "elevation",
      label: "Elevation",
      status: "success",
      featureCount: 1,
    }),
  };
}

async function fetchFeatureLayer(args: {
  filter: AoiDataFilter;
  layer: "all" | "military" | "roads" | "water" | "buildings" | "infrastructure";
  bbox: [number, number, number, number];
  source: string;
  defaultName: string;
  category?: IntelFeature["category"];
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
    category: args.category ?? "infrastructure",
    idPrefix: args.filter,
    defaultName: args.defaultName,
    propertyMapper: (properties) => ({
      ...properties,
      category: args.filter,
    }),
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
    propertyMapper: (properties) => ({
      ...properties,
      category: "bridges",
    }),
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
    propertyMapper: (properties) => ({
      ...properties,
      category: "population",
    }),
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

// Conservative fallback radii (km) when the API doesn't provide a range value.
const RADIO_FALLBACK_RADIUS_KM: Record<string, number> = {
  NR:   1,
  LTE:  2,
  UMTS: 5,
  GSM:  8,
};
const DEFAULT_RADIUS_KM = 3;

async function fetchTelecom(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes: string[] }> {
  const data = await fetchJson<{
    towers?: GeoJsonFeatureCollection;
    coverage_grid?: GeoJsonFeatureCollection;
    summary?: string;
    dead_zone_ratio?: number;
  }>(`/api/intel/comms?bbox=${bboxToQuery(bbox)}`);

  // Build geo-accurate coverage circles from tower data using Turf.js.
  // The backend's dot-grid is discarded — we derive coverage directly from
  // each tower's coverage_radius_m + radio type, which gives correctly
  // sized geographic polygons instead of a uniform sea of screen dots.
  const coverageCircles: IntelFeature[] = (data.towers?.features ?? []).flatMap(
    (feature, index) => {
      if (feature.geometry?.type !== "Point") return [];

      const props = feature.properties ?? {};
      const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      const radio = typeof props.radio === "string" ? props.radio : "LTE";

      const radiusKm =
        typeof props.coverage_radius_m === "number" && props.coverage_radius_m > 10
          ? props.coverage_radius_m / 1000
          : (RADIO_FALLBACK_RADIUS_KM[radio] ?? DEFAULT_RADIUS_KM);

      const rangeSource = typeof props.range_source === "string" ? props.range_source : "fallback";

      const polygon = turfCircle([lon, lat], radiusKm, { steps: 64, units: "kilometers" });

      return [
        {
          id: `telecom-coverage-${index}`,
          name: `${radio} coverage`,
          source: "telecom",
          category: "telecom" as const,
          geometry: polygon.geometry,
          properties: {
            radio,
            range_source: rangeSource,
            operator: props.operator ?? null,
            cellid: props.cellid ?? null,
          },
        },
      ];
    },
  );

  // Tower point features — physical mast locations rendered as dots on top
  // of the coverage fill so the exact position remains visible at all zooms.
  const towerPoints: IntelFeature[] = (data.towers?.features ?? []).flatMap(
    (feature, index) => {
      if (!feature.geometry || !isIntelGeometry(feature.geometry)) return [];

      const props = feature.properties ?? {};
      const radio = typeof props.radio === "string" ? props.radio : "LTE";

      return [
        {
          id: `telecom-tower-${index}`,
          name: typeof props.operator === "string" ? `${props.operator} (${radio})` : `Cell tower (${radio})`,
          source: "telecom",
          category: "telecom" as const,
          geometry: feature.geometry,
          properties: {
            radio,
            operator: props.operator ?? null,
            cellid: props.cellid ?? null,
            avg_signal_dbm: props.avg_signal_dbm ?? null,
            range_source: props.range_source ?? "fallback",
          },
        },
      ];
    },
  );

  const features = [...coverageCircles, ...towerPoints];
  return {
    features,
    summary: summary({
      sourceId: "telecom",
      label: "Telecom",
      status: "success",
      featureCount: towerPoints.length,
      message: typeof data.summary === "string" ? data.summary : undefined,
    }),
    notes: typeof data.summary === "string" ? [data.summary] : [],
  };
}

async function fetchSatellites(
  bbox: [number, number, number, number],
): Promise<{ features: IntelFeature[]; summary: SectionIntelSourceSummary; notes: string[] }> {
  const [centerLon, centerLat] = bboxCenter(bbox);
  const data = await fetchJson<{
    passes?: Array<Record<string, unknown> & { satellite?: string; type?: string }>;
  }>(`/api/intel/satellites?lat=${centerLat}&lon=${centerLon}&alt_m=0&days=3`);

  const passes = data.passes ?? [];
  const features: IntelFeature[] = [
    makeCenterPointFeature({
      id: "satellite-passes",
      name: "Satellite pass forecast",
      source: "satellite",
      category: "satellite",
      bbox,
      properties: {
        category: "satellite",
        source: "satellite",
        description: `${passes.length} upcoming satellite pass${passes.length === 1 ? "" : "es"} over the selected section centre.`,
        timestamp: new Date().toISOString(),
        passes,
      },
    }),
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
    category: args.filter === "healthcare" ? "infrastructure" : "terrain",
    idPrefix: args.filter,
    defaultName: args.label,
    propertyMapper: (properties) => ({
      ...properties,
      category: args.filter,
    }),
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
  const [chokepoints, restrictions, supportNodes] = await Promise.all([
    fetchJson<GeoJsonFeatureCollection>(`/api/logistics/chokepoints?bbox=${bboxToQuery(bbox)}`),
    fetchJson<GeoJsonFeatureCollection>(`/api/logistics/restrictions?bbox=${bboxToQuery(bbox)}`),
    fetchJson<GeoJsonFeatureCollection>(`/api/logistics/support_nodes?bbox=${bboxToQuery(bbox)}&type=fuel`),
  ]);

  const chokepointFeatures = normalizeFeatureCollection({
    collection: chokepoints,
    source: "logistics",
    category: "infrastructure",
    idPrefix: "logistics-chokepoint",
    defaultName: "Chokepoint",
    propertyMapper: (properties) => ({
      ...properties,
      category: "logistics",
      description:
        typeof properties.name === "string"
          ? `Logistics chokepoint on ${properties.name}`
          : "Logistics chokepoint",
    }),
  });

  const restrictionFeatures = normalizeFeatureCollection({
    collection: restrictions,
    source: "logistics",
    category: "infrastructure",
    idPrefix: "logistics-restriction",
    defaultName: "Weight restriction",
    propertyMapper: (properties) => ({
      ...properties,
      category: "logistics",
      description:
        typeof properties.combination_t === "number"
          ? `Weight restriction: combination ${properties.combination_t} t`
          : "Road restriction segment",
    }),
  });

  const supportFeatures = normalizeFeatureCollection({
    collection: supportNodes,
    source: "logistics",
    category: "infrastructure",
    idPrefix: "logistics-fuel",
    defaultName: "Fuel support node",
    propertyMapper: (properties) => ({
      ...properties,
      category: "logistics",
      description:
        typeof properties.name === "string"
          ? `Fuel support node: ${properties.name}`
          : "Fuel support node",
    }),
  });

  const features = [...chokepointFeatures, ...restrictionFeatures, ...supportFeatures];
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
    case "visibility":
      return fetchVisibility(bbox);
    case "terrain":
      return fetchTerrain(bbox);
    case "topography":
      return fetchTopography(bbox);
    case "elevation":
      return fetchElevation(bbox);
    case "landCover":
      return fetchTerrainVariant({ filter, bbox });
    case "forestDensity":
      return fetchTerrainVariant({ filter, bbox });
    case "infrastructure":
      return fetchFeatureLayer({
        filter,
        layer: "infrastructure",
        bbox,
        source: "infrastructure",
        category: "infrastructure",
        defaultName: "Infrastructure",
      });
    case "roads":
      return fetchFeatureLayer({
        filter,
        layer: "roads",
        bbox,
        source: "roads",
        category: "infrastructure",
        defaultName: "Road",
      });
    case "water":
      return fetchFeatureLayer({
        filter,
        layer: "water",
        bbox,
        source: "water",
        category: "terrain",
        defaultName: "Water feature",
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
        category: "infrastructure",
        defaultName: "Power asset",
        propertyFilter: (properties) => "power" in properties,
      });
    case "logistics":
      return fetchLogistics(bbox);
    case "routes":
    case "demographics":
      return {
        features: [],
        summary: summary({
          sourceId: filter,
          label: filter,
          status: "error",
          featureCount: 0,
          message: "This intelligence category is visible in the UI but not yet supported by the backend.",
        }),
      };
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
      sectionId?: unknown;
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
      sectionId: typeof body.sectionId === "string" ? body.sectionId : undefined,
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
