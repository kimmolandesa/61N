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
  AoiIntelState,
  AoiSelection,
  AoiShapeType,
} from "@/lib/aoi/types";

export function useAoiManager() {
  const [aois, setAois] = useState<AoiSelection[]>(() => readStoredAoiSelections());
  const [selectedAoiId, setSelectedAoiId] = useState<string | null>(() => {
    const stored = readStoredAoiSelections();
    return stored[0]?.id ?? null;
  });
  const [activeDrawMode, setActiveDrawMode] = useState<AoiDrawMode>("select");
  const [intelStateByAoiId, setIntelStateByAoiId] = useState<Record<string, AoiIntelState>>({});
  const storageReadyRef = useRef(true);

  useEffect(() => {
    if (!storageReadyRef.current) {
      return;
    }

    writeStoredAoiSelections(aois);
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
    setIntelStateByAoiId((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const clearAllAois = useCallback(() => {
    setAois([]);
    setSelectedAoiId(null);
    setActiveDrawMode("select");
    setIntelStateByAoiId({});
  }, []);

  const replaceAois = useCallback((nextAois: AoiSelection[]) => {
    setAois(nextAois);
    setSelectedAoiId(nextAois[0]?.id ?? null);
    setIntelStateByAoiId((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([aoiId]) => nextAois.some((aoi) => aoi.id === aoiId)),
      ),
    );
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

  const setAoiIntelState = useCallback((id: string, state: AoiIntelState) => {
    setIntelStateByAoiId((current) => ({
      ...current,
      [id]: state,
    }));
  }, []);

  const clearAoiIntelState = useCallback((id: string) => {
    setIntelStateByAoiId((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  return {
    aois,
    selectedAoiId,
    selectedAoi,
    activeDrawMode,
    intelStateByAoiId,
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
    setAoiIntelState,
    clearAoiIntelState,
    saveToStorage,
    loadFromStorage,
    setActiveDrawMode,
  };
}
