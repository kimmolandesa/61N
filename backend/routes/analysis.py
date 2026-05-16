from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.errors import TopologicalError
from shapely.geometry import box, shape

from services.los import compute_los, compute_viewshed

router = APIRouter()


# ── Request models ────────────────────────────────────────────────────────────

class _Point(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    height_m: float = Field(0.0, ge=0, description="Height above ground (m)")


class LOSRequest(BaseModel):
    observer: _Point
    target: _Point


class ViewshedRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    height_m: float = Field(1.5, ge=0, description="Observer height above ground (m)")
    max_range_m: float = Field(5000.0, gt=0, le=30_000)


class DefiladeRequest(BaseModel):
    threat: _Point
    bbox: list[float] = Field(
        ..., min_length=4, max_length=4,
        description="[minx, miny, maxx, maxy] WGS84 — area of interest",
    )
    max_range_m: float = Field(10_000.0, gt=0, le=30_000)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/los")
async def line_of_sight(req: LOSRequest):
    """
    Check line-of-sight between two points.
    Returns {visible, obstruction: {lon, lat, elevation} | null}.
    """
    return await compute_los(
        observer_lon=req.observer.lon,
        observer_lat=req.observer.lat,
        observer_height_m=req.observer.height_m,
        target_lon=req.target.lon,
        target_lat=req.target.lat,
        target_height_m=req.target.height_m,
    )


@router.post("/viewshed")
async def viewshed(req: ViewshedRequest):
    """
    360° viewshed from a point up to max_range_m.
    Returns GeoJSON Feature of the visible area polygon.
    Use for: OP siting, comms relay planning, surveillance coverage.
    """
    geometry = await compute_viewshed(
        observer_lon=req.lon,
        observer_lat=req.lat,
        observer_height_m=req.height_m,
        max_range_m=req.max_range_m,
    )
    return {
        'type': 'Feature',
        'geometry': geometry,
        'properties': {
            'observer': {'lat': req.lat, 'lon': req.lon, 'height_m': req.height_m},
            'max_range_m': req.max_range_m,
        },
    }


@router.post("/defilade")
async def defilade(req: DefiladeRequest):
    """
    Areas within the bbox that are hidden from the threat position.
    Algorithm: viewshed FROM threat → complement within bbox = defilade.
    Returns GeoJSON Feature of the defilade polygon.
    Use for: hide site selection, route planning, cover analysis.
    """
    # Viewshed from threat = everything it can observe
    visible_geom = await compute_viewshed(
        observer_lon=req.threat.lon,
        observer_lat=req.threat.lat,
        observer_height_m=req.threat.height_m,
        max_range_m=req.max_range_m,
    )

    minx, miny, maxx, maxy = req.bbox
    area = box(minx, miny, maxx, maxy)

    try:
        defilade_shape = area.difference(shape(visible_geom))
    except TopologicalError as exc:
        raise HTTPException(status_code=500, detail=f"Geometry error: {exc}")

    return {
        'type': 'Feature',
        'geometry': defilade_shape.__geo_interface__,
        'properties': {
            'threat': {
                'lat': req.threat.lat,
                'lon': req.threat.lon,
                'height_m': req.threat.height_m,
            },
            'max_range_m': req.max_range_m,
            'bbox': req.bbox,
        },
    }
