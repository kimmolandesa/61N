"use client";

import { useState } from "react";
import type { AoiSelection } from "@/lib/aoi/types";

interface AoiCommentsProps {
  aoi: AoiSelection;
  onAddComment: (id: string, text: string) => void;
}

export default function AoiComments({ aoi, onAddComment }: AoiCommentsProps) {
  const [value, setValue] = useState("");

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
        <p className="text-xs text-slate-500">
          Add observations, assumptions, and follow-up notes for this area.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="Add a comment for this AOI"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
      <button
        type="button"
        onClick={() => {
          onAddComment(aoi.id, value);
          setValue("");
        }}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        Add comment
      </button>
      <div className="space-y-2">
        {aoi.comments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            No comments yet for this area.
          </div>
        ) : (
          aoi.comments
            .slice()
            .reverse()
            .map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
              >
                <div className="mb-1 text-xs text-slate-500">
                  {new Date(comment.createdAt).toLocaleString()}
                </div>
                <div className="text-sm text-slate-800">{comment.text}</div>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
