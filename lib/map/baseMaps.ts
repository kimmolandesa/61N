import type { StyleSpecification } from "maplibre-gl";

export type BaseMapId = "streets" | "terrain" | "satellite" | "mml" | "dark";

export interface BaseMapConfig {
  id: BaseMapId;
  label: string;
  description: string;
  style: string | StyleSpecification;
  available?: boolean;
}

const SHARED_GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

function buildRasterStyle(args: {
  name: string;
  tiles: string[];
  attribution: string;
  tileSize?: number;
  maxzoom?: number;
}): StyleSpecification {
  return {
    version: 8,
    name: args.name,
    glyphs: SHARED_GLYPHS,
    sources: {
      basemap: {
        type: "raster",
        tiles: args.tiles,
        tileSize: args.tileSize ?? 256,
        attribution: args.attribution,
        maxzoom: args.maxzoom ?? 19,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": "#081018",
        },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

export const BASE_MAPS: BaseMapConfig[] = [
  {
    id: "streets",
    label: "Streets",
    description: "Standard vector basemap",
    style: "https://demotiles.maplibre.org/style.json",
  },
  {
    id: "terrain",
    label: "Terrain",
    description: "Topographic context",
    style: buildRasterStyle({
      name: "Terrain",
      tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
      attribution:
        '&copy; OpenTopoMap (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      maxzoom: 17,
    }),
  },
  {
    id: "satellite",
    label: "Satellite",
    description: "Imagery basemap",
    style: buildRasterStyle({
      name: "Satellite",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      attribution: "&copy; Esri, Maxar, Earthstar Geographics",
      maxzoom: 19,
    }),
  },
  {
    id: "mml",
    label: "MML",
    description: "National Land Survey",
    style: buildRasterStyle({
      name: "Maanmittauslaitos",
      // If this endpoint is later replaced by a keyed upstream service, read the key from NEXT_PUBLIC_MML_API_KEY.
      tiles: ["https://api.kebabkartta.fi/api/tiles/mml/{z}/{x}/{y}.png"],
      attribution: "&copy; Maanmittauslaitos via kebabkartta.fi",
      maxzoom: 18,
    }),
  },
  {
    id: "dark",
    label: "Dark / Tactical",
    description: "Placeholder until tactical style is connected",
    style: "https://demotiles.maplibre.org/style.json",
    available: false,
  },
];

export const BASE_MAPS_BY_ID: Record<BaseMapId, BaseMapConfig> = Object.fromEntries(
  BASE_MAPS.map((baseMap) => [baseMap.id, baseMap]),
) as Record<BaseMapId, BaseMapConfig>;
