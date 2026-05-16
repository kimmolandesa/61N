"use client";

import { useMemo } from "react";
import type { AoiSelection } from "@/lib/aoi/types";

interface AoiPanelProps {
  selectedAoi: AoiSelection | null;
  onUpdateAoi: (id: string, patch: Partial<AoiSelection>) => void;
}

export default function AoiPanel({
  selectedAoi,
  onUpdateAoi,
}: AoiPanelProps) {
  const intelCounts = useMemo(
    () =>
      Object.entries(selectedAoi?.intel.summary?.byCategory ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [selectedAoi],
  );
  const sourceCounts = useMemo(
    () =>
      Object.entries(selectedAoi?.intel.summary?.bySource ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [selectedAoi],
  );

  if (!selectedAoi) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-5 py-6 text-sm text-slate-500">
        Select or draw an area to update section notes and review intelligence.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Selected Area
          </h2>
          <p className="mt-1 text-lg font-semibold text-slate-900">{selectedAoi.name}</p>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Name
            </span>
            <input
              value={selectedAoi.name}
              onChange={(event) => onUpdateAoi(selectedAoi.id, { name: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Section Notes
            </span>
            <textarea
              rows={14}
              value={selectedAoi.notes}
              onChange={(event) => onUpdateAoi(selectedAoi.id, { notes: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Metadata</h3>
          <p className="text-xs text-slate-500">Live AOI geometry and workspace metadata.</p>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-sm text-slate-700">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Center</dt>
            <dd>
              {selectedAoi.center.lat.toFixed(5)}, {selectedAoi.center.lon.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">BBox</dt>
            <dd>
              {selectedAoi.bounds.west.toFixed(4)}, {selectedAoi.bounds.south.toFixed(4)} →{" "}
              {selectedAoi.bounds.east.toFixed(4)}, {selectedAoi.bounds.north.toFixed(4)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Approx. Area</dt>
            <dd>{selectedAoi.areaSqKm ? `${selectedAoi.areaSqKm.toFixed(2)} km²` : "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Created</dt>
            <dd>{new Date(selectedAoi.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Updated</dt>
            <dd>{new Date(selectedAoi.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Intelligence Status</h3>
          <p className="text-xs text-slate-500">
            Runtime status and summary for the currently selected section.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Status: <span className="font-medium capitalize">{selectedAoi.intel.status}</span>
        </div>
        {selectedAoi.intel.status === "error" && selectedAoi.intel.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {selectedAoi.intel.error}
          </div>
        ) : null}
        {selectedAoi.intel.fetchedAt ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Fetched {new Date(selectedAoi.intel.fetchedAt).toLocaleString()}
          </div>
        ) : null}
        {selectedAoi.intel.status === "success" ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Total features: <span className="font-medium">{selectedAoi.intel.summary?.total ?? 0}</span>
            </div>
            {intelCounts.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  By category
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {intelCounts.map(([category, count]) => (
                    <div
                      key={category}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-700">{category}</span>
                      <span className="text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {sourceCounts.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  By source
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {sourceCounts.map(([source, count]) => (
                    <div
                      key={source}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-slate-700">{source}</span>
                      <span className="text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {!(selectedAoi.intel.summary?.total) ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                No data returned for selected sources.
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
