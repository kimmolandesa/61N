import type { AoiBounds, AoiGeometry, AoiInputMode, AoiSelection } from "@/lib/aoi/types";

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

function approximatePolygonAreaSqKm(geometry: AoiGeometry): number | undefined {
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) {
    return undefined;
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

  return Math.abs(shoelace) / 2;
}

export function polygonToBounds(geometry: AoiGeometry): AoiBounds {
  const ring = geometry.coordinates[0] ?? [];
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const coordinate of ring) {
    const [lon, lat] = coordinate;
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }

  return { west, south, east, north };
}

export function boundsToPolygon(bounds: AoiBounds): AoiGeometry {
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

export function getPolygonCenter(geometry: AoiGeometry): { lon: number; lat: number } {
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

export function validatePolygon(geometry: AoiGeometry): boolean {
  if (geometry.type !== "Polygon" || geometry.coordinates.length === 0) {
    return false;
  }

  const ring = geometry.coordinates[0];
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
}

export function createAoiSelection(input: {
  mode: AoiInputMode;
  name?: string;
  bounds?: AoiBounds;
  geometry?: AoiGeometry;
}): AoiSelection {
  const geometry = input.geometry ?? (input.bounds ? boundsToPolygon(input.bounds) : undefined);
  if (!geometry || !validatePolygon(geometry)) {
    throw new Error("Invalid AOI polygon");
  }

  const normalizedGeometry: AoiGeometry = {
    type: "Polygon",
    coordinates: [normalizeRing(geometry.coordinates[0])],
  };
  const bounds = polygonToBounds(normalizedGeometry);
  if (!validateBounds(bounds)) {
    throw new Error("Invalid AOI bounds");
  }

  const center = getPolygonCenter(normalizedGeometry);
  const timestamp = new Date().toISOString();

  return {
    id: `aoi-${crypto.randomUUID()}`,
    name: input.name?.trim() || undefined,
    mode: input.mode,
    geometry: normalizedGeometry,
    bounds,
    center,
    areaSqKm: approximatePolygonAreaSqKm(normalizedGeometry),
    createdAt: timestamp,
  };
}
