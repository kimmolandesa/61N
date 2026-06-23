from fastapi import APIRouter, Query
from core.config import settings
from core.db import get_pool
from mock import get_fixture
import json

router = APIRouter()

@router.get("/bbox")
async def get_features_bbox(
    minx: float = Query(...),
    miny: float = Query(...),
    maxx: float = Query(...),
    maxy: float = Query(...),
    layer: str = Query("all"),
    limit: int = Query(1000)
):
    if settings.MOCK_MODE:
        return get_fixture("features")

    pool = await get_pool()

    layer_filter = {
        "military": "AND (military IS NOT NULL OR landuse = 'military')",
        "roads": "AND highway IS NOT NULL",
        "water": "AND (waterway IS NOT NULL OR natural = 'water')",
        "buildings": "AND building IS NOT NULL",
        "infrastructure": "AND (power IS NOT NULL OR man_made IS NOT NULL)",
        "all": ""
    }
    where = layer_filter.get(layer, "")

    bbox = "ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3067)"

    def make_query(table):
        return f"""
            SELECT
                osm_id, name, "natural", landuse, highway,
                waterway, military, amenity, building,
                man_made, power, historic, ele,
                ST_AsGeoJSON(ST_Transform(way, 4326)) as geometry
            FROM {table}
            WHERE ST_Intersects(way, {bbox})
            {where}
            LIMIT $5
        """

    features = []
    async with pool.acquire() as conn:
        for table in ["planet_osm_polygon", "planet_osm_point"]:
            rows = await conn.fetch(make_query(table), minx, miny, maxx, maxy, limit)
            for row in rows:
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(row["geometry"]),
                    "properties": {k: v for k, v in dict(row).items() if k != "geometry"}
                })

    return {"type": "FeatureCollection", "features": features}
