import { createAoiSelection } from "@/lib/aoi/utils";
import type { AoiSelection, PersistedAoiSelection } from "@/lib/aoi/types";

export function isPersistedAoiSelection(value: unknown): value is PersistedAoiSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const selection = value as Partial<PersistedAoiSelection>;
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

export function toPersistedAoiSelection(section: AoiSelection): PersistedAoiSelection {
  return {
    id: section.id,
    name: section.name,
    notes: section.notes,
    comments: section.comments,
    shapeType: section.shapeType,
    geometry: section.geometry,
    bounds: section.bounds,
    center: section.center,
    selectedFilters: section.selectedFilters,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  };
}

export function fromPersistedAoiSelection(
  section: PersistedAoiSelection,
  index: number,
): AoiSelection {
  return createAoiSelection({
    id: section.id,
    index,
    name: section.name,
    notes: section.notes,
    comments: section.comments,
    shapeType: section.shapeType,
    geometry: section.geometry,
    selectedFilters: section.selectedFilters,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
  });
}
