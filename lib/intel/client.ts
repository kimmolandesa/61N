import type {
  AoiSelection,
  SectionIntelFeatureCollection,
  SectionIntelSummary,
} from "@/lib/aoi/types";
import { filterFeaturesToAoi } from "@/lib/geo/filterFeaturesToAoi";
import type { SectionIntelResponse } from "@/lib/aoi/sectionIntel";

export interface SectionIntelFetchResult {
  featureCollection: SectionIntelFeatureCollection;
  summary: SectionIntelSummary;
}

function emptyFeatureCollection(): SectionIntelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function createIntelSummary(
  featureCollection: SectionIntelFeatureCollection,
): SectionIntelSummary {
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const feature of featureCollection.features) {
    const category =
      typeof feature.properties?.category === "string"
        ? feature.properties.category
        : "unknown";
    const source =
      typeof feature.properties?.source === "string"
        ? feature.properties.source
        : "unknown";

    byCategory[category] = (byCategory[category] ?? 0) + 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
  }

  return {
    total: featureCollection.features.length,
    byCategory,
    bySource,
  };
}

function normalizeSectionIntelResponse(
  response: SectionIntelResponse,
  section: AoiSelection,
): SectionIntelFeatureCollection {
  if (!response.overlays.length) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: response.overlays.map((feature, index) => ({
      type: "Feature",
      id: feature.id ?? `${section.id}-${index}`,
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
        sectionId: section.id,
      },
    })),
  };
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

  const data = (await res.json().catch(() => null)) as SectionIntelResponse | { error?: string } | null;
  if (!res.ok) {
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      throw new Error(data.error);
    }
    throw new Error("Failed to fetch intelligence");
  }

  if (!data || !("overlays" in data)) {
    const featureCollection = emptyFeatureCollection();
    return {
      featureCollection,
      summary: createIntelSummary(featureCollection),
    };
  }

  const featureCollection = filterFeaturesToAoi(
    normalizeSectionIntelResponse(data, section),
    section.geometry,
  );

  return {
    featureCollection,
    summary: createIntelSummary(featureCollection),
  };
}
