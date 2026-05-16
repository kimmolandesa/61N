export type AoiInputMode = "polygon" | "bbox" | "manual";

export interface AoiGeometry {
  type: "Polygon";
  coordinates: number[][][];
}

export interface AoiBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface AoiSelection {
  id: string;
  name?: string;
  mode: AoiInputMode;
  geometry: AoiGeometry;
  bounds: AoiBounds;
  center: {
    lon: number;
    lat: number;
  };
  areaSqKm?: number;
  createdAt: string;
}
