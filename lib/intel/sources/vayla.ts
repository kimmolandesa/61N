import { getCollectionItems, getCollections, VAYLA_BASE_URLS } from '@/lib/intel/providers/vayla';
import type { IntelFetchParams, IntelSourceAdapter } from '@/lib/intel/types';
import { isRecord, normalizeFeatureCollection, queryMatchesCollection } from '@/lib/intel/sources/utils';

const VAYLA_ATTRIBUTION = 'Finnish Transport Infrastructure Agency open API';

interface CollectionDescriptor {
  id?: string;
  title?: string;
  description?: string;
}

async function resolveCollectionId(query: string | undefined): Promise<string> {
  const response = await getCollections<{ collections?: CollectionDescriptor[] }>(
    VAYLA_BASE_URLS.transportFeatures,
  );
  const collections = response.collections ?? [];
  const collection = collections.find((entry) => isRecord(entry) && queryMatchesCollection(entry, query));

  if (!collection?.id) {
    throw new Error(`No Vayla collection matched query "${query ?? ''}"`);
  }

  return collection.id;
}

export const vaylaSourceAdapter: IntelSourceAdapter = {
  id: 'vayla',
  label: 'Vayla',
  category: 'infrastructure',
  async fetch(params: IntelFetchParams) {
    const collectionId = await resolveCollectionId(params.query);
    const data = await getCollectionItems({
      baseUrl: VAYLA_BASE_URLS.transportFeatures,
      collectionId,
      bbox: params.bbox,
      limit: 500,
      datetime:
        params.startTime && params.endTime
          ? `${params.startTime}/${params.endTime}`
          : undefined,
    });

    return normalizeFeatureCollection({
      source: 'vayla',
      category: 'infrastructure',
      data,
      attribution: VAYLA_ATTRIBUTION,
      timestampFromProperties: ['timestamp', 'viimeisinMuutos', 'modified'],
    });
  },
};
