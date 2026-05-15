import { getCollectionItems, getCollections, MML_BASE_URLS } from '@/lib/intel/providers/maanmittauslaitos';
import type { IntelFeature, IntelFetchParams, IntelSourceAdapter } from '@/lib/intel/types';
import { isRecord, normalizeFeatureCollection, queryMatchesCollection } from '@/lib/intel/sources/utils';

const MML_ATTRIBUTION = 'National Land Survey of Finland open spatial data';

interface CollectionDescriptor {
  id?: string;
  title?: string;
  description?: string;
}

async function resolveCollectionId(
  baseUrl: string,
  query: string | undefined,
): Promise<string> {
  const response = await getCollections<{ collections?: CollectionDescriptor[] }>(baseUrl);
  const collections = response.collections ?? [];

  const collection = collections.find((entry) => isRecord(entry) && queryMatchesCollection(entry, query));

  if (!collection?.id) {
    throw new Error(`No Maanmittauslaitos collection matched query "${query ?? ''}"`);
  }

  return collection.id;
}

export const maanmittauslaitosSourceAdapter: IntelSourceAdapter = {
  id: 'maanmittauslaitos',
  label: 'Maanmittauslaitos',
  category: 'terrain',
  async fetch(params: IntelFetchParams): Promise<IntelFeature[]> {
    const collectionId = await resolveCollectionId(MML_BASE_URLS.topographicFeatures, params.query);
    const data = await getCollectionItems({
      baseUrl: MML_BASE_URLS.topographicFeatures,
      collectionId,
      bbox: params.bbox,
      limit: 500,
      datetime:
        params.startTime && params.endTime
          ? `${params.startTime}/${params.endTime}`
          : undefined,
    });

    return normalizeFeatureCollection({
      source: 'maanmittauslaitos',
      category: 'terrain',
      data,
      attribution: MML_ATTRIBUTION,
      timestampFromProperties: ['timestamp', 'modified', 'created'],
    });
  },
};
