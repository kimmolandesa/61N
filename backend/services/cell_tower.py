import math

import httpx

from core.cache import TTLCache
from core.config import settings

OPENCELLID_BASE = "https://opencellid.org/cell/getInArea"
TIMEOUT_S = 20.0
_TTL = 3600  # towers move rarely; 1h cache

_cache = TTLCache()

# Conservative rural coverage radii for Finland terrain (metres)
_RADIO_RADIUS_M: dict[str, float] = {
    'NR':   1_000,   # 5G
    'LTE':  2_000,   # 4G
    'UMTS': 5_000,   # 3G
    'GSM':  8_000,   # 2G
}
_DEFAULT_RADIUS_M = 3_000

# MCC 244 = Finland; map MNC prefix → operator name (common MNCs)
_OPERATOR: dict[str, str] = {
    '03': 'DNA', '04': 'DNA', '05': 'Elisa', '07': 'Nokia test',
    '10': 'TDC', '12': 'DNA', '14': 'Alands Mobiltelefon',
    '21': 'Ålands Telekommunikation', '91': 'Sonera', '99': 'Tele Finland',
}


def _operator_name(mnc: int) -> str:
    return _OPERATOR.get(f"{mnc:02d}", f"MNC-{mnc}")


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _coverage_grid(
    towers: list[dict],
    west: float, south: float, east: float, north: float,
    step_deg: float = 0.005,   # ~350 m at 60° N
) -> tuple[list[dict], float]:
    """
    Sample grid of (lat, lon) points; mark each covered/uncovered.
    Returns (grid_features, dead_zone_ratio).
    """
    lats = []
    lat = south + step_deg / 2
    while lat < north:
        lats.append(lat)
        lat += step_deg

    lons = []
    lon = west + step_deg / 2
    while lon < east:
        lons.append(lon)
        lon += step_deg

    features = []
    covered_count = 0

    for lat in lats:
        for lon in lons:
            covered = False
            for t in towers:
                radius_m = t['coverage_radius_m']
                dist_m = _haversine_m(lat, lon, t['lat'], t['lon'])
                if dist_m <= radius_m:
                    covered = True
                    break
            if covered:
                covered_count += 1
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
                'properties': {'covered': covered},
            })

    total = len(features)
    dead_zone_ratio = round(1.0 - covered_count / total, 3) if total else 0.0
    return features, dead_zone_ratio


async def get_cell_coverage(bbox: tuple[float, float, float, float]) -> dict:
    """
    Cell tower positions and coverage dead-zone map for the bbox.

    Returns:
      towers            — GeoJSON FeatureCollection (point per tower)
      coverage_grid     — GeoJSON FeatureCollection (~350 m grid, covered bool)
      dead_zone_ratio   — fraction of grid cells with no cell coverage (0–1)
      summary           — operational text: comms reliability assessment
    """
    if not settings.OPENCELLID_API_KEY:
        return {
            'error': 'OPENCELLID_API_KEY not configured',
            'towers': {'type': 'FeatureCollection', 'features': []},
            'coverage_grid': {'type': 'FeatureCollection', 'features': []},
            'dead_zone_ratio': None,
        }

    west, south, east, north = bbox
    key = f"cell:{west:.3f}:{south:.3f}:{east:.3f}:{north:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    params = {
        'key':    settings.OPENCELLID_API_KEY,
        'BBOX':   f"{south},{west},{north},{east}",
        'format': 'json',
        'limit':  1000,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.get(OPENCELLID_BASE, params=params)
        r.raise_for_status()
        raw = r.json()

    tower_meta: list[dict] = []
    tower_features: list[dict] = []

    for cell in raw.get('cells', []):
        radio = cell.get('radio', 'LTE')
        lat = float(cell['lat'])
        lon = float(cell['lon'])

        api_range = cell.get('range')
        if isinstance(api_range, int) and 0 < api_range <= 50000:
            radius_m = api_range
            range_source = 'api'
        else:
            radius_m = _RADIO_RADIUS_M.get(radio, _DEFAULT_RADIUS_M)
            range_source = 'fallback'

        tower_meta.append({'lat': lat, 'lon': lon, 'coverage_radius_m': radius_m})
        tower_features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
            'properties': {
                'radio':              radio,
                'mcc':                cell.get('mcc'),
                'mnc':                cell.get('mnc'),
                'operator':           _operator_name(int(cell['mnc'])) if cell.get('mnc') else None,
                'lac':                cell.get('lac'),
                'cellid':             cell.get('cellid'),
                'avg_signal_dbm':     cell.get('averageSignalStrength'),
                'coverage_radius_m':  radius_m,
                'range_source':       range_source,
            },
        })

    grid_features, dead_zone_ratio = _coverage_grid(tower_meta, west, south, east, north)

    if dead_zone_ratio > 0.7:
        summary = 'poor — majority of area has no cell coverage; SIGINT blind spots likely'
    elif dead_zone_ratio > 0.4:
        summary = 'degraded — significant dead zones; communications unreliable in gaps'
    elif dead_zone_ratio > 0.1:
        summary = 'moderate — isolated dead zones; verify coverage on planned routes'
    else:
        summary = 'good — most of the area has cell coverage'

    result = {
        'towers': {
            'type': 'FeatureCollection',
            'features': tower_features,
            'metadata': {
                'tower_count': len(tower_features),
                'source': 'OpenCellID',
            },
        },
        'coverage_grid': {
            'type': 'FeatureCollection',
            'features': grid_features,
        },
        'dead_zone_ratio': dead_zone_ratio,
        'summary': summary,
    }

    _cache.set(key, result, ttl_seconds=_TTL)
    return result
