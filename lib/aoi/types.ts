export type AoiShapeType =
  | "polygon"
  | "rectangle"
  | "circle"
  | "freehand";

export type AoiDrawMode =
  | "select"
  | "polygon"
  | "rectangle"
  | "circle"
  | "freehand"
  | "measure"
  | "edit";

export type AoiDataFilter =
  | "terrain"
  | "weather"
  | "infrastructure"
  | "roads"
  | "bridges"
  | "population"
  | "telecom"
  | "satellite"
  | "healthcare"
  | "power"
  | "water"
  | "logistics";

export interface AoiIntelState {
  status: "idle" | "loading" | "success" | "error";
  message: string | null;
  result?: unknown;
  lastFetchedAt?: string;
}

export interface AoiComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface AoiBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface AoiSelection {
  id: string;
  name: string;
  notes: string;
  comments: AoiComment[];
  shapeType: AoiShapeType;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bounds: AoiBounds;
  center: {
    lon: number;
    lat: number;
  };
  areaSqKm?: number;
  selectedFilters: AoiDataFilter[];
  createdAt: string;
  updatedAt: string;
}
