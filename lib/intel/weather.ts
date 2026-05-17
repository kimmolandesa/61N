import type { GeoResult } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";

export interface WeatherForecastEntry {
  time: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  cloudCoverPct: number | null;
  condition: "clear" | "clouds" | "rain" | "snow";
}

function inferCondition(entry: {
  temperatureC: number | null;
  precipitationMm: number | null;
  cloudCoverPct: number | null;
}): WeatherForecastEntry["condition"] {
  if ((entry.precipitationMm ?? 0) > 0.2) {
    return (entry.temperatureC ?? 5) <= 0 ? "snow" : "rain";
  }
  if ((entry.cloudCoverPct ?? 0) > 60) {
    return "clouds";
  }
  return "clear";
}

export function buildWeatherOverlayFeature(args: {
  location: GeoResult;
  locationName?: string;
  entries: Array<{
    time: string;
    temperatureC: number | null;
    precipitationMm: number | null;
    cloudCoverPct: number | null;
  }>;
}): IntelFeature | null {
  if (args.entries.length === 0) {
    return null;
  }

  const forecast: WeatherForecastEntry[] = args.entries.slice(0, 12).map((entry) => ({
    ...entry,
    condition: inferCondition(entry),
  }));

  return {
    id: `weather-${args.location.lat}-${args.location.lon}`,
    name: args.locationName ?? args.location.displayName,
    source: "weather",
    category: "weather",
    geometry: {
      type: "Point",
      coordinates: [args.location.lon, args.location.lat],
    },
    properties: {
      category: "weather",
      source: "weather",
      conditionLabel: "Forecast",
      forecast,
      description: `Weather forecast for ${args.locationName ?? args.location.displayName}.`,
    },
  };
}
