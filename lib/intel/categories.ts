export type IntelCategory =
  | "terrain"
  | "topography"
  | "elevation"
  | "landCover"
  | "forestDensity"
  | "routes"
  | "water"
  | "weather"
  | "visibility"
  | "infrastructure"
  | "roads"
  | "bridges"
  | "telecom"
  | "logistics"
  | "power"
  | "healthcare"
  | "population"
  | "demographics"
  | "satellite";

export interface IntelCategoryConfig {
  id: IntelCategory;
  label: string;
  group: "Terrain" | "Weather" | "Infrastructure" | "Population" | "Satellite";
  description: string;
  defaultEnabled?: boolean;
  available?: boolean;
}

export const INTEL_CATEGORIES: IntelCategoryConfig[] = [
  {
    id: "terrain",
    label: "Terrain",
    group: "Terrain",
    description: "General terrain and traversability cells for the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "topography",
    label: "Topography",
    group: "Terrain",
    description: "Topographic and soil-derived terrain features within the selected section.",
    available: true,
  },
  {
    id: "elevation",
    label: "Elevation",
    group: "Terrain",
    description: "Elevation summary synthesized for the selected section centre.",
    available: true,
  },
  {
    id: "landCover",
    label: "Land cover",
    group: "Terrain",
    description: "Surface and land-cover classes derived from terrain cover data.",
    available: true,
  },
  {
    id: "forestDensity",
    label: "Forest density",
    group: "Terrain",
    description: "Forest-related terrain cover cells useful for concealment and movement analysis.",
    available: true,
  },
  {
    id: "routes",
    label: "Routes",
    group: "Terrain",
    description: "Route intelligence is reserved for route-specific workflows rather than AOI-only queries.",
    available: false,
  },
  {
    id: "water",
    label: "Water bodies and rivers",
    group: "Terrain",
    description: "Water features and supply-related nodes inside the section.",
    available: true,
  },
  {
    id: "weather",
    label: "Current weather and forecast",
    group: "Weather",
    description: "Current conditions and weather observations relevant to the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "visibility",
    label: "Visibility, wind, rain, temperature",
    group: "Weather",
    description: "Weather-impact summary synthesized for the center of the selected section.",
    available: true,
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    group: "Infrastructure",
    description: "General infrastructure features within the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "roads",
    label: "Roads",
    group: "Infrastructure",
    description: "Road networks and related road geometry.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "bridges",
    label: "Bridges",
    group: "Infrastructure",
    description: "Bridge locations and supporting bridge metadata when available.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "telecom",
    label: "Telecom and cell towers",
    group: "Infrastructure",
    description: "Cell towers, communications grid, and telecom coverage cells.",
    available: true,
  },
  {
    id: "logistics",
    label: "Logistics chokepoints",
    group: "Infrastructure",
    description: "Logistics chokepoints and movement friction points in the selected section.",
    available: true,
  },
  {
    id: "power",
    label: "Power grid",
    group: "Infrastructure",
    description: "Power-related infrastructure filtered from the broader infrastructure layer.",
    available: true,
  },
  {
    id: "healthcare",
    label: "Healthcare",
    group: "Infrastructure",
    description: "Medical support nodes and healthcare-adjacent infrastructure.",
    available: true,
  },
  {
    id: "population",
    label: "Population density",
    group: "Population",
    description: "Population cells and density data within the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "demographics",
    label: "Demographics",
    group: "Population",
    description: "Demographic breakdowns will be enabled when a clean AOI-wide provider contract is available.",
    available: false,
  },
  {
    id: "satellite",
    label: "Satellite passes and windows",
    group: "Satellite",
    description: "Satellite pass summaries synthesized around the selected section center.",
    available: true,
  },
];

export const INTEL_CATEGORIES_BY_ID = Object.fromEntries(
  INTEL_CATEGORIES.map((category) => [category.id, category]),
) as Record<IntelCategory, IntelCategoryConfig>;
