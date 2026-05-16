import type { GeoResult } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";

const FIELD_REGEX = /<swe:field[^>]+name="([^"]+)"/g;
const POSITIONS_REGEX = /<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/;
const TUPLES_REGEX =
  /<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/;
const POINT_NAME_REGEX =
  /<gml:name(?:\s+codeSpace="http:\/\/xml\.fmi\.fi\/namespace\/locationcode\/name")?>([^<]+)<\/gml:name>/;

export interface WeatherForecastEntry {
  time: string;
  unixTime: number;
  temperature?: number;
  cloudCover?: number;
  precipitationAmount?: number;
  condition: "clear" | "clouds" | "rain" | "snow";
}

export interface WeatherOverlayResult {
  location: GeoResult;
  features: IntelFeature[];
}

function normalizeWhitespaceBlock(value: string): string[] {
  return value
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseFieldNames(xml: string): string[] {
  return Array.from(xml.matchAll(FIELD_REGEX), (match) => match[1]);
}

function parsePositions(xml: string): Array<{ lat: number; lon: number; unixTime: number }> {
  const block = xml.match(POSITIONS_REGEX)?.[1];
  if (!block) {
    return [];
  }

  return normalizeWhitespaceBlock(block)
    .map((line) => line.split(/\s+/).map(Number))
    .filter((parts) => parts.length >= 3 && parts.every((part) => !Number.isNaN(part)))
    .map(([lat, lon, unixTime]) => ({ lat, lon, unixTime }));
}

function parseTupleRows(xml: string): string[][] {
  const block = xml.match(TUPLES_REGEX)?.[1];
  if (!block) {
    return [];
  }

  return normalizeWhitespaceBlock(block).map((line) => line.split(/\s+/));
}

function parseNullableNumber(value: string | undefined): number | undefined {
  if (!value || value === "NaN" || value === "nil") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function getCondition(entry: {
  temperature?: number;
  cloudCover?: number;
  precipitationAmount?: number;
}): WeatherForecastEntry["condition"] {
  if ((entry.precipitationAmount ?? 0) > 0.15) {
    return (entry.temperature ?? 5) <= 0.5 ? "snow" : "rain";
  }

  if ((entry.cloudCover ?? 0) >= 60) {
    return "clouds";
  }

  return "clear";
}

function getConditionLabel(condition: WeatherForecastEntry["condition"]): string {
  switch (condition) {
    case "snow":
      return "Snow";
    case "rain":
      return "Rain";
    case "clouds":
      return "Clouds";
    default:
      return "Clear";
  }
}

export function parseFmiForecastEntries(xml: string): {
  locationName?: string;
  lat?: number;
  lon?: number;
  entries: WeatherForecastEntry[];
} {
  const fieldNames = parseFieldNames(xml);
  const positions = parsePositions(xml);
  const tupleRows = parseTupleRows(xml);
  const locationName = xml.match(POINT_NAME_REGEX)?.[1];

  const entries: WeatherForecastEntry[] = [];

  for (const [index, position] of positions.entries()) {
    const tuple = tupleRows[index];
    if (!tuple) {
      continue;
    }

    const values = Object.fromEntries(
      fieldNames.map((fieldName, fieldIndex) => [fieldName, tuple[fieldIndex]]),
    );

    const temperature =
      parseNullableNumber(values.Temperature) ??
      parseNullableNumber(values.t2m);
    const cloudCover =
      parseNullableNumber(values.TotalCloudCover) ??
      parseNullableNumber(values.N_TotalCloudCover);
    const precipitationAmount =
      parseNullableNumber(values.PrecipitationAmount) ??
      parseNullableNumber(values.Precipitation1h);
    const condition = getCondition({
      temperature,
      cloudCover,
      precipitationAmount,
    });

    entries.push({
      time: new Date(position.unixTime * 1000).toISOString(),
      unixTime: position.unixTime,
      temperature,
      cloudCover,
      precipitationAmount,
      condition,
    });
  }

  return {
    locationName,
    lat: positions[0]?.lat,
    lon: positions[0]?.lon,
    entries,
  };
}

export function buildWeatherOverlayFeature(args: {
  location: GeoResult;
  locationName?: string;
  entries: WeatherForecastEntry[];
}): IntelFeature | null {
  const firstEntry = args.entries[0];
  if (!firstEntry) {
    return null;
  }

  return {
    id: `weather-${args.location.displayName}`,
    name: `${args.locationName ?? args.location.addressComponents.city ?? args.location.displayName} Forecast`,
    source: "fmi",
    category: "weather",
    geometry: {
      type: "Point",
      coordinates: [args.location.lon, args.location.lat],
    },
    properties: {
      condition: firstEntry.condition,
      conditionLabel: getConditionLabel(firstEntry.condition),
      forecast: args.entries.slice(0, 12),
      cloudCover: firstEntry.cloudCover,
      precipitationAmount: firstEntry.precipitationAmount,
      temperature: firstEntry.temperature,
      locationDisplayName: args.location.displayName,
    },
    timestamp: firstEntry.time,
    attribution: "Finnish Meteorological Institute open data",
  };
}
