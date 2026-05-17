import type { IntelCategory } from "@/lib/intel/categories";

export type IntelGeometry =
  | GeoJSON.Point
  | GeoJSON.LineString
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | GeoJSON.MultiLineString;

export interface IntelFeature {
  id: string;
  name?: string;
  source: string;
  category: IntelCategory | "terrain" | "weather" | "infrastructure" | "population" | "telecom" | "satellite";
  geometry: IntelGeometry;
  properties: Record<string, unknown>;
  timestamp?: string;
  confidence?: number;
  attribution?: string;
}
