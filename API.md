# 61N Backend API

Base URL: `https://api.kebabkartta.fi`

No authentication required. All coordinates are WGS84.
`bbox` query params always use `minx,miny,maxx,maxy` (longitude first, then latitude).

---

## MapLibre Integration

Wire the tile endpoints directly as MapLibre sources:

```js
map.addSource('osm-vector', {
  type: 'vector',
  tiles: ['https://api.kebabkartta.fi/api/tiles/{z}/{x}/{y}.mvt'],
  minzoom: 0, maxzoom: 16,
});

map.addSource('mml-topo', {
  type: 'raster',
  tiles: ['https://api.kebabkartta.fi/api/tiles/mml/{z}/{x}/{y}.png'],
  tileSize: 256,
});

map.addSource('hillshade', {
  type: 'raster',
  tiles: ['https://api.kebabkartta.fi/api/terrain/dem/{z}/{x}/{y}.png'],
  tileSize: 256,
});
```

The vector tile layer name is `features`. Available properties on each feature:
`osm_id`, `name`, `natural`, `landuse`, `highway`, `waterway`, `military`, `amenity`, `building`, `man_made`, `power`, `historic`.

---

## Tiles

### OSM Vector Tile
```
GET /api/tiles/{z}/{x}/{y}.mvt
```
Mapbox Vector Tile (protobuf) from the local OSM PostGIS database.

### MML Topographic Raster
```
GET /api/tiles/mml/{z}/{x}/{y}.png
```
Maanmittauslaitos topographic map tile.

### Hillshade Raster
```
GET /api/terrain/dem/{z}/{x}/{y}.png
```
Hillshade rendered from the DEM VRT. Cache: 24h.

---

## Features

### GeoJSON bbox query
```
GET /api/features/bbox?minx=24.9&miny=60.1&maxx=25.2&maxy=60.4&layer=all&limit=1000
```
Returns a GeoJSON FeatureCollection of OSM features intersecting the bbox.

| Param | Values | Default |
|---|---|---|
| `layer` | `all`, `military`, `roads`, `water`, `buildings`, `infrastructure` | `all` |
| `limit` | integer | `1000` |

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[...]] },
      "properties": { "osm_id": 123, "name": "...", "military": "barracks" }
    }
  ]
}
```

---

## Weather

### Current observations
```
GET /api/weather/current?bbox=24.5,60.0,25.5,60.5
```
FMI station observations from the last 60 minutes. Cache: 30 min.

```json
{
  "bbox": [24.5, 60.0, 25.5, 60.5],
  "count": 3,
  "observations": [
    {
      "station": "Helsinki Kaisaniemi",
      "lat": 60.175, "lon": 24.944,
      "temperature_c": 4.2, "wind_speed_ms": 5.1,
      "wind_direction_deg": 220, "precipitation_mm": 0.0,
      "visibility_m": 9000, "snow_depth_cm": 0
    }
  ]
}
```

### Forecast
```
GET /api/weather/forecast?bbox=24.5,60.0,25.5,60.5&hours=72
```
HARMONIE model hourly forecast for the bbox centre. `hours` 1–120, default 72. Cache: 2h.

```json
{
  "center": { "lat": 60.25, "lon": 25.0 },
  "forecast": [
    {
      "time": "2025-05-16T12:00:00Z",
      "temperature_c": 3.5, "wind_speed_ms": 6.2,
      "wind_direction_deg": 180, "precipitation_mm": 0.2,
      "visibility_m": 8000, "snow_depth_cm": 5
    }
  ]
}
```

### Operational impact assessment
```
GET /api/weather/impact?bbox=24.5,60.0,25.5,60.5
```
**The most useful weather endpoint.** Translates forecast into mobility/aviation categories. Cache: 2h.

```json
{
  "mobility_wheeled":  "moderate",
  "mobility_tracked":  "good",
  "aviation_rotary":   "good",
  "drone_ops":         "no-go",
  "visibility":        "good",
  "reason": "Wind 14 m/s — fixed-wing drone ops not recommended"
}
```

Possible values: `good`, `moderate`, `severe`, `no-go`, `obscured`.

---

## Terrain

### Point elevation
```
GET /api/terrain/elevation?lat=60.2&lon=25.0
```
Returns elevation in metres at a single point. Requires DEM VRT on server.

```json
{ "lat": 60.2, "lon": 25.0, "elevation_m": 42.3 }
```

### Elevation profile
```
GET /api/terrain/profile?start_lat=60.1&start_lon=24.9&end_lat=60.3&end_lon=25.1&samples=100
```
Elevation transect between two points. `samples` 10–500, default 100.

```json
{
  "samples": 100,
  "profile": [
    { "lat": 60.1, "lon": 24.9, "elevation_m": 15.2, "distance_m": 0 },
    { "lat": 60.12, "lon": 24.92, "elevation_m": 23.7, "distance_m": 2450 }
  ]
}
```

### Terrain cover grid
```
GET /api/terrain/cover?bbox=24.9,60.1,25.2,60.4
```
Grid of tactical terrain cells. Resolution adapts to bbox size (100–500m cells).

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [25.0, 60.2] },
      "properties": {
        "cover_class": "dense_forest",
        "movement_factor_wheeled": 0.3,
        "movement_factor_tracked": 0.5,
        "concealment_from_air": "high",
        "concealment_from_ground": "high"
      }
    }
  ]
}
```

`cover_class` values: `dense_forest`, `sparse_forest`, `open`, `urban`, `wetland`, `slope`.
`movement_factor`: 1.0 = road speed, 0.0 = impassable.

### Soil deposits
```
GET /api/terrain/soil?bbox=24.9,60.1,25.2,60.4
```
GTK Maapera superficial deposit polygons from local PostGIS. Fast (<200ms). No bbox size limit.

```json
{
  "type": "FeatureCollection",
  "source": "GTK Maapera 1:200000 (PostGIS)",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[...]] },
      "properties": {
        "deposit_type": "till",
        "peat_depth": null,
        "digging_suitability": "good",
        "trafficability_dry": "high",
        "trafficability_wet": "medium",
        "concealment_potential": "low",
        "groundwater_risk": false
      }
    }
  ]
}
```

`deposit_type` values: `bedrock`, `till`, `glaciofluvial_gravel`, `sand`, `clay`, `fine_grained`, `peat`, `swamp`, `water`, `unknown`.

---

## Analysis

All analysis endpoints are POST with a JSON body.

### Line of sight
```
POST /api/analysis/los
Content-Type: application/json

{
  "observer": { "lat": 60.2, "lon": 25.0, "height_m": 1.5 },
  "target":   { "lat": 60.25, "lon": 25.1, "height_m": 0.0 }
}
```

```json
{
  "visible": false,
  "obstruction": { "lon": 25.05, "lat": 60.22, "elevation_m": 87.4 }
}
```

### Viewshed
```
POST /api/analysis/viewshed
Content-Type: application/json

{
  "lat": 60.2, "lon": 25.0,
  "height_m": 1.5,
  "max_range_m": 5000
}
```
Returns a GeoJSON Feature with the visible area polygon. `max_range_m` max 30 000.

```json
{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [[...]] },
  "properties": {
    "observer": { "lat": 60.2, "lon": 25.0, "height_m": 1.5 },
    "max_range_m": 5000
  }
}
```

### Defilade (areas hidden from a threat)
```
POST /api/analysis/defilade
Content-Type: application/json

{
  "threat": { "lat": 60.3, "lon": 25.2, "height_m": 2.0 },
  "bbox": [24.9, 60.1, 25.2, 60.4],
  "max_range_m": 10000
}
```
Returns a GeoJSON polygon of areas within the bbox that are NOT visible from the threat position.

---

## Logistics

### Road chokepoints
```
GET /api/logistics/chokepoints?bbox=24.5,60.0,25.5,60.5
```
Top-30 road segments by betweenness centrality. Bridges/tunnels receive a structural criticality multiplier. Cache: varies.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[...]] },
      "properties": {
        "highway": "primary",
        "name": "Hämeentie",
        "centrality_score": 0.84,
        "is_bridge": true,
        "rank": 1
      }
    }
  ]
}
```

### Route planning
```
GET /api/logistics/routes?from_lat=60.1&from_lon=24.9&to_lat=60.4&to_lon=25.2&vehicle_class=wheeled
```

| `vehicle_class` | Passable roads |
|---|---|
| `wheeled` | Paved roads only |
| `tracked` | Roads + tracks (reduced speed) |
| `foot` | All |

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[...]] },
  "properties": { "distance_m": 42300, "duration_min": 38, "vehicle_class": "wheeled" }
}
```

### Support nodes
```
GET /api/logistics/support_nodes?bbox=24.5,60.0,25.5,60.5&type=all
```
`type`: `medical`, `fuel`, `water`, `all`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [25.0, 60.2] },
      "properties": { "name": "Meilahti Hospital", "node_type": "medical", "amenity": "hospital" }
    }
  ]
}
```

### Weight restrictions
```
GET /api/logistics/restrictions?bbox=24.5,60.0,25.5,60.5
```
Väylä Digiroad road weight restrictions. Segments without restrictions meet Finnish standard (76t combination / 13t axle). Cache: 24h.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[...]] },
      "properties": {
        "single_vehicle_t": 20.0,
        "combination_t": 40.0,
        "axle_t": 8.0,
        "bogie_t": null,
        "passable_by": ["light_wheeled", "apc_wheeled"],
        "blocks_mbt": true,
        "blocks_heavy_truck": true
      }
    }
  ]
}
```

Vehicle classes: `light_wheeled` (≤12t), `apc_wheeled` (≤28t, e.g. AMV), `medium_truck` (≤32t), `heavy_truck` (≤44t), `tracked_ifv` (≤40t, e.g. CV90), `mbt` (≤65t, e.g. Leopard 2).

### Bridges
```
GET /api/logistics/bridges?bbox=24.5,60.0,25.5,60.5
```
Bridge structures from Väylä Taitorakennerekisteri. `null` load fields mean no posted restriction — Finnish standard applies (76t/13t axle). Cache: 24h.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [25.05, 60.22] },
      "properties": {
        "name": "Pitkäsilta",
        "purpose": "road",
        "max_total_mass_t": 40.0,
        "max_axle_load_t": null,
        "restricted": true,
        "passable_by": ["light_wheeled", "apc_wheeled", "medium_truck"],
        "blocks_mbt": true,
        "blocks_heavy_truck": true
      }
    }
  ]
}
```

`purpose` values: `road`, `pedestrian`, `railway`, `underpass`.

---

## Intel

### Population grid
```
GET /api/intel/population?bbox=24.5,60.0,25.5,60.5
```
1km² population grid from Statistics Finland. Cache: 24h.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[...]] },
      "properties": {
        "population": 1240,
        "density_class": "urban"
      }
    }
  ]
}
```

### Cell coverage (comms dead zones)
```
GET /api/intel/comms?bbox=24.5,60.0,25.5,60.5
```
Cell tower positions + ~350m coverage grid + operational summary. Cache: 1h.

```json
{
  "towers": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [25.0, 60.2] },
        "properties": {
          "radio": "LTE",
          "operator": "Elisa",
          "coverage_radius_m": 2000,
          "avg_signal_dbm": -85
        }
      }
    ],
    "metadata": { "tower_count": 12, "source": "OpenCellID" }
  },
  "coverage_grid": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [25.01, 60.21] },
        "properties": { "covered": true }
      }
    ]
  },
  "dead_zone_ratio": 0.18,
  "summary": "moderate — isolated dead zones; verify coverage on planned routes"
}
```

`dead_zone_ratio`: 0–1. `summary` values: `good`, `moderate`, `degraded`, `poor`.

### ISR satellite passes
```
GET /api/intel/satellites?lat=60.2&lon=25.0&alt_m=0&days=3
```
Upcoming passes of reconnaissance satellites. `days` 1–10, default 3. Cache: 30 min.

```json
{
  "passes": [
    {
      "satellite": "Sentinel-2A",
      "norad_id": 40697,
      "startUTC": 1747390800,
      "endUTC": 1747391340,
      "duration_s": 540,
      "max_elevation_deg": 72.4,
      "type": "optical"
    }
  ]
}
```

Satellites covered: Sentinel-1A/B (SAR, all-weather), Sentinel-2A/B (optical), Landsat-8/9 (optical).
`type`: `sar` (works at night/through clouds) or `optical` (daylight/clear sky only).

---

## Quick reference

| Question | Endpoint |
|---|---|
| What is the terrain here? | `GET /api/terrain/cover?bbox=` |
| What is the soil type? | `GET /api/terrain/soil?bbox=` |
| How will weather affect operations? | `GET /api/weather/impact?bbox=` |
| Can point A see point B? | `POST /api/analysis/los` |
| What area can an observer see? | `POST /api/analysis/viewshed` |
| Where to hide from a threat? | `POST /api/analysis/defilade` |
| Which bridges block heavy vehicles? | `GET /api/logistics/bridges?bbox=` |
| Where are the road bottlenecks? | `GET /api/logistics/chokepoints?bbox=` |
| Where is the nearest hospital/fuel? | `GET /api/logistics/support_nodes?bbox=&type=medical` |
| Are there cell coverage gaps? | `GET /api/intel/comms?bbox=` |
| When is a satellite overhead? | `GET /api/intel/satellites?lat=&lon=` |
| How many civilians in the area? | `GET /api/intel/population?bbox=` |
