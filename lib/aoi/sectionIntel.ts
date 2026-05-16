import type { AoiDataFilter } from "@/lib/aoi/types";
import type { IntelFeature } from "@/lib/intel/types";

export interface SectionIntelSourceSummary {
  sourceId: AoiDataFilter;
  label: string;
  status: "success" | "error";
  featureCount: number;
  message?: string;
}

export interface SectionIntelResponse {
  aoiId: string;
  bbox: [number, number, number, number];
  requestedFilters: AoiDataFilter[];
  generatedAt: string;
  message: string;
  notes: string[];
  totals: {
    features: number;
    sourcesSuccessful: number;
    sourcesFailed: number;
  };
  sourceSummaries: SectionIntelSourceSummary[];
  overlays: IntelFeature[];
}
