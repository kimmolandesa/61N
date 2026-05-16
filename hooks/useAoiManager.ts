"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readStoredAoiSelections, writeStoredAoiSelections } from "@/lib/aoi/storage";
import {
  createAoiSelection,
  DEFAULT_AOI_FILTERS,
  validateGeometry,
} from "@/lib/aoi/utils";
import type {
  AoiComment,
  AoiDataFilter,
  AoiDrawMode,
  AoiSelection,
  AoiShapeType,
  SectionIntelFeatureCollection,
  SectionIntelSummary,
} from "@/lib/aoi/types";

export function useAoiManager() {
  const [aois, setAois] = useState<AoiSelection[]>(() => readStoredAoiSelections());
  const [selectedAoiId, setSelectedAoiId] = useState<string | null>(() => {
    const stored = readStoredAoiSelections();
    return stored[0]?.id ?? null;
  });
  const [activeDrawMode, setActiveDrawMode] = useState<AoiDrawMode>("select");
  const storageReadyRef = useRef(true);
  const persistTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!storageReadyRef.current) {
      return;
    }

    if (persistTimeoutRef.current !== null) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      writeStoredAoiSelections(aois);
      persistTimeoutRef.current = null;
    }, 250);

    return () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [aois]);

  const selectedAoi = useMemo(
    () => aois.find((aoi) => aoi.id === selectedAoiId) ?? null,
    [aois, selectedAoiId],
  );

  const selectAoi = useCallback((id: string | null) => {
    setSelectedAoiId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAoiId(null);
    setActiveDrawMode("select");
  }, []);

  const addAoiFromGeometry = useCallback((args: {
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    shapeType: AoiShapeType;
  }) => {
    if (!validateGeometry(args.geometry)) {
      return null;
    }

    const selection = createAoiSelection({
      index: aois.length + 1,
      geometry: args.geometry,
      shapeType: args.shapeType,
      selectedFilters: [...DEFAULT_AOI_FILTERS],
    });

    setAois((current) => [selection, ...current]);
    setSelectedAoiId(selection.id);
    return selection;
  }, [aois.length]);

  const updateAoi = useCallback((id: string, patch: Partial<AoiSelection>) => {
    setAois((current) =>
      current.map((aoi) =>
        aoi.id === id
          ? {
              ...aoi,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : aoi,
      ),
    );
  }, []);

  const replaceAoiGeometry = useCallback((id: string, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) => {
    if (!validateGeometry(geometry)) {
      return;
    }

    setAois((current) =>
      current.map((aoi) => {
        if (aoi.id !== id) {
          return aoi;
        }

        const next = createAoiSelection({
          id: aoi.id,
          index: 1,
          name: aoi.name,
          notes: aoi.notes,
          comments: aoi.comments,
          geometry,
          shapeType: aoi.shapeType,
          selectedFilters: aoi.selectedFilters,
          intel: aoi.intel,
          createdAt: aoi.createdAt,
        });

        return next;
      }),
    );
  }, []);

  const deleteAoi = useCallback((id: string) => {
    setAois((current) => {
      const next = current.filter((aoi) => aoi.id !== id);
      setSelectedAoiId((selected) =>
        selected === id ? (next[0]?.id ?? null) : selected,
      );
      return next;
    });
  }, []);

  const clearAllAois = useCallback(() => {
    setAois([]);
    setSelectedAoiId(null);
    setActiveDrawMode("select");
  }, []);

  const replaceAois = useCallback((nextAois: AoiSelection[]) => {
    setAois(nextAois);
    setSelectedAoiId(nextAois[0]?.id ?? null);
  }, []);

  const saveToStorage = useCallback(() => {
    writeStoredAoiSelections(aois);
  }, [aois]);

  const loadFromStorage = useCallback(() => {
    const stored = readStoredAoiSelections();
    setAois(stored);
    setSelectedAoiId(stored[0]?.id ?? null);
    setActiveDrawMode("select");
  }, []);

  const addComment = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const comment: AoiComment = {
      id: `comment-${crypto.randomUUID()}`,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    setAois((current) =>
      current.map((aoi) =>
        aoi.id === id
          ? {
              ...aoi,
              comments: [...aoi.comments, comment],
              updatedAt: new Date().toISOString(),
            }
          : aoi,
      ),
    );
  }, []);

  const toggleFilter = useCallback((id: string, filter: AoiDataFilter) => {
    setAois((current) =>
      current.map((aoi) => {
        if (aoi.id !== id) {
          return aoi;
        }

        const selectedFilters = aoi.selectedFilters.includes(filter)
          ? aoi.selectedFilters.filter((item) => item !== filter)
          : [...aoi.selectedFilters, filter];

        return {
          ...aoi,
          selectedFilters,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }, []);

  const setSectionIntelLoading = useCallback((id: string) => {
    setAois((current) =>
      current.map((aoi) =>
        aoi.id === id
          ? {
              ...aoi,
              intel: {
                status: "loading",
              },
              updatedAt: new Date().toISOString(),
            }
          : aoi,
      ),
    );
  }, []);

  const setSectionIntelSuccess = useCallback((
    id: string,
    featureCollection: SectionIntelFeatureCollection,
    summary?: SectionIntelSummary,
  ) => {
    setAois((current) =>
      current.map((aoi) =>
        aoi.id === id
          ? {
              ...aoi,
              intel: {
                status: "success",
                fetchedAt: new Date().toISOString(),
                featureCollection,
                summary,
              },
              updatedAt: new Date().toISOString(),
            }
          : aoi,
      ),
    );
  }, []);

  const setSectionIntelError = useCallback((id: string, error: string) => {
    setAois((current) =>
      current.map((aoi) =>
        aoi.id === id
          ? {
              ...aoi,
              intel: {
                status: "error",
                error,
                featureCollection: aoi.intel.featureCollection,
                summary: aoi.intel.summary,
              },
              updatedAt: new Date().toISOString(),
            }
          : aoi,
      ),
    );
  }, []);

  const clearSectionIntel = useCallback((id: string) => {
    setAois((current) =>
      current.map((aoi) =>
        aoi.id === id
          ? {
              ...aoi,
              intel: {
                status: "idle",
              },
              updatedAt: new Date().toISOString(),
            }
          : aoi,
      ),
    );
  }, []);

  return {
    aois,
    selectedAoiId,
    selectedAoi,
    activeDrawMode,
    addAoiFromGeometry,
    updateAoi,
    replaceAoiGeometry,
    deleteAoi,
    selectAoi,
    clearSelection,
    clearAllAois,
    replaceAois,
    addComment,
    toggleFilter,
    setSectionIntelLoading,
    setSectionIntelSuccess,
    setSectionIntelError,
    clearSectionIntel,
    saveToStorage,
    loadFromStorage,
    setActiveDrawMode,
  };
}
