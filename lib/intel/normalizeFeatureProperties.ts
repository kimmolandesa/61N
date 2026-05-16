import type { SectionIntelFeatureProperties } from "@/lib/aoi/types";

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeIntelFeatureProperties(
  properties: Record<string, unknown> | null | undefined,
  sectionId: string,
): SectionIntelFeatureProperties {
  const category = asString(properties?.category) ?? "Unknown category";
  const source = asString(properties?.source) ?? "Unknown source";
  const name = asString(properties?.name) ?? `${category} feature`;
  const description =
    asString(properties?.description) ??
    asString(properties?.summary) ??
    asString(properties?.reason) ??
    undefined;

  return {
    sectionId,
    category,
    source,
    name,
    description,
    confidence: asNumber(properties?.confidence),
    timestamp: asString(properties?.timestamp) ?? asString(properties?.time) ?? asString(properties?.updatedAt),
    ...(properties ?? {}),
  };
}
