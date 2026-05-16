const VAYLA_BASE_URLS = {
  transportFeatures: 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ogc/features/v1/',
  digiroadFeatures: 'https://avoinapi.vaylapilvi.fi/vaylatiedot/digiroad/ogc/features/v1/',
  inspireRoadFeatures: 'https://avoinapi.vaylapilvi.fi/inspirepalvelu/tn-ro/ogc/features/v1/',
  tiera: 'https://avoinapi.vaylapilvi.fi/tiera/',
  arcgisRestServices: 'https://paikkatieto.vaylapilvi.fi/arcgis/rest/services/',
} as const;

const DEFAULT_TIMEOUT_MS = 15_000;

export interface VaylaRequestOptions {
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface VaylaItemsRequest extends VaylaRequestOptions {
  baseUrl?: string;
  collectionId: string;
  limit?: number;
  bbox?: [number, number, number, number];
  datetime?: string;
  crs?: string;
  filter?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export interface VaylaRoadAddressRequest {
  tie: number;
  tieosa: number;
  ajorata: number;
  etaisyys: number;
}

export interface VaylaRailAddressRequest {
  ratanumero: string;
  ratakilometri: number;
  ratametri: number;
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
  }

  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });

  return controller.signal;
}

function buildBaseUrl(baseUrl: string): URL {
  return new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

function appendDefinedSearchParams(
  url: URL,
  params: Record<string, string | number | boolean | null | undefined>,
): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function fetchVaylaJson<T>(url: URL, options: VaylaRequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Vayla request failed with status ${response.status} for ${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

export async function getLandingPage<T = unknown>(
  baseUrl: string = VAYLA_BASE_URLS.transportFeatures,
  options: VaylaRequestOptions = {},
): Promise<T> {
  return fetchVaylaJson<T>(buildBaseUrl(baseUrl), options);
}

export async function getCollections<T = unknown>(
  baseUrl: string = VAYLA_BASE_URLS.transportFeatures,
  options: VaylaRequestOptions = {},
): Promise<T> {
  const url = new URL('collections', buildBaseUrl(baseUrl));
  return fetchVaylaJson<T>(url, options);
}

export async function getCollectionItems<T = unknown>(request: VaylaItemsRequest): Promise<T> {
  const url = new URL(
    `collections/${request.collectionId}/items`,
    buildBaseUrl(request.baseUrl ?? VAYLA_BASE_URLS.transportFeatures),
  );

  appendDefinedSearchParams(url, {
    limit: request.limit,
    datetime: request.datetime,
    crs: request.crs,
    filter: request.filter,
    ...request.params,
  });

  if (request.bbox) {
    url.searchParams.set('bbox', request.bbox.join(','));
  }

  return fetchVaylaJson<T>(url, request);
}

export async function getDigiroadItems<T = unknown>(
  request: Omit<VaylaItemsRequest, 'baseUrl'>,
): Promise<T> {
  return getCollectionItems<T>({
    ...request,
    baseUrl: VAYLA_BASE_URLS.digiroadFeatures,
  });
}

export async function convertRoadAddressToRail<T = unknown>(
  request: VaylaRoadAddressRequest,
  options: VaylaRequestOptions = {},
): Promise<T> {
  const url = new URL('tieradaksi', buildBaseUrl(VAYLA_BASE_URLS.tiera));
  appendDefinedSearchParams(url, { ...request });
  return fetchVaylaJson<T>(url, options);
}

export async function convertRailAddressToRoad<T = unknown>(
  request: VaylaRailAddressRequest,
  options: VaylaRequestOptions = {},
): Promise<T> {
  const url = new URL('ratatieksi', buildBaseUrl(VAYLA_BASE_URLS.tiera));
  appendDefinedSearchParams(url, { ...request });
  return fetchVaylaJson<T>(url, options);
}

export async function convertRoadAddressesToRail<T = unknown>(
  requests: VaylaRoadAddressRequest[],
  options: VaylaRequestOptions = {},
): Promise<T> {
  const url = new URL('tieradaksi', buildBaseUrl(VAYLA_BASE_URLS.tiera));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(requests),
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Vayla request failed with status ${response.status} for ${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

export async function convertRailAddressesToRoad<T = unknown>(
  requests: VaylaRailAddressRequest[],
  options: VaylaRequestOptions = {},
): Promise<T> {
  const url = new URL('ratatieksi', buildBaseUrl(VAYLA_BASE_URLS.tiera));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(requests),
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Vayla request failed with status ${response.status} for ${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

export { VAYLA_BASE_URLS };
