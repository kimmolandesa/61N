import asyncio
import json
import math

import networkx as nx

from core.db import get_pool


# ── Road speed table (km/h) ───────────────────────────────────────────────────

_ROAD_SPEED: dict[str, float] = {
    'motorway': 100, 'motorway_link': 70,
    'trunk': 80, 'trunk_link': 60,
    'primary': 60, 'primary_link': 50,
    'secondary': 50, 'secondary_link': 40,
    'tertiary': 40, 'tertiary_link': 30,
    'unclassified': 30, 'residential': 30,
    'living_street': 15, 'service': 20,
    'track': 15, 'path': 5,
}

_WHEELED_BLOCKED = {'path', 'footway', 'cycleway', 'pedestrian', 'steps', 'bridleway'}
_TRACKED_BLOCKED = {'footway', 'cycleway', 'pedestrian', 'steps'}


def _effective_speed(highway: str, vehicle_class: str) -> float:
    if vehicle_class == 'wheeled' and highway in _WHEELED_BLOCKED:
        return 0.0
    if vehicle_class == 'tracked' and highway in _TRACKED_BLOCKED:
        return 0.0
    speed = _ROAD_SPEED.get(highway, 20.0)
    if vehicle_class == 'tracked' and highway in ('track', 'unclassified'):
        speed *= 0.8
    return speed


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _node_id(lon: float, lat: float) -> tuple:
    return (round(lon, 5), round(lat, 5))


# ── PostGIS queries ───────────────────────────────────────────────────────────

async def _fetch_roads(bbox: tuple, buffer_deg: float = 0.005) -> list:
    west, south, east, north = bbox
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT
                osm_id::text              AS osm_id,
                COALESCE(name, '')        AS name,
                COALESCE(highway, 'unclassified') AS highway,
                COALESCE(bridge, '')      AS bridge,
                COALESCE(tunnel, '')      AS tunnel,
                ST_Length(way)            AS length_m,
                ST_AsGeoJSON(ST_Transform(way, 4326)) AS geometry
            FROM planet_osm_line
            WHERE ST_Intersects(
                way,
                ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3067)
            )
            AND highway IS NOT NULL
            AND highway NOT IN ('proposed','construction','abandoned','no')
            LIMIT 10000
            """,
            west - buffer_deg, south - buffer_deg,
            east + buffer_deg, north + buffer_deg,
        )


# ── Graph construction ────────────────────────────────────────────────────────

def _build_graph(rows: list, vehicle_class: str = 'wheeled') -> tuple[nx.Graph, dict]:
    G = nx.Graph()
    edge_meta: dict[tuple, dict] = {}

    for row in rows:
        hw = row['highway']
        speed = _effective_speed(hw, vehicle_class)
        if speed == 0:
            continue

        try:
            coords = json.loads(row['geometry'])['coordinates']
        except Exception:
            continue

        length_m = float(row['length_m']) if row['length_m'] else _haversine_m(
            coords[0][1], coords[0][0], coords[-1][1], coords[-1][0]
        )
        travel_s = (length_m / 1000.0) / speed * 3600.0

        u = _node_id(*coords[0])
        v = _node_id(*coords[-1])
        if u == v:
            continue

        G.add_node(u, lon=coords[0][0],  lat=coords[0][1])
        G.add_node(v, lon=coords[-1][0], lat=coords[-1][1])
        G.add_edge(u, v, weight=travel_s, length_m=length_m, highway=hw)

        meta = {
            'osm_id':  row['osm_id'],
            'name':    row['name'],
            'highway': hw,
            'bridge':  bool(row['bridge'] and row['bridge'] not in ('', 'no')),
            'tunnel':  bool(row['tunnel'] and row['tunnel'] not in ('', 'no')),
            'length_m': round(length_m, 1),
            'geometry': row['geometry'],
        }
        edge_meta[(u, v)] = meta
        edge_meta[(v, u)] = meta

    return G, edge_meta


def _nearest_node(G: nx.Graph, lon: float, lat: float) -> tuple[tuple, float]:
    best, best_d = None, float('inf')
    for n, data in G.nodes(data=True):
        d = _haversine_m(lat, lon, data['lat'], data['lon'])
        if d < best_d:
            best, best_d = n, d
    return best, best_d


# ── Public API ────────────────────────────────────────────────────────────────

async def get_chokepoints(bbox: tuple) -> dict:
    """
    Rank road segments by edge betweenness centrality.
    Bridges and tunnels get a structural multiplier.
    Returns top-30 segments as GeoJSON FeatureCollection.
    """
    rows = await _fetch_roads(bbox)
    if not rows:
        return {'type': 'FeatureCollection', 'features': []}

    def _compute():
        G, edge_meta = _build_graph(rows)
        if G.number_of_edges() == 0:
            return []

        # Approximate betweenness — k=150 sample nodes keeps it fast
        k = min(G.number_of_nodes(), 150)
        centrality = nx.edge_betweenness_centrality(
            G, k=k, weight='weight', normalized=True
        )

        scored: list[tuple] = []
        for (u, v), score in centrality.items():
            meta = edge_meta.get((u, v))
            if not meta:
                continue
            if meta['bridge']:
                score *= 2.5
            if meta['tunnel']:
                score *= 2.0
            scored.append((score, u, v, meta))

        scored.sort(reverse=True)

        features = []
        for rank, (score, _u, _v, meta) in enumerate(scored[:30], 1):
            try:
                geom = json.loads(meta['geometry'])
            except Exception:
                continue
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': {
                    'rank':              rank,
                    'criticality_score': round(score, 6),
                    'osm_id':            meta['osm_id'],
                    'name':              meta['name'],
                    'highway':           meta['highway'],
                    'bridge':            meta['bridge'],
                    'tunnel':            meta['tunnel'],
                    'length_m':          meta['length_m'],
                    'type': (
                        'bridge' if meta['bridge'] else
                        'tunnel' if meta['tunnel'] else
                        'road_bottleneck'
                    ),
                },
            })
        return features

    loop = asyncio.get_event_loop()
    features = await loop.run_in_executor(None, _compute)
    return {'type': 'FeatureCollection', 'features': features}


async def get_route(
    from_lat: float, from_lon: float,
    to_lat: float,   to_lon: float,
    vehicle_class: str = 'wheeled',
) -> dict:
    """
    Shortest-time route between two points for a given vehicle class.
    Returns GeoJSON Feature with LineString geometry and travel stats.
    """
    buffer = max(0.05, abs(to_lat - from_lat) * 0.3, abs(to_lon - from_lon) * 0.3)
    bbox = (
        min(from_lon, to_lon) - buffer, min(from_lat, to_lat) - buffer,
        max(from_lon, to_lon) + buffer, max(from_lat, to_lat) + buffer,
    )
    rows = await _fetch_roads(bbox)
    if not rows:
        return {'error': 'No road data for this area'}

    def _compute():
        G, edge_meta = _build_graph(rows, vehicle_class)
        if G.number_of_nodes() == 0:
            return {'error': 'No passable roads for this vehicle class'}

        start_node, start_snap = _nearest_node(G, from_lon, from_lat)
        end_node, end_snap     = _nearest_node(G, to_lon, to_lat)

        if not start_node or not end_node or start_node == end_node:
            return {'error': 'Could not snap to road network'}

        try:
            path_nodes = nx.shortest_path(G, start_node, end_node, weight='weight')
        except nx.NetworkXNoPath:
            return {'error': 'No route found between these points'}

        coords: list = []
        total_m = 0.0
        total_s = 0.0
        road_type_counts: dict[str, int] = {}
        has_bridge = False
        has_tunnel = False

        for i in range(len(path_nodes) - 1):
            u, v = path_nodes[i], path_nodes[i + 1]
            u_d = G.nodes[u]
            v_d = G.nodes[v]
            if not coords:
                coords.append([u_d['lon'], u_d['lat']])
            coords.append([v_d['lon'], v_d['lat']])

            meta = edge_meta.get((u, v), {})
            total_m += G.edges[u, v].get('length_m', 0)
            total_s += G.edges[u, v].get('weight', 0)
            hw = meta.get('highway', 'unknown')
            road_type_counts[hw] = road_type_counts.get(hw, 0) + 1
            if meta.get('bridge'):
                has_bridge = True
            if meta.get('tunnel'):
                has_tunnel = True

        return {
            'type': 'Feature',
            'geometry': {'type': 'LineString', 'coordinates': coords},
            'properties': {
                'vehicle_class':           vehicle_class,
                'total_distance_m':        round(total_m),
                'estimated_travel_min':    round(total_s / 60.0, 1),
                'road_types':              road_type_counts,
                'crosses_bridge':          has_bridge,
                'crosses_tunnel':          has_tunnel,
                'snap_distance_start_m':   round(start_snap),
                'snap_distance_end_m':     round(end_snap),
            },
        }

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _compute)


async def get_support_nodes(bbox: tuple, node_type: str = 'all') -> dict:
    """
    Logistics and medical support nodes within the bbox from OSM.
    Queries both point and polygon tables (polygon centroids).
    """
    west, south, east, north = bbox

    _FILTERS = {
        'medical':  "amenity IN ('hospital','clinic','doctors','pharmacy','dentist')",
        'fuel':     "amenity = 'fuel'",
        'water':    "natural = 'spring' OR amenity IN ('water_point','drinking_water')",
        'all':      (
            "amenity IN ('hospital','clinic','doctors','pharmacy','fuel',"
            "'water_point','drinking_water') OR natural = 'spring'"
        ),
    }
    where = _FILTERS.get(node_type, _FILTERS['all'])

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
                osm_id::text AS osm_id,
                COALESCE(name, 'Unknown') AS name,
                COALESCE(amenity, "natural") AS category,
                ST_AsGeoJSON(ST_Transform(way, 4326)) AS geometry
            FROM planet_osm_point
            WHERE ST_Intersects(
                way,
                ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3067)
            )
            AND ({where})
            UNION ALL
            SELECT
                osm_id::text AS osm_id,
                COALESCE(name, 'Unknown') AS name,
                COALESCE(amenity, "natural") AS category,
                ST_AsGeoJSON(ST_Transform(ST_Centroid(way), 4326)) AS geometry
            FROM planet_osm_polygon
            WHERE ST_Intersects(
                way,
                ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3067)
            )
            AND ({where})
            LIMIT 500
            """,
            west, south, east, north,
        )

    features = []
    for row in rows:
        try:
            geom = json.loads(row['geometry'])
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': {
                    'osm_id':   row['osm_id'],
                    'name':     row['name'],
                    'category': row['category'],
                    'type':     node_type,
                },
            })
        except Exception:
            continue

    return {'type': 'FeatureCollection', 'features': features}
