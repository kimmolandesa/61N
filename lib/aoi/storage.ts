import type { AoiSelection } from "@/lib/aoi/types";

const AOI_STORAGE_KEY = "sightline-aoi-selections";

function isAoiSelection(value: unknown): value is AoiSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const selection = value as Partial<AoiSelection>;
  return (
    typeof selection.id === "string" &&
    typeof selection.name === "string" &&
    typeof selection.notes === "string" &&
    Array.isArray(selection.comments) &&
    typeof selection.shapeType === "string" &&
    Array.isArray(selection.selectedFilters) &&
    !!selection.bounds &&
    typeof selection.bounds.west === "number" &&
    typeof selection.bounds.south === "number" &&
    typeof selection.bounds.east === "number" &&
    typeof selection.bounds.north === "number" &&
    !!selection.center &&
    typeof selection.center.lon === "number" &&
    typeof selection.center.lat === "number" &&
    !!selection.geometry &&
    (selection.geometry.type === "Polygon" || selection.geometry.type === "MultiPolygon") &&
    Array.isArray(selection.geometry.coordinates) &&
    typeof selection.createdAt === "string" &&
    typeof selection.updatedAt === "string"
  );
}

export function readStoredAoiSelections(): AoiSelection[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(AOI_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isAoiSelection);
  } catch {
    return [];
  }
}

export function writeStoredAoiSelections(selections: AoiSelection[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AOI_STORAGE_KEY, JSON.stringify(selections));
}
