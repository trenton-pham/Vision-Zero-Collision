from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import geopandas as gpd
import pandas as pd
from shapely import from_wkb


ROOT = Path(__file__).resolve().parents[2]
COLLISIONS = ROOT / "data/processed/Collision_Processed.parquet"
NEIGHBORHOODS = ROOT / "data/processed/Neighborhood_Map_Atlas_Neighborhoods.geojson"
OUTPUT = ROOT / "data/dashboard"
VERSION = "neighborhood-context-v2"
EXPECTED_TOTAL = 106_050
EXPECTED_NEIGHBORHOODS = 94
EXPECTED_ASSIGNMENTS = {"direct": 104_579, "nearest": 1_193, "unassigned": 278}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def load_sources() -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    raw = pd.read_parquet(COLLISIONS)
    geometry = gpd.GeoSeries(from_wkb(raw.pop("geometry")), crs="EPSG:4326")
    points = gpd.GeoDataFrame(raw, geometry=geometry, crs="EPSG:4326")

    polygons = gpd.read_file(NEIGHBORHOODS).to_crs("EPSG:4326")
    polygons = polygons[["S_HOOD", "L_HOOD", "geometry"]].copy()
    polygons["id"] = polygons["S_HOOD"].map(slugify)
    polygons["name"] = polygons["S_HOOD"].astype(str)
    polygons = polygons.sort_values(["id", "name"]).reset_index(drop=True)
    if len(points) != EXPECTED_TOTAL:
        raise RuntimeError(f"Expected {EXPECTED_TOTAL:,} collisions; found {len(points):,}.")
    if len(polygons) != EXPECTED_NEIGHBORHOODS or polygons["id"].nunique() != EXPECTED_NEIGHBORHOODS:
        raise RuntimeError("Neighborhood source must contain exactly 94 unique S_HOOD polygons.")
    return points, polygons


def assign(points: gpd.GeoDataFrame, polygons: gpd.GeoDataFrame) -> pd.DataFrame:
    indexed_polygons = polygons[["id", "name", "geometry"]].copy()
    indexed_polygons["polygon_area"] = indexed_polygons.to_crs("EPSG:26910").area.values

    direct = gpd.sjoin(points[["geometry"]], indexed_polygons, how="left", predicate="within")
    direct = direct.reset_index(names="collision_index")
    direct = direct.sort_values(["collision_index", "polygon_area", "id"], na_position="last")
    direct = direct.drop_duplicates("collision_index", keep="first").set_index("collision_index")

    assigned = pd.DataFrame(index=points.index)
    assigned["neighborhood_id"] = direct["id"]
    assigned["neighborhood_name"] = direct["name"]
    assigned["assignment_method"] = assigned["neighborhood_id"].notna().map({True: "direct", False: "unassigned"})
    assigned["assignment_distance_m"] = 0.0

    unresolved_idx = assigned.index[assigned["neighborhood_id"].isna()]
    if len(unresolved_idx):
        projected_points = points.loc[unresolved_idx, ["geometry"]].to_crs("EPSG:26910")
        projected_polygons = indexed_polygons.to_crs("EPSG:26910")
        nearest = gpd.sjoin_nearest(
            projected_points,
            projected_polygons,
            how="left",
            max_distance=25,
            distance_col="assignment_distance_m",
        )
        nearest = nearest.reset_index(names="collision_index")
        nearest = nearest.sort_values(
            ["collision_index", "assignment_distance_m", "polygon_area", "id"],
            na_position="last",
        ).drop_duplicates("collision_index", keep="first")
        nearest = nearest.set_index("collision_index")
        matched = nearest[nearest["id"].notna()]
        assigned.loc[matched.index, "neighborhood_id"] = matched["id"]
        assigned.loc[matched.index, "neighborhood_name"] = matched["name"]
        assigned.loc[matched.index, "assignment_method"] = "nearest"
        assigned.loc[matched.index, "assignment_distance_m"] = matched["assignment_distance_m"]

    assigned.loc[assigned["neighborhood_id"].isna(), "assignment_distance_m"] = pd.NA
    return assigned


def add_metric_columns(frame: pd.DataFrame) -> pd.DataFrame:
    enriched = frame.copy()
    enriched["severity_score"] = (
        enriched["INJURIES"].fillna(0)
        + 3 * enriched["SERIOUSINJURIES"].fillna(0)
        + 5 * enriched["FATALITIES"].fillna(0)
    )
    enriched["pedestrian_collision"] = enriched["PEDCOUNT"].fillna(0).gt(0)
    enriched["intersection"] = enriched["JUNCTIONTYPE"].fillna("").str.startswith("At Intersection")
    enriched["night"] = enriched["HOUR"].lt(6) | enriched["HOUR"].ge(20)
    enriched["weekend"] = enriched["Day_of_Week"].isin(["Saturday", "Sunday"])
    return enriched


def aggregate_metrics(frame: pd.DataFrame, groups: list[str]) -> pd.DataFrame:
    return frame.groupby(groups, observed=True).agg(
        collision_count=("INCKEY", "size"),
        injuries=("INJURIES", "sum"),
        serious_injuries=("SERIOUSINJURIES", "sum"),
        fatalities=("FATALITIES", "sum"),
        total_severity=("severity_score", "sum"),
        pedestrian_collisions=("pedestrian_collision", "sum"),
        intersection_collisions=("intersection", "sum"),
        night_collisions=("night", "sum"),
        weekend_collisions=("weekend", "sum"),
    )


def add_mean_severity(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame["mean_severity"] = frame["total_severity"].div(frame["collision_count"].replace(0, pd.NA))
    return frame


def aggregate_annual(frame: pd.DataFrame, polygons: gpd.GeoDataFrame) -> pd.DataFrame:
    years = range(int(frame["YEAR"].min()), int(frame["YEAR"].max()) + 1)
    enriched = add_metric_columns(frame)
    assigned = enriched[enriched["neighborhood_id"].notna()]
    index = pd.MultiIndex.from_product([polygons["id"], years], names=["neighborhood_id", "YEAR"])
    neighborhoods = aggregate_metrics(assigned, ["neighborhood_id", "YEAR"])
    neighborhoods = neighborhoods.reindex(index, fill_value=0).reset_index()

    citywide = aggregate_metrics(enriched, ["YEAR"]).reset_index()
    citywide.insert(0, "neighborhood_id", "citywide")
    annual = pd.concat([neighborhoods, citywide], ignore_index=True)
    annual = add_mean_severity(annual).sort_values(["neighborhood_id", "YEAR"]).reset_index(drop=True)
    return annual


def aggregate_monthly(frame: pd.DataFrame, polygons: gpd.GeoDataFrame) -> pd.DataFrame:
    enriched = add_metric_columns(frame)
    enriched["period"] = pd.to_datetime({
        "year": enriched["YEAR"].astype(int),
        "month": enriched["MONTH"].astype(int),
        "day": 1,
    }).dt.to_period("M")
    periods = pd.period_range(enriched["period"].min(), enriched["period"].max(), freq="M")
    assigned = enriched[enriched["neighborhood_id"].notna()]
    index = pd.MultiIndex.from_product([polygons["id"], periods], names=["neighborhood_id", "period"])
    neighborhoods = aggregate_metrics(assigned, ["neighborhood_id", "period"])
    neighborhoods = neighborhoods.reindex(index, fill_value=0).reset_index()

    citywide = aggregate_metrics(enriched, ["period"]).reset_index()
    citywide.insert(0, "neighborhood_id", "citywide")
    monthly = pd.concat([neighborhoods, citywide], ignore_index=True)
    monthly = add_mean_severity(monthly).sort_values(["neighborhood_id", "period"]).reset_index(drop=True)
    monthly["YEAR"] = monthly["period"].dt.year.astype(int)
    monthly["MONTH"] = monthly["period"].dt.month.astype(int)
    monthly["period"] = monthly["period"].astype(str)
    return monthly


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

    clean_geojson = json.loads(polygons[["id", "name", "L_HOOD", "geometry"]].to_json())
    for feature in clean_geojson["features"]:
        feature["properties"] = {
            "id": feature["properties"]["id"],
            "name": feature["properties"]["name"],
            "largeNeighborhood": feature["properties"]["L_HOOD"],
        }
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
        "partialYears": (
            [data_as_of_date.year]
            if data_as_of_date.year == datetime.now(ZoneInfo("America/Los_Angeles")).year
            else []
        ),
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
