"use client";

import type { AoiDrawMode } from "@/lib/aoi/types";

interface AoiToolbarProps {
  activeDrawMode: AoiDrawMode;
  onSetDrawMode: (mode: AoiDrawMode) => void;
}

const TOOLS: Array<{ mode: AoiDrawMode; label: string }> = [
  { mode: "select", label: "Select" },
  { mode: "polygon", label: "Polygon" },
  { mode: "rectangle", label: "Rectangle" },
  { mode: "circle", label: "Circle" },
  { mode: "freehand", label: "Freehand" },
  { mode: "measure", label: "Measure" },
];

export default function AoiToolbar({
  activeDrawMode,
  onSetDrawMode,
}: AoiToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TOOLS.map((tool) => (
        <button
          key={tool.mode}
          type="button"
          onClick={() => onSetDrawMode(tool.mode)}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
            activeDrawMode === tool.mode
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
}
