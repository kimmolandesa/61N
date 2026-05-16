"use client";

import type { ReactNode } from "react";

interface AppShellProps {
  topBar: ReactNode;
  leftSidebar: ReactNode;
  mapCanvas: ReactNode;
  rightInspector: ReactNode;
  statusBanner?: ReactNode;
}

export default function AppShell({
  topBar,
  leftSidebar,
  mapCanvas,
  rightInspector,
  statusBanner,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#eef2f7] text-slate-900">
      <div className="sticky top-0 z-30">
        {topBar}
        {statusBanner ? <div className="border-b border-slate-200 bg-white px-4 py-2">{statusBanner}</div> : null}
      </div>
      <div className="grid min-h-[calc(100vh-88px)] grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        {leftSidebar}
        <main className="min-h-0 overflow-visible bg-[linear-gradient(180deg,#eef2f7,#e5ebf3)] p-4 sm:p-6">
          <div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Map Working Paper
            </div>
            <div className="flex-1">{mapCanvas}</div>
          </div>
        </main>
        {rightInspector}
      </div>
    </div>
  );
}
