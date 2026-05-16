from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query

from services import chokepoint as chokepoint_svc
from services import vayla as vayla_svc

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


@router.get("/restrictions")
async def get_weight_restrictions(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    Road segment weight restrictions from Väylä Digiroad.
    Returns LineString features for segments with posted limits below Finnish standard.
    Fields: single_vehicle_t, combination_t, axle_t, bogie_t (tonnes), passable_by.
    Segments without restrictions meet Finnish standard (76t combination, 13t axle).
    Cached 24 hours.
    """
    return await vayla_svc.get_weight_restrictions(_bbox(bbox))


@router.get("/bridges")
async def get_bridges(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    Bridge structures from Väylä with load capacity and military vehicle passability.
    Fields: max_total_mass_t, max_axle_load_t, passable_by (vehicle class list),
    blocks_mbt, blocks_heavy_truck.
    Vehicle classes: light_wheeled (12t), apc_wheeled (28t, e.g. AMV),
    medium_truck (32t), heavy_truck (44t), tracked_ifv (40t, e.g. CV90), mbt (65t, e.g. Leopard 2).
    Cached 24 hours.
    """
    return await vayla_svc.get_bridges(_bbox(bbox))
