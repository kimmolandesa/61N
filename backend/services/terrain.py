import asyncio
import json

import numpy as np
import geopandas as gpd
from rasterio.io import MemoryFile
from rasterio.transform import rowcol
from scipy.ndimage import map_coordinates, zoom
from shapely.geometry import box, shape

from core import dem as dem_mod
from core.db import get_pool


# ── Raster helpers ────────────────────────────────────────────────────────────

def _slope_degrees(array: np.ndarray, px_m: float) -> np.ndarray:
    dy, dx = np.gradient(array, px_m)
    return np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))


def _hillshade(array: np.ndarray, px_m: float, azimuth=315.0, altitude=45.0) -> np.ndarray:
    az_r = np.radians(360 - azimuth + 90)
    alt_r = np.radians(altitude)
    dy, dx = np.gradient(array, px_m)
    slope = np.arctan(np.sqrt(dx**2 + dy**2))
    aspect = np.arctan2(-dx, dy)
    hs = (
        np.cos(alt_r) * np.cos(slope)
        + np.sin(alt_r) * np.sin(slope) * np.cos(az_r - aspect)
    )
    return np.clip(hs * 255, 0, 255).astype(np.uint8)


def _array_to_png(array: np.ndarray) -> bytes:
    with MemoryFile() as mem:
        with mem.open(
            driver='PNG',
            height=array.shape[0],
            width=array.shape[1],
            count=1,
            dtype='uint8',
        ) as ds:
            ds.write(array[np.newaxis, :, :])
        return mem.read()


# ── Terrain cover classification ──────────────────────────────────────────────

def _osm_to_landcover(row: dict) -> str:
    nat = (row.get('natural') or '').lower()
    lu  = (row.get('landuse') or '').lower()
    bld = row.get('building')
    ww  = row.get('waterway')

    if bld or lu in ('residential', 'commercial', 'industrial', 'retail'):
        return 'urban'
    if ww or nat == 'water' or lu in ('reservoir', 'basin'):
        return 'water'
    if nat in ('wetland', 'marsh', 'bog', 'fen'):
        return 'wetland'
    if nat == 'wood' or lu == 'forest':
        return 'dense_forest'
    if nat in ('scrub', 'heath') or lu in ('meadow', 'grass', 'village_green'):
        return 'scrub'
    if lu in ('farmland', 'farm', 'orchard', 'vineyard'):
        return 'open'
    return 'open'


_COVER_TABLE: dict[str, dict] = {
    'dense_forest': {
        'movement_factor_wheeled': 0.25,
        'movement_factor_tracked': 0.35,
        'concealment_from_air': 'high',
        'concealment_from_ground': 'high',
    },
    'sparse_forest': {
        'movement_factor_wheeled': 0.45,
        'movement_factor_tracked': 0.60,
        'concealment_from_air': 'medium',
        'concealment_from_ground': 'medium',
    },
    'scrub': {
        'movement_factor_wheeled': 0.60,
        'movement_factor_tracked': 0.70,
        'concealment_from_air': 'medium',
        'concealment_from_ground': 'low',
    },
    'open': {
        'movement_factor_wheeled': 0.75,
        'movement_factor_tracked': 0.85,
        'concealment_from_air': 'low',
        'concealment_from_ground': 'low',
    },
    'urban': {
        'movement_factor_wheeled': 0.35,
        'movement_factor_tracked': 0.25,
        'concealment_from_air': 'low',
        'concealment_from_ground': 'high',
    },
    'wetland': {
        'movement_factor_wheeled': 0.05,
        'movement_factor_tracked': 0.20,
        'concealment_from_air': 'low',
        'concealment_from_ground': 'low',
    },
    'water': {
        'movement_factor_wheeled': 0.00,
        'movement_factor_tracked': 0.00,
        'concealment_from_air': 'low',
        'concealment_from_ground': 'low',
    },
    'steep': {
        'movement_factor_wheeled': 0.00,
        'movement_factor_tracked': 0.10,
        'concealment_from_air': 'low',
        'concealment_from_ground': 'medium',
    },
}

# Lower number = higher priority when multiple polygons overlap a cell
_LANDCOVER_PRIORITY = {
    'urban': 0, 'water': 1, 'wetland': 2,
    'dense_forest': 3, 'scrub': 4, 'open': 5,
}


def _classify(landcover: str, slope_deg: float) -> dict:
    if slope_deg > 25:
        out = _COVER_TABLE['steep'].copy()
        out['cover_class'] = 'steep'
        return out

    out = _COVER_TABLE.get(landcover, _COVER_TABLE['open']).copy()
    out['cover_class'] = landcover

    if slope_deg > 15:
        out['movement_factor_wheeled'] = round(out['movement_factor_wheeled'] * 0.4, 2)
        out['movement_factor_tracked'] = round(out['movement_factor_tracked'] * 0.7, 2)

    return out


# ── Public API ────────────────────────────────────────────────────────────────

async def get_elevation(lat: float, lon: float) -> dict:
    return {
        'lat': lat,
        'lon': lon,
        'elevation_m': dem_mod.get_elevation_at(lon, lat),
    }


async def get_elevation_profile(
    start_lat: float, start_lon: float,
    end_lat: float, end_lon: float,
    samples: int = 100,
) -> dict:
    west  = min(start_lon, end_lon) - 0.01
    east  = max(start_lon, end_lon) + 0.01
    south = min(start_lat, end_lat) - 0.01
    north = max(start_lat, end_lat) + 0.01

    def _run():
        data, transform = dem_mod.read_window(west, south, east, north)
        if data.size == 0:
            return []

        r0, c0 = rowcol(transform, start_lon, start_lat)
        r1, c1 = rowcol(transform, end_lon, end_lat)

        rows_arr = np.linspace(np.clip(r0, 0, data.shape[0] - 1),
                               np.clip(r1, 0, data.shape[0] - 1), samples)
        cols_arr = np.linspace(np.clip(c0, 0, data.shape[1] - 1),
                               np.clip(c1, 0, data.shape[1] - 1), samples)

        elevs = map_coordinates(data, [rows_arr, cols_arr], order=1, mode='nearest')

        lat_m = 111_320.0
        lon_m = 111_320.0 * np.cos(np.radians((start_lat + end_lat) / 2))
        total_m = (((end_lat - start_lat) * lat_m) ** 2 +
                   ((end_lon - start_lon) * lon_m) ** 2) ** 0.5
        dists = np.linspace(0, total_m, samples)

        return [
            {'distance_m': round(float(d), 1), 'elevation_m': round(float(e), 1)}
            for d, e in zip(dists, elevs)
        ]

    loop = asyncio.get_event_loop()
    points = await loop.run_in_executor(None, _run)

    return {
        'start': {'lat': start_lat, 'lon': start_lon},
        'end': {'lat': end_lat, 'lon': end_lon},
        'total_distance_m': round(points[-1]['distance_m']) if points else 0,
        'samples': len(points),
        'profile': points,
    }


async def get_terrain_cover(bbox: tuple[float, float, float, float]) -> dict:
    """
    GeoJSON FeatureCollection of terrain grid cells with:
      cover_class, movement_factor_wheeled/tracked, concealment_from_air/ground.

    Grid resolution adapts to bbox size (100–500 m cells, max 100×100 grid).
    Slope from DEM + landcover from PostGIS OSM are cross-referenced per cell.
    """
    west, south, east, north = bbox

    # ── 1. OSM landcover polygons ─────────────────────────────────────────────
    pool = await get_pool()
    async with pool.acquire() as conn:
        osm_rows = await conn.fetch(
            """
            SELECT "natural", landuse, building, waterway,
                   ST_AsGeoJSON(ST_Transform(way, 4326)) AS geometry
            FROM planet_osm_polygon
            WHERE ST_Intersects(
                way,
                ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3067)
            )
            AND (
                "natural" IN ('wood','scrub','heath','wetland','water','marsh','bog','fen')
                OR landuse IN ('forest','farmland','meadow','grass','residential',
                               'commercial','industrial','orchard','vineyard')
                OR building IS NOT NULL
                OR waterway IS NOT NULL
            )
            LIMIT 5000
            """,
            west, south, east, north,
        )

    # ── 2. Adaptive grid ──────────────────────────────────────────────────────
    mid_lat = (south + north) / 2
    bbox_w_m = (east - west) * 111_320 * np.cos(np.radians(mid_lat))
    bbox_h_m = (north - south) * 111_320
    cell_m   = max(100.0, min(500.0, max(bbox_w_m, bbox_h_m) / 80))

    cell_deg_x = cell_m / (111_320 * np.cos(np.radians(mid_lat)))
    cell_deg_y = cell_m / 111_320

    n_cols = max(10, min(100, int((east - west) / cell_deg_x)))
    n_rows = max(10, min(100, int((north - south) / cell_deg_y)))
    cw = (east - west) / n_cols
    ch = (north - south) / n_rows

    cells = [
        box(west + xi * cw, south + yi * ch,
            west + (xi + 1) * cw, south + (yi + 1) * ch)
        for yi in range(n_rows)
        for xi in range(n_cols)
    ]
    centers_lon = np.array([c.centroid.x for c in cells])
    centers_lat = np.array([c.centroid.y for c in cells])

    # ── 3. Slope at each cell centre ──────────────────────────────────────────
    def _sample_slopes():
        try:
            data, transform = dem_mod.read_window(west, south, east, north)
            if data.size == 0:
                return np.zeros(len(cells))
            px_m = dem_mod.pixel_size_m(transform)
            slope = _slope_degrees(data, px_m)
            rs, cs = rowcol(transform, centers_lon, centers_lat)
            rs = np.clip(np.asarray(rs), 0, slope.shape[0] - 1)
            cs = np.clip(np.asarray(cs), 0, slope.shape[1] - 1)
            return slope[rs, cs]
        except Exception:
            return np.zeros(len(cells))

    loop = asyncio.get_event_loop()
    slopes = await loop.run_in_executor(None, _sample_slopes)

    # ── 4. Spatial join: dominant landcover per cell ──────────────────────────
    cell_landcover = ['open'] * len(cells)

    if osm_rows:
        osm_features = []
        for row in osm_rows:
            try:
                geom = shape(json.loads(row['geometry']))
                osm_features.append({
                    'geometry': geom,
                    'landcover': _osm_to_landcover(dict(row)),
                })
            except Exception:
                continue

        if osm_features:
            osm_gdf  = gpd.GeoDataFrame(osm_features, crs='EPSG:4326')
            grid_gdf = gpd.GeoDataFrame(
                {'idx': range(len(cells))},
                geometry=cells,
                crs='EPSG:4326',
            )
            joined = gpd.sjoin(
                grid_gdf, osm_gdf[['geometry', 'landcover']],
                how='left', predicate='intersects',
            )
            for cell_idx, group in joined.groupby('idx'):
                lcs = group['landcover'].dropna().tolist()
                if lcs:
                    cell_landcover[int(cell_idx)] = min(
                        lcs, key=lambda x: _LANDCOVER_PRIORITY.get(x, 99)
                    )

    # ── 5. Build GeoJSON ──────────────────────────────────────────────────────
    features = [
        {
            'type': 'Feature',
            'geometry': cell.__geo_interface__,
            'properties': _classify(cell_landcover[i], float(slopes[i])),
        }
        for i, cell in enumerate(cells)
    ]

    return {'type': 'FeatureCollection', 'features': features}


async def get_hillshade_tile(z: int, x: int, y: int) -> bytes:
    """256×256 hillshade PNG rendered from DEM VRT for a slippy-map tile."""
    west, south, east, north = dem_mod.tile_bbox_wgs84(z, x, y)

    def _run():
        try:
            data, transform = dem_mod.read_window(west, south, east, north)
            if data.size == 0:
                return _array_to_png(np.full((256, 256), 128, dtype=np.uint8))
            px_m = dem_mod.pixel_size_m(transform)
            hs = _hillshade(data, px_m)
            if hs.shape != (256, 256):
                factors = (256 / hs.shape[0], 256 / hs.shape[1])
                hs = zoom(hs, factors, order=1).astype(np.uint8)
            return _array_to_png(hs)
        except Exception:
            return _array_to_png(np.full((256, 256), 128, dtype=np.uint8))

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run)
