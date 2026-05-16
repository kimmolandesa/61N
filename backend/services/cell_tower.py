import httpx

from core.cache import TTLCache
from core.config import settings

OPENCELLID_BASE = "https://opencellid.org/cell/getInArea"
TIMEOUT_S = 20.0
_TTL = 3600

_cache = TTLCache()

# Realistic rural propagation radii for Finland (metres), post-3G shutdown (2024)
_RADIO_RADIUS_M: dict[str, float] = {
    'NR':  3_000,   # 5G
    'LTE': 5_000,   # 4G
    'GSM': 10_000,  # 2G
}
_DEFAULT_RADIUS_M = 5_000

# MCC 244 = Finland; MNC → operator (2026 accurate)
_OPERATOR: dict[str, str] = {
    '03': 'DNA',
    '04': 'DNA',
    '05': 'Elisa',
    '07': 'Nokia test',
    '10': 'TDC',
    '12': 'DNA',
    '14': 'Alands Mobiltelefon',
    '21': 'Ålands Telekommunikation',
    '36': 'Telia',
    '41': 'Suomen Yhteisverkko (Telia/DNA)',
    '91': 'Telia',
    '99': 'Telia',
}


def _operator_name(mnc_raw: object) -> str | None:
    try:
        mnc_str = f"{int(str(mnc_raw).strip()):02d}"
        return _OPERATOR.get(mnc_str, f"MNC-{mnc_str}")
    except (ValueError, TypeError):
        return None


async def get_cell_coverage(bbox: tuple[float, float, float, float]) -> dict:
    """
    Cell tower positions and coverage metadata for the bbox.

    Returns a GeoJSON FeatureCollection of Point features (one per tower).
    Coverage circles are drawn client-side from coverage_radius_m + radio type.
    """
    if not settings.OPENCELLID_API_KEY:
        return {
            'error': 'OPENCELLID_API_KEY not configured',
            'towers': {
                'type': 'FeatureCollection',
                'features': [],
                'metadata': {'tower_count': 0, 'truncated': False, 'source': 'OpenCellID'},
            },
            'summary': 'unavailable — API key not configured',
        }

    west, south, east, north = bbox
    key = f"cell:{west:.3f}:{south:.3f}:{east:.3f}:{north:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    limit = 1000
    params = {
        'key':    settings.OPENCELLID_API_KEY,
        'BBOX':   f"{west},{south},{east},{north}",
        'format': 'json',
        'limit':  limit,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.get(OPENCELLID_BASE, params=params)
        r.raise_for_status()
        raw = r.json()

    tower_features: list[dict] = []

    for cell in raw.get('cells', []):
        radio = cell.get('radio', 'LTE')
        try:
            lat = float(cell['lat'])
            lon = float(cell['lon'])
        except (KeyError, TypeError, ValueError):
            continue

        api_range = cell.get('range')
        if isinstance(api_range, int) and 0 < api_range <= 50_000:
            radius_m = api_range
            range_source = 'api'
        else:
            radius_m = _RADIO_RADIUS_M.get(radio, _DEFAULT_RADIUS_M)
            range_source = 'fallback'

        tower_features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
            'properties': {
                'radio':             radio,
                'mcc':               cell.get('mcc'),
                'mnc':               cell.get('mnc'),
                'operator':          _operator_name(cell.get('mnc')),
                'lac':               cell.get('lac'),
                'cellid':            cell.get('cellid'),
                'avg_signal_dbm':    cell.get('averageSignalStrength'),
                'coverage_radius_m': radius_m,
                'range_source':      range_source,
            },
        })

    tower_count = len(tower_features)
    truncated = tower_count >= limit

    if tower_count == 0:
        summary = 'no data — no cell towers found in this area'
    elif truncated:
        summary = f'data truncated — at least {tower_count} towers in area; zoom in for full detail'
    else:
        summary = f'{tower_count} tower{"s" if tower_count != 1 else ""} found in area'

    result = {
        'towers': {
            'type': 'FeatureCollection',
            'features': tower_features,
            'metadata': {
                'tower_count': tower_count,
                'truncated': truncated,
                'source': 'OpenCellID',
            },
        },
        'summary': summary,
    }

    _cache.set(key, result, ttl_seconds=_TTL)
    return result
