import type {
  AoiBounds,
  AoiComment,
  AoiDataFilter,
  AoiSelection,
  AoiShapeType,
} from "@/lib/aoi/types";

export const DEFAULT_AOI_FILTERS: AoiDataFilter[] = [
  "terrain",
  "weather",
  "infrastructure",
  "roads",
  "bridges",
  "population",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeRing(ring: number[][]): number[][] {
  if (ring.length === 0) {
    return ring;
  }

  const [firstLon, firstLat] = ring[0];
  const last = ring[ring.length - 1];
  if (last && last[0] === firstLon && last[1] === firstLat) {
    return ring;
  }

  return [...ring, [firstLon, firstLat]];
}

function normalizePolygon(polygon: GeoJSON.Polygon): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: polygon.coordinates.map((ring) => normalizeRing(ring as number[][])),
  };
}

function normalizeMultiPolygon(multiPolygon: GeoJSON.MultiPolygon): GeoJSON.MultiPolygon {
  return {
    type: "MultiPolygon",
    coordinates: multiPolygon.coordinates.map((polygon) =>
      polygon.map((ring) => normalizeRing(ring as number[][])),
    ),
  };
}

function polygonRings(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number[][][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates as number[][][];
  }

  return geometry.coordinates.flatMap((polygon) => polygon as number[][][]);
}

function coordinateSets(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number[][] {
  return polygonRings(geometry).flatMap((ring) => ring);
}

function approximatePolygonAreaSqKm(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number | undefined {
  const rings = polygonRings(geometry);
  if (rings.length === 0) {
    return undefined;
  }

  let totalArea = 0;

  for (const ring of rings) {
    if (ring.length < 4) {
      continue;
    }

    const meanLatRadians =
      (ring.reduce((total, [, lat]) => total + lat, 0) / ring.length) * (Math.PI / 180);
    const kmPerDegLat = 111.32;
    const kmPerDegLon = 111.32 * Math.cos(meanLatRadians);

    let shoelace = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const [lon1, lat1] = ring[index];
      const [lon2, lat2] = ring[index + 1];
      const x1 = lon1 * kmPerDegLon;
      const y1 = lat1 * kmPerDegLat;
      const x2 = lon2 * kmPerDegLon;
      const y2 = lat2 * kmPerDegLat;
      shoelace += x1 * y2 - x2 * y1;
    }

    totalArea += Math.abs(shoelace) / 2;
  }

  return totalArea;
}

export function polygonToBounds(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): AoiBounds {
  const coordinates = coordinateSets(geometry);
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const coordinate of coordinates) {
    const [lon, lat] = coordinate;
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }

  return { west, south, east, north };
}

export function boundsToPolygon(bounds: AoiBounds): GeoJSON.Polygon {
  return {
    type: "Polygon",
    coordinates: [[
      [bounds.west, bounds.south],
      [bounds.east, bounds.south],
      [bounds.east, bounds.north],
      [bounds.west, bounds.north],
      [bounds.west, bounds.south],
    ]],
  };
}

export function getPolygonCenter(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): { lon: number; lat: number } {
  const bounds = polygonToBounds(geometry);
  return {
    lon: (bounds.west + bounds.east) / 2,
    lat: (bounds.south + bounds.north) / 2,
  };
}

export function validateBounds(bounds: AoiBounds): boolean {
  return (
    isFiniteNumber(bounds.west) &&
    isFiniteNumber(bounds.south) &&
    isFiniteNumber(bounds.east) &&
    isFiniteNumber(bounds.north) &&
    bounds.west >= -180 &&
    bounds.west <= 180 &&
    bounds.east >= -180 &&
    bounds.east <= 180 &&
    bounds.south >= -90 &&
    bounds.south <= 90 &&
    bounds.north >= -90 &&
    bounds.north <= 90 &&
    bounds.west < bounds.east &&
    bounds.south < bounds.north
  );
}

export function validateGeometry(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return false;
  }

  const rings = polygonRings(geometry);
  if (rings.length === 0) {
    return false;
  }

  return rings.every((ring) => {
    if (!Array.isArray(ring) || ring.length < 4) {
      return false;
    }

    const closedRing = normalizeRing(ring);
    const [firstLon, firstLat] = closedRing[0];
    const [lastLon, lastLat] = closedRing[closedRing.length - 1];
    if (firstLon !== lastLon || firstLat !== lastLat) {
      return false;
    }

    return closedRing.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        isFiniteNumber(coordinate[0]) &&
        isFiniteNumber(coordinate[1]) &&
        coordinate[0] >= -180 &&
        coordinate[0] <= 180 &&
        coordinate[1] >= -90 &&
        coordinate[1] <= 90,
    );
  });
}

export function normalizeGeometry(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (geometry.type === "Polygon") {
    return normalizePolygon(geometry);
  }

  return normalizeMultiPolygon(geometry);
}

export function createAoiSelection(input: {
  id?: string;
  index: number;
  name?: string;
  notes?: string;
  comments?: AoiComment[];
  shapeType: AoiShapeType;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  selectedFilters?: AoiDataFilter[];
  createdAt?: string;
  updatedAt?: string;
}): AoiSelection {
  if (!validateGeometry(input.geometry)) {
    throw new Error("Invalid AOI geometry");
  }

  const normalizedGeometry = normalizeGeometry(input.geometry);
  const bounds = polygonToBounds(normalizedGeometry);
  if (!validateBounds(bounds)) {
    throw new Error("Invalid AOI bounds");
  }

  const timestamp = input.updatedAt ?? new Date().toISOString();
  const createdAt = input.createdAt ?? timestamp;

  return {
    id: input.id ?? `aoi-${crypto.randomUUID()}`,
    name: input.name?.trim() || `Area ${input.index}`,
    notes: input.notes ?? "",
    comments: input.comments ?? [],
    shapeType: input.shapeType,
    geometry: normalizedGeometry,
    bounds,
    center: getPolygonCenter(normalizedGeometry),
    areaSqKm: approximatePolygonAreaSqKm(normalizedGeometry),
    selectedFilters: input.selectedFilters ?? [...DEFAULT_AOI_FILTERS],
    createdAt,
    updatedAt: timestamp,
  };
}
