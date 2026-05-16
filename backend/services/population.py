from urllib.parse import urlencode

import httpx
from pyproj import Transformer

from core.cache import TTLCache

STATFI_WFS = "https://geo.stat.fi/geoserver/vaestoruutu/wfs"
TIMEOUT_S = 20.0

_cache = TTLCache()

# Population grid data changes once a year — 24h TTL is fine
_TTL = 86_400

_to_3067 = Transformer.from_crs("EPSG:4326", "EPSG:3067", always_xy=True)


def _bbox_3067(west: float, south: float, east: float, north: float) -> str:
    # Reproject all four corners and take the containing bbox in EPSG:3067
    xs, ys = _to_3067.transform(
        [west, east, west, east],
        [south, south, north, north],
    )
    return f"{min(xs)},{min(ys)},{max(xs)},{max(ys)},urn:ogc:def:crs:EPSG::3067"


def _density_class(pop: float) -> str:
    if pop == 0:
        return 'uninhabited'
    if pop < 10:
        return 'very_sparse'
    if pop < 100:
        return 'rural'
    if pop < 500:
        return 'suburban'
    return 'urban'


async def get_population_grid(bbox: tuple[float, float, float, float]) -> dict:
    """
    1 km² population grid from Stat.fi for the bbox.
    Returns GeoJSON FeatureCollection with population count and density class per cell.
    Response is cached for 24 hours.
    """
    key = f"pop:{bbox}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    west, south, east, north = bbox

    params = urlencode({
        'service':     'WFS',
        'version':     '2.0.0',
        'request':     'GetFeature',
        'typeNames':   'vaestoruutu:vaki2022_1km',
        'bbox':        _bbox_3067(west, south, east, north),
        'outputFormat': 'application/json',
        'srsName':     'urn:ogc:def:crs:EPSG::4326',
        'count':       2000,
    })
    url = f"{STATFI_WFS}?{params}"

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.get(url, headers={'Accept': 'application/json'})
        r.raise_for_status()
        raw = r.json()

    features = []
    total_pop = 0
    for feat in raw.get('features', []):
        props = feat.get('properties') or {}
        pop = float(props.get('vaesto') or 0)
        total_pop += pop

        features.append({
            'type': 'Feature',
            'geometry': feat.get('geometry'),
            'properties': {
                'population':    int(pop),
                'density_class': _density_class(pop),
            },
        })

    result = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'total_population':   int(total_pop),
            'cell_count':         len(features),
            'cell_resolution_km': 1,
            'source':             'Statistics Finland (Stat.fi) 2022',
        },
    }

    _cache.set(key, result, ttl_seconds=_TTL)
    return result
