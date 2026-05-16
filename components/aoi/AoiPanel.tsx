"use client";

import AoiComments from "@/components/aoi/AoiComments";
import AoiFilters from "@/components/aoi/AoiFilters";
import type { AoiDataFilter, AoiSelection } from "@/lib/aoi/types";

interface AoiPanelProps {
  selectedAoi: AoiSelection | null;
  loading: boolean;
  fetchMessage: string | null;
  onUpdateAoi: (id: string, patch: Partial<AoiSelection>) => void;
  onAddComment: (id: string, text: string) => void;
  onToggleFilter: (id: string, filter: AoiDataFilter) => void;
  onFetchSelectedData: () => void;
  onDeleteAoi: (id: string) => void;
}

export default function AoiPanel({
  selectedAoi,
  loading,
  fetchMessage,
  onUpdateAoi,
  onAddComment,
  onToggleFilter,
  onFetchSelectedData,
  onDeleteAoi,
}: AoiPanelProps) {
  if (!selectedAoi) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-5 py-6 text-sm text-slate-500">
        Select or draw an area to add notes, comments, and intelligence filters.
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
              Notes
            </span>
            <textarea
              rows={5}
              value={selectedAoi.notes}
              onChange={(event) => onUpdateAoi(selectedAoi.id, { notes: event.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <AoiComments aoi={selectedAoi} onAddComment={onAddComment} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <AoiFilters aoi={selectedAoi} onToggleFilter={onToggleFilter} />
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

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onFetchSelectedData}
            disabled={loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Fetching…" : "Fetch selected data"}
          </button>
          <button
            type="button"
            onClick={() => onDeleteAoi(selectedAoi.id)}
            className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
          >
            Delete AOI
          </button>
        </div>
        {fetchMessage && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {fetchMessage}
          </div>
        )}
      </section>
    </div>
  );
}
