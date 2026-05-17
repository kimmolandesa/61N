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
    label: "Terrain mobility",
    group: "Terrain",
    description: "Traversability, concealment, and terrain friction cells inside the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "topography",
    label: "Topography",
    group: "Terrain",
    description: "Soil and topographic context that affects digging, cover, and wet-ground movement.",
    available: true,
  },
  {
    id: "elevation",
    label: "Elevation summary",
    group: "Terrain",
    description: "Center-point elevation for quick terrain orientation.",
    available: true,
  },
  {
    id: "landCover",
    label: "Land cover",
    group: "Terrain",
    description: "Surface classes useful for movement, observation, and concealment analysis.",
    available: true,
  },
  {
    id: "forestDensity",
    label: "Forest density and concealment",
    group: "Terrain",
    description: "Forest-heavy terrain cells that may improve cover but slow movement.",
    available: true,
  },
  {
    id: "routes",
    label: "Route planning",
    group: "Terrain",
    description: "Route-specific planning is outside the current AOI-only workflow.",
    available: false,
  },
  {
    id: "water",
    label: "Water bodies and rivers",
    group: "Terrain",
    description: "Water obstacles, waterways, and support-relevant water features inside the section.",
    available: true,
  },
  {
    id: "weather",
    label: "Current weather and forecast",
    group: "Weather",
    description: "Current observations and near-term weather conditions for the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "visibility",
    label: "Visibility and operational weather",
    group: "Weather",
    description: "Operational weather assessment for mobility, visibility, aviation, and drone use.",
    available: true,
  },
  {
    id: "infrastructure",
    label: "General infrastructure",
    group: "Infrastructure",
    description: "General infrastructure layer for power, built-up assets, and support context.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "roads",
    label: "Roads",
    group: "Infrastructure",
    description: "Road network geometry for movement, access, and chokepoint reasoning.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "bridges",
    label: "Bridges",
    group: "Infrastructure",
    description: "Bridge locations and load/passability metadata when available.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "telecom",
    label: "Telecom and cell towers",
    group: "Infrastructure",
    description: "Cell towers and comms coverage. Degrades gracefully when provider access is unavailable.",
    available: true,
  },
  {
    id: "logistics",
    label: "Logistics chokepoints",
    group: "Infrastructure",
    description: "Chokepoints, restrictions, and support nodes that affect sustainment and support.",
    available: true,
  },
  {
    id: "power",
    label: "Power grid",
    group: "Infrastructure",
    description: "Power-related assets filtered from the broader infrastructure layer.",
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
    description: "Civilian presence and population density cells inside the selected section.",
    defaultEnabled: true,
    available: true,
  },
  {
    id: "demographics",
    label: "Demographics",
    group: "Population",
    description: "Demographic breakdowns are not wired into the current demo pipeline.",
    available: false,
  },
  {
    id: "satellite",
    label: "Satellite passes and windows",
    group: "Satellite",
    description: "Satellite pass summaries around the selected section center.",
    available: true,
  },
];

export const INTEL_CATEGORIES_BY_ID = Object.fromEntries(
  INTEL_CATEGORIES.map((category) => [category.id, category]),
) as Record<IntelCategory, IntelCategoryConfig>;
