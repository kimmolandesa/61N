"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { AreaIntelReport } from "@/lib/aoi/intel";
import { readStoredAoiSelections, writeStoredAoiSelections } from "@/lib/aoi/storage";
import type { AoiBounds, AoiGeometry, AoiSelection } from "@/lib/aoi/types";
import type { Asset } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";
import type { WeatherForecastEntry } from "@/lib/intel/weather";
import AssetInfoModal from "./AssetInfoModal";

interface MapViewProps {
  results: Asset[];
  weatherFeatures: IntelFeature[];
  bounds: [number, number, number, number] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterOperator: string | null;
  filterType: string | null;
}

type BasemapKey = "street" | "satellite" | "terrain";

interface ResultFeatureProperties {
  id: string;
  name: string;
  type: string;
  operator: string | null;
  lat: number;
  lon: number;
  osmPath: string;
  popupHtml: string;
}

interface WeatherFeatureProperties {
  id: string;
  name: string;
  condition: string;
  icon: string;
  popupHtml: string;
}

type AoiTool = "idle" | "polygon" | "bbox";

const MAP_STYLE_STORAGE_KEY = "sightline-map-style";
const DEFAULT_BASEMAP: BasemapKey = "street";
const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 2;
const FOCUSED_ZOOM = 13;

const RESULTS_SOURCE_ID = "sightline-results";
const RESULTS_CLUSTER_SOURCE_ID = "sightline-results-clusters";
const RESULTS_LAYER_ID = "sightline-results-points";
const RESULTS_SELECTED_LAYER_ID = "sightline-results-selected";
const RESULTS_PLAIN_LAYER_ID = "sightline-results-plain";
const RESULTS_CLUSTER_LAYER_ID = "sightline-results-cluster-circles";
const RESULTS_CLUSTER_COUNT_LAYER_ID = "sightline-results-cluster-count";
const WEATHER_SOURCE_ID = "sightline-weather";
const WEATHER_CIRCLE_LAYER_ID = "sightline-weather-circles";
const WEATHER_ICON_LAYER_ID = "sightline-weather-icons";
const AOI_SOURCE_ID = "aoi-source";
const AOI_FILL_LAYER_ID = "aoi-fill";
const AOI_OUTLINE_LAYER_ID = "aoi-outline";
const AOI_ACTIVE_OUTLINE_LAYER_ID = "aoi-active-outline";

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

const BASEMAPS: Record<
  BasemapKey,
  {
    label: string;
    description: string;
    style: string | StyleSpecification;
  }
> = {
  street: {
    label: "Street",
    description: "Vector basemap",
    style: "https://demotiles.maplibre.org/style.json",
  },
  satellite: {
    label: "Satellite",
    description: "Imagery",
    style: buildRasterStyle({
      name: "Satellite",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      attribution: "&copy; Esri, Maxar, Earthstar Geographics",
      maxzoom: 19,
    }),
  },
  terrain: {
    label: "Terrain",
    description: "Topographic",
    style: buildRasterStyle({
      name: "Terrain",
      tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
      attribution:
        '&copy; OpenTopoMap (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      maxzoom: 17,
    }),
  },
};

const WEATHER_ICONS: Record<string, string> = {
  clear: "☀",
  clouds: "☁",
  rain: "☂",
  snow: "❄",
};

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function readStoredBasemap(): BasemapKey {
  if (typeof window === "undefined") {
    return DEFAULT_BASEMAP;
  }

  const stored = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
  return stored && stored in BASEMAPS ? (stored as BasemapKey) : DEFAULT_BASEMAP;
}

function writeStoredBasemap(key: BasemapKey): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, key);
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function boundsToMapLibre(bounds: [number, number, number, number]): LngLatBoundsLike {
  return [
    [bounds[2], bounds[0]],
    [bounds[3], bounds[1]],
  ];
}

function createResultPopupHtml(asset: Asset): string {
  const safeName = escapeHtml(asset.name);
  const safeType = escapeHtml(asset.type);
  const safeOperator = asset.operator ? escapeHtml(asset.operator) : null;
  const tags = Object.entries(asset.tags)
    .slice(0, 5)
    .map(
      ([key, value]) =>
        `<tr><td class="popup-key">${escapeHtml(key)}</td><td class="popup-value">${escapeHtml(String(value))}</td></tr>`,
    )
    .join("");

  return `
    <div class="map-popup">
      <div class="popup-title">${safeName}</div>
      <div class="popup-type">${safeType}</div>
      ${safeOperator ? `<div class="popup-operator">${safeOperator}</div>` : ""}
      <div class="popup-coords">${asset.lat.toFixed(5)}, ${asset.lon.toFixed(5)}</div>
      ${tags ? `<table class="popup-tags">${tags}</table>` : ""}
      <div class="popup-links">
        <button class="popup-more-info-btn" data-asset-id="${escapeHtml(asset.id)}">More Info</button>
        <a class="popup-osm-link" href="https://www.openstreetmap.org/${asset.id}" target="_blank" rel="noopener noreferrer">View on OSM</a>
      </div>
    </div>
  `;
}

function createWeatherPopupHtml(feature: IntelFeature): string {
  const safeName = escapeHtml(feature.name ?? "Weather Forecast");
  const conditionLabel =
    typeof feature.properties.conditionLabel === "string"
      ? escapeHtml(feature.properties.conditionLabel)
      : "Forecast";
  const forecast = Array.isArray(feature.properties.forecast)
    ? (feature.properties.forecast as WeatherForecastEntry[])
    : [];

  const rows = forecast
    .slice(0, 6)
    .map((entry) => {
      const icon = WEATHER_ICONS[entry.condition] ?? "•";
      const time = new Date(entry.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const temp =
        typeof entry.temperature === "number"
          ? `${entry.temperature.toFixed(1)}°C`
          : "n/a";
      const clouds =
        typeof entry.cloudCover === "number"
          ? `${Math.round(entry.cloudCover)}% cloud`
          : "cloud n/a";
      const precipitation =
        typeof entry.precipitationAmount === "number"
          ? `${entry.precipitationAmount.toFixed(1)} mm`
          : "dry";

      return `<tr><td class="popup-key">${icon} ${time}</td><td class="popup-value">${temp} · ${clouds} · ${precipitation}</td></tr>`;
    })
    .join("");

  return `
    <div class="map-popup">
      <div class="popup-title">${safeName}</div>
      <div class="popup-type">${conditionLabel}</div>
      ${rows ? `<table class="popup-tags">${rows}</table>` : ""}
    </div>
  `;
}

function asGeoJSONSource(map: maplibregl.Map, sourceId: string): GeoJSONSource | null {
  const source = map.getSource(sourceId);
  return source && "setData" in source ? (source as GeoJSONSource) : null;
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function aoiBoundsToMapLibre(bounds: AoiBounds): LngLatBoundsLike {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.north],
  ];
}

function asAoiGeometry(
  geometry: GeoJSONStoreFeatures["geometry"],
): AoiGeometry | null {
  if (geometry.type !== "Polygon") {
    return null;
  }

  return {
    type: "Polygon",
    coordinates: geometry.coordinates as number[][][],
  };
}

function getAoiModeFromFeature(feature: GeoJSONStoreFeatures): "polygon" | "bbox" {
  const featureMode =
    typeof feature.properties?.mode === "string" ? feature.properties.mode : "";
  return featureMode.includes("rectangle") ? "bbox" : "polygon";
}

function ensureSourcesAndLayers(map: maplibregl.Map): void {
  if (!map.getSource(RESULTS_SOURCE_ID)) {
    map.addSource(RESULTS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getSource(RESULTS_CLUSTER_SOURCE_ID)) {
    map.addSource(RESULTS_CLUSTER_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 13,
    });
  }

  if (!map.getSource(WEATHER_SOURCE_ID)) {
    map.addSource(WEATHER_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getSource(AOI_SOURCE_ID)) {
    map.addSource(AOI_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }

  if (!map.getLayer(RESULTS_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: RESULTS_CLUSTER_LAYER_ID,
      type: "circle",
      source: RESULTS_CLUSTER_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#3b82f6",
          10,
          "#f59e0b",
          100,
          "#ef4444",
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          18,
          10,
          24,
          100,
          32,
        ],
        "circle-stroke-color": "#0d1117",
        "circle-stroke-width": 2,
        "circle-opacity": 0.92,
      },
    });
  }

  if (!map.getLayer(RESULTS_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: RESULTS_CLUSTER_COUNT_LAYER_ID,
      type: "symbol",
      source: RESULTS_CLUSTER_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Semibold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#f8fafc",
      },
    });
  }

  if (!map.getLayer(RESULTS_PLAIN_LAYER_ID)) {
    map.addLayer({
      id: RESULTS_PLAIN_LAYER_ID,
      type: "circle",
      source: RESULTS_SOURCE_ID,
      paint: {
        "circle-radius": 6,
        "circle-color": "#4da3ff",
        "circle-stroke-color": "#081018",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getLayer(RESULTS_LAYER_ID)) {
    map.addLayer({
      id: RESULTS_LAYER_ID,
      type: "circle",
      source: RESULTS_CLUSTER_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": "#4da3ff",
        "circle-stroke-color": "#081018",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getLayer(RESULTS_SELECTED_LAYER_ID)) {
    map.addLayer({
      id: RESULTS_SELECTED_LAYER_ID,
      type: "circle",
      source: RESULTS_SOURCE_ID,
      filter: ["==", ["get", "id"], ""],
      paint: {
        "circle-radius": 10,
        "circle-color": "#22c55e",
        "circle-stroke-color": "#ecfdf5",
        "circle-stroke-width": 3,
      },
    });
  }

  if (!map.getLayer(WEATHER_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: WEATHER_CIRCLE_LAYER_ID,
      type: "circle",
      source: WEATHER_SOURCE_ID,
      paint: {
        "circle-radius": 16,
        "circle-color": "#0f3d91",
        "circle-stroke-color": "#e0f2fe",
        "circle-stroke-width": 2,
        "circle-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(WEATHER_ICON_LAYER_ID)) {
    map.addLayer({
      id: WEATHER_ICON_LAYER_ID,
      type: "symbol",
      source: WEATHER_SOURCE_ID,
      layout: {
        "text-field": ["get", "icon"],
        "text-font": ["Open Sans Regular"],
        "text-size": 16,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer(AOI_FILL_LAYER_ID)) {
    map.addLayer({
      id: AOI_FILL_LAYER_ID,
      type: "fill",
      source: AOI_SOURCE_ID,
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": 0.2,
      },
    });
  }

  if (!map.getLayer(AOI_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: AOI_OUTLINE_LAYER_ID,
      type: "line",
      source: AOI_SOURCE_ID,
      paint: {
        "line-color": "#fbbf24",
        "line-width": 2,
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(AOI_ACTIVE_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: AOI_ACTIVE_OUTLINE_LAYER_ID,
      type: "line",
      source: AOI_SOURCE_ID,
      filter: ["==", ["get", "active"], true],
      paint: {
        "line-color": "#fde68a",
        "line-width": 4,
        "line-opacity": 1,
      },
    });
  }
}

export default function MapView({
  results,
  weatherFeatures,
  bounds,
  selectedId,
  onSelect,
  filterOperator,
  filterType,
}: MapViewProps) {
  const [showClusters, setShowClusters] = useState(true);
  const [modalAsset, setModalAsset] = useState<Asset | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeBasemap, setActiveBasemap] = useState<BasemapKey>(() => readStoredBasemap());
  const [aoiTool, setAoiTool] = useState<AoiTool>("idle");
  const [aoiSelections, setAoiSelections] = useState<AoiSelection[]>([]);
  const [activeAoiId, setActiveAoiId] = useState<string | null>(null);
  const [aoiError, setAoiError] = useState<string | null>(null);
  const [aoiIntelReport, setAoiIntelReport] = useState<AreaIntelReport | null>(null);
  const [aoiLoadingIntel, setAoiLoadingIntel] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualWest, setManualWest] = useState("");
  const [manualSouth, setManualSouth] = useState("");
  const [manualEast, setManualEast] = useState("");
  const [manualNorth, setManualNorth] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const resultsRef = useRef<Asset[]>(results);
  const selectedIdRef = useRef<string | null>(selectedId);
  const aoiToolRef = useRef<AoiTool>("idle");
  const manualNameRef = useRef("");
  const activeAoiIdRef = useRef<string | null>(null);
  const aoiStorageReadyRef = useRef(false);
  const weatherGeoJsonRef = useRef<
    GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProperties>
  >(emptyFeatureCollection() as GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProperties>);
  const aoiGeoJsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Polygon>>(emptyFeatureCollection() as GeoJSON.FeatureCollection<GeoJSON.Polygon>);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    aoiToolRef.current = aoiTool;
  }, [aoiTool]);

  useEffect(() => {
    manualNameRef.current = manualName;
  }, [manualName]);

  useEffect(() => {
    activeAoiIdRef.current = activeAoiId;
  }, [activeAoiId]);

  useEffect(() => {
    const storedSelections = readStoredAoiSelections();
    setAoiSelections(storedSelections);
    setActiveAoiId(storedSelections[0]?.id ?? null);
    aoiStorageReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (!aoiStorageReadyRef.current) {
      return;
    }

    writeStoredAoiSelections(aoiSelections);
  }, [aoiSelections]);

  const filteredResults = useMemo(() => {
    let filtered = results;

    if (filterOperator) {
      filtered = filtered.filter((result) => result.operator === filterOperator);
    }

    if (filterType) {
      filtered = filtered.filter((result) => result.type === filterType);
    }

    return filtered;
  }, [results, filterOperator, filterType]);

  const resultsGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, ResultFeatureProperties>>(
    () => ({
      type: "FeatureCollection",
      features: filteredResults
        .filter((asset) => isValidCoordinate(asset.lat, asset.lon))
        .map((asset) => ({
          type: "Feature",
          id: asset.id,
          geometry: {
            type: "Point",
            coordinates: [asset.lon, asset.lat],
          },
          properties: {
            id: asset.id,
            name: asset.name,
            type: asset.type,
            operator: asset.operator,
            lat: asset.lat,
            lon: asset.lon,
            osmPath: asset.id,
            popupHtml: createResultPopupHtml(asset),
          },
        })),
    }),
    [filteredResults],
  );

  const selectedResultGeoJson = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, ResultFeatureProperties>
  >(() => {
    const selectedAsset = filteredResults.find((asset) => asset.id === selectedId);
    if (!selectedAsset || !isValidCoordinate(selectedAsset.lat, selectedAsset.lon)) {
      return { type: "FeatureCollection", features: [] };
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: selectedAsset.id,
          geometry: {
            type: "Point",
            coordinates: [selectedAsset.lon, selectedAsset.lat],
          },
          properties: {
            id: selectedAsset.id,
            name: selectedAsset.name,
            type: selectedAsset.type,
            operator: selectedAsset.operator,
            lat: selectedAsset.lat,
            lon: selectedAsset.lon,
            osmPath: selectedAsset.id,
            popupHtml: createResultPopupHtml(selectedAsset),
          },
        },
      ],
    };
  }, [filteredResults, selectedId]);

  const weatherGeoJson = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProperties>
  >(() => ({
    type: "FeatureCollection",
    features: weatherFeatures
      .filter((feature): feature is IntelFeature & { geometry: GeoJSON.Point } => feature.geometry.type === "Point")
      .filter((feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        return isValidCoordinate(lat, lon);
      })
      .map((feature) => {
        const icon =
          typeof feature.properties.condition === "string"
            ? WEATHER_ICONS[feature.properties.condition] ?? "☀"
            : "☀";

        return {
          type: "Feature",
          id: feature.id,
          geometry: {
            type: "Point",
            coordinates: feature.geometry.coordinates,
          },
          properties: {
            id: feature.id,
            name: feature.name ?? "Weather Forecast",
            condition:
              typeof feature.properties.condition === "string"
                ? feature.properties.condition
                : "clear",
            icon,
            popupHtml: createWeatherPopupHtml(feature),
          },
        };
      }),
  }), [weatherFeatures]);

  useEffect(() => {
    weatherGeoJsonRef.current = weatherGeoJson;
  }, [weatherGeoJson]);

  const activeAoi = useMemo(
    () => aoiSelections.find((selection) => selection.id === activeAoiId) ?? null,
    [aoiSelections, activeAoiId],
  );

  const aoiGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Polygon>>(() => {
    if (aoiSelections.length === 0) {
      return emptyFeatureCollection() as GeoJSON.FeatureCollection<GeoJSON.Polygon>;
    }

    return {
      type: "FeatureCollection",
      features: aoiSelections.map((selection) => ({
          type: "Feature",
          id: selection.id,
          geometry: selection.geometry,
          properties: {
            id: selection.id,
            name: selection.name ?? "Area of Interest",
            active: selection.id === activeAoiId,
          },
        })),
    };
  }, [activeAoiId, aoiSelections]);

  useEffect(() => {
    aoiGeoJsonRef.current = aoiGeoJson;
  }, [aoiGeoJson]);

  const normalizeAoi = useCallback(
    async (payload: { mode: "polygon" | "bbox" | "manual"; geometry?: AoiGeometry; bounds?: AoiBounds; name?: string }) => {
      const response = await fetch("/api/aoi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as AoiSelection | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Unable to create area of interest.",
        );
      }

      return data as AoiSelection;
    },
    [],
  );

  const populateManualForm = useCallback((selection: AoiSelection | null) => {
    if (!selection) {
      setManualName("");
      setManualWest("");
      setManualSouth("");
      setManualEast("");
      setManualNorth("");
      return;
    }

    setManualName(selection.name ?? "");
    setManualWest(selection.bounds.west.toFixed(4));
    setManualSouth(selection.bounds.south.toFixed(4));
    setManualEast(selection.bounds.east.toFixed(4));
    setManualNorth(selection.bounds.north.toFixed(4));
  }, []);

  const clearAoi = useCallback(() => {
    setAoiSelections([]);
    setActiveAoiId(null);
    setAoiError(null);
    setAoiIntelReport(null);
    setAoiTool("idle");
    populateManualForm(null);
    drawRef.current?.clear();
    drawRef.current?.setMode("select");
  }, [populateManualForm]);

  const applyAoiSelection = useCallback((selection: AoiSelection, replaceId?: string | null) => {
    setAoiSelections((current) => {
      if (replaceId) {
        return current.map((item) => (item.id === replaceId ? selection : item));
      }

      return [selection, ...current];
    });
    setActiveAoiId(selection.id);
    setAoiError(null);
    setAoiIntelReport(null);
    setAoiTool("idle");
    populateManualForm(selection);

    drawRef.current?.clear();
    drawRef.current?.setMode("select");
  }, [populateManualForm]);

  useEffect(() => {
    populateManualForm(activeAoi);
  }, [activeAoi, populateManualForm]);

  const closePopup = useCallback(() => {
    popupRef.current?.remove();
    popupRef.current = null;
  }, []);

  const openResultPopup = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Point, ResultFeatureProperties>) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      closePopup();

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnMove: false,
        closeOnClick: false,
        className: "sightline-popup",
        maxWidth: "320px",
      })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(feature.properties.popupHtml)
        .addTo(map);
    },
    [closePopup],
  );

  const openWeatherPopup = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Point, WeatherFeatureProperties>) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      closePopup();

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnMove: false,
        closeOnClick: false,
        className: "sightline-popup sightline-popup-weather",
        maxWidth: "360px",
      })
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setHTML(feature.properties.popupHtml)
        .addTo(map);
    },
    [closePopup],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAPS[activeBasemap].style,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: {},
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    const syncSources = () => {
      ensureSourcesAndLayers(map);
      asGeoJSONSource(map, RESULTS_SOURCE_ID)?.setData(resultsGeoJson);
      asGeoJSONSource(map, RESULTS_CLUSTER_SOURCE_ID)?.setData(resultsGeoJson);
      asGeoJSONSource(map, WEATHER_SOURCE_ID)?.setData(weatherGeoJsonRef.current);
      asGeoJSONSource(map, AOI_SOURCE_ID)?.setData(aoiGeoJsonRef.current);
      map.setFilter(RESULTS_SELECTED_LAYER_ID, ["==", ["get", "id"], selectedIdRef.current ?? ""]);
    };

    const setupDraw = () => {
      drawRef.current?.stop();

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({
          map,
          prefixId: "sightline-aoi-draw",
        }),
        modes: [
          new TerraDrawPolygonMode(),
          new TerraDrawRectangleMode(),
          new TerraDrawSelectMode(),
        ],
      });

      draw.on("finish", async (featureId) => {
        const feature = draw.getSnapshotFeature(featureId);
        if (!feature) {
          return;
        }

        const geometry = asAoiGeometry(feature.geometry);
        if (!geometry) {
          return;
        }

        try {
          const selection = await normalizeAoi({
            mode: getAoiModeFromFeature(feature),
            geometry,
            name: manualNameRef.current.trim() || undefined,
          });
          applyAoiSelection(selection);
        } catch (error) {
          setAoiError(
            error instanceof Error ? error.message : "Unable to create area of interest.",
          );
        }
      });

      draw.start();
      draw.setMode("select");
      drawRef.current = draw;
    };

    const handleStyleLoad = () => {
      syncSources();
      setupDraw();
    };

    const handleClick = async (event: maplibregl.MapMouseEvent) => {
      if (aoiToolRef.current !== "idle") {
        return;
      }

      const hitFeatures = map.queryRenderedFeatures(event.point, {
        layers: [
          RESULTS_CLUSTER_LAYER_ID,
          RESULTS_LAYER_ID,
          RESULTS_PLAIN_LAYER_ID,
          WEATHER_CIRCLE_LAYER_ID,
          WEATHER_ICON_LAYER_ID,
          AOI_FILL_LAYER_ID,
          AOI_OUTLINE_LAYER_ID,
          AOI_ACTIVE_OUTLINE_LAYER_ID,
        ],
      });

      const topFeature = hitFeatures[0];
      if (!topFeature) {
        return;
      }

      if (topFeature.layer.id === RESULTS_CLUSTER_LAYER_ID) {
        const clusterId = topFeature.properties?.cluster_id;
        const clusterSource = asGeoJSONSource(map, RESULTS_CLUSTER_SOURCE_ID);
        if (typeof clusterId === "number" && clusterSource) {
          const expansionZoom = await clusterSource.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: (topFeature.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom: expansionZoom,
            duration: 500,
          });
        }
        return;
      }

      if (topFeature.layer.id === WEATHER_CIRCLE_LAYER_ID || topFeature.layer.id === WEATHER_ICON_LAYER_ID) {
        const match = weatherGeoJsonRef.current.features.find((feature) => feature.id === topFeature.id);
        if (match) {
          openWeatherPopup(match);
        }
        return;
      }

      if (
        topFeature.layer.id === AOI_FILL_LAYER_ID ||
        topFeature.layer.id === AOI_OUTLINE_LAYER_ID ||
        topFeature.layer.id === AOI_ACTIVE_OUTLINE_LAYER_ID
      ) {
        const aoiId =
          typeof topFeature.properties?.id === "string"
            ? topFeature.properties.id
            : typeof topFeature.id === "string"
              ? topFeature.id
              : null;

        if (aoiId) {
          setActiveAoiId(aoiId);
          setAoiError(null);
          setAoiIntelReport(null);
        }
        return;
      }

      const assetId =
        typeof topFeature.properties?.id === "string"
          ? topFeature.properties.id
          : typeof topFeature.id === "string"
            ? topFeature.id
            : null;

      if (assetId) {
        onSelect(assetId);
      }
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const isInteractive = map.queryRenderedFeatures(event.point, {
        layers: [
          RESULTS_CLUSTER_LAYER_ID,
          RESULTS_LAYER_ID,
          RESULTS_PLAIN_LAYER_ID,
          WEATHER_CIRCLE_LAYER_ID,
          WEATHER_ICON_LAYER_ID,
          AOI_FILL_LAYER_ID,
          AOI_OUTLINE_LAYER_ID,
          AOI_ACTIVE_OUTLINE_LAYER_ID,
        ],
      }).length > 0;

      map.getCanvas().style.cursor = isInteractive ? "pointer" : "";
    };

    const handlePopupButtonClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const button = target.closest(".popup-more-info-btn") as HTMLButtonElement | null;
      if (!button) {
        return;
      }

      const assetId = button.getAttribute("data-asset-id");
      if (!assetId) {
        return;
      }

      const asset = resultsRef.current.find((item) => item.id === assetId);
      if (asset) {
        setModalAsset(asset);
        setIsModalOpen(true);
      }
    };

    map.on("load", handleStyleLoad);
    map.on("style.load", handleStyleLoad);
    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    document.addEventListener("click", handlePopupButtonClick);

    mapRef.current = map;

    return () => {
      document.removeEventListener("click", handlePopupButtonClick);
      drawRef.current?.stop();
      drawRef.current = null;
      closePopup();
      map.off("load", handleStyleLoad);
      map.off("style.load", handleStyleLoad);
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.remove();
      mapRef.current = null;
    };
  }, [activeBasemap, applyAoiSelection, closePopup, normalizeAoi, onSelect, openWeatherPopup, resultsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    ensureSourcesAndLayers(map);
    asGeoJSONSource(map, RESULTS_SOURCE_ID)?.setData(resultsGeoJson);
    asGeoJSONSource(map, RESULTS_CLUSTER_SOURCE_ID)?.setData(resultsGeoJson);
    map.setLayoutProperty(
      RESULTS_CLUSTER_LAYER_ID,
      "visibility",
      showClusters ? "visible" : "none",
    );
    map.setLayoutProperty(
      RESULTS_CLUSTER_COUNT_LAYER_ID,
      "visibility",
      showClusters ? "visible" : "none",
    );
    map.setLayoutProperty(
      RESULTS_LAYER_ID,
      "visibility",
      showClusters ? "visible" : "none",
    );
    map.setLayoutProperty(
      RESULTS_PLAIN_LAYER_ID,
      "visibility",
      showClusters ? "none" : "visible",
    );
  }, [resultsGeoJson, showClusters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    ensureSourcesAndLayers(map);
    asGeoJSONSource(map, WEATHER_SOURCE_ID)?.setData(weatherGeoJson);
  }, [weatherGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    ensureSourcesAndLayers(map);
    asGeoJSONSource(map, AOI_SOURCE_ID)?.setData(aoiGeoJson);
  }, [aoiGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    ensureSourcesAndLayers(map);
    map.setFilter(RESULTS_SELECTED_LAYER_ID, ["==", ["get", "id"], selectedId ?? ""]);

    if (!selectedId) {
      return;
    }

    const selectedFeature = selectedResultGeoJson.features[0];
    if (!selectedFeature) {
      closePopup();
      return;
    }

    map.flyTo({
      center: selectedFeature.geometry.coordinates as [number, number],
      zoom: Math.max(map.getZoom(), FOCUSED_ZOOM),
      speed: 0.9,
      essential: true,
    });

    window.setTimeout(() => {
      if (selectedIdRef.current === selectedId) {
        openResultPopup(selectedFeature);
      }
    }, 180);
  }, [selectedId, selectedResultGeoJson, openResultPopup, closePopup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) {
      return;
    }

    if (filteredResults.length === 0 && weatherFeatures.length === 0) {
      return;
    }

    map.fitBounds(boundsToMapLibre(bounds), {
      padding: 56,
      maxZoom: filteredResults.length > 0 ? 12 : 11,
      duration: filteredResults.length > 250 ? 0 : 700,
    });
  }, [bounds, filteredResults.length, weatherFeatures.length]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) {
      return;
    }

    if (aoiTool === "polygon") {
      setAoiError(null);
      draw.clear();
      draw.setMode("polygon");
      return;
    }

    if (aoiTool === "bbox") {
      setAoiError(null);
      draw.clear();
      draw.setMode("rectangle");
      return;
    }

    draw.setMode("select");
  }, [aoiTool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeAoi) {
      return;
    }

    map.fitBounds(aoiBoundsToMapLibre(activeAoi.bounds), {
      padding: 72,
      duration: 650,
      maxZoom: 12,
    });
  }, [activeAoi]);

  const handleBasemapChange = useCallback((nextBasemap: BasemapKey) => {
    setActiveBasemap(nextBasemap);
    writeStoredBasemap(nextBasemap);
    closePopup();
    mapRef.current?.setStyle(BASEMAPS[nextBasemap].style);
  }, [closePopup]);

  const handleManualApply = useCallback(async () => {
    setAoiError(null);

    const bounds: AoiBounds = {
      west: Number(manualWest),
      south: Number(manualSouth),
      east: Number(manualEast),
      north: Number(manualNorth),
    };

    try {
      const selection = await normalizeAoi({
        mode: "manual",
        bounds,
        name: manualName.trim() || undefined,
      });
      applyAoiSelection(selection, activeAoiId);
    } catch (error) {
      setAoiError(
        error instanceof Error ? error.message : "Unable to create area of interest.",
      );
    }
  }, [activeAoiId, applyAoiSelection, manualEast, manualName, manualNorth, manualSouth, manualWest, normalizeAoi]);

  const handleRemoveAoi = useCallback((id: string) => {
    setAoiSelections((current) => {
      const next = current.filter((selection) => selection.id !== id);
      if (activeAoiIdRef.current === id) {
        setActiveAoiId(next[0]?.id ?? null);
      }
      return next;
    });
    setAoiError(null);
    setAoiIntelReport(null);
  }, []);

  const handleCreateNewManual = useCallback(() => {
    setActiveAoiId(null);
    setAoiError(null);
    setAoiIntelReport(null);
    populateManualForm(null);
  }, [populateManualForm]);

  const handleFetchAreaIntel = useCallback(async () => {
    if (!activeAoi) {
      return;
    }

    setAoiLoadingIntel(true);
    setAoiIntelReport(null);

    try {
      const response = await fetch("/api/aoi/intel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ aoi: activeAoi }),
      });

      const data = (await response.json()) as AreaIntelReport | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Unable to fetch area intelligence.",
        );
      }

      setAoiIntelReport(data as AreaIntelReport);
    } catch {
      setAoiError("Unable to fetch area intelligence.");
    } finally {
      setAoiLoadingIntel(false);
    }
  }, [activeAoi]);

  return (
    <>
      <div className="map-shell">
        <div className="map-toolbar">
          <div className="map-style-switcher" role="tablist" aria-label="Basemap style">
            {Object.entries(BASEMAPS).map(([key, basemap]) => (
              <button
                key={key}
                type="button"
                className={`map-style-button ${activeBasemap === key ? "active" : ""}`}
                onClick={() => handleBasemapChange(key as BasemapKey)}
              >
                <span className="map-style-label">{basemap.label}</span>
                <span className="map-style-description">{basemap.description}</span>
              </button>
            ))}
          </div>

          <label className="map-toggle-card">
            <input
              type="checkbox"
              checked={showClusters}
              onChange={(event) => setShowClusters(event.target.checked)}
            />
            <span className="map-toggle-copy">
              <span className="map-toggle-title">Cluster Points</span>
              <span className="map-toggle-description">
                Group dense search results for faster reading.
              </span>
            </span>
          </label>

          <section className="aoi-panel" aria-label="Area of Interest">
            <div className="aoi-panel-header">
              <div className="aoi-panel-title">Area of Interest</div>
              <div className="aoi-panel-description">
                Define the map area for emergency-response and open-source area analysis.
              </div>
            </div>

            <div className="aoi-tool-grid">
              <button
                type="button"
                className={`aoi-tool-button ${aoiTool === "polygon" ? "active" : ""}`}
                onClick={() => setAoiTool((current) => (current === "polygon" ? "idle" : "polygon"))}
              >
                Draw polygon
              </button>
              <button
                type="button"
                className={`aoi-tool-button ${aoiTool === "bbox" ? "active" : ""}`}
                onClick={() => setAoiTool((current) => (current === "bbox" ? "idle" : "bbox"))}
              >
                Draw rectangle
              </button>
              <button
                type="button"
                className="aoi-clear-button"
                onClick={clearAoi}
                disabled={aoiSelections.length === 0 && aoiTool === "idle"}
              >
                Clear all areas
              </button>
            </div>

            <div className="aoi-list-header">
              <span className="aoi-list-title">Saved areas</span>
              <button type="button" className="aoi-list-action" onClick={handleCreateNewManual}>
                New manual
              </button>
            </div>

            {aoiSelections.length > 0 ? (
              <div className="aoi-list">
                {aoiSelections.map((selection) => (
                  <div
                    key={selection.id}
                    className={`aoi-list-item ${selection.id === activeAoiId ? "active" : ""}`}
                  >
                    <button
                      type="button"
                      className="aoi-list-select"
                      onClick={() => setActiveAoiId(selection.id)}
                    >
                      <span className="aoi-list-name">{selection.name ?? "Unnamed area"}</span>
                      <span className="aoi-list-meta">
                        {selection.mode} · {selection.areaSqKm ? `${selection.areaSqKm.toFixed(1)} km²` : "n/a"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="aoi-list-delete"
                      onClick={() => handleRemoveAoi(selection.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="aoi-status-message">
                No saved areas yet. Draw one on the map or enter coordinates manually.
              </div>
            )}

            <div className="aoi-manual-form">
              <input
                type="text"
                className="aoi-input"
                placeholder="Name"
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
              />
              <div className="aoi-coordinate-grid">
                <input
                  type="number"
                  step="any"
                  className="aoi-input"
                  placeholder="West"
                  value={manualWest}
                  onChange={(event) => setManualWest(event.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  className="aoi-input"
                  placeholder="South"
                  value={manualSouth}
                  onChange={(event) => setManualSouth(event.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  className="aoi-input"
                  placeholder="East"
                  value={manualEast}
                  onChange={(event) => setManualEast(event.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  className="aoi-input"
                  placeholder="North"
                  value={manualNorth}
                  onChange={(event) => setManualNorth(event.target.value)}
                />
              </div>
              <button type="button" className="aoi-apply-button" onClick={handleManualApply}>
                {activeAoiId ? "Update area" : "Add area"}
              </button>
            </div>

            {aoiError && <div className="aoi-status-error">{aoiError}</div>}
            {aoiTool !== "idle" && (
              <div className="aoi-status-message">
                {aoiTool === "polygon"
                  ? "Polygon mode active. Click to place vertices and double-click to finish the shape."
                  : "Rectangle mode active. Drag on the map to create a bounding box."}
              </div>
            )}

            {activeAoi && (
              <div className="aoi-meta">
                <div className="aoi-meta-row">
                  <span className="aoi-meta-label">Mode</span>
                  <span className="aoi-meta-value">{activeAoi.mode}</span>
                </div>
                <div className="aoi-meta-row">
                  <span className="aoi-meta-label">BBox</span>
                  <span className="aoi-meta-value">
                    {activeAoi.bounds.west.toFixed(3)}, {activeAoi.bounds.south.toFixed(3)} to{" "}
                    {activeAoi.bounds.east.toFixed(3)}, {activeAoi.bounds.north.toFixed(3)}
                  </span>
                </div>
                <div className="aoi-meta-row">
                  <span className="aoi-meta-label">Center</span>
                  <span className="aoi-meta-value">
                    {activeAoi.center.lat.toFixed(4)}, {activeAoi.center.lon.toFixed(4)}
                  </span>
                </div>
                <div className="aoi-meta-row">
                  <span className="aoi-meta-label">Area</span>
                  <span className="aoi-meta-value">
                    {activeAoi.areaSqKm ? `${activeAoi.areaSqKm.toFixed(1)} km²` : "n/a"}
                  </span>
                </div>
                <button
                  type="button"
                  className="aoi-fetch-button"
                  onClick={handleFetchAreaIntel}
                  disabled={aoiLoadingIntel}
                >
                  {aoiLoadingIntel ? "Fetching…" : "Fetch area intelligence"}
                </button>
                {aoiIntelReport && (
                  <>
                    <div className="aoi-status-message">{aoiIntelReport.message}</div>

                    <div className="aoi-intel-overview">
                      <div className="aoi-intel-stat">
                        <span className="aoi-intel-stat-label">Features</span>
                        <span className="aoi-intel-stat-value">{aoiIntelReport.totals.features}</span>
                      </div>
                      <div className="aoi-intel-stat">
                        <span className="aoi-intel-stat-label">Sources OK</span>
                        <span className="aoi-intel-stat-value">{aoiIntelReport.totals.sourcesSuccessful}</span>
                      </div>
                      <div className="aoi-intel-stat">
                        <span className="aoi-intel-stat-label">Failures</span>
                        <span className="aoi-intel-stat-value">{aoiIntelReport.totals.sourcesFailed}</span>
                      </div>
                    </div>

                    {aoiIntelReport.highlights.length > 0 && (
                      <div className="aoi-intel-section">
                        <div className="aoi-intel-section-title">Highlights</div>
                        <div className="aoi-highlight-list">
                          {aoiIntelReport.highlights.map((highlight) => (
                            <div key={highlight.id} className="aoi-highlight-card">
                              <div className="aoi-highlight-title">{highlight.title}</div>
                              <div className="aoi-highlight-detail">{highlight.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(aoiIntelReport.categoryCounts).length > 0 && (
                      <div className="aoi-intel-section">
                        <div className="aoi-intel-section-title">Category totals</div>
                        <div className="aoi-category-grid">
                          {Object.entries(aoiIntelReport.categoryCounts).map(([category, count]) => (
                            <div key={category} className="aoi-category-pill">
                              <span>{category}</span>
                              <strong>{count}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="aoi-intel-section">
                      <div className="aoi-intel-section-title">Source status</div>
                      <div className="aoi-source-list">
                        {aoiIntelReport.sourceSummaries.map((source) => (
                          <div key={source.sourceId} className={`aoi-source-card ${source.status}`}>
                            <div className="aoi-source-head">
                              <span className="aoi-source-name">{source.label}</span>
                              <span className={`aoi-source-badge ${source.status}`}>{source.status}</span>
                            </div>
                            <div className="aoi-source-meta">
                              {source.category} · {source.featureCount} feature{source.featureCount === 1 ? "" : "s"}
                            </div>
                            {source.note && <div className="aoi-source-note">{source.note}</div>}
                            {source.error && <div className="aoi-source-error">{source.error}</div>}
                            {source.sampleNames.length > 0 && (
                              <div className="aoi-source-note">
                                Sample: {source.sampleNames.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        <div ref={containerRef} className="map-canvas" />

        {weatherFeatures.length > 0 && (
          <div className="weather-overlay-badge">Weather forecast overlay</div>
        )}

        {filteredResults.length === 0 && results.length > 0 && (
          <div className="map-overlay">
            <span>No results match current filters</span>
          </div>
        )}
      </div>

      <AssetInfoModal
        asset={modalAsset}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
