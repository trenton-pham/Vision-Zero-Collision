from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import from_wkb

from backend.app.dataset import (
    EXPECTED_NEIGHBORHOODS,
    EXPECTED_TOTAL,
    VERSION,
    aggregate_annual,
    aggregate_monthly,
    assign,
    dashboard_geojson,
    load_neighborhoods,
    partial_years,
    sha256,
)


ROOT = Path(__file__).resolve().parents[2]
COLLISIONS = ROOT / "data/processed/Collision_Processed.parquet"
NEIGHBORHOODS = ROOT / "data/processed/Neighborhood_Map_Atlas_Neighborhoods.geojson"
OUTPUT = ROOT / "data/dashboard"
EXPECTED_ASSIGNMENTS = {"direct": 104_579, "nearest": 1_193, "unassigned": 278}


def load_sources() -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    raw = pd.read_parquet(COLLISIONS)
    geometry = gpd.GeoSeries(from_wkb(raw.pop("geometry")), crs="EPSG:4326")
    points = gpd.GeoDataFrame(raw, geometry=geometry, crs="EPSG:4326")

    polygons = load_neighborhoods(NEIGHBORHOODS)
    if len(points) != EXPECTED_TOTAL:
        raise RuntimeError(f"Expected {EXPECTED_TOTAL:,} collisions; found {len(points):,}.")
    if len(polygons) != EXPECTED_NEIGHBORHOODS or polygons["id"].nunique() != EXPECTED_NEIGHBORHOODS:
        raise RuntimeError("Neighborhood source must contain exactly 94 unique S_HOOD polygons.")
    return points, polygons


def build(output: Path, enforce_baseline: bool = True) -> dict[str, object]:
    points, polygons = load_sources()
    assignment = assign(points, polygons)
    frame = pd.concat([points.drop(columns="geometry"), assignment], axis=1)
    counts = assignment["assignment_method"].value_counts().to_dict()
    counts = {key: int(counts.get(key, 0)) for key in EXPECTED_ASSIGNMENTS}
    if enforce_baseline and counts != EXPECTED_ASSIGNMENTS:
        raise RuntimeError(f"Assignment regression: expected {EXPECTED_ASSIGNMENTS}, found {counts}.")

    output.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(output / "collisions_assigned.parquet", index=False)
    aggregate_annual(frame, polygons).to_parquet(output / "neighborhood_annual.parquet", index=False)
    aggregate_monthly(frame, polygons).to_parquet(output / "context_monthly.parquet", index=False)

    clean_geojson = dashboard_geojson(polygons)
    (output / "neighborhoods.geojson").write_text(json.dumps(clean_geojson, separators=(",", ":")))

    data_as_of_date = pd.to_datetime(points["INCDATE"], utc=True).max().date()
    data_as_of = data_as_of_date.isoformat()
    built_at = datetime.now(timezone.utc).isoformat()
    collision_hash = sha256(COLLISIONS)
    manifest = {
        "artifactVersion": VERSION,
        "datasetVersion": f"artifact-{collision_hash[:16]}",
        "builtAt": built_at,
        "lastPublishedAt": built_at,
        "dataAsOf": data_as_of,
        "sourceHashes": {
            str(COLLISIONS.relative_to(ROOT)): collision_hash,
            str(NEIGHBORHOODS.relative_to(ROOT)): sha256(NEIGHBORHOODS),
        },
        "availableYears": sorted(int(v) for v in frame["YEAR"].dropna().unique()),
        "partialYears": partial_years(data_as_of_date),
        "knownTimeNightShare": True,
        "collisionCount": len(frame),
        "neighborhoodCount": len(polygons),
        "assignmentCounts": counts,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build deterministic dashboard artifacts.")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--allow-baseline-drift", action="store_true")
    args = parser.parse_args()
    result = build(args.output, enforce_baseline=not args.allow_baseline_drift)
    print(json.dumps(result, indent=2))
