export type IntelCategory =
  | 'terrain'
  | 'weather'
  | 'climate'
  | 'infrastructure'
  | 'population'
  | 'telecom'
  | 'satellite';

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
  category: IntelCategory;
  geometry: IntelGeometry;
  properties: Record<string, unknown>;
  timestamp?: string;
  confidence?: number;
  attribution?: string;
}

export interface IntelSourceAdapter {
  id: string;
  label: string;
  category: IntelCategory;
  fetch: (params: IntelFetchParams) => Promise<IntelFeature[]>;
}

export interface IntelFetchParams {
  bbox: [number, number, number, number];
  startTime?: string;
  endTime?: string;
  query?: string;
}
