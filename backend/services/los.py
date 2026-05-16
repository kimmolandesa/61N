import asyncio
from functools import lru_cache

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from scipy.ndimage import map_coordinates

from core.config import settings


@lru_cache(maxsize=1)
def _open_dem():
    return rasterio.open(settings.DEM_VRT_PATH)


def _read_dem_window(west: float, south: float, east: float, north: float) -> tuple[np.ndarray, object]:
    src = _open_dem()
    window = from_bounds(west, south, east, north, src.transform)
    data = src.read(1, window=window).astype(np.float32)
    transform = src.window_transform(window)
    return data, transform


def _lonlat_to_pixel(lon: float, lat: float, transform) -> tuple[int, int]:
    from rasterio.transform import rowcol
    row, col = rowcol(transform, lon, lat)
    return int(row), int(col)


def viewshed_vectorized(
    dem: np.ndarray,
    observer_row: int,
    observer_col: int,
    observer_height: float,
    max_r_px: int,
    n_azimuths: int = 720,
) -> np.ndarray:
    """
    Fully vectorized viewshed. No Python loop over azimuths.

    Coordinate array passed to map_coordinates has shape (2, n_azimuths, num_samples)
    where axis 0 = [row_indices, col_indices]. Single map_coordinates call interpolates
    all rays at once. Horizon tracking uses np.maximum.accumulate along axis=-1.

    Returns boolean visibility mask with same shape as dem.
    """
    observer_elev = float(dem[observer_row, observer_col]) + observer_height

    azimuths = np.linspace(0, 2 * np.pi, n_azimuths, endpoint=False)  # (n_azimuths,)
    r = np.arange(1, max_r_px + 1, dtype=np.float64)                  # (num_samples,)

    # Fractional row/col for every (azimuth, range) pair — shape (n_azimuths, num_samples)
    row_coords = observer_row - r[np.newaxis, :] * np.cos(azimuths[:, np.newaxis])
    col_coords = observer_col + r[np.newaxis, :] * np.sin(azimuths[:, np.newaxis])

    # scipy expects (2, n_azimuths, num_samples): first dim = [rows, cols]
    coords = np.array([row_coords, col_coords])  # (2, n_azimuths, num_samples)

    # Single bilinear interpolation across all rays
    elevations = map_coordinates(dem, coords, order=1, mode='nearest')  # (n_azimuths, num_samples)

    # Angular elevation relative to observer (rise over run in pixel units)
    angular_elev = (elevations - observer_elev) / r[np.newaxis, :]  # (n_azimuths, num_samples)

    # Cumulative horizon: max angular elevation seen so far along each ray
    horizon = np.maximum.accumulate(angular_elev, axis=-1)  # (n_azimuths, num_samples)

    # A sample is visible if its angular elevation >= the horizon at the previous step.
    # Shift horizon right by 1 along the ray axis; first sample is always visible.
    prev_horizon = np.empty_like(horizon)
    prev_horizon[:, 0] = -np.inf
    prev_horizon[:, 1:] = horizon[:, :-1]

    visible_mask = angular_elev >= prev_horizon  # (n_azimuths, num_samples)

    # Scatter visible samples back onto the DEM grid
    result = np.zeros(dem.shape, dtype=bool)
    result[observer_row, observer_col] = True

    ri = np.clip(row_coords.astype(np.intp), 0, dem.shape[0] - 1)
    ci = np.clip(col_coords.astype(np.intp), 0, dem.shape[1] - 1)
    result[ri[visible_mask], ci[visible_mask]] = True

    return result


def _viewshed_to_geojson(
    visible: np.ndarray,
    transform,
) -> dict:
    """Convert boolean visibility mask to a GeoJSON Polygon (convex hull of visible pixels)."""
    from rasterio.features import shapes
    from shapely.geometry import shape, MultiPolygon
    from shapely.ops import unary_union

    polys = [
        shape(geom)
        for geom, val in shapes(visible.astype(np.uint8), transform=transform)
        if val == 1
    ]
    if not polys:
        return {"type": "Polygon", "coordinates": []}

    merged = unary_union(polys)
    return merged.__geo_interface__


async def compute_viewshed(
    observer_lon: float,
    observer_lat: float,
    observer_height_m: float,
    max_range_m: float,
) -> dict:
    """
    Async entry point for viewshed. Offloads CPU-bound work to thread pool.
    Returns GeoJSON geometry of the visible area.
    """
    # Determine bbox: max_range degrees ≈ max_range_m / 111320
    deg_offset = max_range_m / 111320.0
    west = observer_lon - deg_offset
    east = observer_lon + deg_offset
    south = observer_lat - deg_offset
    north = observer_lat + deg_offset

    def _run():
        dem, transform = _read_dem_window(west, south, east, north)
        if dem.size == 0:
            return {"type": "Polygon", "coordinates": []}

        obs_row, obs_col = _lonlat_to_pixel(observer_lon, observer_lat, transform)
        obs_row = max(0, min(obs_row, dem.shape[0] - 1))
        obs_col = max(0, min(obs_col, dem.shape[1] - 1))

        # max range in pixels (pixel size ≈ transform pixel width in degrees * 111320)
        pixel_size_m = abs(transform.a) * 111320.0
        max_r_px = max(1, int(max_range_m / pixel_size_m))

        visible = viewshed_vectorized(dem, obs_row, obs_col, observer_height_m, max_r_px)
        return _viewshed_to_geojson(visible, transform)

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run)


async def compute_los(
    observer_lon: float,
    observer_lat: float,
    observer_height_m: float,
    target_lon: float,
    target_lat: float,
    target_height_m: float = 0.0,
) -> dict:
    """
    Check line-of-sight between two points.
    Returns {visible: bool, obstruction: {lon, lat, elevation} | None}.
    """
    west = min(observer_lon, target_lon) - 0.01
    east = max(observer_lon, target_lon) + 0.01
    south = min(observer_lat, target_lat) - 0.01
    north = max(observer_lat, target_lat) + 0.01

    def _run():
        dem, transform = _read_dem_window(west, south, east, north)
        if dem.size == 0:
            return {"visible": None, "obstruction": None, "error": "No DEM data for area"}

        obs_row, obs_col = _lonlat_to_pixel(observer_lon, observer_lat, transform)
        tgt_row, tgt_col = _lonlat_to_pixel(target_lon, target_lat, transform)

        for v in (obs_row, obs_col, tgt_row, tgt_col):
            pass  # bounds already clamped in pixel conversion — check below
        obs_row = max(0, min(obs_row, dem.shape[0] - 1))
        obs_col = max(0, min(obs_col, dem.shape[1] - 1))
        tgt_row = max(0, min(tgt_row, dem.shape[0] - 1))
        tgt_col = max(0, min(tgt_col, dem.shape[1] - 1))

        obs_elev = float(dem[obs_row, obs_col]) + observer_height_m
        tgt_elev = float(dem[tgt_row, tgt_col]) + target_height_m

        n_samples = max(
            abs(tgt_row - obs_row),
            abs(tgt_col - obs_col),
            2,
        )
        rows = np.linspace(obs_row, tgt_row, n_samples)
        cols = np.linspace(obs_col, tgt_col, n_samples)

        terrain = map_coordinates(dem, np.array([rows, cols]), order=1, mode='nearest')

        # Required clearance elevation at each sample along the straight line
        t = np.linspace(0, 1, n_samples)
        los_elev = obs_elev + t * (tgt_elev - obs_elev)

        blocked = terrain > los_elev
        if not blocked.any():
            return {"visible": True, "obstruction": None}

        first = int(np.argmax(blocked))
        from rasterio.transform import xy
        lon_obs, lat_obs = xy(transform, int(rows[first]), int(cols[first]))
        return {
            "visible": False,
            "obstruction": {
                "lon": float(lon_obs),
                "lat": float(lat_obs),
                "elevation": float(terrain[first]),
            },
        }

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run)
