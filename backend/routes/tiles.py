import httpx
from fastapi import APIRouter, Response
from core.cache import FileTileCache
from core.config import settings
from core.db import get_pool

router = APIRouter()

_tile_cache = FileTileCache(settings.TILE_CACHE_DIR)

@router.get("/mml/{z}/{x}/{y}.png")
async def mml_topo_tile(z: int, x: int, y: int):
    # MML WMTS uses row/col order (y/x), opposite of standard XYZ
    url = (
        f"https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0"
        f"/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png"
    )
    async with httpx.AsyncClient() as client:
        r = await client.get(url, params={"api-key": settings.MML_API_KEY})
    if r.status_code != 200:
        return Response(content=b"", media_type="image/png", status_code=r.status_code)
    return Response(
        content=r.content,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/{z}/{x}/{y}.mvt")
async def get_tile(z: int, x: int, y: int):
    cached = _tile_cache.get(z, x, y)
    if cached is not None:
        return Response(content=cached, media_type="application/x-protobuf")

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

    tile_data = bytes(row[0]) if row[0] else b""
    _tile_cache.set(z, x, y, tile_data)
    return Response(content=tile_data, media_type="application/x-protobuf")
