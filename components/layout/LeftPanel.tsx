"use client";

import { useMemo } from "react";
import type { AoiDataFilter, AoiIntelState, AoiSelection } from "@/lib/aoi/types";
import { INTEL_CATEGORIES } from "@/lib/intel/categories";

const SHAPE_LABELS = {
  polygon: "Polygon",
  rectangle: "Rectangle",
  circle: "Circle",
  freehand: "Freehand",
} as const;

interface LeftPanelProps {
  aois: AoiSelection[];
  selectedAoiId: string | null;
  selectedAoi: AoiSelection | null;
  onSelectAoi: (id: string) => void;
  onDeleteAoi: (id: string) => void;
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

const GROUP_LABELS: Record<string, string> = {
  Terrain: "Terrain & Topography",
  Weather: "Weather & Climate",
  Infrastructure: "Infrastructure",
  Population: "Population",
  Satellite: "Satellite",
};

export default function LeftPanel({
  aois,
  selectedAoiId,
  selectedAoi,
  onSelectAoi,
  onDeleteAoi,
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
    const byCategory = intelState?.summary?.byCategory ?? {};
    return Object.entries(byCategory).sort(([left], [right]) => left.localeCompare(right));
  }, [intelState]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, typeof INTEL_CATEGORIES>();
    for (const category of INTEL_CATEGORIES) {
      const label = GROUP_LABELS[category.group];
      groups.set(label, [...(groups.get(label) ?? []), category]);
    }
    return Array.from(groups.entries());
  }, []);

  const enabledSelectedFilters = selectedAoi
    ? selectedAoi.selectedFilters.filter((filter) => {
        const config = INTEL_CATEGORIES.find((entry) => entry.id === filter);
        return config?.available !== false;
      })
    : [];

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
              <div
                key={aoi.id}
                className={`rounded-xl border px-4 py-3 shadow-sm transition ${
                  aoi.id === selectedAoiId
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectAoi(aoi.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="font-medium">{aoi.name}</div>
                    <div className={`mt-1 text-xs ${aoi.id === selectedAoiId ? "text-slate-300" : "text-slate-500"}`}>
                      {SHAPE_LABELS[aoi.shapeType]} · {aoi.areaSqKm ? `${aoi.areaSqKm.toFixed(1)} km²` : "Area n/a"} · {aoi.selectedFilters.length} categories
                    </div>
                  </button>
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5 text-[11px] text-slate-400">
                      {new Date(aoi.createdAt).toLocaleDateString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this section?")) {
                          onDeleteAoi(aoi.id);
                        }
                      }}
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
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
                Select a section to configure intelligence sources.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedCategories.map(([groupLabel, categories]) => (
                  <div key={groupLabel} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {groupLabel}
                    </div>
                    {categories.map((category) => {
                      const disabled = category.available === false;
                      return (
                        <label
                          key={category.id}
                          title={category.description}
                          className={`block rounded-lg border px-3 py-2 transition ${
                            disabled
                              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                              : "border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedAoi.selectedFilters.includes(category.id)}
                              disabled={disabled}
                              onChange={() => onToggleFilter(selectedAoi.id, category.id)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            />
                            <div>
                              <div className="text-sm font-medium">{category.label}</div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                {category.description}
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={onFetchIntelligence}
                  disabled={intelState?.status === "loading" || enabledSelectedFilters.length === 0}
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {intelState?.status === "loading" ? "Fetching…" : "Fetch Intelligence"}
                </button>
                {enabledSelectedFilters.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Select at least one enabled intelligence category for this section.
                  </div>
                ) : null}
                {intelState?.status === "error" && intelState.error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {intelState.error}
                  </div>
                ) : null}
                {intelState?.status === "success" ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <div>
                      {intelState.summary?.total
                        ? `${intelState.summary.total} feature${intelState.summary.total === 1 ? "" : "s"} loaded.`
                        : "No data returned for selected sources."}
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
                            <span className="font-medium text-slate-600">{category}</span>
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
