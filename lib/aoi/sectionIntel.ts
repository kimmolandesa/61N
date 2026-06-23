import type { AoiDataFilter, SectionIntelSourceSummary } from "@/lib/aoi/types";
import type { IntelFeature } from "@/lib/intel/types";

export interface SectionIntelResponse {
  sectionId?: string;
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
