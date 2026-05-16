"""
GTK superficial deposit service — queries local PostGIS gtk_soil table.
Raw parsing functions are kept here so ingest_soil.py can import them.
"""

import json
import xml.etree.ElementTree as ET

from core.cache import TTLCache
from core.db import get_pool

GTK_WFS = (
    "https://gtkdata.gtk.fi/arcgis/services/Rajapinnat/"
    "GTK_Maapera_WFS/MapServer/WFSServer"
)
TYPENAME = "Rajapinnat_GTK_Maapera_WFS:maapera_200k_maalajit"
FEAT_NS  = (
    "https://gtkdata.gtk.fi/arcgis/services/Rajapinnat/"
    "GTK_Maapera_WFS/MapServer/WFSServer"
)
GML_NS   = "http://www.opengis.net/gml"

_CACHE_TTL_S = 3_600  # 1 hour
_cache = TTLCache()

# ── Deposit code → tactical classification ────────────────────────────────────
_CODE_MAP: dict[str, dict] = {
    "195110": {
        "deposit_type": "bedrock", "peat_depth": None,
        "digging_suitability": "poor", "trafficability_dry": "high",
        "trafficability_wet": "high", "concealment_potential": "low",
        "groundwater_risk": False,
    },
    "195111": {
        "deposit_type": "bedrock", "peat_depth": None,
        "digging_suitability": "poor", "trafficability_dry": "high",
        "trafficability_wet": "high", "concealment_potential": "low",
        "groundwater_risk": False,
    },
    "195210": {
        "deposit_type": "till", "peat_depth": None,
        "digging_suitability": "good", "trafficability_dry": "high",
        "trafficability_wet": "medium", "concealment_potential": "low",
        "groundwater_risk": False,
    },
    "195310": {
        "deposit_type": "glaciofluvial_gravel", "peat_depth": None,
        "digging_suitability": "good", "trafficability_dry": "high",
        "trafficability_wet": "high", "concealment_potential": "low",
        "groundwater_risk": True,
    },
    "195410": {
        "deposit_type": "fine_grained", "peat_depth": None,
        "digging_suitability": "moderate", "trafficability_dry": "medium",
        "trafficability_wet": "low", "concealment_potential": "low",
        "groundwater_risk": False,
    },
    "195413": {
        "deposit_type": "clay", "peat_depth": None,
        "digging_suitability": "moderate", "trafficability_dry": "medium",
        "trafficability_wet": "low", "concealment_potential": "low",
        "groundwater_risk": False,
    },
    "195420": {
        "deposit_type": "sand", "peat_depth": None,
        "digging_suitability": "good", "trafficability_dry": "high",
        "trafficability_wet": "medium", "concealment_potential": "low",
        "groundwater_risk": True,
    },
    "19551822": {
        "deposit_type": "swamp", "peat_depth": None,
        "digging_suitability": "poor", "trafficability_dry": "low",
        "trafficability_wet": "low", "concealment_potential": "high",
        "groundwater_risk": False,
    },
    "19551891": {
        "deposit_type": "peat", "peat_depth": "thin",
        "digging_suitability": "moderate", "trafficability_dry": "medium",
        "trafficability_wet": "low", "concealment_potential": "medium",
        "groundwater_risk": False,
    },
    "19551892": {
        "deposit_type": "peat", "peat_depth": "thick",
        "digging_suitability": "poor", "trafficability_dry": "low",
        "trafficability_wet": "low", "concealment_potential": "high",
        "groundwater_risk": False,
    },
    "195603": {
        "deposit_type": "water", "peat_depth": None,
        "digging_suitability": "not_applicable", "trafficability_dry": "low",
        "trafficability_wet": "low", "concealment_potential": "low",
        "groundwater_risk": False,
    },
}

_UNKNOWN_TACTICS = {
    "deposit_type": "unknown", "peat_depth": None,
    "digging_suitability": "moderate", "trafficability_dry": "medium",
    "trafficability_wet": "medium", "concealment_potential": "low",
    "groundwater_risk": False,
}


def _classify(code: str) -> dict:
    if code in _CODE_MAP:
        return _CODE_MAP[code]
    for prefix_len in (8, 7, 6, 5, 4):
        hit = _CODE_MAP.get(code[:prefix_len])
        if hit:
            return hit
    return _UNKNOWN_TACTICS


# ── GML3 geometry parser (used by ingest_soil.py) ────────────────────────────

def _poslist_to_coords(poslist: str) -> list[list[float]]:
    nums = [float(v) for v in poslist.split()]
    return [[nums[i + 1], nums[i]] for i in range(0, len(nums) - 1, 2)]


def _parse_ring(ring_elem) -> list[list[float]]:
    pl = ring_elem.find(f"{{{GML_NS}}}posList")
    if pl is not None and pl.text:
        return _poslist_to_coords(pl.text.strip())
    return []


def _parse_polygon(poly_elem) -> dict | None:
    exterior = poly_elem.find(f"{{{GML_NS}}}exterior/{{{GML_NS}}}LinearRing")
    if exterior is None:
        return None
    rings = [_parse_ring(exterior)]
    for interior in poly_elem.findall(f"{{{GML_NS}}}interior/{{{GML_NS}}}LinearRing"):
        rings.append(_parse_ring(interior))
    rings = [r for r in rings if r]
    if not rings:
        return None
    return {"type": "Polygon", "coordinates": rings}


def _parse_geometry(feat_elem) -> dict | None:
    ms = feat_elem.find(f".//{{{GML_NS}}}MultiSurface")
    if ms is not None:
        polys = []
        for patch in ms.findall(f".//{{{GML_NS}}}Polygon"):
            g = _parse_polygon(patch)
            if g:
                polys.append(g["coordinates"])
        if not polys:
            return None
        if len(polys) == 1:
            return {"type": "Polygon", "coordinates": polys[0]}
        return {"type": "MultiPolygon", "coordinates": polys}
    poly = feat_elem.find(f".//{{{GML_NS}}}Polygon")
    if poly is not None:
        return _parse_polygon(poly)
    return None


# ── Main public function ──────────────────────────────────────────────────────

async def get_soil(bbox: tuple[float, float, float, float]) -> dict:
    """
    Superficial deposit polygons from PostGIS gtk_soil for bbox.
    bbox = (west, south, east, north) WGS84.
    Returns GeoJSON FeatureCollection with tactical attributes.
    Cached 1 hour in memory. Run scripts/ingest_soil.py first.
    """
    west, south, east, north = bbox
    key = f"soil:{west:.3f}:{south:.3f}:{east:.3f}:{north:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT objectid, pintamaalaji_koodi, pintamaalaji,
                   pohjamaalaji_koodi, pohjamaalaji,
                   shape_area, shape_len,
                   deposit_type, peat_depth, digging_suitability,
                   trafficability_dry, trafficability_wet,
                   concealment_potential, groundwater_risk,
                   ST_AsGeoJSON(geom)::text AS geom_json
            FROM gtk_soil
            WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
              AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
            """,
            west, south, east, north,
        )

    features = []
    for row in rows:
        geom = json.loads(row["geom_json"])
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "deposit_type":          row["deposit_type"],
                "peat_depth":            row["peat_depth"],
                "digging_suitability":   row["digging_suitability"],
                "trafficability_dry":    row["trafficability_dry"],
                "trafficability_wet":    row["trafficability_wet"],
                "concealment_potential": row["concealment_potential"],
                "groundwater_risk":      row["groundwater_risk"],
                "_raw": {
                    "OBJECTID":           row["objectid"],
                    "PINTAMAALAJI_KOODI": row["pintamaalaji_koodi"],
                    "PINTAMAALAJI":       row["pintamaalaji"],
                    "POHJAMAALAJI_KOODI": row["pohjamaalaji_koodi"],
                    "POHJAMAALAJI":       row["pohjamaalaji"],
                    "SHAPE_AREA":         row["shape_area"],
                    "SHAPE_LEN":          row["shape_len"],
                },
            },
        })

    result = {
        "type":     "FeatureCollection",
        "source":   "GTK Maapera 1:200000 (PostGIS)",
        "bbox":     list(bbox),
        "features": features,
    }

    _cache.set(key, result, ttl_seconds=_CACHE_TTL_S)
    return result
