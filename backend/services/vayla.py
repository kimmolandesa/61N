import asyncio
import math
from urllib.parse import urlencode

import httpx

from core.cache import TTLCache
from core.config import settings
from mock import get_fixture

DIGIROAD_BASE = "https://avoinapi.vaylapilvi.fi/vaylatiedot/digiroad/ogc/features/v1"
TAITORAKENTEET_BASE = "https://avoinapi.vaylapilvi.fi/vaylatiedot/ogc/features/v1"
TIMEOUT_S = 20.0
_TTL = 86_400  # restrictions change rarely; 24h cache

_cache = TTLCache()

# Military vehicle classes: total GVW and max axle load (tonnes)
_VEHICLE_CLASSES: dict[str, dict] = {
    'light_wheeled':  {'total_t': 12,  'axle_t': 8,    'label': 'Light wheeled (≤12 t)'},
    'apc_wheeled':    {'total_t': 28,  'axle_t': 10,   'label': 'Wheeled APC/IFV (≤28 t, e.g. AMV)'},
    'medium_truck':   {'total_t': 32,  'axle_t': 11,   'label': 'Medium truck (≤32 t)'},
    'heavy_truck':    {'total_t': 44,  'axle_t': 13,   'label': 'Heavy logistics (≤44 t)'},
    'tracked_ifv':    {'total_t': 40,  'axle_t': None, 'label': 'Tracked IFV (≤40 t, e.g. CV90)'},
    'mbt':            {'total_t': 65,  'axle_t': None, 'label': 'MBT (≤65 t, e.g. Leopard 2)'},
}

# Finnish standard road limits — null restriction means bridge meets these
_FI_STANDARD_TOTAL_T = 76.0
_FI_STANDARD_AXLE_T  = 13.0

# Digiroad restriction collections to fetch
_RESTRICTION_COLLECTIONS = {
    'single_vehicle_t':    'digiroad:dr_max_massa',
    'combination_t':       'digiroad:dr_yhdistelman_max_massa',
    'axle_t':              'digiroad:dr_max_akselimassa',
    'bogie_t':             'digiroad:dr_max_telimassa',
}


def _passable_by(total_t: float, axle_t: float) -> list[str]:
    passable = []
    for cls, spec in _VEHICLE_CLASSES.items():
        if spec['total_t'] > total_t:
            continue
        if spec['axle_t'] is not None and spec['axle_t'] > axle_t:
            continue
        passable.append(cls)
    return passable


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bbox_param(west: float, south: float, east: float, north: float) -> str:
    return f"{west},{south},{east},{north}"


async def _fetch_collection(client: httpx.AsyncClient, collection: str, bbox_str: str) -> list[dict]:
    params = urlencode({
        'f':     'application/json',
        'bbox':  bbox_str,
        'limit': 500,
    })
    url = f"{DIGIROAD_BASE}/collections/{collection}/items?{params}"
    try:
        r = await client.get(url)
        if r.status_code != 200:
            return []
        return r.json().get('features', [])
    except Exception:
        return []


async def get_weight_restrictions(bbox: tuple[float, float, float, float]) -> dict:
    """
    Road segment weight restrictions from Väylä Digiroad.
    Queries mass, combination mass, and axle load collections and merges
    by road link ID. Values in API are kg — converted to tonnes here.

    Returns GeoJSON FeatureCollection of LineStrings with:
      single_vehicle_t, combination_t, axle_t, bogie_t (tonnes, null if no restriction)
      passable_by: list of vehicle class keys
      blocks_mbt, blocks_heavy_truck: quick flags
    Cached 24 hours.
    """
    if settings.MOCK_MODE:
        return get_fixture("restrictions")

    west, south, east, north = bbox
    key = f"vayla_restr:{west:.3f}:{south:.3f}:{east:.3f}:{north:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    bbox_str = _bbox_param(west, south, east, north)

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        results = await asyncio.gather(*[
            _fetch_collection(client, col, bbox_str)
            for col in _RESTRICTION_COLLECTIONS.values()
        ])

    single_feats, combo_feats, axle_feats, bogie_feats = results

    # Merge by link_id — keep geometry from whichever collection has it
    merged: dict[str, dict] = {}

    def _kg_to_t(val) -> float | None:
        try:
            kg = float(val)
            return round(kg / 1000.0, 1) if kg > 0 else None
        except (TypeError, ValueError):
            return None

    def _ingest(feats: list, field: str):
        for feat in feats:
            props = feat.get('properties') or {}
            link_id = props.get('link_id', '')
            if not link_id:
                continue
            if link_id not in merged:
                merged[link_id] = {
                    'geometry':        feat.get('geometry'),
                    'link_id':         link_id,
                    'kuntakoodi':      props.get('kuntakoodi'),
                    'vaik_suunt':      props.get('vaik_suunt'),
                    'single_vehicle_t': None,
                    'combination_t':   None,
                    'axle_t':          None,
                    'bogie_t':         None,
                }
            merged[link_id][field] = _kg_to_t(props.get('arvo'))

    _ingest(single_feats, 'single_vehicle_t')
    _ingest(combo_feats,  'combination_t')
    _ingest(axle_feats,   'axle_t')
    _ingest(bogie_feats,  'bogie_t')

    features = []
    for seg in merged.values():
        geom = seg['geometry']
        if not geom:
            continue

        # Use the most restrictive applicable total and axle limits
        total_t = min(
            t for t in [seg['single_vehicle_t'], seg['combination_t']] if t is not None
        ) if any(t is not None for t in [seg['single_vehicle_t'], seg['combination_t']]) else None

        axle_t = seg['axle_t']

        eff_total = total_t if total_t is not None else _FI_STANDARD_TOTAL_T
        eff_axle  = axle_t  if axle_t  is not None else _FI_STANDARD_AXLE_T

        passable = _passable_by(eff_total, eff_axle)

        features.append({
            'type': 'Feature',
            'geometry': geom,
            'properties': {
                'link_id':           seg['link_id'],
                'municipality':      seg['kuntakoodi'],
                'direction':         seg['vaik_suunt'],
                'single_vehicle_t':  seg['single_vehicle_t'],
                'combination_t':     seg['combination_t'],
                'axle_t':            seg['axle_t'],
                'bogie_t':           seg['bogie_t'],
                'passable_by':       passable,
                'passable_labels':   [_VEHICLE_CLASSES[c]['label'] for c in passable],
                'blocks_mbt':        'mbt' not in passable,
                'blocks_heavy_truck': 'heavy_truck' not in passable,
            },
        })

    result = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'restriction_count': len(features),
            'vehicle_classes':   {k: v['label'] for k, v in _VEHICLE_CLASSES.items()},
            'source':            'Väylä Digiroad',
            'note':              'Segments without restrictions meet Finnish standard (76t combo / 13t axle)',
        },
    }

    _cache.set(key, result, ttl_seconds=_TTL)
    return result


async def get_bridges(bbox: tuple[float, float, float, float]) -> dict:
    """
    Bridge locations from Väylä Taitorakennerekisteri.
    Load capacity fields are often null (bridge meets standard); when populated
    they indicate a posted restriction below Finnish standard.
    Cached 24 hours.
    """
    if settings.MOCK_MODE:
        return get_fixture("bridges")

    west, south, east, north = bbox
    key = f"vayla_bridge:{west:.3f}:{south:.3f}:{east:.3f}:{north:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    params = urlencode({
        'f':     'application/json',
        'bbox':  _bbox_param(west, south, east, north),
        'limit': 500,
    })
    url = f"{TAITORAKENTEET_BASE}/collections/taitorakenteet:silta/items?{params}"

    features = []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.get(url, headers={'Accept': 'application/json'})
            if r.status_code == 200:
                for feat in r.json().get('features', []):
                    props = feat.get('properties') or {}
                    geom  = feat.get('geometry')
                    if not geom:
                        continue

                    def _f(k):
                        v = props.get(k)
                        try:
                            return float(v) if v not in (None, '', 0) else None
                        except (TypeError, ValueError):
                            return None

                    total_t = _f('ajoneuvoyhdistelman_suurin_sallittu_massa') or \
                              _f('ajoneuvon_suurin_sallittu_massa')
                    axle_t  = _f('ajoneuvon_suurin_sallittu_akselille_kohdistuva_massa')
                    restricted = total_t is not None or axle_t is not None

                    eff_total = total_t if total_t is not None else _FI_STANDARD_TOTAL_T
                    eff_axle  = axle_t  if axle_t  is not None else _FI_STANDARD_AXLE_T
                    passable  = _passable_by(eff_total, eff_axle)

                    kt = props.get('kayttotarkoitukset', '')
                    if 'Raittisilta' in kt:
                        purpose = 'pedestrian'
                    elif 'Rautatiesilta' in kt:
                        purpose = 'railway'
                    elif 'alikulku' in kt.lower():
                        purpose = 'underpass'
                    else:
                        purpose = 'road'

                    features.append({
                        'type': 'Feature',
                        'geometry': geom,
                        'properties': {
                            'name':               props.get('nimi') or '',
                            'bridge_id':          props.get('id') or feat.get('id'),
                            'bridge_code':        props.get('tunnus') or '',
                            'owner':              props.get('nykyinen_omistaja') or '',
                            'purpose':            purpose,
                            'max_total_mass_t':   total_t,
                            'max_axle_load_t':    axle_t,
                            'restricted':         restricted,
                            'passable_by':        passable,
                            'passable_labels':    [_VEHICLE_CLASSES[c]['label'] for c in passable],
                            'blocks_mbt':         'mbt' not in passable,
                            'blocks_heavy_truck': 'heavy_truck' not in passable,
                            'source':             'Väylä Taitorakennerekisteri',
                        },
                    })
    except Exception:
        pass

    result = {
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'bridge_count':   len(features),
            'vehicle_classes': {k: v['label'] for k, v in _VEHICLE_CLASSES.items()},
            'source':         'Väylä (Finnish Transport Infrastructure Agency)',
            'note':           'null load fields = no posted restriction = Finnish standard applies (76t/13t axle)',
        },
    }
    _cache.set(key, result, ttl_seconds=_TTL)
    return result


def match_bridges_to_osm(
    vayla_features: list[dict],
    osm_bridge_segments: list[dict],
    max_dist_m: float = 100.0,
) -> dict[str, dict]:
    """Spatial match Väylä bridge points to OSM bridge segments (within max_dist_m)."""
    matched: dict[str, dict] = {}
    for seg in osm_bridge_segments:
        coords = (seg.get('geometry') or {}).get('coordinates', [])
        if not coords:
            continue
        mid = coords[len(coords) // 2]
        seg_lon, seg_lat = mid[0], mid[1]

        best_dist = float('inf')
        best_props: dict | None = None

        for feat in vayla_features:
            fgeom = feat.get('geometry') or {}
            fc = fgeom.get('coordinates', [])
            pts = [fc] if fgeom.get('type') == 'Point' else fc
            for pt in pts:
                if isinstance(pt, (list, tuple)) and len(pt) >= 2 and isinstance(pt[0], (int, float)):
                    d = _haversine_m(seg_lat, seg_lon, pt[1], pt[0])
                    if d < best_dist:
                        best_dist = d
                        best_props = feat.get('properties', {})

        if best_props is not None and best_dist <= max_dist_m:
            matched[seg.get('osm_id', '')] = best_props

    return matched
