"use client";

import type { AoiSelection } from "@/lib/aoi/types";

const SHAPE_LABELS = {
  polygon: "Polygon",
  rectangle: "Rectangle",
  circle: "Circle",
  freehand: "Freehand",
} as const;

interface LeftSidebarProps {
  aois: AoiSelection[];
  selectedAoiId: string | null;
  onSelectAoi: (id: string) => void;
}

export default function LeftSidebar({
  aois,
  selectedAoiId,
  onSelectAoi,
}: LeftSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-[#f8fafc]">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Operational Areas
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Manage saved AOIs, inspect layer context, and keep the active workspace organized.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {aois.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
              No AOIs yet. Use the toolbar to draw the first area.
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
                    <div
                      className={`mt-1 text-xs ${
                        aoi.id === selectedAoiId ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {SHAPE_LABELS[aoi.shapeType]} · {aoi.selectedFilters.length} filters
                    </div>
                  </div>
                  <div
                    className={`text-[11px] ${
                      aoi.id === selectedAoiId ? "text-slate-400" : "text-slate-400"
                    }`}
                  >
                    {new Date(aoi.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-6 space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Map Layers
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              Basemap, AOIs, and intelligence overlays are managed from the top toolbar.
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Saved Products
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
              Intelligence summaries and exported map products will appear here.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
