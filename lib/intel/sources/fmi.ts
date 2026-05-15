import { executeStoredQuery } from '@/lib/intel/providers/fmi';
import type {
  IntelCategory,
  IntelFeature,
  IntelFetchParams,
  IntelSourceAdapter,
} from '@/lib/intel/types';
import { bboxCenter, bboxToFmiParam, toIntelFeature } from '@/lib/intel/sources/utils';

const FMI_ATTRIBUTION = 'Finnish Meteorological Institute open data';

const FMI_WEATHER_STORED_QUERY = 'fmi::observations::weather::multipointcoverage';
const FMI_CLIMATE_STORED_QUERY = 'fmi::observations::weather::monthly::30year::multipointcoverage';

const STATION_LOCATION_REGEX =
  /<target:Location\s+gml:id="obsloc-fmisid-(\d+)-pos"[\s\S]*?<\/target:Location>/g;
const STATION_NAME_REGEX =
  /<gml:name\s+codeSpace="http:\/\/xml\.fmi\.fi\/namespace\/locationcode\/name">([^<]+)<\/gml:name>/;
const STATION_REGION_REGEX =
  /<target:region\s+codeSpace="[^"]+">([^<]+)<\/target:region>/;

const POINT_REGEX =
  /<gml:Point\s+gml:id="point-(\d+)"[^>]*>[\s\S]*?<gml:pos>\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*<\/gml:pos>[\s\S]*?<\/gml:Point>/g;

const OBSERVED_PROPERTY_REGEX = /<om:observedProperty\s+xlink:href="([^"]+)"/;
const POSITIONS_REGEX = /<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/;
const TUPLE_LIST_REGEX = /<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/;
const PHENOMENON_TIME_REGEX =
  /<om:phenomenonTime>[\s\S]*?<gml:beginPosition>([^<]+)<\/gml:beginPosition>[\s\S]*?<gml:endPosition>([^<]+)<\/gml:endPosition>[\s\S]*?<\/om:phenomenonTime>/;

interface FmiStation {
  fmisid: string;
  name: string;
  region?: string;
  lat: number;
  lon: number;
  posKey: string;
}

interface FmiSeriesEntry {
  time: string;
  values: Record<string, number | null>;
}

interface FmiPeriod {
  start: string;
  end: string;
}

interface AdapterContext {
  source: string;
  category: IntelCategory;
}

function makePosKey(lat: number, lon: number): string {
  return `${lat} ${lon}`;
}

function parseParameters(xml: string): string[] {
  const match = xml.match(OBSERVED_PROPERTY_REGEX);
  if (!match) {
    return [];
  }

  try {
    const url = new URL(match[1].replace(/&amp;/g, '&'));
    const param = url.searchParams.get('param');
    return param
      ? param
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parseStations(xml: string): Map<string, FmiStation> {
  const stations = new Map<string, FmiStation>();
  const metadataByFmisid = new Map<string, { name: string; region?: string }>();

  for (const match of xml.matchAll(STATION_LOCATION_REGEX)) {
    const fmisid = match[1];
    const block = match[0];
    const name = block.match(STATION_NAME_REGEX)?.[1]?.trim() ?? fmisid;
    const region = block.match(STATION_REGION_REGEX)?.[1]?.trim();
    metadataByFmisid.set(fmisid, { name, region });
  }

  for (const match of xml.matchAll(POINT_REGEX)) {
    const fmisid = match[1];
    const lat = Number(match[2]);
    const lon = Number(match[3]);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      continue;
    }

    const meta = metadataByFmisid.get(fmisid);
    const posKey = makePosKey(lat, lon);

    stations.set(posKey, {
      fmisid,
      name: meta?.name ?? `FMI station ${fmisid}`,
      region: meta?.region,
      lat,
      lon,
      posKey,
    });
  }

  return stations;
}

function parsePositions(xml: string): Array<{ posKey: string; time: string }> {
  const match = xml.match(POSITIONS_REGEX);
  if (!match) {
    return [];
  }

  const rows: Array<{ posKey: string; time: string }> = [];
  const tokens = match[1].trim().split(/\s+/);

  for (let i = 0; i + 2 < tokens.length; i += 3) {
    const lat = Number(tokens[i]);
    const lon = Number(tokens[i + 1]);
    const epoch = Number(tokens[i + 2]);

    if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(epoch)) {
      continue;
    }

    rows.push({
      posKey: makePosKey(lat, lon),
      time: new Date(epoch * 1000).toISOString(),
    });
  }

  return rows;
}

function parseValueRows(xml: string, parameterCount: number): Array<Array<number | null>> {
  if (parameterCount <= 0) {
    return [];
  }

  const match = xml.match(TUPLE_LIST_REGEX);
  if (!match) {
    return [];
  }

  const tokens = match[1].trim().split(/\s+/);
  const rows: Array<Array<number | null>> = [];

  for (let i = 0; i + parameterCount <= tokens.length; i += parameterCount) {
    const row: Array<number | null> = [];
    for (let j = 0; j < parameterCount; j += 1) {
      const token = tokens[i + j];
      if (token === 'NaN' || token === undefined) {
        row.push(null);
        continue;
      }
      const parsed = Number(token);
      row.push(Number.isNaN(parsed) ? null : parsed);
    }
    rows.push(row);
  }

  return rows;
}

function parsePeriod(xml: string): FmiPeriod | undefined {
  const match = xml.match(PHENOMENON_TIME_REGEX);
  if (!match) {
    return undefined;
  }
  return { start: match[1].trim(), end: match[2].trim() };
}

function buildFeatures(xml: string, context: AdapterContext): IntelFeature[] {
  const parameters = parseParameters(xml);
  const stations = parseStations(xml);
  const positions = parsePositions(xml);
  const valueRows = parseValueRows(xml, parameters.length);
  const period = parsePeriod(xml);

  const seriesByStation = new Map<string, FmiSeriesEntry[]>();
  const rowCount = Math.min(positions.length, valueRows.length);

  for (let i = 0; i < rowCount; i += 1) {
    const position = positions[i];
    const valueRow = valueRows[i];
    const values: Record<string, number | null> = {};

    parameters.forEach((parameter, index) => {
      values[parameter] = valueRow[index] ?? null;
    });

    const existing = seriesByStation.get(position.posKey) ?? [];
    existing.push({ time: position.time, values });
    seriesByStation.set(position.posKey, existing);
  }

  const features: IntelFeature[] = [];

  for (const station of stations.values()) {
    const series = seriesByStation.get(station.posKey) ?? [];
    const lastTime = series.at(-1)?.time;

    features.push(
      toIntelFeature({
        id: `${context.source}-${station.fmisid}`,
        name: station.name,
        source: context.source,
        category: context.category,
        geometry: {
          type: 'Point',
          coordinates: [station.lon, station.lat],
        },
        properties: {
          fmisid: station.fmisid,
          region: station.region,
          parameters,
          period,
          series,
        },
        timestamp: lastTime ?? period?.end,
        attribution: FMI_ATTRIBUTION,
      }),
    );
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
      storedQueryId: FMI_WEATHER_STORED_QUERY,
      params: {
        bbox: bboxToFmiParam(params.bbox),
        latlon: `${lat},${lon}`,
        starttime: params.startTime,
        endtime: params.endTime,
        parameters: params.query,
      },
    });

    return buildFeatures(xml, { source: 'fmi', category: 'weather' });
  },
};

export const fmiClimateSourceAdapter: IntelSourceAdapter = {
  id: 'fmi-climate',
  label: 'FMI climate normals (30-year monthly)',
  category: 'climate',
  async fetch(params: IntelFetchParams): Promise<IntelFeature[]> {
    const xml = await executeStoredQuery({
      storedQueryId: FMI_CLIMATE_STORED_QUERY,
      params: {
        bbox: bboxToFmiParam(params.bbox),
        starttime: params.startTime,
        endtime: params.endTime,
        parameters: params.query,
      },
    });

    return buildFeatures(xml, { source: 'fmi-climate', category: 'climate' });
  },
};
