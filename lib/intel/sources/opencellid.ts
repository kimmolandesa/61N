import { getCellsInArea } from '@/lib/intel/providers/opencellid';
import type { IntelFeature, IntelFetchParams, IntelSourceAdapter } from '@/lib/intel/types';
import { toIntelFeature } from '@/lib/intel/sources/utils';

const OPENCELLID_ATTRIBUTION = 'OpenCellID community database';

export const opencellidSourceAdapter: IntelSourceAdapter = {
  id: 'opencellid',
  label: 'OpenCellID',
  category: 'telecom',
  async fetch(params: IntelFetchParams): Promise<IntelFeature[]> {
    const data = await getCellsInArea({
      bbox: [params.bbox[0], params.bbox[1], params.bbox[2], params.bbox[3]],
      limit: 250,
    });

    return data.cells.map((cell, index): IntelFeature =>
      toIntelFeature({
        id: `${cell.mcc}-${cell.mnc}-${cell.lac}-${cell.cellid}-${index}`,
        name: `Cell ${cell.cellid}`,
        source: 'opencellid',
        category: 'telecom',
        geometry: {
          type: 'Point',
          coordinates: [cell.lon, cell.lat],
        },
        properties: {
          mcc: cell.mcc,
          mnc: cell.mnc,
          lac: cell.lac,
          cellid: cell.cellid,
          radio: cell.radio,
          samples: cell.samples,
          range: cell.range,
          averageSignalStrength: cell.averageSignalStrength,
        },
        confidence:
          typeof cell.samples === 'number'
            ? Math.min(1, Math.max(0, cell.samples / 10))
            : undefined,
        attribution: OPENCELLID_ATTRIBUTION,
      }),
    );
  },
};
