from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4
from zoneinfo import ZoneInfo

import geopandas as gpd
import httpx
import pandas as pd

from backend.app.config import Settings
from backend.app.mongo_writer import MongoDatasetWriter
from backend.app.repository import DatasetBundle
from backend.scripts.build_artifacts import (
    NEIGHBORHOODS,
    EXPECTED_TOTAL,
    VERSION,
    aggregate_annual,
    aggregate_monthly,
    assign,
    slugify,
)


START_DATE = "2015-01-01"
BATCH_SIZE = 1_000
SEATTLE_BOUNDS = (-122.45, 47.45, -122.20, 47.75)
SOURCE_FIELDS = [
    "OBJECTID",
    "INCKEY",
    "COLDETKEY",
    "MAXSEVERITYDESC",
    "INJURIES",
    "SERIOUSINJURIES",
    "FATALITIES",
    "PEDCOUNT",
    "INCDATE",
    "INCDTTM",
    "JUNCTIONTYPE",
    "MODDTTM",
]
REQUIRED_FIELD_TYPES = {
    "OBJECTID": "esriFieldTypeOID",
    "INCKEY": "esriFieldTypeInteger",
    "COLDETKEY": "esriFieldTypeInteger",
    "MAXSEVERITYDESC": "esriFieldTypeString",
    "INJURIES": "esriFieldTypeInteger",
    "SERIOUSINJURIES": "esriFieldTypeInteger",
    "FATALITIES": "esriFieldTypeInteger",
    "PEDCOUNT": "esriFieldTypeInteger",
    "INCDATE": "esriFieldTypeDate",
    "INCDTTM": "esriFieldTypeString",
    "JUNCTIONTYPE": "esriFieldTypeString",
    "MODDTTM": "esriFieldTypeDate",
}


def batched(values: list[int], size: int = BATCH_SIZE) -> Iterable[list[int]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


class ArcGISClient:
    def __init__(self, layer_url: str, client: httpx.Client | None = None):
        self.layer_url = layer_url.rstrip("/")
        self.client = client or httpx.Client(
            timeout=httpx.Timeout(60, connect=15),
            headers={"User-Agent": "seattle-collision-dashboard/3.0"},
            follow_redirects=True,
        )
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self.client.close()

    def _get_json(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(5):
            try:
                response = self.client.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
                if "error" in payload:
                    raise RuntimeError(f"ArcGIS error: {payload['error']}")
                return payload
            except (httpx.HTTPError, ValueError, RuntimeError) as error:
                last_error = error
                if attempt == 4:
                    break
                time.sleep(min(2 ** attempt, 8) + attempt * 0.1)
        raise RuntimeError(f"ArcGIS request failed after retries: {last_error}") from last_error

    def metadata(self) -> dict[str, Any]:
        return self._get_json(self.layer_url, {"f": "json"})

    @staticmethod
    def validate_schema(metadata: dict[str, Any]) -> None:
        if metadata.get("geometryType") != "esriGeometryPoint":
            raise RuntimeError("ArcGIS layer must contain point geometry")
        available = {field["name"]: field["type"] for field in metadata.get("fields", [])}
        missing = sorted(set(REQUIRED_FIELD_TYPES) - set(available))
        changed = {
            name: {"expected": expected, "actual": available.get(name)}
            for name, expected in REQUIRED_FIELD_TYPES.items()
            if name in available and available[name] != expected
        }
        if missing or changed:
            raise RuntimeError(f"ArcGIS schema drift detected; missing={missing}, changed={changed}")

    @staticmethod
    def last_edit(metadata: dict[str, Any]) -> int:
        editing = metadata.get("editingInfo") or {}
        value = editing.get("lastEditDate")
        if value is None:
            raise RuntimeError("ArcGIS layer metadata does not expose editingInfo.lastEditDate")
        return int(value)

    def object_ids(self) -> list[int]:
        payload = self._get_json(
            f"{self.layer_url}/query",
            {
                "f": "json",
                "where": f"INCDATE >= DATE '{START_DATE}'",
                "returnIdsOnly": "true",
            },
        )
        ids = payload.get("objectIds")
        if not isinstance(ids, list):
            raise RuntimeError("ArcGIS object ID query returned no objectIds array")
        normalized = sorted(int(value) for value in ids)
        if len(normalized) != len(set(normalized)):
            raise RuntimeError("ArcGIS object ID query returned duplicates")
        return normalized

    def features(self, object_ids: list[int]) -> dict[str, Any]:
        collections: list[dict[str, Any]] = []
        returned_ids: list[int] = []
        for batch in batched(object_ids):
            payload = self._get_json(
                f"{self.layer_url}/query",
                {
                    "f": "geojson",
                    "objectIds": ",".join(str(value) for value in batch),
                    "outFields": ",".join(SOURCE_FIELDS),
                    "returnGeometry": "true",
                    "outSR": "4326",
                },
            )
            features = payload.get("features")
            if not isinstance(features, list):
                raise RuntimeError("ArcGIS feature query returned no features array")
            collections.extend(features)
            returned_ids.extend(int(feature["properties"]["OBJECTID"]) for feature in features)

        if sorted(returned_ids) != object_ids:
            missing = sorted(set(object_ids) - set(returned_ids))[:10]
            unexpected = sorted(set(returned_ids) - set(object_ids))[:10]
            raise RuntimeError(
                f"ArcGIS feature IDs did not reconcile; missing={missing}, unexpected={unexpected}"
            )
        return {"type": "FeatureCollection", "features": collections}

    def download_consistent_snapshot(self) -> tuple[dict[str, Any], dict[str, Any]]:
        for attempt in range(3):
            before = self.metadata()
            self.validate_schema(before)
            before_edit = self.last_edit(before)
            ids = self.object_ids()
            collection = self.features(ids)
            after = self.metadata()
            self.validate_schema(after)
            after_edit = self.last_edit(after)
            if before_edit == after_edit:
                return collection, {
                    "layerUrl": self.layer_url,
                    "lastEditDate": after_edit,
                    "sourceFeatureCount": len(ids),
                    "downloadAttempt": attempt + 1,
                }
        raise RuntimeError("ArcGIS source changed during all three download attempts")


def _parse_arcgis_date(values: pd.Series, name: str, *, required: bool) -> pd.Series:
    numeric = pd.to_numeric(values, errors="coerce")
    if values.notna().any() and numeric.notna().sum() == values.notna().sum():
        parsed = pd.to_datetime(numeric, unit="ms", utc=True, errors="coerce")
    else:
        parsed = pd.to_datetime(values, format="mixed", utc=True, errors="coerce")
    invalid = values.notna() & parsed.isna()
    if invalid.any() or (required and parsed.isna().any()):
        raise RuntimeError(f"{name} contains invalid or missing dates")
    return parsed


def clean_features(collection: dict[str, Any]) -> tuple[gpd.GeoDataFrame, dict[str, Any]]:
    points = gpd.GeoDataFrame.from_features(collection, crs="EPSG:4326")
    if points.empty:
        raise RuntimeError("ArcGIS returned no collision records")

    for key in ("OBJECTID", "INCKEY", "COLDETKEY"):
        points[key] = pd.to_numeric(points[key], errors="coerce")
        if points[key].isna().any():
            raise RuntimeError(f"ArcGIS records contain missing {key} values")
    if points["COLDETKEY"].duplicated().any():
        raise RuntimeError("ArcGIS records contain duplicate COLDETKEY values")

    count_columns = ["INJURIES", "SERIOUSINJURIES", "FATALITIES", "PEDCOUNT"]
    for column in count_columns:
        points[column] = pd.to_numeric(points[column], errors="coerce")
    if points[count_columns].isna().any().any():
        raise RuntimeError("ArcGIS records contain missing collision count values")
    if points[count_columns].lt(0).any().any():
        raise RuntimeError("ArcGIS records contain negative collision count values")

    points["INCDATE"] = _parse_arcgis_date(points["INCDATE"], "INCDATE", required=True)
    points["MODDTTM"] = _parse_arcgis_date(points["MODDTTM"], "MODDTTM", required=False)
    incident_time = pd.to_datetime(points["INCDTTM"], format="mixed", errors="coerce")
    if incident_time.isna().mean() > 0.50:
        raise RuntimeError("More than half of ArcGIS INCDTTM values are missing or invalid")

    today = pd.Timestamp.now(tz="America/Los_Angeles").date()
    if points["INCDATE"].dt.date.gt(today).any():
        raise RuntimeError("ArcGIS records contain incident dates in the future")
    if points["MAXSEVERITYDESC"].isna().mean() > 0.01:
        raise RuntimeError("More than 1% of ArcGIS severity descriptions are missing")

    points["JUNCTIONTYPE"] = points["JUNCTIONTYPE"].astype("string").str.strip().fillna("Unknown")
    points["YEAR"] = points["INCDATE"].dt.year.astype(int)
    points["MONTH"] = points["INCDATE"].dt.month.astype(int)
    points["HOUR"] = incident_time.dt.hour
    points["Day_of_Week"] = points["INCDATE"].dt.day_name()

    min_x, min_y, max_x, max_y = SEATTLE_BOUNDS
    geometry_valid = (
        points.geometry.notna()
        & ~points.geometry.is_empty
        & points.geometry.is_valid
        & points.geometry.geom_type.eq("Point")
    )
    valid_points = points.loc[geometry_valid].copy()
    within_seattle = (
        valid_points.geometry.x.between(min_x, max_x)
        & valid_points.geometry.y.between(min_y, max_y)
    )
    valid_points = valid_points.loc[within_seattle].copy()
    excluded = len(points) - len(valid_points)
    if valid_points.empty:
        raise RuntimeError("No valid Seattle point geometry remained after cleaning")

    valid_points["X"] = valid_points.geometry.x
    valid_points["Y"] = valid_points.geometry.y
    valid_points = valid_points.sort_values("COLDETKEY").reset_index(drop=True)
    return valid_points, {
        "sourceRows": len(points),
        "geometryExcludedRows": excluded,
        "missingSeverityRows": int(valid_points["MAXSEVERITYDESC"].isna().sum()),
    }


def load_neighborhoods() -> gpd.GeoDataFrame:
    polygons = gpd.read_file(NEIGHBORHOODS).to_crs("EPSG:4326")
    polygons = polygons[["S_HOOD", "L_HOOD", "geometry"]].copy()
    polygons["id"] = polygons["S_HOOD"].map(slugify)
    polygons["name"] = polygons["S_HOOD"].astype(str)
    polygons = polygons.sort_values(["id", "name"]).reset_index(drop=True)
    if len(polygons) != 94 or polygons["id"].nunique() != 94:
        raise RuntimeError("Neighborhood source must contain exactly 94 unique S_HOOD polygons")
    return polygons


def _dashboard_geojson(polygons: gpd.GeoDataFrame) -> dict[str, Any]:
    collection = json.loads(polygons[["id", "name", "L_HOOD", "geometry"]].to_json())
    for feature in collection["features"]:
        feature["properties"] = {
            "id": feature["properties"]["id"],
            "name": feature["properties"]["name"],
            "largeNeighborhood": feature["properties"]["L_HOOD"],
        }
    return collection


def _content_hash(frame: pd.DataFrame) -> str:
    columns = [
        "OBJECTID", "INCKEY", "COLDETKEY", "MAXSEVERITYDESC", "INJURIES",
        "SERIOUSINJURIES", "FATALITIES", "PEDCOUNT", "INCDATE", "MODDTTM",
        "JUNCTIONTYPE", "YEAR", "MONTH", "HOUR", "Day_of_Week", "X", "Y",
        "neighborhood_id", "assignment_method", "assignment_distance_m",
    ]
    normalized = frame[[column for column in columns if column in frame.columns]].copy()
    for column in ("INCDATE", "MODDTTM"):
        if column in normalized:
            normalized[column] = normalized[column].astype("string")
    payload = normalized.sort_values("COLDETKEY").to_json(
        orient="records", date_format="iso", double_precision=10
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def build_bundle(
    collection: dict[str, Any],
    source_metadata: dict[str, Any],
) -> tuple[DatasetBundle, str, dict[str, Any]]:
    points, quality = clean_features(collection)
    polygons = load_neighborhoods()
    assignment = assign(points, polygons)
    frame = pd.concat([points.drop(columns="geometry"), assignment], axis=1)
    assignment_counts = {
        key: int(value)
        for key, value in assignment["assignment_method"].value_counts().to_dict().items()
    }
    annual = aggregate_annual(frame, polygons)
    monthly = aggregate_monthly(frame, polygons)
    data_as_of = pd.to_datetime(frame["INCDATE"], utc=True).max().date()
    available_years = sorted(int(value) for value in frame["YEAR"].unique())
    content_hash = _content_hash(frame)
    built_at = datetime.now(timezone.utc)
    version = f"{built_at.strftime('%Y%m%dT%H%M%SZ')}-{content_hash[:12]}"
    warnings = []
    if quality["geometryExcludedRows"]:
        warnings.append(
            f"Excluded {quality['geometryExcludedRows']:,} source rows without accepted Seattle point geometry"
        )
    if quality["missingSeverityRows"]:
        warnings.append(
            f"Retained {quality['missingSeverityRows']:,} rows with an unknown severity description"
        )
    manifest = {
        "artifactVersion": VERSION,
        "datasetVersion": version,
        "builtAt": built_at.isoformat(),
        "lastPublishedAt": None,
        "dataAsOf": data_as_of.isoformat(),
        "availableYears": available_years,
        "partialYears": (
            [data_as_of.year]
            if data_as_of.year == datetime.now(ZoneInfo("America/Los_Angeles")).year
            else []
        ),
        "collisionCount": len(frame),
        "neighborhoodCount": len(polygons),
        "assignmentCounts": assignment_counts,
        "contentHash": content_hash,
        "warnings": warnings,
        "baselineComparison": {
            "checkedInCollisionCount": EXPECTED_TOTAL,
            "difference": len(frame) - EXPECTED_TOTAL,
        },
        "source": {**source_metadata, **quality},
    }
    citywide_annual = int(
        annual.loc[annual["neighborhood_id"] == "citywide", "collision_count"].sum()
    )
    citywide_monthly = int(
        monthly.loc[monthly["neighborhood_id"] == "citywide", "collision_count"].sum()
    )
    if citywide_annual != len(frame) or citywide_monthly != len(frame):
        raise RuntimeError("Generated annual and monthly totals do not reconcile")
    return DatasetBundle(manifest, frame, annual, monthly, _dashboard_geojson(polygons)), content_hash, quality


def run_sync(
    *,
    settings: Settings,
    dry_run: bool = False,
    allow_row_decrease: bool = False,
) -> dict[str, Any]:
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is required for collision synchronization")
    source = ArcGISClient(settings.arcgis_layer_url)
    writer = MongoDatasetWriter(settings.mongodb_uri, settings.mongodb_database)
    source_metadata: dict[str, Any] = {}
    bundle: DatasetBundle | None = None
    try:
        collection, source_metadata = source.download_consistent_snapshot()
        bundle, content_hash, _ = build_bundle(collection, source_metadata)
        result = writer.publish(
            bundle,
            str(bundle.manifest["datasetVersion"]),
            content_hash,
            source_metadata,
            dry_run=dry_run,
            allow_row_decrease=allow_row_decrease,
        )
        return {**result, "manifest": bundle.manifest}
    except Exception as error:
        run_id = (
            str(bundle.manifest["datasetVersion"])
            if bundle is not None
            else f"failed-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid4().hex[:8]}"
        )
        try:
            writer.record_failure(
                run_id,
                error,
                source_metadata=source_metadata,
                manifest=bundle.manifest if bundle is not None else None,
            )
        except Exception:
            # Preserve the original ingestion error when Atlas itself is unavailable.
            pass
        raise
    finally:
        source.close()
        writer.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synchronize SDOT collisions into MongoDB")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-row-decrease", action="store_true")
    parser.add_argument("--manifest-output", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output: dict[str, Any]
    try:
        output = run_sync(
            settings=Settings.from_env(),
            dry_run=args.dry_run,
            allow_row_decrease=args.allow_row_decrease,
        )
    except Exception as error:
        output = {
            "status": "failed",
            "failedAt": datetime.now(timezone.utc).isoformat(),
            "error": str(error),
        }
        if args.manifest_output:
            args.manifest_output.write_text(json.dumps(output, indent=2) + "\n")
        raise
    if args.manifest_output:
        args.manifest_output.write_text(json.dumps(output, indent=2, default=str) + "\n")
    print(json.dumps(output, indent=2, default=str))


if __name__ == "__main__":
    main()
