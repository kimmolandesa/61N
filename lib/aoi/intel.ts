import type { AoiSelection } from "@/lib/aoi/types";
import type { IntelCategory } from "@/lib/intel/types";

export interface AreaIntelHighlight {
  id: string;
  sourceId: string;
  title: string;
  detail: string;
}

export interface AreaIntelSourceSummary {
  sourceId: string;
  label: string;
  category: IntelCategory;
  status: "success" | "error" | "skipped";
  featureCount: number;
  note?: string;
  error?: string;
  sampleNames: string[];
}

export interface AreaIntelReport {
  aoi: AoiSelection;
  generatedAt: string;
  totals: {
    features: number;
    sourcesSuccessful: number;
    sourcesFailed: number;
    sourcesSkipped: number;
  };
  categoryCounts: Partial<Record<IntelCategory, number>>;
  sourceSummaries: AreaIntelSourceSummary[];
  highlights: AreaIntelHighlight[];
  message: string;
}
