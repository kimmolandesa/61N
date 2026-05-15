const FMI_WFS_BASE_URL = 'https://opendata.fmi.fi/wfs';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ACCEPT_HEADER = 'application/xml, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5';

export interface FmiRequestOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface FmiStoredQueryRequest extends FmiRequestOptions {
  storedQueryId: string;
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

async function fetchFmi(url: URL, options: FmiRequestOptions = {}): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Accept: DEFAULT_ACCEPT_HEADER,
      ...options.headers,
    },
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`FMI request failed with status ${response.status} for ${url.toString()}`);
  }

  return response;
}

function buildWfsUrl(baseUrl: string, params: Record<string, string>): URL {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function normalizeStoredQueryParams(
  params: Record<string, string | number | boolean | null | undefined> = {},
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    normalized[key] = String(value);
  }

  return normalized;
}

export function buildFmiStoredQueryUrl({
  baseUrl = FMI_WFS_BASE_URL,
  storedQueryId,
  params = {},
}: Pick<FmiStoredQueryRequest, 'baseUrl' | 'storedQueryId' | 'params'>): URL {
  return buildWfsUrl(baseUrl, {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: storedQueryId,
    ...normalizeStoredQueryParams(params),
  });
}

export async function getCapabilities(options: FmiRequestOptions = {}): Promise<string> {
  const url = buildWfsUrl(options.baseUrl ?? FMI_WFS_BASE_URL, {
    service: 'WFS',
    request: 'getCapabilities',
  });

  const response = await fetchFmi(url, options);
  return response.text();
}

export async function listStoredQueries(options: FmiRequestOptions = {}): Promise<string> {
  const url = buildWfsUrl(options.baseUrl ?? FMI_WFS_BASE_URL, {
    service: 'WFS',
    version: '2.0.0',
    request: 'listStoredQueries',
  });

  const response = await fetchFmi(url, options);
  return response.text();
}

export async function describeStoredQueries(options: FmiRequestOptions = {}): Promise<string> {
  const url = buildWfsUrl(options.baseUrl ?? FMI_WFS_BASE_URL, {
    service: 'WFS',
    version: '2.0.0',
    request: 'describeStoredQueries',
  });

  const response = await fetchFmi(url, options);
  return response.text();
}

export async function executeStoredQuery(request: FmiStoredQueryRequest): Promise<string> {
  const response = await fetchFmi(buildFmiStoredQueryUrl(request), request);
  return response.text();
}

export async function getWeatherObservationsByPlace(
  place: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
  options: FmiRequestOptions = {},
): Promise<string> {
  return executeStoredQuery({
    ...options,
    storedQueryId: 'fmi::observations::weather::multipointcoverage',
    params: {
      place,
      ...params,
    },
  });
}

export async function getForecastByPlace(
  place: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
  options: FmiRequestOptions = {},
): Promise<string> {
  return executeStoredQuery({
    ...options,
    storedQueryId: 'fmi::forecast::harmonie::surface::point::multipointcoverage',
    params: {
      place,
      ...params,
    },
  });
}

export { FMI_WFS_BASE_URL };
