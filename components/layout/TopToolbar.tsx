"use client";

import type { ReactNode } from "react";
import AoiToolbar from "@/components/aoi/AoiToolbar";
import type { AoiDrawMode } from "@/lib/aoi/types";
import type { BaseMapId, BaseMapConfig } from "@/lib/map/baseMaps";
import type { IntelDisplayTheme } from "@/lib/intel/categories";
import { INTEL_DISPLAY_THEMES } from "@/lib/intel/categories";

interface TopToolbarProps {
  projectName: string;
  activeDrawMode: AoiDrawMode;
  activeBaseMap: BaseMapId;
  activeDisplayTheme: IntelDisplayTheme;
  baseMaps: BaseMapConfig[];
  onSetDrawMode: (mode: AoiDrawMode) => void;
  onSetBaseMap: (id: BaseMapId) => void;
  onSetDisplayTheme: (theme: IntelDisplayTheme) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
}

function ToolbarGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {title}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

export default function TopToolbar(props: TopToolbarProps) {
  return (
    <header className="border-b border-slate-200 bg-[#f7f8fb] px-4 py-3">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          Workspace
        </div>
        <div className="text-2xl font-semibold text-slate-900">{props.projectName}</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <ToolbarGroup title="File">
          <ToolbarButton label="New" onClick={props.onNew} />
          <ToolbarButton label="Open" onClick={props.onOpen} />
          <ToolbarButton label="Save" onClick={props.onSave} />
          <ToolbarButton label="Export" onClick={props.onExport} />
        </ToolbarGroup>
        <ToolbarGroup title="Map">
          <AoiToolbar
            activeDrawMode={props.activeDrawMode}
            onSetDrawMode={props.onSetDrawMode}
          />
          <div className="flex flex-wrap items-center gap-2">
            {props.baseMaps.map((baseMap) => (
              <button
                key={baseMap.id}
                type="button"
                onClick={() => props.onSetBaseMap(baseMap.id)}
                disabled={baseMap.available === false}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                  props.activeBaseMap === baseMap.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                } ${baseMap.available === false ? "cursor-not-allowed opacity-50" : ""}`}
                title={baseMap.description}
              >
                {baseMap.label}
              </button>
            ))}
          </div>
        </ToolbarGroup>
       
      </div>
    </header>
  );
}
