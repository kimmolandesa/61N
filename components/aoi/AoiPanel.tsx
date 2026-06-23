"use client";

import { useMemo, useState } from "react";
import type { AoiSelection } from "@/lib/aoi/types";
import { INTEL_CATEGORIES_BY_ID } from "@/lib/intel/categories";

interface AoiPanelProps {
  selectedAoi: AoiSelection | null;
  onUpdateAoi: (id: string, patch: Partial<AoiSelection>) => void;
}

type JudgmentTone = "good" | "warning" | "info";

export default function AoiPanel({
  selectedAoi,
  onUpdateAoi,
}: AoiPanelProps) {
  const [featureSearchQuery, setFeatureSearchQuery] = useState("");
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const judgments = useMemo<Array<{ title: string; tone: JudgmentTone; body: string }>>(() => {
    if (!selectedAoi?.intel.featureCollection) {
      return [];
    }

    const features = selectedAoi.intel.featureCollection.features;
    const byCategory = selectedAoi.intel.summary?.byCategory ?? {};
    const notes = selectedAoi.intel.summary?.notes ?? [];

    const terrainCells = byCategory.terrain ?? 0;
    const roads = byCategory.roads ?? 0;
    const bridges = byCategory.bridges ?? 0;
    const logistics = byCategory.logistics ?? 0;
    const weather = byCategory.weather ?? 0;
    const visibility = byCategory.visibility ?? 0;
    const telecom = byCategory.telecom ?? 0;
    const healthcare = byCategory.healthcare ?? 0;
    const water = byCategory.water ?? 0;
    const infrastructure = byCategory.infrastructure ?? 0;

    const restrictiveTerrain = features.filter((feature) => {
      const coverClass = feature.properties?.cover_class;
      return coverClass === "wetland" || coverClass === "slope";
    }).length;
    const concealedTerrain = features.filter((feature) => {
      const coverClass = feature.properties?.cover_class;
      return coverClass === "dense_forest" || coverClass === "sparse_forest";
    }).length;
    const estimatedPopulation = features.reduce((total, feature) => {
      const value = feature.properties?.population;
      return total + (typeof value === "number" ? value : 0);
    }, 0);
    const weatherReason = notes.find((note) =>
      /wind|weather|visibility|drone|mobility|aviation|precip/i.test(note),
    );

    return [
      {
        title: "Can forces move here?",
        tone:
          roads + bridges + logistics > 0
            ? restrictiveTerrain > Math.max(3, terrainCells * 0.2)
              ? "warning"
              : "good"
            : "info",
        body:
          roads + bridges + logistics > 0
            ? `${roads} road features, ${bridges} bridge features, and ${logistics} logistics features were returned. ${restrictiveTerrain > 0 ? `${restrictiveTerrain} terrain cells look movement-restrictive.` : "No major terrain friction cells were highlighted in the fetched layer."}`
            : terrainCells > 0
              ? `${terrainCells} terrain cells were returned, but route-support layers are light. Use the map to confirm passable approaches.`
              : "Movement picture is incomplete until terrain and route layers are fetched.",
      },
      {
        title: "What blocks or slows movement?",
        tone: restrictiveTerrain + water + bridges > 0 ? "warning" : "info",
        body:
          restrictiveTerrain + water + bridges > 0
            ? `${restrictiveTerrain} restrictive terrain cells, ${water} water features, and ${bridges} bridge features are the main friction points to review.`
            : "No obvious chokepoints or blocking terrain were emphasized in the current section output.",
      },
      {
        title: "What cover does the terrain provide?",
        tone: concealedTerrain > 0 ? "good" : "info",
        body:
          concealedTerrain > 0
            ? `${concealedTerrain} terrain cells suggest forested or concealed ground. That improves cover but may slow movement and observation.`
            : "The current terrain layers do not show strong concealment signatures in this section.",
      },
      {
        title: "How does weather change the situation?",
        tone: weatherReason ? "warning" : weather + visibility > 0 ? "info" : "info",
        body:
          weatherReason ??
          (weather + visibility > 0
            ? "Weather and visibility layers are loaded. Use the weather markers to confirm near-term operational constraints."
            : "Weather impact has not been fetched for this section yet."),
      },
      {
        title: "Who and what else is in the area?",
        tone: estimatedPopulation > 0 ? "warning" : infrastructure + telecom + healthcare > 0 ? "info" : "info",
        body:
          estimatedPopulation > 0
            ? `Estimated civilian presence is about ${estimatedPopulation.toLocaleString()} people. Infrastructure layers also returned ${infrastructure} general infrastructure features, ${telecom} telecom features, and ${healthcare} healthcare features.`
            : infrastructure + telecom + healthcare > 0
              ? `Support and civilian context is present through ${infrastructure} infrastructure features, ${telecom} telecom features, and ${healthcare} healthcare features.`
              : "Civilian and support context is still sparse in the current section output.",
      },
    ];
  }, [selectedAoi]);
  const intelCounts = useMemo(
    () =>
      Object.entries(selectedAoi?.intel.summary?.byCategory ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [selectedAoi],
  );

  function judgmentClasses(tone: JudgmentTone) {
    if (tone === "good") {
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    }
    if (tone === "warning") {
      return "border-amber-200 bg-amber-50 text-amber-900";
    }
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  function exportFeatureCollection() {
    if (!selectedAoi?.intel.featureCollection) {
      return;
    }

    const blob = new Blob(
      [JSON.stringify(selectedAoi.intel.featureCollection, null, 2)],
      { type: "application/geo+json" },
    );
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedAoi.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "section"}-full-intel.geojson`;
    link.click();
    window.URL.revokeObjectURL(url);
  }
  const sourceCounts = useMemo(
    () =>
      Object.entries(selectedAoi?.intel.summary?.bySource ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [selectedAoi],
  );
  const featureRows = useMemo(() => {
    if (!selectedAoi?.intel.featureCollection) {
      return [];
    }

    return selectedAoi.intel.featureCollection.features.map((feature, index) => {
      const id = String(feature.id ?? `feature-${index}`);
      const properties = feature.properties ?? {};
      const category =
        typeof properties.category === "string" ? properties.category : "unknown";
      const source =
        typeof properties.source === "string" ? properties.source : "unknown";
      const name =
        typeof properties.name === "string" && properties.name.trim().length > 0
          ? properties.name
          : `${category} feature`;
      const description =
        typeof properties.description === "string" ? properties.description : "";

      return {
        id,
        index: index + 1,
        name,
        category,
        source,
        geometryType: feature.geometry.type,
        description,
        properties,
        searchableText: [
          id,
          name,
          category,
          source,
          description,
          ...Object.entries(properties).flatMap(([key, value]) => [key, String(value ?? "")]),
        ]
          .join(" ")
          .toLowerCase(),
      };
    });
  }, [selectedAoi]);
  const filteredFeatureRows = useMemo(() => {
    const query = featureSearchQuery.trim().toLowerCase();
    if (!query) {
      return featureRows;
    }

    return featureRows.filter((row) => row.searchableText.includes(query));
  }, [featureRows, featureSearchQuery]);
  const selectedFeatureRow = useMemo(
    () =>
      filteredFeatureRows.find((row) => row.id === selectedFeatureId) ??
      featureRows.find((row) => row.id === selectedFeatureId) ??
      filteredFeatureRows[0] ??
      null,
    [featureRows, filteredFeatureRows, selectedFeatureId],
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
          <h3 className="text-sm font-semibold text-slate-900">Key Judgments</h3>
          <p className="text-xs text-slate-500">
            Brief this section as answers to mission questions, not as raw layer counts.
          </p>
        </div>
        {selectedAoi.intel.status === "success" ? (
          <div className="space-y-2">
            {judgments.map((judgment) => (
              <div
                key={judgment.title}
                className={`rounded-xl border px-3 py-3 ${judgmentClasses(judgment.tone)}`}
              >
                <div className="text-sm font-semibold">{judgment.title}</div>
                <div className="mt-1 text-sm leading-6">{judgment.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            Fetch intelligence for this section to generate analyst-ready judgments.
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">What Was Fetched</h3>
          <p className="text-xs text-slate-500">
            Runtime status and quick verification for the current briefing package.
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
            {selectedAoi.intel.summary?.message ? (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                {selectedAoi.intel.summary.message}
              </div>
            ) : null}
            {selectedAoi.intel.summary?.sourceSummaries?.length ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Source health
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {selectedAoi.intel.summary.sourceSummaries.map((source) => (
                    <div
                      key={source.sourceId}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-700">{source.label}</span>
                        <span className="text-xs uppercase tracking-wide text-slate-500">
                          {source.status}
                        </span>
                      </div>
                      {source.message ? (
                        <div className="mt-1 text-xs text-slate-500">{source.message}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedAoi.selectedFilters.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Requested questions
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedAoi.selectedFilters.map((filter) => (
                    <span
                      key={filter}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                    >
                      {INTEL_CATEGORIES_BY_ID[filter]?.label ?? filter}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
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

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Full Feature Inventory</h3>
            <p className="text-xs text-slate-500">
              Inspect every fetched feature in the marked area and export the full AOI dataset.
            </p>
          </div>
          <button
            type="button"
            onClick={exportFeatureCollection}
            disabled={!selectedAoi.intel.featureCollection?.features.length}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Full AOI Data
          </button>
        </div>
        {selectedAoi.intel.status === "success" ? (
          <>
            <div className="flex flex-col gap-3 lg:flex-row">
              <input
                type="text"
                value={featureSearchQuery}
                onChange={(event) => setFeatureSearchQuery(event.target.value)}
                placeholder="Search by name, category, source, or any returned property"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {filteredFeatureRows.length} of {featureRows.length} features shown
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-[56px_minmax(0,1.6fr)_120px_120px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span>#</span>
                  <span>Feature</span>
                  <span>Category</span>
                  <span>Source</span>
                  <span>Geometry</span>
                </div>
                <div className="max-h-[420px] overflow-y-auto">
                  {filteredFeatureRows.length > 0 ? (
                    filteredFeatureRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedFeatureId(row.id)}
                        className={`grid w-full grid-cols-[56px_minmax(0,1.6fr)_120px_120px_120px] gap-3 border-b border-slate-100 px-3 py-3 text-left text-sm transition hover:bg-slate-50 ${
                          selectedFeatureRow?.id === row.id ? "bg-sky-50" : "bg-white"
                        }`}
                      >
                        <span className="text-slate-500">{row.index}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900">{row.name}</span>
                          <span className="mt-1 block truncate text-xs text-slate-500">
                            {row.description || row.id}
                          </span>
                        </span>
                        <span className="truncate text-slate-700">{row.category}</span>
                        <span className="truncate text-slate-700">{row.source}</span>
                        <span className="truncate text-slate-500">{row.geometryType}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-sm text-slate-500">
                      No features match this search.
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {selectedFeatureRow ? (
                  <>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Selected feature
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {selectedFeatureRow.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {selectedFeatureRow.category} · {selectedFeatureRow.source} · {selectedFeatureRow.geometryType}
                      </div>
                    </div>
                    {selectedFeatureRow.description ? (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        {selectedFeatureRow.description}
                      </div>
                    ) : null}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Full properties
                      </div>
                      <pre className="max-h-[360px] overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-800">
                        {JSON.stringify(selectedFeatureRow.properties, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">
                    Select a feature from the table to inspect all returned properties.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
            Fetch intelligence for this section to build a complete feature inventory.
          </div>
        )}
      </section>
    </div>
  );
}
