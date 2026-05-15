import { executeStoredQuery } from '@/lib/intel/providers/fmi';
import type { IntelFeature, IntelFetchParams, IntelSourceAdapter } from '@/lib/intel/types';
import { bboxCenter, bboxToFmiParam, toIntelFeature } from '@/lib/intel/sources/utils';

const FMI_ATTRIBUTION = 'Finnish Meteorological Institute open data';
const FMI_POINT_REGEX = /<gml:pos[^>]*>\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*<\/gml:pos>/g;
const FMI_TIME_REGEX = /<gml:timePosition[^>]*>\s*([^<]+)\s*<\/gml:timePosition>/;

function parseFmiPoints(xml: string): IntelFeature[] {
  const features: IntelFeature[] = [];
  const timestampMatch = xml.match(FMI_TIME_REGEX);
  const timestamp = timestampMatch?.[1];
  let index = 0;

  for (const match of xml.matchAll(FMI_POINT_REGEX)) {
    const lat = Number(match[1]);
    const lon = Number(match[2]);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      continue;
    }

    features.push(
      toIntelFeature({
        id: `fmi-${index}`,
        name: `FMI observation point ${index + 1}`,
        source: 'fmi',
        category: 'weather',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties: {
          provider: 'FMI',
          index,
        },
        timestamp,
        attribution: FMI_ATTRIBUTION,
      }),
    );

    index += 1;
  }

  return features;
}

export const fmiSourceAdapter: IntelSourceAdapter = {
  id: 'fmi',
  label: 'Finnish Meteorological Institute',
  category: 'weather',
  async fetch(params: IntelFetchParams): Promise<IntelFeature[]> {
    const [lat, lon] = bboxCenter(params.bbox);
    const xml = await executeStoredQuery({
      storedQueryId: 'fmi::observations::weather::multipointcoverage',
      params: {
        bbox: bboxToFmiParam(params.bbox),
        latlon: `${lat},${lon}`,
        starttime: params.startTime,
        endtime: params.endTime,
        parameters: params.query,
      },
    });

    return parseFmiPoints(xml);
  },
};
