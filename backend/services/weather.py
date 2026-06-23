import statistics
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from core.cache import TTLCache
from core.config import settings
from mock import get_fixture

FMI_WFS_BASE = "https://opendata.fmi.fi/wfs"
TIMEOUT_S = 20.0

_cache = TTLCache()

# FMI GML namespace URIs (no prefix needed — use Clark notation)
_GMLCOV_POSITIONS = '{http://www.opengis.net/gmlcov/1.0}positions'
_GMLCOV_COVERAGE = '{http://www.opengis.net/gmlcov/1.0}MultiPointCoverage'
_GML_DATA = '{http://www.opengis.net/gml/3.2}doubleOrNilReasonTupleList'
_SWE_FIELD = '{http://www.opengis.net/swe/2.0}field'


def _fmi_url(query_id: str, params: dict) -> str:
    p = {
        'service': 'WFS',
        'version': '2.0.0',
        'request': 'getFeature',
        'storedquery_id': query_id,
    }
    p.update({k: str(v) for k, v in params.items() if v is not None})
    return f"{FMI_WFS_BASE}?{urlencode(p)}"


async def _fetch_xml(url: str) -> str:
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.get(url, headers={'Accept': 'application/xml, text/xml'})
        r.raise_for_status()
        return r.text


def _parse_multipointcoverage(xml_text: str) -> list[dict]:
    """
    Parse FMI GML multipointcoverage response.
    Positions block: flat triplets of (lat, lon, epoch_seconds).
    Data block: n_fields values per (station × timestep) tuple, same order as positions.
    """
    root = ET.fromstring(xml_text)
    results = []

    for coverage in root.iter(_GMLCOV_COVERAGE):
        fields = [f.get('name', '') for f in coverage.iter(_SWE_FIELD)]
        if not fields:
            continue

        pos_el = coverage.find(f'.//{_GMLCOV_POSITIONS}')
        if pos_el is None or not (pos_el.text or '').strip():
            continue
        pos_vals = pos_el.text.split()

        data_el = coverage.find(f'.//{_GML_DATA}')
        if data_el is None or not (data_el.text or '').strip():
            continue
        data_vals = data_el.text.split()

        n_fields = len(fields)
        n_points = len(pos_vals) // 3

        for i in range(n_points):
            try:
                lat = float(pos_vals[i * 3])
                lon = float(pos_vals[i * 3 + 1])
                epoch = float(pos_vals[i * 3 + 2])
            except (ValueError, IndexError):
                continue

            obs: dict = {'lat': lat, 'lon': lon, 'time': epoch}
            start = i * n_fields
            for fi, name in enumerate(fields):
                try:
                    raw = data_vals[start + fi]
                    obs[name] = None if raw in ('NaN', 'nan') else float(raw)
                except (ValueError, IndexError):
                    obs[name] = None

            results.append(obs)

    return results


def _average(obs_list: list[dict]) -> dict:
    """Mean of each numeric field across all observations, ignoring None."""
    if not obs_list:
        return {}
    keys = [k for k in obs_list[0] if k not in ('lat', 'lon', 'time')]
    agg: dict = {}
    for k in keys:
        vals = [o[k] for o in obs_list if o.get(k) is not None]
        if vals:
            agg[k] = round(statistics.mean(vals), 2)
    return agg


def _worst(obs_list: list[dict]) -> dict:
    """Worst-case conditions across time steps: max wind/rain/snow, min visibility."""
    worst: dict = {}
    for obs in obs_list:
        for k, v in obs.items():
            if k in ('lat', 'lon', 'time') or v is None:
                continue
            k_lower = k.lower()
            if any(x in k_lower for x in ('wind', 'gust', 'rain', 'precip', 'snow')):
                worst[k] = max(worst.get(k) or v, v)
            elif 'vis' in k_lower:
                worst[k] = min(worst.get(k) or v, v)
            elif k not in worst:
                worst[k] = v
    return worst


def _assess(cond: dict) -> dict:
    """Translate raw weather values into operational impact categories."""
    def pick(*keys):
        for k in keys:
            v = cond.get(k)
            if v is not None:
                return v
        return None

    temp = pick('temperature', 'Temperature')
    wind = pick('windspeedms', 'WindSpeedMS') or 0.0
    gust = pick('windgust', 'WindGust', 'gust') or wind
    vis  = pick('visibility', 'Visibility') or 10_000.0
    snow = pick('snowdepth', 'SnowDepth') or 0.0
    rain = pick('rain', 'Precipitation1h') or 0.0

    # Wheeled mobility
    if snow > 30:
        mob_w = 'severe'
    elif snow > 15 or rain > 5:
        mob_w = 'moderate'
    elif rain > 2:
        mob_w = 'reduced'
    else:
        mob_w = 'normal'

    # Tracked mobility
    if snow > 60:
        mob_t = 'severe'
    elif snow > 30:
        mob_t = 'moderate'
    else:
        mob_t = 'normal'

    # Rotary aviation
    eff_wind = max(wind, gust * 0.7)
    if eff_wind > 15:
        aviation = 'no-go'
    elif eff_wind > 10:
        aviation = 'reduced'
    else:
        aviation = 'normal'

    # Drone ops
    if wind > 10 or rain > 1 or (temp is not None and temp < -15):
        drone = 'no-go'
    elif wind > 7 or rain > 0.2 or (temp is not None and temp < -10):
        drone = 'reduced'
    else:
        drone = 'normal'

    # Visibility class
    if vis < 500:
        vis_class = 'zero'
    elif vis < 1_000:
        vis_class = 'obscured'
    elif vis < 5_000:
        vis_class = 'reduced'
    else:
        vis_class = 'clear'

    reasons = []
    if snow > 10:
        reasons.append(f"Snow {snow:.0f}cm")
    if wind > 7:
        reasons.append(f"Wind {wind:.0f}m/s")
    if gust > wind + 3:
        reasons.append(f"Gusts {gust:.0f}m/s")
    if vis < 5_000:
        reasons.append(f"Vis {vis/1000:.1f}km")
    if rain > 0.2:
        reasons.append(f"Rain {rain:.1f}mm/h")
    if temp is not None and temp < -10:
        reasons.append(f"Temp {temp:.0f}°C")

    return {
        'mobility_wheeled':  mob_w,
        'mobility_tracked':  mob_t,
        'aviation_rotary':   aviation,
        'drone_ops':         drone,
        'visibility':        vis_class,
        'reason': ', '.join(reasons) if reasons else 'Conditions normal',
        'raw': {
            'temperature_c':  temp,
            'wind_ms':        round(wind, 1),
            'gust_ms':        round(gust, 1),
            'visibility_m':   round(vis),
            'snow_depth_cm':  round(snow, 1),
            'rain_mmh':       round(rain, 2),
        },
    }


async def get_observations(bbox: tuple[float, float, float, float]) -> list[dict]:
    """Current weather from FMI stations within bbox (last 60 minutes)."""
    if settings.MOCK_MODE:
        return get_fixture("weather_current")["observations"]

    key = f"obs:{bbox}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    now = datetime.now(timezone.utc)
    url = _fmi_url('fmi::observations::weather::multipointcoverage', {
        'bbox': f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
        'starttime': (now - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'endtime': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'timestep': 60,
        'parameters': 'temperature,windspeedms,windgust,winddirection,humidity,visibility,totalcloudcover,rain,snowdepth',
    })

    xml = await _fetch_xml(url)
    result = _parse_multipointcoverage(xml)
    _cache.set(key, result, ttl_seconds=1800)
    return result


async def get_forecast(lat: float, lon: float, hours: int = 72) -> list[dict]:
    """HARMONIE forecast for a point (up to 72h, 1h timesteps)."""
    if settings.MOCK_MODE:
        return get_fixture("weather_forecast")["forecast"]

    key = f"forecast:{lat:.2f}:{lon:.2f}:{hours}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    now = datetime.now(timezone.utc)
    url = _fmi_url('fmi::forecast::harmonie::surface::point::multipointcoverage', {
        'latlon': f"{lat},{lon}",
        'endtime': (now + timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'timestep': 60,
        'parameters': 'Temperature,WindSpeedMS,WindGust,WindDirection,Humidity,Visibility,TotalCloudCover,Precipitation1h,SnowDepth',
    })

    xml = await _fetch_xml(url)
    result = _parse_multipointcoverage(xml)
    _cache.set(key, result, ttl_seconds=7200)
    return result


async def get_impact(bbox: tuple[float, float, float, float]) -> dict:
    """
    Operational weather impact for the area.
    Uses worst-case conditions from the next 24h HARMONIE forecast.
    """
    if settings.MOCK_MODE:
        return get_fixture("weather_impact")

    key = f"impact:{bbox}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    lat = (bbox[1] + bbox[3]) / 2
    lon = (bbox[0] + bbox[2]) / 2

    forecast = await get_forecast(lat, lon, hours=24)
    result = _assess(_worst(forecast))
    _cache.set(key, result, ttl_seconds=3600)
    return result
