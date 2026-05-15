const OPENCELLID_BASE_URL = 'https://opencellid.org';
const DEFAULT_TIMEOUT_MS = 15_000;
const OPENCELLID_DEFAULT_API_KEY_ENV = 'OPENCELLID_API_KEY';

export type OpenCellIdRadio = 'GSM' | 'UMTS' | 'LTE' | 'NBIOT' | 'NR' | 'CDMA';

export interface OpenCellIdRequestOptions {
  apiKey?: string;
  apiKeyEnvVar?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface OpenCellIdCellLookupRequest extends OpenCellIdRequestOptions {
  mcc: number;
  mnc: number;
  lac: number;
  cellid: number;
  radio?: OpenCellIdRadio;
}

export interface OpenCellIdAreaRequest extends OpenCellIdRequestOptions {
  bbox: [number, number, number, number];
  mcc?: number;
  mnc?: number;
  lac?: number;
  radio?: OpenCellIdRadio;
  limit?: number;
  offset?: number;
}

export interface OpenCellIdCellResponse {
  lat: number;
  lon: number;
  mcc: number;
  mnc: number;
  lac: number;
  cellid: number;
  averageSignalStrength?: number;
  range?: number;
  samples?: number;
  changeable?: boolean | number;
  radio?: string;
  rnc?: number;
  cid?: number;
  tac?: number;
  sid?: number;
  nid?: number;
  bid?: number;
  message?: string | null;
}

export interface OpenCellIdAreaResponse {
  count: number;
  cells: OpenCellIdCellResponse[];
}

export interface OpenCellIdAreaSizeResponse {
  count: number;
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

function getApiKey(options: OpenCellIdRequestOptions): string {
  const apiKey = options.apiKey ?? process.env[options.apiKeyEnvVar ?? OPENCELLID_DEFAULT_API_KEY_ENV];

  if (!apiKey) {
    throw new Error(
      `OpenCellID API key missing. Set ${options.apiKeyEnvVar ?? OPENCELLID_DEFAULT_API_KEY_ENV} or pass apiKey directly.`,
    );
  }

  return apiKey;
}

function buildOpenCellIdUrl(
  path: string,
  options: OpenCellIdRequestOptions,
  params: Record<string, string | number | boolean | null | undefined>,
): URL {
  const url = new URL(path, options.baseUrl ?? OPENCELLID_BASE_URL);
  url.searchParams.set('key', getApiKey(options));
  url.searchParams.set('format', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

async function fetchOpenCellIdJson<T>(
  path: string,
  options: OpenCellIdRequestOptions,
  params: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  const url = buildOpenCellIdUrl(path, options, params);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
    signal: withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenCellID request failed with status ${response.status} for ${url.toString()}`);
  }

  return response.json() as Promise<T>;
}

export async function getCell(request: OpenCellIdCellLookupRequest): Promise<OpenCellIdCellResponse> {
  return fetchOpenCellIdJson<OpenCellIdCellResponse>('/cell/get', request, {
    mcc: request.mcc,
    mnc: request.mnc,
    lac: request.lac,
    cellid: request.cellid,
    radio: request.radio,
  });
}

export async function getCellsInArea(request: OpenCellIdAreaRequest): Promise<OpenCellIdAreaResponse> {
  return fetchOpenCellIdJson<OpenCellIdAreaResponse>('/cell/getInArea', request, {
    BBOX: request.bbox.join(','),
    mcc: request.mcc,
    mnc: request.mnc,
    lac: request.lac,
    radio: request.radio,
    limit: request.limit,
    offset: request.offset,
  });
}

export async function getCellCountInArea(request: OpenCellIdAreaRequest): Promise<OpenCellIdAreaSizeResponse> {
  return fetchOpenCellIdJson<OpenCellIdAreaSizeResponse>('/cell/getInAreaSize', request, {
    BBOX: request.bbox.join(','),
    mcc: request.mcc,
    mnc: request.mnc,
    lac: request.lac,
    radio: request.radio,
  });
}

export { OPENCELLID_BASE_URL, OPENCELLID_DEFAULT_API_KEY_ENV };
