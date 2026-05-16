import type {
  AoiSelection,
  SectionIntelFeatureCollection,
  SectionIntelFeatureProperties,
} from "@/lib/aoi/types";
import type { SectionIntelResponse } from "@/lib/aoi/sectionIntel";

function emptyFeatureCollection(): SectionIntelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>> {
  return (
    !!value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "FeatureCollection" &&
    "features" in value &&
    Array.isArray(value.features)
  );
}

function normalizeFeatureProperties(
  properties: Record<string, unknown> | null | undefined,
  sectionId: string,
): SectionIntelFeatureProperties {
  return {
    sectionId,
    category: typeof properties?.category === "string" ? properties.category : "unknown",
    source: typeof properties?.source === "string" ? properties.source : "unknown",
    name: typeof properties?.name === "string" ? properties.name : "Unnamed feature",
    confidence: typeof properties?.confidence === "number" ? properties.confidence : undefined,
    timestamp: typeof properties?.timestamp === "string" ? properties.timestamp : undefined,
    ...(properties ?? {}),
  };
}

function normalizeFeatureCollection(
  collection: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>,
  sectionId: string,
): SectionIntelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features
      .filter((feature) => !!feature.geometry)
      .map((feature, index) => ({
        type: "Feature",
        id: feature.id ?? `${sectionId}-${index}`,
        geometry: feature.geometry,
        properties: normalizeFeatureProperties(feature.properties, sectionId),
      })),
  };
}

function normalizeSectionIntelResponse(
  response: SectionIntelResponse,
): SectionIntelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: response.overlays.map((feature, index) => ({
      type: "Feature",
      id: feature.id ?? `${response.aoiId}-${index}`,
      geometry: feature.geometry,
      properties: normalizeFeatureProperties(
        {
          ...feature.properties,
          category: feature.category,
          source: feature.source,
          name: feature.name,
          confidence: feature.confidence,
          timestamp: feature.timestamp,
        },
        response.aoiId,
      ),
    })),
  };
}

export async function fetchSectionIntel(
  section: AoiSelection,
): Promise<SectionIntelFeatureCollection> {
  const res = await fetch("/api/intel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      aoiId: section.id,
      geometry: section.geometry,
      bbox: [
        section.bounds.west,
        section.bounds.south,
        section.bounds.east,
        section.bounds.north,
      ],
      filters: section.selectedFilters,
    }),
  });

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      throw new Error(data.error);
    }
    throw new Error("Failed to fetch intelligence");
  }

  if (!data) {
    return emptyFeatureCollection();
  }

  if (isFeatureCollection(data)) {
    return normalizeFeatureCollection(data, section.id);
  }

  if (typeof data === "object" && data && "overlays" in data) {
    return normalizeSectionIntelResponse(data as SectionIntelResponse);
  }

  return emptyFeatureCollection();
}
