import math
from urllib.parse import urlencode

import httpx

from core.cache import TTLCache

VAYLA_BASE = "https://avoinapi.vaylapilvi.fi/vaylatiedot/ogc/features/v1"
TIMEOUT_S = 20.0
_TTL = 86_400  # bridge specs change rarely; 24h cache

_cache = TTLCache()

# Military vehicle classes: total GVW and max axle load (tonnes)
# Tracked vehicles have no axle rating — bridges use total mass for them too.
_VEHICLE_CLASSES: dict[str, dict] = {
    'light_wheeled':  {'total_t': 12,  'axle_t': 8,    'label': 'Light wheeled (≤12 t)'},
    'apc_wheeled':    {'total_t': 28,  'axle_t': 10,   'label': 'Wheeled APC/IFV (≤28 t, e.g. AMV)'},
    'medium_truck':   {'total_t': 32,  'axle_t': 11,   'label': 'Medium truck (≤32 t)'},
    'heavy_truck':    {'total_t': 44,  'axle_t': 13,   'label': 'Heavy logistics (≤44 t)'},
    'tracked_ifv':    {'total_t': 40,  'axle_t': None, 'label': 'Tracked IFV (≤40 t, e.g. CV90)'},
    'mbt':            {'total_t': 65,  'axle_t': None, 'label': 'MBT (≤65 t, e.g. Leopard 2)'},
}


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _passable_by(total_t: float | None, axle_t: float | None) -> list[str]:
    """Return list of vehicle class keys that can cross this bridge."""
    passable = []
    for cls, spec in _VEHICLE_CLASSES.items():
        if total_t is not None and spec['total_t'] > total_t:
            continue
        if axle_t is not None and spec['axle_t'] is not None and spec['axle_t'] > axle_t:
            continue
        passable.append(cls)
    return passable


def _extract_loads(props: dict) -> tuple[float | None, float | None]:
    """
    Extract (total_mass_t, axle_load_t) from Väylä taitorakenteet:silta properties.
    For vehicle combinations (trucks, military convoys) use ajoneuvoyhdistelman field.
    Single-vehicle mass as fallback.
    """
    def _f(key: str) -> float | None:
        v = props.get(key)
        if v not in (None, '', 0):
            try:
                return float(v)
            except (ValueError, TypeError):
                pass
        return None

    # Vehicle combination total mass (most relevant for logistics/military)
    total_t = _f('ajoneuvoyhdistelman_suurin_sallittu_massa') or \
              _f('ajoneuvon_suurin_sallittu_massa')

    # Per-axle limit
    axle_t = _f('ajoneuvon_suurin_sallittu_akselille_kohdistuva_massa')

    return total_t, axle_t


def _bridge_purpose(props: dict) -> str:
    """Extract human-readable bridge purpose from kayttotarkoitukset field."""
    kt = props.get('kayttotarkoitukset', '')
    if 'Raittisilta' in kt:
        return 'pedestrian'
    if 'Rautatiesilta' in kt:
        return 'railway'
    if 'Tiesilta' in kt:
        return 'road'
    if 'Alikulkusilta' in kt or 'alikulku' in kt.lower():
        return 'underpass'
    return 'road'


async def get_bridges(bbox: tuple[float, float, float, float]) -> dict:
    """
    Fetch bridge structures from Väylä OGC Features API for the bbox.
    Returns GeoJSON FeatureCollection with load capacity and military
    vehicle passability per bridge.
    Cached 24 hours.
    """
    west, south, east, north = bbox
    key = f"vayla_bridge:{west:.3f}:{south:.3f}:{east:.3f}:{north:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    # Väylä OGC API — bbox is minx,miny,maxx,maxy WGS84
    params = urlencode({
        'bbox':         f"{west},{south},{east},{north}",
        'bbox-crs':     'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
        'crs':          'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
        'limit':        500,
        'f':            'json',
    })

    features = []
    errors = []

    collections = [
        f"{VAYLA_BASE}/collections/taitorakenteet:silta/items",
    ]

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        for url in collections:
            try:
                r = await client.get(f"{url}?{params}", headers={'Accept': 'application/json'})
                if r.status_code == 404:
                    continue
                if r.status_code != 200:
                    errors.append(f"{url}: HTTP {r.status_code}")
                    continue

                data = r.json()
                raw_features = data.get('features', [])
                if not raw_features:
                    continue

                for feat in raw_features:
                    props = feat.get('properties') or {}
                    geom  = feat.get('geometry')
                    if not geom:
                        continue

                    total_t, axle_t = _extract_loads(props)
                    passable = _passable_by(total_t, axle_t)
                    purpose = _bridge_purpose(props)

                    features.append({
                        'type': 'Feature',
                        'geometry': geom,
                        'properties': {
                            'name':              props.get('nimi') or '',
                            'bridge_id':         props.get('id') or feat.get('id'),
                            'bridge_code':       props.get('tunnus') or '',
                            'owner':             props.get('nykyinen_omistaja') or '',
                            'purpose':           purpose,
                            'max_total_mass_t':  total_t,
                            'max_axle_load_t':   axle_t,
                            'passable_by':       passable,
                            'passable_labels':   [_VEHICLE_CLASSES[c]['label'] for c in passable],
                            'blocks_mbt':        'mbt' not in passable,
                            'blocks_heavy_truck': 'heavy_truck' not in passable,
                            'source':            'Väylä',
                        },
                    })

                # Got data — no need to try other collections
                break

            except Exception as exc:
                errors.append(f"{url}: {exc}")

    result = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'bridge_count': len(features),
            'vehicle_classes': {k: v['label'] for k, v in _VEHICLE_CLASSES.items()},
            'source': 'Väylä (Finnish Transport Infrastructure Agency)',
            'errors': errors if errors else None,
        },
    }

    _cache.set(key, result, ttl_seconds=_TTL)
    return result


def match_bridges_to_osm(
    vayla_features: list[dict],
    osm_bridge_segments: list[dict],
    max_dist_m: float = 100.0,
) -> dict[str, dict]:
    """
    Spatial match: for each OSM bridge segment find the nearest Väylä bridge
    within max_dist_m. Returns dict keyed by osm_id.
    """
    matched: dict[str, dict] = {}

    for seg in osm_bridge_segments:
        geom = seg.get('geometry', {})
        coords = geom.get('coordinates', [])
        if not coords:
            continue
        # Use midpoint of segment
        mid_idx = len(coords) // 2
        seg_lon, seg_lat = coords[mid_idx]

        best_dist = float('inf')
        best_props: dict | None = None

        for feat in vayla_features:
            fgeom = feat.get('geometry', {})
            fcoords = fgeom.get('coordinates', [])
            if not fcoords:
                continue
            # Bridge geometry may be Point or LineString
            if fgeom.get('type') == 'Point':
                pts = [fcoords]
            else:
                pts = fcoords

            for pt in pts:
                if isinstance(pt, list) and len(pt) >= 2 and isinstance(pt[0], (int, float)):
                    d = _haversine_m(seg_lat, seg_lon, pt[1], pt[0])
                    if d < best_dist:
                        best_dist = d
                        best_props = feat.get('properties', {})

        if best_props is not None and best_dist <= max_dist_m:
            matched[seg.get('osm_id', '')] = best_props

    return matched
