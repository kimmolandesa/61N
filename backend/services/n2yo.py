from datetime import datetime, timezone

import httpx

from core.cache import TTLCache
from core.config import settings

N2YO_BASE = "https://api.n2yo.com/rest/v1/satellite"
TIMEOUT_S = 15.0

_cache = TTLCache()

# ISR-relevant satellites: NORAD ID → metadata
# Open-source catalogue — optical satellites have cloud/daylight constraints;
# SAR satellites work through clouds and at night.
ISR_CATALOGUE: dict[int, dict] = {
    40524: {'name': 'Sentinel-1A', 'sensor': 'SAR',     'notes': 'C-band radar · all-weather · day/night'},
    44439: {'name': 'Sentinel-1B', 'sensor': 'SAR',     'notes': 'C-band radar · all-weather · day/night'},
    40697: {'name': 'Sentinel-2A', 'sensor': 'Optical', 'notes': '10 m multispectral · daylight only'},
    42063: {'name': 'Sentinel-2B', 'sensor': 'Optical', 'notes': '10 m multispectral · daylight only'},
    49260: {'name': 'Landsat-9',   'sensor': 'Optical', 'notes': '30 m multispectral · daylight only'},
    39084: {'name': 'Landsat-8',   'sensor': 'Optical', 'notes': '30 m multispectral · daylight only'},
}


def _passes_url(norad_id: int, lat: float, lon: float, alt_m: float, days: int) -> str:
    # radiopasses returns every pass regardless of daylight — correct for SAR & radar
    return (
        f"{N2YO_BASE}/radiopasses/{norad_id}"
        f"/{lat}/{lon}/{alt_m}/{days}/0"
        f"/&apiKey={settings.N2YO_API_KEY}"
    )


def _fmt_pass(p: dict, sat_meta: dict, norad_id: int) -> dict:
    return {
        'satellite':  sat_meta['name'],
        'norad_id':   norad_id,
        'sensor':     sat_meta['sensor'],
        'notes':      sat_meta['notes'],
        'start_utc':  datetime.fromtimestamp(p['startUTC'], tz=timezone.utc).isoformat(),
        'max_utc':    datetime.fromtimestamp(p['maxUTC'],   tz=timezone.utc).isoformat(),
        'end_utc':    datetime.fromtimestamp(p['endUTC'],   tz=timezone.utc).isoformat(),
        'max_elevation_deg': round(p['maxEl'], 1),
        'start_azimuth':     p.get('startAzCompass', ''),
        'duration_s':        p['endUTC'] - p['startUTC'],
        # High elevation = near-zenith pass = high-quality imagery, minimal oblique distortion
        'quality': 'high' if p['maxEl'] > 60 else 'medium' if p['maxEl'] > 30 else 'low',
    }


async def get_satellite_passes(
    lat: float,
    lon: float,
    alt_m: float = 0.0,
    days: int = 3,
) -> dict:
    """
    Next passes of ISR satellites over the observer position.
    Queries N2YO radiopasses for each satellite and merges results
    into a time-sorted list.

    Results are cached for 30 minutes (orbital mechanics don't change
    minute-to-minute but TLE updates matter over hours).
    """
    if not settings.N2YO_API_KEY:
        return {
            'error': 'N2YO_API_KEY not configured',
            'passes': [],
            'satellites_queried': 0,
        }

    key = f"sat:{lat:.2f}:{lon:.2f}:{days}"
    cached = _cache.get(key)
    if cached is not None:
        return cached

    all_passes: list[dict] = []
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        for norad_id, meta in ISR_CATALOGUE.items():
            url = _passes_url(norad_id, lat, lon, alt_m, days)
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    errors.append(f"{meta['name']}: HTTP {r.status_code}")
                    continue
                data = r.json()
                for p in data.get('passes', []):
                    all_passes.append(_fmt_pass(p, meta, norad_id))
            except Exception as exc:
                errors.append(f"{meta['name']}: {exc}")

    # Sort by start time ascending
    all_passes.sort(key=lambda p: p['start_utc'])

    result = {
        'observer':           {'lat': lat, 'lon': lon, 'alt_m': alt_m},
        'days_ahead':         days,
        'satellites_queried': len(ISR_CATALOGUE),
        'pass_count':         len(all_passes),
        'passes':             all_passes,
        'errors':             errors if errors else None,
    }

    _cache.set(key, result, ttl_seconds=1800)
    return result
