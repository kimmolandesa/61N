"use client";

import type { AoiDataFilter, AoiSelection } from "@/lib/aoi/types";

const FILTER_OPTIONS: Array<{ value: AoiDataFilter; label: string }> = [
  { value: "terrain", label: "Terrain" },
  { value: "weather", label: "Weather" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "roads", label: "Roads" },
  { value: "bridges", label: "Bridges" },
  { value: "population", label: "Population" },
  { value: "telecom", label: "Telecom" },
  { value: "satellite", label: "Satellite" },
  { value: "healthcare", label: "Healthcare" },
  { value: "power", label: "Power grid" },
  { value: "water", label: "Water sources" },
  { value: "logistics", label: "Logistics" },
];

interface AoiFiltersProps {
  aoi: AoiSelection;
  onToggleFilter: (id: string, filter: AoiDataFilter) => void;
}

export default function AoiFilters({ aoi, onToggleFilter }: AoiFiltersProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Intelligence Filters</h3>
        <p className="text-xs text-slate-500">
          Select which categories this area should request when intelligence is fetched.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {FILTER_OPTIONS.map((filter) => (
          <label
            key={filter.value}
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            <input
              type="checkbox"
              checked={aoi.selectedFilters.includes(filter.value)}
              onChange={() => onToggleFilter(aoi.id, filter.value)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
            />
            <span>{filter.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
