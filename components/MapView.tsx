"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const resultsRef = useRef<Asset[]>(results);
  const selectedIdRef = useRef<string | null>(selectedId);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

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
      asGeoJSONSource(map, WEATHER_SOURCE_ID)?.setData(weatherGeoJson);
      map.setFilter(RESULTS_SELECTED_LAYER_ID, ["==", ["get", "id"], selectedIdRef.current ?? ""]);
    };

    const handleStyleLoad = () => {
      syncSources();
    };

    const handleClick = async (event: maplibregl.MapMouseEvent) => {
      const hitFeatures = map.queryRenderedFeatures(event.point, {
        layers: [
          RESULTS_CLUSTER_LAYER_ID,
          RESULTS_LAYER_ID,
          RESULTS_PLAIN_LAYER_ID,
          WEATHER_CIRCLE_LAYER_ID,
          WEATHER_ICON_LAYER_ID,
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
        const match = weatherGeoJson.features.find((feature) => feature.id === topFeature.id);
        if (match) {
          openWeatherPopup(match);
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
      closePopup();
      map.off("load", handleStyleLoad);
      map.off("style.load", handleStyleLoad);
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.remove();
      mapRef.current = null;
    };
  }, [activeBasemap, closePopup, onSelect, openWeatherPopup, resultsGeoJson, weatherGeoJson]);

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

  const handleBasemapChange = useCallback((nextBasemap: BasemapKey) => {
    setActiveBasemap(nextBasemap);
    writeStoredBasemap(nextBasemap);
    closePopup();
    mapRef.current?.setStyle(BASEMAPS[nextBasemap].style);
  }, [closePopup]);

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
