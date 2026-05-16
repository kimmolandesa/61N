import type {
  AoiSelection,
  SectionIntelFeatureCollection,
  SectionIntelFeatureProperties,
  SectionIntelSummary,
} from "@/lib/aoi/types";
import type { IntelCategory } from "@/lib/intel/categories";
import { normalizeIntelFeatureProperties } from "@/lib/intel/normalizeFeatureProperties";

function emptyFeatureCollection(): SectionIntelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

export function createIntelSummary(
  featureCollection: SectionIntelFeatureCollection,
): SectionIntelSummary {
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  for (const feature of featureCollection.features) {
    const category =
      typeof feature.properties?.category === "string"
        ? feature.properties.category
        : "Unknown category";
    const source =
      typeof feature.properties?.source === "string"
        ? feature.properties.source
        : "Unknown source";

    byCategory[category] = (byCategory[category] ?? 0) + 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
  }

  return {
    total: featureCollection.features.length,
    byCategory,
    bySource,
  };
}

function inferCategory(
  properties: Record<string, unknown> | null | undefined,
  preferredCategory: IntelCategory | undefined,
): string | undefined {
  if (typeof properties?.category === "string" && properties.category.trim()) {
    return properties.category.trim();
  }

  if (typeof properties?.source === "string") {
    const source = properties.source.trim().toLowerCase();
    if (source.includes("weather")) return "weather";
    if (source.includes("terrain")) return "terrain";
    if (source.includes("bridge")) return "bridges";
    if (source.includes("telecom") || source.includes("cell")) return "telecom";
    if (source.includes("population")) return "population";
    if (source.includes("satellite")) return "satellite";
    if (source.includes("road")) return "roads";
    if (source.includes("power")) return "power";
    if (source.includes("water")) return "water";
    if (source.includes("health")) return "healthcare";
    if (source.includes("logistics")) return "logistics";
    if (source.includes("infrastructure")) return "infrastructure";
  }

  return preferredCategory;
}

export function normalizeIntelFeatureCollection(args: {
  collection: GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
  section: Pick<AoiSelection, "id" | "selectedFilters">;
}): SectionIntelFeatureCollection {
  const preferredCategory = args.section.selectedFilters[0];
  const features = args.collection.features
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>> => !!feature?.geometry)
    .map((feature, index) => {
      const category = inferCategory(feature.properties, preferredCategory);
      const properties = normalizeIntelFeatureProperties(
        {
          ...feature.properties,
          category,
        },
        args.section.id,
      ) as SectionIntelFeatureProperties;

      return {
        type: "Feature" as const,
        id: feature.id ?? `${args.section.id}-${index}`,
        geometry: feature.geometry,
        properties,
      };
    });

  if (features.length === 0) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
