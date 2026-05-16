#!/usr/bin/env python3
"""
One-time ingestion of GTK maapera_200k_maalajit into PostGIS gtk_soil table.
Run from backend/ directory: python scripts/ingest_soil.py
Re-run quarterly when GTK publishes a dataset update.
"""
import asyncio
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
import httpx

from core.config import settings
from services.soil import (
    GTK_WFS, TYPENAME, FEAT_NS,
    _parse_geometry, _classify,
)

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS gtk_soil (
    id SERIAL PRIMARY KEY,
    objectid TEXT,
    pintamaalaji_koodi TEXT,
    pintamaalaji TEXT,
    pohjamaalaji_koodi TEXT,
    pohjamaalaji TEXT,
    shape_area DOUBLE PRECISION,
    shape_len DOUBLE PRECISION,
    deposit_type TEXT,
    peat_depth TEXT,
    digging_suitability TEXT,
    trafficability_dry TEXT,
    trafficability_wet TEXT,
    concealment_potential TEXT,
    groundwater_risk BOOLEAN,
    geom geometry(GEOMETRY, 4326)
);
CREATE INDEX IF NOT EXISTS gtk_soil_geom_idx ON gtk_soil USING GIST (geom);
"""

INSERT_SQL = """
INSERT INTO gtk_soil (
    objectid, pintamaalaji_koodi, pintamaalaji,
    pohjamaalaji_koodi, pohjamaalaji,
    shape_area, shape_len,
    deposit_type, peat_depth, digging_suitability,
    trafficability_dry, trafficability_wet,
    concealment_potential, groundwater_risk, geom
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12, $13, $14,
    ST_GeomFromGeoJSON($15)
)
ON CONFLICT DO NOTHING
"""


def _parse_page(raw_xml: str) -> list[tuple]:
    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as exc:
        print(f"  XML parse error: {exc}")
        return []

    rows = []
    for feat_elem in root.iter(f"{{{FEAT_NS}}}maapera_200k_maalajit"):
        def _text(field: str) -> str:
            el = feat_elem.find(f"{{{FEAT_NS}}}{field}")
            return (el.text or "").strip() if el is not None else ""

        geom = _parse_geometry(feat_elem)
        if geom is None:
            continue

        code = _text("PINTAMAALAJI_KOODI")
        t = _classify(code)

        def _f(s: str) -> float | None:
            try:
                return float(s) if s else None
            except ValueError:
                return None

        rows.append((
            _text("OBJECTID"),
            code,
            _text("PINTAMAALAJI"),
            _text("POHJAMAALAJI_KOODI"),
            _text("POHJAMAALAJI"),
            _f(_text("SHAPE.AREA")),
            _f(_text("SHAPE.LEN")),
            t["deposit_type"],
            t["peat_depth"],
            t["digging_suitability"],
            t["trafficability_dry"],
            t["trafficability_wet"],
            t["concealment_potential"],
            t["groundwater_risk"],
            json.dumps(geom, ensure_ascii=False),
        ))
    return rows


async def main():
    conn = await asyncpg.connect(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        database=settings.DB_NAME,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
    )
    print("Creating gtk_soil table and index...")
    await conn.execute(CREATE_SQL)

    total = 0
    start_index = 0
    page_size = 500

    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            params = {
                "SERVICE":     "WFS",
                "VERSION":     "1.1.0",
                "REQUEST":     "GetFeature",
                "TYPENAME":    TYPENAME,
                "SRSNAME":     "urn:ogc:def:crs:EPSG::4326",
                "maxFeatures": page_size,
                "startIndex":  start_index,
            }
            print(f"  Page startIndex={start_index} ...", end=" ", flush=True)
            try:
                r = await client.get(GTK_WFS, params=params)
                r.raise_for_status()
            except Exception as exc:
                print(f"FAILED: {exc}")
                break

            rows = _parse_page(r.text)
            print(f"{len(rows)} features")

            if rows:
                await conn.executemany(INSERT_SQL, rows)
                total += len(rows)

            if len(rows) < page_size:
                break
            start_index += page_size

    count = await conn.fetchval("SELECT COUNT(*) FROM gtk_soil")
    await conn.close()
    print(f"\nDone. Inserted {total} rows this run. Total in gtk_soil: {count}")


if __name__ == "__main__":
    asyncio.run(main())
