"use client";

import { useMemo, useState } from "react";
import type { AoiDataFilter, AoiSelection, AoiShapeType } from "@/lib/aoi/types";

export type AoiDrawMode =
  | "idle"
  | "polygon"
  | "rectangle"
  | "circle"
  | "freehand"
  | "edit";

const FILTER_OPTIONS: Array<{ value: AoiDataFilter; label: string }> = [
  { value: "terrain", label: "Terrain" },
  { value: "weather", label: "Weather" },
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

const SHAPE_LABELS: Record<AoiShapeType, string> = {
  polygon: "Polygon",
  rectangle: "Rectangle",
  circle: "Circle",
  freehand: "Freehand",
};

interface AoiPanelProps {
  aois: AoiSelection[];
  selectedAoi: AoiSelection | null;
  selectedAoiId: string | null;
  drawMode: AoiDrawMode;
  loading: boolean;
  fetchMessage: string | null;
  onSetDrawMode: (mode: AoiDrawMode) => void;
  onSelectAoi: (id: string) => void;
  onClearDrawing: () => void;
  onClearAllAois: () => void;
  onDeleteAoi: (id: string) => void;
  onUpdateAoi: (id: string, patch: Partial<AoiSelection>) => void;
  onAddComment: (id: string, text: string) => void;
  onToggleFilter: (id: string, filter: AoiDataFilter) => void;
  onFetchSelectedData: () => void;
}

export default function AoiPanel({
  aois,
  selectedAoi,
  selectedAoiId,
  drawMode,
  loading,
  fetchMessage,
  onSetDrawMode,
  onSelectAoi,
  onClearDrawing,
  onClearAllAois,
  onDeleteAoi,
  onUpdateAoi,
  onAddComment,
  onToggleFilter,
  onFetchSelectedData,
}: AoiPanelProps) {
  const [commentText, setCommentText] = useState("");

  const commentCountLabel = useMemo(() => {
    if (!selectedAoi) {
      return "0 comments";
    }

    const count = selectedAoi.comments.length;
    return `${count} comment${count === 1 ? "" : "s"}`;
  }, [selectedAoi]);

  const handleAddComment = () => {
    if (!selectedAoi) {
      return;
    }

    onAddComment(selectedAoi.id, commentText);
    setCommentText("");
  };

  return (
    <section className="aoi-panel" aria-label="Area of Interest">
      <div className="aoi-panel-header">
        <div className="aoi-panel-title">Area of Interest</div>
        <div className="aoi-panel-description">
          Build and compare multiple map areas, annotate them, and choose which data layers to request.
        </div>
      </div>

      <div className="aoi-tool-grid aoi-draw-grid">
        <button
          type="button"
          className={`aoi-tool-button ${drawMode === "polygon" ? "active" : ""}`}
          onClick={() => onSetDrawMode("polygon")}
        >
          Polygon
        </button>
        <button
          type="button"
          className={`aoi-tool-button ${drawMode === "rectangle" ? "active" : ""}`}
          onClick={() => onSetDrawMode("rectangle")}
        >
          Rectangle
        </button>
        <button
          type="button"
          className={`aoi-tool-button ${drawMode === "circle" ? "active" : ""}`}
          onClick={() => onSetDrawMode("circle")}
        >
          Circle
        </button>
        <button
          type="button"
          className={`aoi-tool-button ${drawMode === "freehand" ? "active" : ""}`}
          onClick={() => onSetDrawMode("freehand")}
        >
          Freehand
        </button>
        <button
          type="button"
          className={`aoi-tool-button ${drawMode === "edit" ? "active" : ""}`}
          onClick={() => onSetDrawMode("edit")}
        >
          Select/Edit
        </button>
        <button type="button" className="aoi-clear-button" onClick={onClearDrawing}>
          Clear drawing
        </button>
      </div>

      <div className="aoi-list-header">
        <span className="aoi-list-title">Saved areas</span>
        <button type="button" className="aoi-list-action" onClick={onClearAllAois}>
          Clear all
        </button>
      </div>

      {aois.length > 0 ? (
        <div className="aoi-list">
          {aois.map((aoi) => (
            <div key={aoi.id} className={`aoi-list-item ${aoi.id === selectedAoiId ? "active" : ""}`}>
              <button
                type="button"
                className="aoi-list-select"
                onClick={() => onSelectAoi(aoi.id)}
              >
                <span className="aoi-list-name">{aoi.name}</span>
                <span className="aoi-list-meta">
                  {SHAPE_LABELS[aoi.shapeType]} · {aoi.areaSqKm ? `${aoi.areaSqKm.toFixed(1)} km²` : "n/a"}
                </span>
              </button>
              <button type="button" className="aoi-list-delete" onClick={() => onDeleteAoi(aoi.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="aoi-status-message">
          No AOIs saved yet. Pick a draw mode and sketch the first one on the map.
        </div>
      )}

      {selectedAoi && (
        <div className="aoi-detail-stack">
          <div className="aoi-meta-row">
            <span className="aoi-meta-label">Shape</span>
            <span className="aoi-meta-value">{SHAPE_LABELS[selectedAoi.shapeType]}</span>
          </div>
          <div className="aoi-meta-row">
            <span className="aoi-meta-label">Center</span>
            <span className="aoi-meta-value">
              {selectedAoi.center.lat.toFixed(4)}, {selectedAoi.center.lon.toFixed(4)}
            </span>
          </div>

          <div className="aoi-field">
            <label className="aoi-field-label" htmlFor="aoi-name">
              Name
            </label>
            <input
              id="aoi-name"
              type="text"
              className="aoi-input"
              value={selectedAoi.name}
              onChange={(event) => onUpdateAoi(selectedAoi.id, { name: event.target.value })}
            />
          </div>

          <div className="aoi-field">
            <label className="aoi-field-label" htmlFor="aoi-notes">
              Notes
            </label>
            <textarea
              id="aoi-notes"
              className="aoi-textarea"
              rows={4}
              value={selectedAoi.notes}
              onChange={(event) => onUpdateAoi(selectedAoi.id, { notes: event.target.value })}
            />
          </div>

          <div className="aoi-intel-section">
            <div className="aoi-intel-section-title">Comments</div>
            <div className="aoi-source-note">{commentCountLabel}</div>
            <textarea
              className="aoi-textarea"
              rows={3}
              placeholder="Add a comment for this area"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
            <button type="button" className="aoi-apply-button" onClick={handleAddComment}>
              Add comment
            </button>
            {selectedAoi.comments.length > 0 && (
              <div className="aoi-source-list">
                {selectedAoi.comments.map((comment) => (
                  <div key={comment.id} className="aoi-source-card">
                    <div className="aoi-source-meta">
                      {new Date(comment.createdAt).toLocaleString()}
                    </div>
                    <div className="aoi-highlight-detail">{comment.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="aoi-intel-section">
            <div className="aoi-intel-section-title">Data filters</div>
            <div className="aoi-filter-grid">
              {FILTER_OPTIONS.map((filter) => (
                <label key={filter.value} className="aoi-filter-option">
                  <input
                    type="checkbox"
                    checked={selectedAoi.selectedFilters.includes(filter.value)}
                    onChange={() => onToggleFilter(selectedAoi.id, filter.value)}
                  />
                  <span>{filter.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="aoi-action-row">
            <button
              type="button"
              className="aoi-fetch-button"
              onClick={onFetchSelectedData}
              disabled={loading}
            >
              {loading ? "Fetching…" : "Fetch selected data"}
            </button>
            <button
              type="button"
              className="aoi-list-delete aoi-delete-primary"
              onClick={() => onDeleteAoi(selectedAoi.id)}
            >
              Delete AOI
            </button>
          </div>

          {fetchMessage && <div className="aoi-status-message">{fetchMessage}</div>}
        </div>
      )}
    </section>
  );
}
