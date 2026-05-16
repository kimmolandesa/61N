import type { AoiSelection } from "@/lib/aoi/types";
import type {
  AreaIntelHighlight,
  AreaIntelReport,
  AreaIntelSourceSummary,
} from "@/lib/aoi/intel";
import type { IntelCategory, IntelFeature, IntelSourceAdapter } from "@/lib/intel/types";
import {
  fmiSourceAdapter,
  maanmittauslaitosSourceAdapter,
  opencellidSourceAdapter,
  vaylaSourceAdapter,
} from "@/lib/intel/sources";

interface SourceJob {
  adapter: IntelSourceAdapter;
  query?: string;
  skip?: string;
}

const SOURCE_JOBS: SourceJob[] = [
  { adapter: fmiSourceAdapter },
  { adapter: opencellidSourceAdapter },
  {
    adapter: maanmittauslaitosSourceAdapter,
    skip: "Collection query not configured for terrain ingestion yet.",
  },
  {
    adapter: vaylaSourceAdapter,
    skip: "Collection query not configured for transport ingestion yet.",
  },
];

function pushCount(
  counts: Partial<Record<IntelCategory, number>>,
  category: IntelCategory,
  amount: number,
): void {
  counts[category] = (counts[category] ?? 0) + amount;
}

function buildSourceSummary(args: {
  sourceId: string;
  label: string;
  category: IntelCategory;
  status: "success" | "error" | "skipped";
  features?: IntelFeature[];
  error?: string;
  note?: string;
}): AreaIntelSourceSummary {
  return {
    sourceId: args.sourceId,
    label: args.label,
    category: args.category,
    status: args.status,
    featureCount: args.features?.length ?? 0,
    error: args.error,
    note: args.note,
    sampleNames: (args.features ?? [])
      .map((feature) => feature.name)
      .filter((name): name is string => typeof name === "string")
      .slice(0, 3),
  };
}

function buildHighlights(sourceSummaries: AreaIntelSourceSummary[]): AreaIntelHighlight[] {
  const highlights: AreaIntelHighlight[] = [];

  const telecom = sourceSummaries.find((source) => source.sourceId === "opencellid");
  if (telecom?.status === "success") {
    highlights.push({
      id: "telecom-density",
      sourceId: telecom.sourceId,
      title: "Telecom coverage observations",
      detail: `${telecom.featureCount} cell observations were found in this area.`,
    });
  }

  const weather = sourceSummaries.find((source) => source.sourceId === "fmi");
  if (weather?.status === "success") {
    highlights.push({
      id: "weather-coverage",
      sourceId: weather.sourceId,
      title: "Weather points available",
      detail: `${weather.featureCount} weather observation points were returned for the AOI.`,
    });
  }

  const failed = sourceSummaries.filter((source) => source.status === "error");
  if (failed.length > 0) {
    highlights.push({
      id: "source-gaps",
      sourceId: failed[0].sourceId,
      title: "Some sources need attention",
      detail: `${failed.length} configured source${failed.length === 1 ? "" : "s"} failed during this fetch.`,
    });
  }

  const skipped = sourceSummaries.filter((source) => source.status === "skipped");
  if (skipped.length > 0) {
    highlights.push({
      id: "source-skips",
      sourceId: skipped[0].sourceId,
      title: "Some feeds are staged but not configured yet",
      detail: `${skipped.length} source${skipped.length === 1 ? "" : "s"} are ready for future AOI ingestion once collection mappings are chosen.`,
    });
  }

  return highlights;
}

export async function fetchAreaIntel(aoi: AoiSelection): Promise<AreaIntelReport> {
  const sourceSummaries = await Promise.all(
    SOURCE_JOBS.map(async (job): Promise<AreaIntelSourceSummary> => {
      if (job.skip) {
        return buildSourceSummary({
          sourceId: job.adapter.id,
          label: job.adapter.label,
          category: job.adapter.category,
          status: "skipped",
          note: job.skip,
        });
      }

      try {
        const features = await job.adapter.fetch({
          bbox: [aoi.bounds.west, aoi.bounds.south, aoi.bounds.east, aoi.bounds.north],
          query: job.query,
        });

        return buildSourceSummary({
          sourceId: job.adapter.id,
          label: job.adapter.label,
          category: job.adapter.category,
          status: "success",
          features,
          note:
            features.length === 0
              ? "No observations were returned for the selected AOI."
              : undefined,
        });
      } catch (error) {
        return buildSourceSummary({
          sourceId: job.adapter.id,
          label: job.adapter.label,
          category: job.adapter.category,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown source error",
        });
      }
    }),
  );

  const categoryCounts: Partial<Record<IntelCategory, number>> = {};
  let totalFeatures = 0;

  for (const summary of sourceSummaries) {
    if (summary.status !== "success") {
      continue;
    }

    totalFeatures += summary.featureCount;
    pushCount(categoryCounts, summary.category, summary.featureCount);
  }

  const totals = {
    features: totalFeatures,
    sourcesSuccessful: sourceSummaries.filter((source) => source.status === "success").length,
    sourcesFailed: sourceSummaries.filter((source) => source.status === "error").length,
    sourcesSkipped: sourceSummaries.filter((source) => source.status === "skipped").length,
  };

  return {
    aoi,
    generatedAt: new Date().toISOString(),
    totals,
    categoryCounts,
    sourceSummaries,
    highlights: buildHighlights(sourceSummaries),
    message:
      totalFeatures > 0
        ? "Area intelligence fetched successfully."
        : "Area intelligence fetched, but no observations were returned from the active sources.",
  };
}
