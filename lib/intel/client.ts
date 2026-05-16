import type {
  AoiSelection,
  SectionIntelFeatureCollection,
  SectionIntelSummary,
} from "@/lib/aoi/types";
import { filterFeaturesToAoi } from "@/lib/geo/filterFeaturesToAoi";
import {
  createIntelSummary,
  normalizeIntelFeatureCollection,
} from "@/lib/intel/normalizeFeatureCollection";
import type { SectionIntelResponse } from "@/lib/aoi/sectionIntel";

export interface SectionIntelFetchResult {
  featureCollection: SectionIntelFeatureCollection;
  summary: SectionIntelSummary;
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

function normalizeSectionIntelResponse(
  response: SectionIntelResponse,
  section: AoiSelection,
): SectionIntelFeatureCollection {
  return normalizeIntelFeatureCollection({
    collection: {
      type: "FeatureCollection",
      features: response.overlays.map((feature, index) => ({
        type: "Feature" as const,
        id: feature.id ?? `${response.aoiId}-${index}`,
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          category: feature.category,
          source: feature.source,
          name: feature.name,
          description:
            typeof feature.properties?.description === "string"
              ? feature.properties.description
              : undefined,
          confidence: feature.confidence,
          timestamp: feature.timestamp,
        },
      })),
    },
    section,
  });
}

export async function fetchSectionIntel(
  section: AoiSelection,
): Promise<SectionIntelFetchResult> {
  const res = await fetch("/api/intel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sectionId: section.id,
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
    const featureCollection = {
      type: "FeatureCollection",
      features: [],
    } satisfies SectionIntelFeatureCollection;
    return {
      featureCollection,
      summary: createIntelSummary(featureCollection),
    };
  }

  let featureCollection: SectionIntelFeatureCollection;
  if (isFeatureCollection(data)) {
    featureCollection = filterFeaturesToAoi(
      normalizeIntelFeatureCollection({
        collection: data,
        section,
      }),
      section.geometry,
    );
  } else if (typeof data === "object" && data && "overlays" in data) {
    featureCollection = filterFeaturesToAoi(normalizeSectionIntelResponse(data as SectionIntelResponse, section), section.geometry);
  } else {
    featureCollection = {
      type: "FeatureCollection",
      features: [],
    };
  }

  return {
    featureCollection,
    summary: createIntelSummary(featureCollection),
  };
}
