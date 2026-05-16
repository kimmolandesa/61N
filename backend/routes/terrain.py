from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response

from services import terrain as terrain_svc

router = APIRouter()


def _bbox(raw: str) -> tuple[float, float, float, float]:
    try:
        parts = [float(x) for x in raw.split(',')]
        if len(parts) != 4:
            raise ValueError
        return (parts[0], parts[1], parts[2], parts[3])
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="bbox must be minx,miny,maxx,maxy")


@router.get("/elevation")
async def get_elevation(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
):
    """Elevation in metres at a single WGS84 point."""
    return await terrain_svc.get_elevation(lat, lon)


@router.get("/profile")
async def get_profile(
    start_lat: Annotated[float, Query()],
    start_lon: Annotated[float, Query()],
    end_lat: Annotated[float, Query()],
    end_lon: Annotated[float, Query()],
    samples: Annotated[int, Query(ge=10, le=500)] = 100,
):
    """
    Elevation profile along a transect between two WGS84 points.
    Useful for route analysis and line-of-sight estimation.
    """
    return await terrain_svc.get_elevation_profile(
        start_lat, start_lon, end_lat, end_lon, samples
    )


@router.get("/cover")
async def get_terrain_cover(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    Terrain cover grid for the bbox.
    Each cell has: cover_class, movement_factor_wheeled, movement_factor_tracked,
    concealment_from_air, concealment_from_ground.
    Grid resolution adapts to bbox size (100–500 m cells).
    """
    return await terrain_svc.get_terrain_cover(_bbox(bbox))


@router.get("/dem/{z}/{x}/{y}.png")
async def get_dem_tile(z: int, x: int, y: int):
    """
    256×256 hillshade PNG tile rendered from the DEM VRT.
    Add as a raster source in MapLibre for terrain visualization.
    """
    png = await terrain_svc.get_hillshade_tile(z, x, y)
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
