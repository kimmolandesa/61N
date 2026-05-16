import {
  fromPersistedAoiSelection,
  isPersistedAoiSelection,
  toPersistedAoiSelection,
} from "@/lib/aoi/persistence";
import type { AoiSelection, PersistedAoiSelection } from "@/lib/aoi/types";

const AOI_STORAGE_KEY = "sightline-aoi-selections";

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

    return parsed.flatMap((entry, index) => {
      if (!isPersistedAoiSelection(entry)) {
        return [];
      }

      try {
        return [fromPersistedAoiSelection(entry, index + 1)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function writeStoredAoiSelections(selections: AoiSelection[]): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const persistedSelections: PersistedAoiSelection[] = selections.map((selection) =>
      toPersistedAoiSelection(selection),
    );
    window.localStorage.setItem(AOI_STORAGE_KEY, JSON.stringify(persistedSelections));
    return true;
  } catch (error) {
    console.error(
      "Local storage quota exceeded. Intelligence data will not be persisted.",
      error,
    );
    return false;
  }
}
