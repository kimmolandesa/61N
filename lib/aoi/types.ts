export type AoiShapeType =
  | "polygon"
  | "rectangle"
  | "circle"
  | "freehand";

export type AoiDataFilter =
  | "terrain"
  | "weather"
  | "roads"
  | "bridges"
  | "population"
  | "telecom"
  | "satellite"
  | "healthcare"
  | "power"
  | "water"
  | "logistics";

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
