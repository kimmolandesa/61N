"use client";

import type { AoiDataFilter, AoiSelection } from "@/lib/aoi/types";

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
}

export default function LeftPanel({
  aois,
  selectedAoiId,
  selectedAoi,
  onSelectAoi,
  onToggleFilter,
}: LeftPanelProps) {
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
              <div className="space-y-2">
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
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
