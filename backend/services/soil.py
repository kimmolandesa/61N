"""
GTK (Geological Survey of Finland) superficial deposit service.
Layer: maapera_200k_maalajit (1:200 000 soil type polygons)
WFS 1.1.0, GML3 output, coordinates returned as lat lon pairs → swapped to lon lat for GeoJSON.
"""

import asyncio
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

GTK_WFS = (
    "https://gtkdata.gtk.fi/arcgis/services/Rajapinnat/"
    "GTK_Maapera_WFS/MapServer/WFSServer"
)
TYPENAME = "Rajapinnat_GTK_Maapera_WFS:maapera_200k_maalajit"
FEAT_NS   = (
    "https://gtkdata.gtk.fi/arcgis/services/Rajapinnat/"
    "GTK_Maapera_WFS/MapServer/WFSServer"
)
GML_NS   = "http://www.opengis.net/gml"
TIMEOUT_S = 30.0
_CACHE_TTL_S = 7 * 86_400   # 7 days
_CACHE_DIR   = Path("/data/soil_cache")

# ── Deposit code → tactical classification ────────────────────────────────────
# PINTAMAALAJI_KOODI values observed from GTK 200k dataset
# Keys are string codes; match by prefix if no exact hit.
_CODE_MAP: dict[str, dict] = {
    # Bedrock
    "195110": {
        "deposit_type": "bedrock",
        "peat_depth": None,
        "digging_suitability": "poor",
        "trafficability_dry": "high",
        "trafficability_wet": "high",
        "concealment_potential": "low",
        "groundwater_risk": False,
    },
    "195111": {
        "deposit_type": "bedrock",
        "peat_depth": None,
        "digging_suitability": "poor",
        "trafficability_dry": "high",
        "trafficability_wet": "high",
        "concealment_potential": "low",
        "groundwater_risk": False,
    },
    # Till / mixed unsorted
    "195210": {
        "deposit_type": "till",
        "peat_depth": None,
        "digging_suitability": "good",
        "trafficability_dry": "high",
        "trafficability_wet": "medium",
        "concealment_potential": "low",
        "groundwater_risk": False,
    },
    # Coarse-grained (gravel / glaciofluvial sand)
    "195310": {
        "deposit_type": "glaciofluvial_gravel",
        "peat_depth": None,
        "digging_suitability": "good",
        "trafficability_dry": "high",
        "trafficability_wet": "high",
        "concealment_potential": "low",
        "groundwater_risk": True,
    },
    # Fine-grained (generic — silt/clay family)
    "195410": {
        "deposit_type": "fine_grained",
        "peat_depth": None,
        "digging_suitability": "moderate",
        "trafficability_dry": "medium",
        "trafficability_wet": "low",
        "concealment_potential": "low",
        "groundwater_risk": False,
    },
    # Clay
    "195413": {
        "deposit_type": "clay",
        "peat_depth": None,
        "digging_suitability": "moderate",
        "trafficability_dry": "medium",
        "trafficability_wet": "low",
        "concealment_potential": "low",
        "groundwater_risk": False,
    },
    # Sand (hiekka prefix 19542x range — defensive fallback handled via prefix)
    "195420": {
        "deposit_type": "sand",
        "peat_depth": None,
        "digging_suitability": "good",
        "trafficability_dry": "high",
        "trafficability_wet": "medium",
        "concealment_potential": "low",
        "groundwater_risk": True,
    },
    # Swamp / wetland
    "19551822": {
        "deposit_type": "swamp",
        "peat_depth": None,
        "digging_suitability": "poor",
        "trafficability_dry": "low",
        "trafficability_wet": "low",
        "concealment_potential": "high",
        "groundwater_risk": False,
    },
    # Thin peat (<0.6 m)
    "19551891": {
        "deposit_type": "peat",
        "peat_depth": "thin",
        "digging_suitability": "moderate",
        "trafficability_dry": "medium",
        "trafficability_wet": "low",
        "concealment_potential": "medium",
        "groundwater_risk": False,
    },
    # Thick peat (>0.6 m)
    "19551892": {
        "deposit_type": "peat",
        "peat_depth": "thick",
        "digging_suitability": "poor",
        "trafficability_dry": "low",
        "trafficability_wet": "low",
        "concealment_potential": "high",
        "groundwater_risk": False,
    },
    # Water
    "195603": {
        "deposit_type": "water",
        "peat_depth": None,
        "digging_suitability": "not_applicable",
        "trafficability_dry": "low",
        "trafficability_wet": "low",
        "concealment_potential": "low",
        "groundwater_risk": False,
    },
}

_UNKNOWN_TACTICS = {
    "deposit_type": "unknown",
    "peat_depth": None,
    "digging_suitability": "moderate",
    "trafficability_dry": "medium",
    "trafficability_wet": "medium",
    "concealment_potential": "low",
    "groundwater_risk": False,
}


def _classify(code: str) -> dict:
    if code in _CODE_MAP:
        return _CODE_MAP[code]
    # Prefix match for codes not seen in testing (GTK may have sub-variants)
    for prefix_len in (8, 7, 6, 5, 4):
        hit = _CODE_MAP.get(code[:prefix_len])
        if hit:
            return hit
    return _UNKNOWN_TACTICS


# ── GML3 geometry parser ──────────────────────────────────────────────────────

def _poslist_to_coords(poslist: str) -> list[list[float]]:
    """Convert GML3 posList (lat lon lat lon …) to GeoJSON [[lon,lat], …]."""
    nums = [float(v) for v in poslist.split()]
    return [[nums[i + 1], nums[i]] for i in range(0, len(nums) - 1, 2)]


def _parse_ring(ring_elem) -> list[list[float]]:
    pl = ring_elem.find(f"{{{GML_NS}}}posList")
    if pl is not None and pl.text:
        return _poslist_to_coords(pl.text.strip())
    return []


def _parse_polygon(poly_elem) -> dict | None:
    exterior = poly_elem.find(
        f"{{{GML_NS}}}exterior/{{{GML_NS}}}LinearRing"
    )
    if exterior is None:
        return None
    rings = [_parse_ring(exterior)]
    for interior in poly_elem.findall(
        f"{{{GML_NS}}}interior/{{{GML_NS}}}LinearRing"
    ):
        rings.append(_parse_ring(interior))
    rings = [r for r in rings if r]
    if not rings:
        return None
    return {"type": "Polygon", "coordinates": rings}


def _parse_geometry(feat_elem) -> dict | None:
    """Extract GeoJSON geometry from a GML3 feature element."""
    # Try MultiSurface first, then Polygon
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


# ── Disk cache ────────────────────────────────────────────────────────────────

def _cache_path(bbox_snapped: tuple) -> Path:
    key = "_".join(f"{v:.2f}" for v in bbox_snapped)
    hsh = hashlib.md5(key.encode()).hexdigest()[:12]
    return _CACHE_DIR / f"soil_{hsh}.json"


def _cache_read(path: Path) -> dict | None:
    if not path.exists():
        return None
    import time
    if time.time() - path.stat().st_mtime > _CACHE_TTL_S:
        return None
    try:
        return json.loads(path.read_bytes())
    except Exception:
        return None


def _cache_write(path: Path, data: dict) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False))


# ── Main public function ──────────────────────────────────────────────────────

async def get_soil(bbox: tuple[float, float, float, float]) -> dict:
    """
    Superficial deposit polygons from GTK maapera_200k_maalajit for bbox.
    bbox = (west, south, east, north) WGS84.
    Returns GeoJSON FeatureCollection with tactical attributes.
    Cached 7 days on disk.
    """
    west, south, east, north = bbox

    # Snap to 0.05° grid for cache reuse
    def _snap(v: float) -> float:
        return round(round(v / 0.05) * 0.05, 4)

    bbox_snapped = (_snap(west), _snap(south), _snap(east), _snap(north))
    cache_path = _cache_path(bbox_snapped)

    cached = _cache_read(cache_path)
    if cached is not None:
        return cached

    # WFS 1.1.0 with EPSG:4326 → bbox must be minLat,minLon,maxLat,maxLon
    params = {
        "SERVICE":    "WFS",
        "VERSION":    "1.1.0",
        "REQUEST":    "GetFeature",
        "TYPENAME":   TYPENAME,
        "BBOX":       f"{south},{west},{north},{east},urn:ogc:def:crs:EPSG::4326",
        "SRSNAME":    "urn:ogc:def:crs:EPSG::4326",
        "maxFeatures": 2000,
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.get(GTK_WFS, params=params)
            r.raise_for_status()
            raw_xml = r.text
    except Exception as exc:
        raise RuntimeError(f"upstream_unavailable: {exc}") from exc

    # XML parse + feature processing is CPU-bound — run off the event loop
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _parse_and_build, raw_xml, bbox, cache_path)
    return result


def _parse_and_build(raw_xml: str, bbox: tuple, cache_path: Path) -> dict:
    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as exc:
        raise RuntimeError(f"upstream_unavailable: bad XML from GTK") from exc

    features = []
    for feat_elem in root.iter(f"{{{FEAT_NS}}}maapera_200k_maalajit"):
        def _text(field: str) -> str:
            el = feat_elem.find(f"{{{FEAT_NS}}}{field}")
            return (el.text or "").strip() if el is not None else ""

        geom = _parse_geometry(feat_elem)
        if geom is None:
            continue

        code = _text("PINTAMAALAJI_KOODI")
        tactics = _classify(code)

        raw_props = {
            "OBJECTID":           _text("OBJECTID"),
            "PINTAMAALAJI_KOODI": code,
            "PINTAMAALAJI":       _text("PINTAMAALAJI"),
            "POHJAMAALAJI_KOODI": _text("POHJAMAALAJI_KOODI"),
            "POHJAMAALAJI":       _text("POHJAMAALAJI"),
            "SHAPE_AREA":         _text("SHAPE.AREA"),
            "SHAPE_LEN":          _text("SHAPE.LEN"),
        }

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                **tactics,
                "_raw": raw_props,
            },
        })

    result = {
        "type":    "FeatureCollection",
        "source":  "GTK Maapera WFS 1:200000",
        "bbox":    list(bbox),
        "features": features,
    }

    _cache_write(cache_path, result)
    return result
