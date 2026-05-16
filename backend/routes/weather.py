from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from services import weather as weather_svc

router = APIRouter()


def _bbox(raw: str) -> tuple[float, float, float, float]:
    try:
        parts = [float(x) for x in raw.split(',')]
        if len(parts) != 4:
            raise ValueError
        return (parts[0], parts[1], parts[2], parts[3])
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="bbox must be minx,miny,maxx,maxy")


@router.get("/current")
async def current_weather(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """Weather station observations for the last 60 minutes within the bbox."""
    b = _bbox(bbox)
    obs = await weather_svc.get_observations(b)
    return {"bbox": b, "count": len(obs), "observations": obs}


@router.get("/forecast")
async def forecast(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
    hours: Annotated[int, Query(ge=1, le=120)] = 72,
):
    """HARMONIE model forecast for bbox center, hourly steps."""
    b = _bbox(bbox)
    lat = (b[1] + b[3]) / 2
    lon = (b[0] + b[2]) / 2
    fc = await weather_svc.get_forecast(lat, lon, hours)
    return {
        "bbox": b,
        "center": {"lat": round(lat, 5), "lon": round(lon, 5)},
        "hours": hours,
        "count": len(fc),
        "forecast": fc,
    }


@router.get("/impact")
async def weather_impact(
    bbox: Annotated[str, Query(description="minx,miny,maxx,maxy (WGS84)")],
):
    """
    Operational weather impact assessment for the area.
    Worst-case conditions from the next 24h HARMONIE forecast translated into
    mobility, aviation, drone, and visibility categories.
    """
    b = _bbox(bbox)
    return await weather_svc.get_impact(b)
