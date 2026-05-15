import type { IntelCategory, IntelFeature, IntelGeometry } from '@/lib/intel/types';

export interface JsonFeatureLike {
  id?: string | number;
  geometry?: GeoJSON.Geometry | null;
  properties?: Record<string, unknown> | null;
}

export interface JsonFeatureCollectionLike {
  features?: JsonFeatureLike[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isIntelGeometry(geometry: GeoJSON.Geometry | null | undefined): geometry is IntelGeometry {
  if (!geometry) {
    return false;
  }

  return (
    geometry.type === 'Point' ||
    geometry.type === 'LineString' ||
    geometry.type === 'Polygon' ||
    geometry.type === 'MultiPolygon' ||
    geometry.type === 'MultiLineString'
  );
}

export function coerceProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function toIntelFeature(args: {
  id: string;
  name?: string;
  source: string;
  category: IntelCategory;
  geometry: IntelGeometry;
  properties?: Record<string, unknown>;
  timestamp?: string;
  confidence?: number;
  attribution?: string;
}): IntelFeature {
  return {
    id: args.id,
    name: args.name,
    source: args.source,
    category: args.category,
    geometry: args.geometry,
    properties: args.properties ?? {},
    timestamp: args.timestamp,
    confidence: args.confidence,
    attribution: args.attribution,
  };
}

export function normalizeFeatureCollection(args: {
  source: string;
  category: IntelCategory;
  data: unknown;
  attribution?: string;
  timestampFromProperties?: string[];
}): IntelFeature[] {
  if (!isRecord(args.data)) {
    return [];
  }

  const features = Array.isArray(args.data.features)
    ? (args.data.features as JsonFeatureLike[])
    : [];

  return features.flatMap((feature, index) => {
    if (!isIntelGeometry(feature.geometry)) {
      return [];
    }

    const properties = coerceProperties(feature.properties);
    const timestamp = args.timestampFromProperties?.find(
      (key) => typeof properties[key] === 'string',
    );

    return [
      toIntelFeature({
        id: String(feature.id ?? properties.id ?? `${args.source}-${index}`),
        name:
          typeof properties.name === 'string'
            ? properties.name
            : typeof properties.nimi === 'string'
              ? properties.nimi
              : typeof properties.label === 'string'
                ? properties.label
                : undefined,
        source: args.source,
        category: args.category,
        geometry: feature.geometry,
        properties,
        timestamp: timestamp ? (properties[timestamp] as string) : undefined,
        attribution: args.attribution,
      }),
    ];
  });
}

export function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  const [west, south, east, north] = bbox;
  return [(south + north) / 2, (west + east) / 2];
}

export function bboxToFmiParam(bbox: [number, number, number, number]): string {
  const [west, south, east, north] = bbox;
  return `${west},${south},${east},${north}`;
}

export function queryMatchesCollection(
  collection: Record<string, unknown>,
  query: string | undefined,
): boolean {
  if (!query) {
    return true;
  }

  const needle = query.trim().toLowerCase();

  return [collection.id, collection.title, collection.description]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(needle));
}
