import type { StyleSpecification } from "maplibre-gl";
import { getTileApiBaseUrl } from "@/lib/runtime/config";

export type BaseMapId = "terrain" | "satellite" | "mml" | "dark";

export interface BaseMapConfig {
  id: BaseMapId;
  label: string;
  description: string;
  style: string | StyleSpecification;
  available?: boolean;
}

const SHARED_GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const TILE_API_BASE_URL = getTileApiBaseUrl();

function buildRasterStyle(args: {
  name: string;
  tiles: string[];
  attribution: string;
  tileSize?: number;
  maxzoom?: number;
  overlays?: Array<{
    id: string;
    tiles: string[];
    attribution?: string;
    tileSize?: number;
    maxzoom?: number;
    opacity?: number;
  }>;
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
      ...(args.overlays
        ? Object.fromEntries(
            args.overlays.map((overlay) => [
              overlay.id,
              {
                type: "raster",
                tiles: overlay.tiles,
                tileSize: overlay.tileSize ?? 256,
                attribution: overlay.attribution ?? args.attribution,
                maxzoom: overlay.maxzoom ?? args.maxzoom ?? 19,
              },
            ]),
          )
        : {}),
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
      ...((args.overlays ?? []).map((overlay) => ({
        id: `${overlay.id}-layer`,
        type: "raster" as const,
        source: overlay.id,
        paint: {
          "raster-opacity": overlay.opacity ?? 0.35,
        },
      }))),
    ],
  };
}

export const BASE_MAPS: BaseMapConfig[] = [
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
      overlays: [
        {
          id: "hillshade",
          tiles: [`${TILE_API_BASE_URL}/api/terrain/dem/{z}/{x}/{y}.png`],
          attribution: "&copy; kebabkartta.fi terrain DEM hillshade",
          maxzoom: 18,
          opacity: 0.32,
        },
      ],
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
      tiles: [`${TILE_API_BASE_URL}/api/tiles/mml/{z}/{x}/{y}.png`],
      attribution: "&copy; Maanmittauslaitos via kebabkartta.fi",
      maxzoom: 18,
    }),
  }
];

export const BASE_MAPS_BY_ID: Record<BaseMapId, BaseMapConfig> = Object.fromEntries(
  BASE_MAPS.map((baseMap) => [baseMap.id, baseMap]),
) as Record<BaseMapId, BaseMapConfig>;
