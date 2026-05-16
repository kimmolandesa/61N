import math
from functools import lru_cache
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

from core.config import settings


@lru_cache(maxsize=1)
def open_dem() -> rasterio.DatasetReader:
    path = settings.DEM_VRT_PATH
    if not Path(path).exists():
        raise FileNotFoundError(
            f"DEM VRT not found at {path}. Run scripts/fetch_dem.py first."
        )
    return rasterio.open(path)


@lru_cache(maxsize=1)
def _to_dem_transformer() -> Transformer:
    src = open_dem()
    return Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)


def read_window(
    west: float, south: float, east: float, north: float
) -> tuple[np.ndarray, object]:
    """
    Read DEM pixels within a WGS84 bbox.
    Reprojects bbox corners to the DEM CRS (MML data is EPSG:3067).
    Returns (float32 array, window transform in DEM CRS).
    """
    src = open_dem()

    if src.crs and src.crs.to_epsg() != 4326:
        t = _to_dem_transformer()
        xs, ys = t.transform(
            [west, east, west, east],
            [south, south, north, north],
        )
        w, e_p, s, n = min(xs), max(xs), min(ys), max(ys)
    else:
        w, e_p, s, n = west, east, south, north

    window = from_bounds(w, s, e_p, n, src.transform)
    data = src.read(1, window=window).astype(np.float32)
    transform = src.window_transform(window)
    return data, transform


def pixel_size_m(transform) -> float:
    """Pixel size in metres (projected CRS → use directly; geographic → convert)."""
    src = open_dem()
    if src.crs and src.crs.is_projected:
        return abs(transform.a)
    return abs(transform.a) * 111_320.0


def get_elevation_at(lon: float, lat: float) -> float | None:
    """Elevation in metres at a single WGS84 point."""
    try:
        data, _ = read_window(lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001)
        if data.size == 0:
            return None
        val = float(data[data.shape[0] // 2, data.shape[1] // 2])
        src = open_dem()
        return None if val == src.nodata else val
    except Exception:
        return None


def tile_bbox_wgs84(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Slippy-map tile z/x/y → WGS84 (west, south, east, north)."""
    n = 2 ** z
    lon_w = x / n * 360.0 - 180.0
    lon_e = (x + 1) / n * 360.0 - 180.0
    lat_n = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_s = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_w, lat_s, lon_e, lat_n
