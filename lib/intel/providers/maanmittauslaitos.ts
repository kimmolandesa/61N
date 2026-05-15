const MML_BASE_URLS = {
  topographicFeatures: 'https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1/',
  geographicNames: 'https://avoin-paikkatieto.maanmittauslaitos.fi/geographic-names/features/v1/',
} as const;

const DEFAULT_TIMEOUT_MS = 15_000;
const MML_DEFAULT_API_KEY_ENV = 'MML_API_KEY';

export interface MmlRequestOptions {
  apiKey?: string;
  apiKeyEnvVar?: string;
  authMode?: 'basic' | 'query';
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface MmlItemsRequest extends MmlRequestOptions {
  baseUrl?: string;
  collectionId: string;
  limit?: number;
  bbox?: [number, number, number, number];
  bboxCrs?: string;
  crs?: string;
  datetime?: string;
  filter?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
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

function getApiKey(options: MmlRequestOptions): string {
  const apiKey = options.apiKey ?? process.env[options.apiKeyEnvVar ?? MML_DEFAULT_API_KEY_ENV];

  if (!apiKey) {
    throw new Error(
      `Maanmittauslaitos API key missing. Set ${options.apiKeyEnvVar ?? MML_DEFAULT_API_KEY_ENV} or pass apiKey directly.`,
    );
  }

  return apiKey;
}

export function createBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

export function applyMmlAuthentication(url: URL, options: MmlRequestOptions): HeadersInit {
  const apiKey = getApiKey(options);

  if ((options.authMode ?? 'basic') === 'query') {
    url.searchParams.set('api-key', apiKey);
    return options.headers ?? {};
  }

  return {
    Authorization: createBasicAuthHeader(apiKey),
    ...options.headers,
  };
}

async function fetchMmlJson<T>(url: URL, options: MmlRequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...applyMmlAuthentication(url, options),
    },
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Maanmittauslaitos request failed with status ${response.status} for ${url.toString()}`);
  }

  return response.json() as Promise<T>;
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

export async function getLandingPage<T = unknown>(
  baseUrl: string = MML_BASE_URLS.topographicFeatures,
  options: MmlRequestOptions = {},
): Promise<T> {
  return fetchMmlJson<T>(buildBaseUrl(baseUrl), options);
}

export async function getCollections<T = unknown>(
  baseUrl: string = MML_BASE_URLS.topographicFeatures,
  options: MmlRequestOptions = {},
): Promise<T> {
  const url = new URL('collections', buildBaseUrl(baseUrl));
  return fetchMmlJson<T>(url, options);
}

export async function getCollectionItems<T = unknown>(request: MmlItemsRequest): Promise<T> {
  const baseUrl = request.baseUrl ?? MML_BASE_URLS.topographicFeatures;
  const url = new URL(`collections/${request.collectionId}/items`, buildBaseUrl(baseUrl));

  appendDefinedSearchParams(url, {
    limit: request.limit,
    datetime: request.datetime,
    'bbox-crs': request.bboxCrs,
    crs: request.crs,
    filter: request.filter,
    ...request.params,
  });

  if (request.bbox) {
    url.searchParams.set('bbox', request.bbox.join(','));
  }

  return fetchMmlJson<T>(url, request);
}

export async function searchTopographicFeatures<T = unknown>(
  request: Omit<MmlItemsRequest, 'baseUrl'>,
): Promise<T> {
  return getCollectionItems<T>({
    ...request,
    baseUrl: MML_BASE_URLS.topographicFeatures,
  });
}

export async function searchGeographicNames<T = unknown>(
  request: Omit<MmlItemsRequest, 'baseUrl'>,
): Promise<T> {
  return getCollectionItems<T>({
    ...request,
    baseUrl: MML_BASE_URLS.geographicNames,
  });
}

export { MML_BASE_URLS, MML_DEFAULT_API_KEY_ENV };
