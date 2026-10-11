from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import geopandas as gpd
import pandas as pd


VERSION = "neighborhood-context-v3"
EXPECTED_TOTAL = 106_050
EXPECTED_NEIGHBORHOODS = 94


def partial_years(data_as_of: date, today: date | None = None) -> list[int]:
    today = today or datetime.now(ZoneInfo("America/Los_Angeles")).date()
    return [data_as_of.year] if (
        data_as_of.year == today.year
        or data_as_of < date(data_as_of.year, 12, 31)
    ) else []


def sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def load_neighborhoods(path: Path) -> gpd.GeoDataFrame:
    polygons = gpd.read_file(path).to_crs("EPSG:4326")
    polygons = polygons[["S_HOOD", "L_HOOD", "geometry"]].copy()
    polygons["id"] = polygons["S_HOOD"].map(slugify)
    polygons["name"] = polygons["S_HOOD"].astype(str)
    return polygons.sort_values(["id", "name"]).reset_index(drop=True)


def dashboard_geojson(polygons: gpd.GeoDataFrame) -> dict[str, Any]:
    collection = json.loads(polygons[["id", "name", "L_HOOD", "geometry"]].to_json())
    for feature in collection["features"]:
        feature["properties"] = {
            "id": feature["properties"]["id"],
            "name": feature["properties"]["name"],
            "largeNeighborhood": feature["properties"]["L_HOOD"],
        }
    return collection


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
    enriched["intersection"] = enriched["JUNCTIONTYPE"].str.startswith("At Intersection", na=False)
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
