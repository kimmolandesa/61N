"use client";

import { useMemo } from "react";
import type { AoiDataFilter, AoiIntelState, AoiSelection } from "@/lib/aoi/types";

const SHAPE_LABELS = {
  polygon: "Polygon",
  rectangle: "Rectangle",
  circle: "Circle",
  freehand: "Freehand",
} as const;

const FILTER_OPTIONS: Array<{ value: AoiDataFilter; label: string }> = [
  { value: "weather", label: "Weather" },
  { value: "terrain", label: "Terrain" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "roads", label: "Roads" },
  { value: "bridges", label: "Bridges" },
  { value: "population", label: "Population" },
  { value: "telecom", label: "Telecom" },
  { value: "satellite", label: "Satellite" },
  { value: "healthcare", label: "Healthcare" },
  { value: "power", label: "Power Grid" },
  { value: "water", label: "Water Sources" },
  { value: "logistics", label: "Logistics" },
];

interface LeftPanelProps {
  aois: AoiSelection[];
  selectedAoiId: string | null;
  selectedAoi: AoiSelection | null;
  onSelectAoi: (id: string) => void;
  onToggleFilter: (id: string, filter: AoiDataFilter) => void;
  onFetchIntelligence: () => void;
  intelState: AoiIntelState | null;
  areaSearchQuery: string;
  areaSearchLoading: boolean;
  areaSearchMessage: string | null;
  areaSearchCount: number;
  onAreaSearchQueryChange: (value: string) => void;
  onRunAreaSearch: () => void;
}

export default function LeftPanel({
  aois,
  selectedAoiId,
  selectedAoi,
  onSelectAoi,
  onToggleFilter,
  onFetchIntelligence,
  intelState,
  areaSearchQuery,
  areaSearchLoading,
  areaSearchMessage,
  areaSearchCount,
  onAreaSearchQueryChange,
  onRunAreaSearch,
}: LeftPanelProps) {
  const intelCounts = useMemo(() => {
    if (!intelState?.featureCollection) {
      return [];
    }

    const counts = new Map<string, number>();
    for (const feature of intelState.featureCollection.features) {
      const category =
        typeof feature.properties?.category === "string"
          ? feature.properties.category
          : "unknown";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    return Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [intelState]);

  return (
    <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-[#f8fafc] xl:h-full xl:border-b-0 xl:border-r">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Sections
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Every drawn area becomes its own section with separate filters, notes, and intelligence state.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {aois.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
              No sections yet. Use the drawing tools to create the first one.
            </div>
          ) : (
            aois.map((aoi) => (
              <button
                key={aoi.id}
                type="button"
                onClick={() => onSelectAoi(aoi.id)}
                className={`w-full rounded-xl border px-4 py-3 text-left shadow-sm transition ${
                  aoi.id === selectedAoiId
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{aoi.name}</div>
                    <div className={`mt-1 text-xs ${aoi.id === selectedAoiId ? "text-slate-300" : "text-slate-500"}`}>
                      {SHAPE_LABELS[aoi.shapeType]} · {aoi.areaSqKm ? `${aoi.areaSqKm.toFixed(1)} km²` : "Area n/a"} · {aoi.selectedFilters.length} sources
                    </div>
                  </div>
                  <div className={`text-[11px] ${aoi.id === selectedAoiId ? "text-slate-400" : "text-slate-400"}`}>
                    {new Date(aoi.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Data Sources
          </div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {!selectedAoi ? (
              <div className="text-sm text-slate-500">
                Select a section to configure data sources.
              </div>
            ) : (
              <div className="space-y-3">
                {FILTER_OPTIONS.map((filter) => (
                  <label
                    key={filter.value}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAoi.selectedFilters.includes(filter.value)}
                      onChange={() => onToggleFilter(selectedAoi.id, filter.value)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <span>{filter.label}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={onFetchIntelligence}
                  disabled={intelState?.status === "loading"}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {intelState?.status === "loading" ? "Fetching…" : "Fetch Intelligence"}
                </button>
                {intelState?.status === "error" && intelState.error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {intelState.error}
                  </div>
                ) : null}
                {intelState?.status === "success" ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <div>
                      {intelState.featureCollection?.features.length
                        ? `${intelState.featureCollection.features.length} feature${intelState.featureCollection.features.length === 1 ? "" : "s"} loaded.`
                        : "No data returned for selected sources"}
                    </div>
                    {intelState.fetchedAt ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Fetched {new Date(intelState.fetchedAt).toLocaleString()}
                      </div>
                    ) : null}
                    {intelCounts.length > 0 ? (
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {intelCounts.map(([category, count]) => (
                          <div key={category} className="flex items-center justify-between text-xs">
                            <span className="font-medium capitalize text-slate-600">{category}</span>
                            <span className="text-slate-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Section Search
          </div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {!selectedAoi ? (
              <div className="text-sm text-slate-500">
                Select a section to search inside it.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-slate-500">
                  Search only inside this section. Current results: {areaSearchCount}
                </div>
                <input
                  type="text"
                  value={areaSearchQuery}
                  onChange={(event) => onAreaSearchQueryChange(event.target.value)}
                  placeholder='Example: "museums" or "bridges"'
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="button"
                  onClick={onRunAreaSearch}
                  disabled={areaSearchLoading}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {areaSearchLoading ? "Searching…" : "Search section"}
                </button>
                {areaSearchMessage ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {areaSearchMessage}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
