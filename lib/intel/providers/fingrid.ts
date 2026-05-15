const FINGRID_BASE_URL = 'https://data.fingrid.fi/api';
const DEFAULT_TIMEOUT_MS = 15_000;
const FINGRID_DEFAULT_API_KEY_ENV = 'FINGRID_API_KEY';

export type FingridFormat = 'json' | 'csv' | 'xml';
export type FingridLocale = 'en' | 'fi';
export type FingridSortBy = 'startTime' | 'endTime';
export type FingridSortOrder = 'asc' | 'desc';

export interface FingridRequestOptions {
  apiKey?: string;
  apiKeyEnvVar?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface FingridDatasetDataRequest extends FingridRequestOptions {
  datasetId: number;
  startTime?: string;
  endTime?: string;
  format?: FingridFormat;
  oneRowPerTimePeriod?: boolean;
  pageSize?: number;
  page?: number;
  locale?: FingridLocale;
  sortBy?: FingridSortBy;
  sortOrder?: FingridSortOrder;
}

export interface FingridDatasetMetadataRequest extends FingridRequestOptions {
  datasetId: number;
  locale?: FingridLocale;
}

export interface FingridListDatasetsRequest extends FingridRequestOptions {
  pageSize?: number;
  page?: number;
  locale?: FingridLocale;
}

export interface FingridDatasetValue {
  datasetId: number;
  startTime: string;
  endTime: string;
  value: number;
}

export interface FingridPagination {
  total: number;
  lastPage: number;
  prevPage: number | null;
  nextPage: number | null;
  perPage: number;
  currentPage: number;
  from: number;
  to: number;
}

export interface FingridDatasetDataResponse {
  data: FingridDatasetValue[];
  pagination: FingridPagination;
}

export interface FingridDatasetMetadata {
  id: number;
  nameEn?: string;
  nameFi?: string;
  descriptionEn?: string;
  descriptionFi?: string;
  dataPeriod?: string;
  unit?: string;
  [key: string]: unknown;
}

export interface FingridDatasetListResponse {
  data: FingridDatasetMetadata[];
  pagination: FingridPagination;
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

function getApiKey(options: FingridRequestOptions): string {
  const apiKey = options.apiKey ?? process.env[options.apiKeyEnvVar ?? FINGRID_DEFAULT_API_KEY_ENV];

  if (!apiKey) {
    throw new Error(
      `Fingrid API key missing. Set ${options.apiKeyEnvVar ?? FINGRID_DEFAULT_API_KEY_ENV} or pass apiKey directly.`,
    );
  }

  return apiKey;
}

function buildFingridUrl(
  path: string,
  options: FingridRequestOptions,
  params: Record<string, string | number | boolean | null | undefined>,
): URL {
  const baseUrl = options.baseUrl ?? FINGRID_BASE_URL;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ''), normalizedBase);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function fetchFingridJson<T>(
  path: string,
  options: FingridRequestOptions,
  params: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const url = buildFingridUrl(path, options, params);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-key': getApiKey(options),
      ...options.headers,
    },
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Fingrid request failed with status ${response.status} for ${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

export async function getDatasetData(
  request: FingridDatasetDataRequest,
): Promise<FingridDatasetDataResponse> {
  return fetchFingridJson<FingridDatasetDataResponse>(`datasets/${request.datasetId}/data`, request, {
    startTime: request.startTime,
    endTime: request.endTime,
    format: request.format ?? 'json',
    oneRowPerTimePeriod: request.oneRowPerTimePeriod,
    pageSize: request.pageSize,
    page: request.page,
    locale: request.locale,
    sortBy: request.sortBy,
    sortOrder: request.sortOrder,
  });
}

export async function getDatasetMetadata(
  request: FingridDatasetMetadataRequest,
): Promise<FingridDatasetMetadata> {
  return fetchFingridJson<FingridDatasetMetadata>(`datasets/${request.datasetId}`, request, {
    locale: request.locale,
  });
}

export async function listDatasets(
  request: FingridListDatasetsRequest = {},
): Promise<FingridDatasetListResponse> {
  return fetchFingridJson<FingridDatasetListResponse>('datasets', request, {
    pageSize: request.pageSize,
    page: request.page,
    locale: request.locale,
  });
}

export { FINGRID_BASE_URL, FINGRID_DEFAULT_API_KEY_ENV };
