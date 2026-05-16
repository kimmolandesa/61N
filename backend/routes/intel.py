from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from services import population as population_svc
from services import n2yo as n2yo_svc
from services import cell_tower as cell_tower_svc

router = APIRouter()


def _bbox(raw: str) -> tuple:
    try:
        parts = [float(x) for x in raw.split(',')]
        if len(parts) != 4:
            raise ValueError
        return tuple(parts)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="bbox must be minx,miny,maxx,maxy")


@router.get("/population")
async def get_population(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    1 km² population grid from Statistics Finland for the bbox.
    Returns GeoJSON FeatureCollection with population count and density class per cell.
    Cached 24 hours (data changes annually).
    """
    return await population_svc.get_population_grid(_bbox(bbox))


@router.get("/comms")
async def get_comms(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    Cell tower positions and coverage dead-zone map for the bbox.
    Towers sourced from OpenCellID. Coverage radius estimated by radio type
    (NR 1km / LTE 2km / UMTS 5km / GSM 8km — conservative for Finnish terrain).
    Returns tower GeoJSON, ~350m coverage grid, dead-zone ratio, and operational summary.
    Cached 1 hour.
    """
    return await cell_tower_svc.get_cell_coverage(_bbox(bbox))


@router.get("/satellites")
async def get_satellite_passes(
    lat:   Annotated[float, Query(description="Observer latitude WGS84")],
    lon:   Annotated[float, Query(description="Observer longitude WGS84")],
    alt_m: Annotated[float, Query(description="Observer altitude above sea level (metres)")] = 0.0,
    days:  Annotated[int,   Query(ge=1, le=10, description="Days to look ahead")] = 3,
):
    """
    Upcoming passes of ISR satellites over the observer position.
    Covers Sentinel-1A/B (SAR, all-weather), Sentinel-2A/B, Landsat-8/9 (optical, daylight).
    Results sorted by start time. Cached 30 minutes.
    """
    return await n2yo_svc.get_satellite_passes(lat, lon, alt_m, days)
