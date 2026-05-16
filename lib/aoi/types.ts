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

export interface SectionIntelFeatureProperties {
  sectionId?: string;
  category?: string;
  source?: string;
  name?: string;
  confidence?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export type SectionIntelFeatureCollection =
  GeoJSON.FeatureCollection<GeoJSON.Geometry, SectionIntelFeatureProperties>;

export interface AoiIntelState {
  status: "idle" | "loading" | "success" | "error";
  error?: string;
  fetchedAt?: string;
  featureCollection?: SectionIntelFeatureCollection;
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
  intel: AoiIntelState;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedAoiSelection {
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
  selectedFilters: AoiDataFilter[];
  createdAt: string;
  updatedAt: string;
}
