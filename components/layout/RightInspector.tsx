"use client";

import AoiPanel from "@/components/aoi/AoiPanel";
import type { AoiDataFilter, AoiSelection } from "@/lib/aoi/types";

interface RightInspectorProps {
  selectedAoi: AoiSelection | null;
  onUpdateAoi: (id: string, patch: Partial<AoiSelection>) => void;
  onAddComment: (id: string, text: string) => void;
  onToggleFilter: (id: string, filter: AoiDataFilter) => void;
  onFetchSelectedData: () => void;
  onDeleteAoi: (id: string) => void;
}

export default function RightInspector(props: RightInspectorProps) {
  return (
    <aside className="flex min-h-0 flex-col border-t border-slate-200 bg-[#fbfcfe] xl:h-full xl:border-l xl:border-t-0">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Inspector
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Notes, comments, filters, and intelligence actions for the currently selected area.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <AoiPanel {...props} />
      </div>
    </aside>
  );
}
