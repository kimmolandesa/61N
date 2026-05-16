from fastapi import APIRouter, Response
from core.db import get_pool

router = APIRouter()

@router.get("/{z}/{x}/{y}.mvt")
async def get_tile(z: int, x: int, y: int):
    pool = await get_pool()

    query = """
        SELECT ST_AsMVT(tile, 'features', 4096, 'geom') FROM (
            SELECT
                osm_id,
                name,
                "natural",
                landuse,
                highway,
                waterway,
                military,
                amenity,
                building,
                man_made,
                power,
                historic,
                ST_AsMVTGeom(
                    ST_Transform(way, 3857),
                    ST_TileEnvelope($1, $2, $3),
                    4096, 256, true
                ) AS geom
            FROM planet_osm_polygon
            WHERE ST_Intersects(
                ST_Transform(way, 3857),
                ST_TileEnvelope($1, $2, $3)
            )
            AND ST_AsMVTGeom(
                ST_Transform(way, 3857),
                ST_TileEnvelope($1, $2, $3),
                4096, 256, true
            ) IS NOT NULL
            UNION ALL
            SELECT
                osm_id,
                name,
                "natural",
                landuse,
                highway,
                waterway,
                military,
                amenity,
                building,
                man_made,
                power,
                historic,
                ST_AsMVTGeom(
                    ST_Transform(way, 3857),
                    ST_TileEnvelope($1, $2, $3),
                    4096, 256, true
                ) AS geom
            FROM planet_osm_line
            WHERE ST_Intersects(
                ST_Transform(way, 3857),
                ST_TileEnvelope($1, $2, $3)
            )
            AND ST_AsMVTGeom(
                ST_Transform(way, 3857),
                ST_TileEnvelope($1, $2, $3),
                4096, 256, true
            ) IS NOT NULL
        ) AS tile
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, z, x, y)

    return Response(
        content=bytes(row[0]) if row[0] else b"",
        media_type="application/x-protobuf"
    )
