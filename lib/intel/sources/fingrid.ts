import { getDatasetData } from '@/lib/intel/providers/fingrid';
import type { IntelFeature, IntelFetchParams, IntelSourceAdapter } from '@/lib/intel/types';
import { bboxCenter, toIntelFeature } from '@/lib/intel/sources/utils';

const FINGRID_ATTRIBUTION = 'Fingrid Open Data';

function resolveDatasetId(query: string | undefined): number {
  if (!query) {
    throw new Error(
      'Fingrid source requires a numeric datasetId in params.query (see https://data.fingrid.fi/en/datasets).',
    );
  }

  const datasetId = Number.parseInt(query.trim(), 10);

  if (!Number.isFinite(datasetId) || datasetId <= 0) {
    throw new Error(`Fingrid source could not parse datasetId from query "${query}".`);
  }

  return datasetId;
}

export const fingridSourceAdapter: IntelSourceAdapter = {
  id: 'fingrid',
  label: 'Fingrid Open Data',
  category: 'infrastructure',
  async fetch(params: IntelFetchParams): Promise<IntelFeature[]> {
    const datasetId = resolveDatasetId(params.query);
    const [lat, lon] = bboxCenter(params.bbox);
    const response = await getDatasetData({
      datasetId,
      startTime: params.startTime,
      endTime: params.endTime,
      pageSize: 500,
      sortBy: 'startTime',
      sortOrder: 'asc',
    });

    return response.data.map((point, index): IntelFeature =>
      toIntelFeature({
        id: `fingrid-${datasetId}-${point.startTime}-${index}`,
        name: `Fingrid dataset ${datasetId}`,
        source: 'fingrid',
        category: 'infrastructure',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          datasetId: point.datasetId,
          value: point.value,
          startTime: point.startTime,
          endTime: point.endTime,
        },
        timestamp: point.startTime,
        attribution: FINGRID_ATTRIBUTION,
      }),
    );
  },
};
