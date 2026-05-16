import type { Asset } from "@/lib/types";
import { validateGeometry } from "@/lib/aoi/utils";

function isPointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function isPointInPolygonGeometry(
  lon: number,
  lat: number,
  geometry: GeoJSON.Polygon,
): boolean {
  const [outerRing, ...holes] = geometry.coordinates as number[][][];
  if (!outerRing || outerRing.length < 4 || !isPointInRing(lon, lat, outerRing)) {
    return false;
  }

  return holes.every((hole) => !isPointInRing(lon, lat, hole));
}

export function isPointInGeometry(
  lon: number,
  lat: number,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): boolean {
  if (!validateGeometry(geometry)) {
    return false;
  }

  if (geometry.type === "Polygon") {
    return isPointInPolygonGeometry(lon, lat, geometry);
  }

  return geometry.coordinates.some((polygon) =>
    isPointInPolygonGeometry(lon, lat, {
      type: "Polygon",
      coordinates: polygon as number[][][],
    }),
  );
}

export function filterAssetsToAoi(
  assets: Asset[],
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): Asset[] {
  if (!validateGeometry(geometry)) {
    return [];
  }

  return assets.filter((asset) => isPointInGeometry(asset.lon, asset.lat, geometry));
}
