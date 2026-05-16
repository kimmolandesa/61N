"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import AppShell from "@/components/layout/AppShell";
import LeftPanel from "@/components/layout/LeftPanel";
import RightInspector from "@/components/layout/RightInspector";
import TopToolbar from "@/components/layout/TopToolbar";
import { useAoiManager } from "@/hooks/useAoiManager";
import type { GeoResult, SearchError, SearchResult } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";
import { BASE_MAPS, BASE_MAPS_BY_ID, type BaseMapId } from "@/lib/map/baseMaps";

const OperationalMap = dynamic(() => import("@/components/map/OperationalMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[720px] items-center justify-center rounded-[28px] border border-slate-300 bg-white text-slate-500 shadow-[0_25px_60px_rgba(15,23,42,0.14)]">
      Loading map workspace...
    </div>
  ),
});

const INITIAL_QUERIES = [
  "airports near london",
  "hospitals in paris",
  "power plants in texas",
  "railway stations in delhi",
  "towers in dubai",
  "stadiums in berlin",
  "museums in rome",
  "bridges in new york",
];

function sanitizeQuery(query: string): string | null {
  const sanitized = query.trim().slice(0, 500).replace(/[\x00-\x1F\x7F]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading workspace...</div>}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
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
    addComment,
    toggleFilter,
    intelStateByAoiId,
    setAoiIntelState,
    saveToStorage,
    loadFromStorage,
    setActiveDrawMode,
  } = useAoiManager();

  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [initialQuery, setInitialQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOperator] = useState<string | null>(null);
  const [filterType] = useState<string | null>(null);
  const [weatherFeatures, setWeatherFeatures] = useState<IntelFeature[]>([]);
  const [weatherBounds, setWeatherBounds] = useState<[number, number, number, number] | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<BaseMapId>("streets");
  const [riskOverlayEnabled, setRiskOverlayEnabled] = useState(false);
  const [toolbarMessage, setToolbarMessage] = useState<string | null>(null);
  const [zoomToSelectedAoiToken, setZoomToSelectedAoiToken] = useState(0);

  const isInitialMount = useRef(true);
  const lastUrlQuery = useRef<string | null>(null);

  const handleSearch = useCallback(
    async (query: string, updateUrl = true) => {
      setLoading(true);
      setError(null);
      setSelectedId(null);
      setCurrentQuery(query);
      setWeatherFeatures([]);
      setWeatherBounds(null);

      if (updateUrl) {
        const params = new URLSearchParams();
        params.set("q", query);
        router.push(`?${params.toString()}`, { scroll: false });
      }

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        const data = await response.json();
        if (!response.ok) {
          const weatherResponse = await fetch("/api/weather", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          });

          if (weatherResponse.ok) {
            const weatherData = (await weatherResponse.json()) as {
              location: GeoResult;
              features: IntelFeature[];
            };
            setSearchResult(null);
            setWeatherBounds(weatherData.location.boundingBox);
            setWeatherFeatures(weatherData.features);
            setError(null);
          } else {
            setError((data as SearchError).error);
            setSearchResult(null);
          }
        } else {
          setSearchResult(data as SearchResult);
          setError(null);
        }
      } catch {
        setError("Network error. Please check your connection.");
        setSearchResult(null);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const urlQuery = searchParams.get("q");
    if (urlQuery === lastUrlQuery.current && !isInitialMount.current) {
      return;
    }

    lastUrlQuery.current = urlQuery;
    isInitialMount.current = false;

    if (urlQuery) {
      const sanitized = sanitizeQuery(urlQuery);
      if (sanitized) {
        setInitialQuery(sanitized);
        void handleSearch(sanitized, false);
        return;
      }
    }

    const randomQuery =
      INITIAL_QUERIES[Math.floor(Math.random() * INITIAL_QUERIES.length)];
    setInitialQuery(randomQuery);
    void handleSearch(randomQuery, true);
  }, [handleSearch, searchParams]);

  const handleFetchSelectedData = useCallback(async () => {
    if (!selectedAoi) {
      setToolbarMessage("Select a section before fetching intelligence.");
      return;
    }

    setAoiIntelState(selectedAoi.id, {
      status: "loading",
      message: "Fetching selected data...",
    });

    try {
      const response = await fetch("/api/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aoiId: selectedAoi.id,
          geometry: selectedAoi.geometry,
          bbox: [
            selectedAoi.bounds.west,
            selectedAoi.bounds.south,
            selectedAoi.bounds.east,
            selectedAoi.bounds.north,
          ],
          filters: selectedAoi.selectedFilters,
        }),
      });

      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Unable to fetch selected data.");
      }

      setAoiIntelState(selectedAoi.id, {
        status: "success",
        message: data.message ?? "Selected data request sent.",
        result: data,
        lastFetchedAt: new Date().toISOString(),
      });
    } catch (fetchError) {
      setAoiIntelState(selectedAoi.id, {
        status: "error",
        message:
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to fetch selected data.",
      });
    }
  }, [selectedAoi, setAoiIntelState]);

  const handleNewWorkspace = useCallback(() => {
    if (window.confirm("Clear all current AOIs from this workspace?")) {
      clearAllAois();
      setToolbarMessage("Started a new workspace.");
    }
  }, [clearAllAois]);

  const handleOpenWorkspace = useCallback(() => {
    loadFromStorage();
    setToolbarMessage("Loaded AOIs from local storage.");
  }, [loadFromStorage]);

  const handleSaveWorkspace = useCallback(() => {
    saveToStorage();
    setToolbarMessage("Saved AOIs to local storage.");
  }, [saveToStorage]);

  const handleExportWorkspace = useCallback(() => {
    const featureCollection = {
      type: "FeatureCollection",
      features: aois.map((aoi) => ({
        type: "Feature",
        id: aoi.id,
        geometry: aoi.geometry,
        properties: {
          name: aoi.name,
          notes: aoi.notes,
          comments: aoi.comments,
          shapeType: aoi.shapeType,
          bounds: aoi.bounds,
          center: aoi.center,
          areaSqKm: aoi.areaSqKm,
          selectedFilters: aoi.selectedFilters,
          createdAt: aoi.createdAt,
          updatedAt: aoi.updatedAt,
        },
      })),
    } as const;

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
      type: "application/geo+json",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sightline-aois.geojson";
    link.click();
    window.URL.revokeObjectURL(url);
    setToolbarMessage("Exported AOIs as GeoJSON.");
  }, [aois]);

  const handleUndo = useCallback(() => {
    setToolbarMessage("Undo is not wired yet.");
  }, []);

  const handleRedo = useCallback(() => {
    setToolbarMessage("Redo is not wired yet.");
  }, []);

  const handleRefreshData = useCallback(() => {
    if (currentQuery) {
      void handleSearch(currentQuery, false);
      setToolbarMessage("Refreshing current search data.");
    } else {
      setToolbarMessage("Nothing to refresh yet.");
    }
  }, [currentQuery, handleSearch]);

  const handleGenerateSummary = useCallback(() => {
    setToolbarMessage("Summary generation will be connected to the intelligence pipeline.");
  }, []);

  const handleToggleSatellite = useCallback(() => {
    setActiveBasemap((current) => (current === "satellite" ? "streets" : "satellite"));
  }, []);

  const handleToggleTerrain = useCallback(() => {
    setActiveBasemap((current) => (current === "terrain" ? "streets" : "terrain"));
  }, []);

  const handleZoomToAoi = useCallback(() => {
    if (!selectedAoi) {
      setToolbarMessage("Select an AOI to zoom to it.");
      return;
    }

    setZoomToSelectedAoiToken((current) => current + 1);
  }, [selectedAoi]);

  const statusBanner = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
      <span>
        Search: <span className="font-medium text-slate-900">{currentQuery || "None"}</span>
      </span>
      <span>
        Results:{" "}
        <span className="font-medium text-slate-900">
          {searchResult?.stats.total ?? weatherFeatures.length}
        </span>
      </span>
      <span>
        AOIs: <span className="font-medium text-slate-900">{aois.length}</span>
      </span>
      <span>
        Basemap: <span className="font-medium text-slate-900">{BASE_MAPS_BY_ID[activeBasemap].label}</span>
      </span>
      <span>
        Risk overlays:{" "}
        <span className="font-medium text-slate-900">
          {riskOverlayEnabled ? "On" : "Off"}
        </span>
      </span>
      {toolbarMessage ? <span className="text-slate-500">{toolbarMessage}</span> : null}
      {error ? <span className="font-medium text-rose-700">{error}</span> : null}
    </div>
  );

  return (
    <AppShell
      topBar={
        <TopToolbar
          projectName="Sightline Operational Workspace"
          activeDrawMode={activeDrawMode}
          activeBaseMap={activeBasemap}
          baseMaps={BASE_MAPS}
          onSetDrawMode={(mode) =>
            setActiveDrawMode(mode === "measure" ? "measure" : mode)
          }
          onSetBaseMap={(id) => {
            if (BASE_MAPS_BY_ID[id].available === false) {
              setToolbarMessage("Dark / Tactical layer is a placeholder for now.");
              return;
            }
            setActiveBasemap(id);
          }}
          onNew={handleNewWorkspace}
          onOpen={handleOpenWorkspace}
          onSave={handleSaveWorkspace}
          onExport={handleExportWorkspace}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearSelection={clearSelection}
          onFetchIntelligence={handleFetchSelectedData}
          onRefreshData={handleRefreshData}
          onGenerateSummary={handleGenerateSummary}
          onZoomToAoi={handleZoomToAoi}
          onToggleSatellite={handleToggleSatellite}
          onToggleTerrain={handleToggleTerrain}
          onToggleRiskOverlays={() =>
            setRiskOverlayEnabled((current) => !current)
          }
          onSearch={(query) => void handleSearch(query)}
          loading={loading}
          initialQuery={initialQuery}
        />
      }
      statusBanner={statusBanner}
      leftSidebar={
        <LeftPanel
          aois={aois}
          selectedAoiId={selectedAoiId}
          selectedAoi={selectedAoi}
          onSelectAoi={(id) => selectAoi(id)}
          onToggleFilter={toggleFilter}
        />
      }
      mapCanvas={
        <OperationalMap
          results={searchResult?.results ?? []}
          weatherFeatures={weatherFeatures}
          bounds={searchResult?.bounds ?? weatherBounds ?? null}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filterOperator={filterOperator}
          filterType={filterType}
          aois={aois}
          selectedAoiId={selectedAoiId}
          selectedAoi={selectedAoi}
          drawMode={activeDrawMode}
          activeBasemap={activeBasemap}
          onAddAoiFromGeometry={addAoiFromGeometry}
          onReplaceAoiGeometry={replaceAoiGeometry}
          onSelectAoi={selectAoi}
          zoomToSelectedAoiToken={zoomToSelectedAoiToken}
        />
      }
      rightInspector={
        <RightInspector
          selectedAoi={selectedAoi}
          loading={selectedAoi ? intelStateByAoiId[selectedAoi.id]?.status === "loading" : false}
          fetchMessage={selectedAoi ? intelStateByAoiId[selectedAoi.id]?.message ?? null : null}
          onUpdateAoi={updateAoi}
          onAddComment={addComment}
          onToggleFilter={toggleFilter}
          onFetchSelectedData={handleFetchSelectedData}
          onDeleteAoi={deleteAoi}
        />
      }
    />
  );
}
