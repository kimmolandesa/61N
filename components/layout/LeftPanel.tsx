"use client";

import { useMemo } from "react";
import type { AoiDataFilter, AoiIntelState, AoiSelection } from "@/lib/aoi/types";
import { INTEL_CATEGORIES_BY_ID } from "@/lib/intel/categories";

const SHAPE_LABELS = {
  polygon: "Polygon",
  rectangle: "Rectangle",
  circle: "Circle",
  freehand: "Freehand",
} as const;

const FILTER_GROUPS: Array<{
  label: string;
  filters: AoiDataFilter[];
}> = [
  {
    label: "Can forces move here?",
    filters: ["terrain", "topography", "elevation", "roads", "bridges", "logistics"],
  },
  {
    label: "What gives cover or concealment?",
    filters: ["landCover", "forestDensity", "water"],
  },
  {
    label: "How does weather change the picture?",
    filters: ["weather", "visibility", "satellite"],
  },
  {
    label: "How can forces be supported?",
    filters: ["infrastructure", "telecom", "healthcare", "power"],
  },
  {
    label: "Who else is in the area?",
    filters: ["population", "demographics"],
  },
];

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
  const groupedFilters = useMemo(
    () =>
      FILTER_GROUPS.map((group) => ({
        ...group,
        filters: group.filters
          .map((filterId) => INTEL_CATEGORIES_BY_ID[filterId])
          .filter((filter) => !!filter),
      })),
    [],
  );

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
                      {SHAPE_LABELS[aoi.shapeType]} · {aoi.areaSqKm ? `${aoi.areaSqKm.toFixed(1)} km²` : "Area n/a"} · {aoi.selectedFilters.length} active layers
                    </div>
                  </button>
                  <div className="flex items-start gap-3">
                    <div className={`pt-0.5 text-[11px] ${aoi.id === selectedAoiId ? "text-slate-400" : "text-slate-400"}`}>
                      {new Date(aoi.createdAt).toLocaleDateString()}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this section?")) {
                          onDeleteAoi(aoi.id);
                        }
                      }}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                        aoi.id === selectedAoiId
                          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      }`}
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
            Intelligence Questions
          </div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {!selectedAoi ? (
              <div className="text-sm text-slate-500">
                Select a section to choose what questions this briefing should answer.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedFilters.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {group.label}
                    </div>
                    {group.filters.map((filter) => (
                      <label
                        key={filter.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${
                          filter.available === false
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                            : "border-slate-200 text-slate-700"
                        }`}
                        title={filter.description}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAoi.selectedFilters.includes(filter.id)}
                          onChange={() => onToggleFilter(selectedAoi.id, filter.id)}
                          disabled={filter.available === false}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        />
                        <div>
                          <div>{filter.label}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{filter.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
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
                    {intelState.summary?.message ? (
                      <div className="mt-1 text-xs text-slate-600">{intelState.summary.message}</div>
                    ) : null}
                    {intelState.fetchedAt ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Fetched {new Date(intelState.fetchedAt).toLocaleString()}
                      </div>
                    ) : null}
                    {intelState.summary?.sourceSummaries?.length ? (
                      <div className="mt-3 space-y-2">
                        {intelState.summary.sourceSummaries.slice(0, 3).map((source) => (
                          <div key={source.sourceId} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
                            <span className="font-semibold">{source.label}:</span>{" "}
                            {source.message ?? `${source.featureCount} feature${source.featureCount === 1 ? "" : "s"} returned.`}
                          </div>
                        ))}
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
