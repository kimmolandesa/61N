from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query

from services import chokepoint as chokepoint_svc

router = APIRouter()


def _bbox(raw: str) -> tuple:
    try:
        parts = [float(x) for x in raw.split(',')]
        if len(parts) != 4:
            raise ValueError
        return tuple(parts)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="bbox must be minx,miny,maxx,maxy")


@router.get("/chokepoints")
async def get_chokepoints(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    Road network chokepoints ranked by betweenness centrality.
    Bridges and tunnels receive a structural criticality multiplier.
    Returns top-30 segments as GeoJSON FeatureCollection.
    """
    return await chokepoint_svc.get_chokepoints(_bbox(bbox))


@router.get("/routes")
async def get_route(
    from_lat: Annotated[float, Query()],
    from_lon: Annotated[float, Query()],
    to_lat:   Annotated[float, Query()],
    to_lon:   Annotated[float, Query()],
    vehicle_class: Annotated[
        Literal['wheeled', 'tracked', 'foot'],
        Query(description="Vehicle type affects passable road types and speed"),
    ] = 'wheeled',
):
    """
    Fastest route between two points for a given vehicle class.
    Wheeled vehicles are blocked from tracks/paths.
    Tracked vehicles can use tracks at reduced speed.
    Returns GeoJSON Feature with LineString and travel time estimate.
    """
    return await chokepoint_svc.get_route(
        from_lat, from_lon, to_lat, to_lon, vehicle_class
    )


@router.get("/support_nodes")
async def get_support_nodes(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
    type: Annotated[
        Literal['medical', 'fuel', 'water', 'all'],
        Query(description="Filter by support node type"),
    ] = 'all',
):
    """
    Logistics and medical support nodes within the bbox.
    Queries both OSM point and polygon layers (polygon centroids included).
    """
    return await chokepoint_svc.get_support_nodes(_bbox(bbox), type)
