"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatBoundsLike,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawFreehandMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { Asset } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";
import type { WeatherForecastEntry } from "@/lib/intel/weather";
import type { AoiDrawMode, AoiSelection, AoiShapeType } from "@/lib/aoi/types";
import AssetInfoModal from "@/components/AssetInfoModal";
import { BASE_MAPS_BY_ID, type BaseMapId } from "@/lib/map/baseMaps";

interface OperationalMapProps {
  results: Asset[];
  weatherFeatures: IntelFeature[];
  bounds: [number, number, number, number] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterOperator: string | null;
  filterType: string | null;
  aois: AoiSelection[];
  selectedAoiId: string | null;
  selectedAoi: AoiSelection | null;
  drawMode: AoiDrawMode;
  activeBasemap: BaseMapId;
  onAddAoiFromGeometry: (args: {
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    shapeType: AoiShapeType;
  }) => AoiSelection | null;
  onReplaceAoiGeometry: (id: string, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) => void;
  onSelectAoi: (id: string | null) => void;
  zoomToSelectedAoiToken?: number;
}

interface ResultFeatureProperties {
  id: string;
  name: string;
  type: string;
  operator: string | null;
  popupHtml: string;
}

interface WeatherFeatureProperties {
  id: string;
  name: string;
  icon: string;
  popupHtml: string;
}

interface AoiFeatureProperties {
  id: string;
  name: string;
  shapeType: AoiShapeType;
  selected: boolean;
}

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
const AOI_SOURCE_ID = "aoi-collection";
const AOI_FILL_LAYER_ID = "aoi-fill";
const AOI_OUTLINE_LAYER_ID = "aoi-outline";
const AOI_SELECTED_OUTLINE_LAYER_ID = "aoi-selected-outline";
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

function aoiBoundsToMapLibre(aoi: AoiSelection): LngLatBoundsLike {
  return [
    [aoi.bounds.west, aoi.bounds.south],
    [aoi.bounds.east, aoi.bounds.north],
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
      return `<tr><td class="popup-key">${icon} ${time}</td><td class="popup-value">${escapeHtml(
        entry.condition,
      )}</td></tr>`;
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

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function asGeoJSONSource(map: maplibregl.Map, sourceId: string): GeoJSONSource | null {
  const source = map.getSource(sourceId);
  return source && "setData" in source ? (source as GeoJSONSource) : null;
}

function asAoiGeometry(
  geometry: GeoJSONStoreFeatures["geometry"],
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const candidate = geometry as unknown as GeoJSON.Geometry;
  if (candidate.type === "Polygon" || candidate.type === "MultiPolygon") {
    return candidate;
  }

  return null;
}

function terraModeFromShapeType(shapeType: AoiShapeType): string {
  if (shapeType === "rectangle") {
    return "rectangle";
  }

  if (shapeType === "circle") {
    return "circle";
  }

  if (shapeType === "freehand") {
    return "freehand";
  }

  return "polygon";
}

function shapeTypeFromFeature(feature: GeoJSONStoreFeatures): AoiShapeType {
  const mode = typeof feature.properties?.mode === "string" ? feature.properties.mode : "";
  if (mode.includes("rectangle")) {
    return "rectangle";
  }

  if (mode.includes("circle")) {
    return "circle";
  }

  if (mode.includes("freehand")) {
    return "freehand";
  }

  return "polygon";
}

function ensureSourcesAndLayers(map: maplibregl.Map): void {
  if (!map.getSource(RESULTS_SOURCE_ID)) {
    map.addSource(RESULTS_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }

  if (!map.getSource(RESULTS_CLUSTER_SOURCE_ID)) {
    map.addSource(RESULTS_CLUSTER_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 13,
    });
  }

  if (!map.getSource(WEATHER_SOURCE_ID)) {
    map.addSource(WEATHER_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
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
        "circle-color": ["step", ["get", "point_count"], "#3b82f6", 10, "#f59e0b", 100, "#ef4444"],
        "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 100, 32],
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
        "fill-opacity": 0.18,
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
        "line-opacity": 0.65,
      },
    });
  }

  if (!map.getLayer(AOI_SELECTED_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: AOI_SELECTED_OUTLINE_LAYER_ID,
      type: "line",
      source: AOI_SOURCE_ID,
      filter: ["==", ["get", "selected"], true],
      paint: {
        "line-color": "#fde68a",
        "line-width": 4,
        "line-opacity": 1,
      },
    });
  }

}

export default function OperationalMap({
  results,
  weatherFeatures,
  bounds,
  selectedId,
  onSelect,
  filterOperator,
  filterType,
  aois,
  selectedAoiId,
  selectedAoi,
  drawMode,
  activeBasemap,
  onAddAoiFromGeometry,
  onReplaceAoiGeometry,
  onSelectAoi,
  zoomToSelectedAoiToken = 0,
}: OperationalMapProps) {
  const [showClusters, setShowClusters] = useState(true);
  const [modalAsset, setModalAsset] = useState<Asset | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const resultsRef = useRef<Asset[]>(results);
  const selectedIdRef = useRef<string | null>(selectedId);
  const drawModeRef = useRef<AoiDrawMode>(drawMode);
  const selectedAoiRef = useRef<AoiSelection | null>(selectedAoi);
  const weatherGeoJsonRef = useRef<
    GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProperties>
  >(emptyFeatureCollection() as GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProperties>);
  const aoiGeoJsonRef = useRef<
    GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AoiFeatureProperties>
  >(emptyFeatureCollection() as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AoiFeatureProperties>);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    selectedAoiRef.current = selectedAoi;
  }, [selectedAoi]);

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

  const resultsGeoJson = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, ResultFeatureProperties>
  >(
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
      return emptyFeatureCollection() as GeoJSON.FeatureCollection<
        GeoJSON.Point,
        ResultFeatureProperties
      >;
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
            popupHtml: createResultPopupHtml(selectedAsset),
          },
        },
      ],
    };
  }, [filteredResults, selectedId]);

  const weatherGeoJson = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Point, WeatherFeatureProperties>
  >(
    () => ({
      type: "FeatureCollection",
      features: weatherFeatures
        .filter(
          (feature): feature is IntelFeature & { geometry: GeoJSON.Point } =>
            feature.geometry.type === "Point",
        )
        .filter((feature) => {
          const [lon, lat] = feature.geometry.coordinates;
          return isValidCoordinate(lat, lon);
        })
        .map((feature) => ({
          type: "Feature",
          id: feature.id,
          geometry: feature.geometry,
          properties: {
            id: feature.id,
            name: feature.name ?? "Weather Forecast",
            icon:
              typeof feature.properties.condition === "string"
                ? WEATHER_ICONS[feature.properties.condition] ?? "☀"
                : "☀",
            popupHtml: createWeatherPopupHtml(feature),
          },
        })),
    }),
    [weatherFeatures],
  );

  useEffect(() => {
    weatherGeoJsonRef.current = weatherGeoJson;
  }, [weatherGeoJson]);

  const aoiGeoJson = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, AoiFeatureProperties>
  >(
    () => ({
      type: "FeatureCollection",
      features: aois.map((aoi) => ({
        type: "Feature",
        id: aoi.id,
        geometry: aoi.geometry,
        properties: {
          id: aoi.id,
          name: aoi.name,
          shapeType: aoi.shapeType,
          selected: aoi.id === selectedAoiId,
        },
      })),
    }),
    [aois, selectedAoiId],
  );

  useEffect(() => {
    aoiGeoJsonRef.current = aoiGeoJson;
  }, [aoiGeoJson]);

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
      style: BASE_MAPS_BY_ID[activeBasemap].style,
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
          new TerraDrawCircleMode(),
          new TerraDrawFreehandMode(),
          new TerraDrawSelectMode(),
        ],
      });

      draw.on("finish", (featureId) => {
        const feature = draw.getSnapshotFeature(featureId);
        if (!feature) {
          return;
        }

        const geometry = asAoiGeometry(feature.geometry);
        if (!geometry) {
          return;
        }

        if (drawModeRef.current === "edit" && selectedAoiRef.current?.id === String(featureId)) {
          onReplaceAoiGeometry(selectedAoiRef.current.id, geometry);
          draw.clear();
          return;
        }

        onAddAoiFromGeometry({
          geometry,
          shapeType: shapeTypeFromFeature(feature),
        });
        draw.clear();
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
      if (drawModeRef.current !== "select") {
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
          AOI_SELECTED_OUTLINE_LAYER_ID,
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

      if (
        topFeature.layer.id === WEATHER_CIRCLE_LAYER_ID ||
        topFeature.layer.id === WEATHER_ICON_LAYER_ID
      ) {
        const match = weatherGeoJsonRef.current.features.find((feature) => feature.id === topFeature.id);
        if (match) {
          openWeatherPopup(match);
        }
        return;
      }

      if (
        topFeature.layer.id === AOI_FILL_LAYER_ID ||
        topFeature.layer.id === AOI_OUTLINE_LAYER_ID ||
        topFeature.layer.id === AOI_SELECTED_OUTLINE_LAYER_ID
      ) {
        const aoiId =
          typeof topFeature.properties?.id === "string"
            ? topFeature.properties.id
            : typeof topFeature.id === "string"
              ? topFeature.id
              : null;

        if (aoiId) {
          onSelectAoi(aoiId);
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
      const isInteractive =
        map.queryRenderedFeatures(event.point, {
          layers: [
            RESULTS_CLUSTER_LAYER_ID,
            RESULTS_LAYER_ID,
            RESULTS_PLAIN_LAYER_ID,
            WEATHER_CIRCLE_LAYER_ID,
            WEATHER_ICON_LAYER_ID,
            AOI_FILL_LAYER_ID,
            AOI_OUTLINE_LAYER_ID,
            AOI_SELECTED_OUTLINE_LAYER_ID,
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
  }, [activeBasemap, closePopup, onAddAoiFromGeometry, onReplaceAoiGeometry, onSelect, onSelectAoi, openResultPopup, openWeatherPopup, resultsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    ensureSourcesAndLayers(map);
    asGeoJSONSource(map, RESULTS_SOURCE_ID)?.setData(resultsGeoJson);
    asGeoJSONSource(map, RESULTS_CLUSTER_SOURCE_ID)?.setData(resultsGeoJson);
    map.setLayoutProperty(RESULTS_CLUSTER_LAYER_ID, "visibility", showClusters ? "visible" : "none");
    map.setLayoutProperty(
      RESULTS_CLUSTER_COUNT_LAYER_ID,
      "visibility",
      showClusters ? "visible" : "none",
    );
    map.setLayoutProperty(RESULTS_LAYER_ID, "visibility", showClusters ? "visible" : "none");
    map.setLayoutProperty(RESULTS_PLAIN_LAYER_ID, "visibility", showClusters ? "none" : "visible");
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

    if (drawMode === "polygon") {
      draw.clear();
      draw.setMode("polygon");
      return;
    }

    if (drawMode === "rectangle") {
      draw.clear();
      draw.setMode("rectangle");
      return;
    }

    if (drawMode === "circle") {
      draw.clear();
      draw.setMode("circle");
      return;
    }

    if (drawMode === "freehand") {
      draw.clear();
      draw.setMode("freehand");
      return;
    }

    if (drawMode === "edit") {
      draw.clear();

      if (!selectedAoi) {
        draw.setMode("select");
        return;
      }

      draw.addFeatures([
        {
          type: "Feature",
          id: selectedAoi.id,
          geometry: selectedAoi.geometry,
          properties: {
            mode: terraModeFromShapeType(selectedAoi.shapeType),
          },
        } as GeoJSONStoreFeatures,
      ]);
      draw.setMode("select");
      draw.selectFeature(selectedAoi.id);
      return;
    }

    draw.clear();
    draw.setMode("select");
  }, [drawMode, selectedAoi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAoi) {
      return;
    }

    map.fitBounds(aoiBoundsToMapLibre(selectedAoi), {
      padding: 72,
      duration: 650,
      maxZoom: 12,
    });
  }, [selectedAoi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    closePopup();
    map.setStyle(BASE_MAPS_BY_ID[activeBasemap].style);
  }, [activeBasemap, closePopup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedAoi || zoomToSelectedAoiToken === 0) {
      return;
    }

    map.fitBounds(aoiBoundsToMapLibre(selectedAoi), {
      padding: 88,
      duration: 500,
      maxZoom: 12,
    });
  }, [selectedAoi, zoomToSelectedAoiToken]);

  return (
    <>
      <div className="relative h-full min-h-[620px] overflow-hidden rounded-[28px] border border-slate-300 bg-white shadow-[0_25px_60px_rgba(15,23,42,0.14)]">
        <div
          ref={containerRef}
          className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),_transparent_55%),linear-gradient(180deg,_rgba(248,250,252,0.85),_rgba(255,255,255,1))]"
        />
        <div className="pointer-events-none absolute inset-x-6 top-6 flex items-center justify-between">
          <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
            Operational map canvas
          </div>
          <label className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
            <input
              type="checkbox"
              checked={showClusters}
              onChange={(event) => setShowClusters(event.target.checked)}
            />
            Cluster points
          </label>
        </div>
        {weatherFeatures.length > 0 && (
          <div className="pointer-events-none absolute bottom-6 left-6 rounded-full border border-sky-200 bg-white/90 px-3 py-1 text-xs font-medium text-sky-700 shadow-sm backdrop-blur">
            Weather forecast overlay active
          </div>
        )}
        {filteredResults.length === 0 && results.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
            <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 shadow-sm">
              No results match the current search filters.
            </div>
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
