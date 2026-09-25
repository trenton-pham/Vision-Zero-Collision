from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Iterable
from uuid import uuid4

import numpy as np
import pandas as pd
from pymongo import ASCENDING, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError

from .repository import DatasetBundle


COLLISION_COLUMNS = [
    "OBJECTID",
    "INCKEY",
    "COLDETKEY",
    "MAXSEVERITYDESC",
    "INJURIES",
    "SERIOUSINJURIES",
    "FATALITIES",
    "PEDCOUNT",
    "INCDATE",
    "MODDTTM",
    "JUNCTIONTYPE",
    "YEAR",
    "MONTH",
    "HOUR",
    "Day_of_Week",
    "X",
    "Y",
    "neighborhood_id",
    "neighborhood_name",
    "assignment_method",
    "assignment_distance_m",
]


def _native(value: Any) -> Any:
    if value is None or value is pd.NA:
        return None
    try:
        if bool(pd.isna(value)):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, (np.integer, np.floating, np.bool_)):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value


def _batched(items: list[dict[str, Any]], size: int = 1_000) -> Iterable[list[dict[str, Any]]]:
    for offset in range(0, len(items), size):
        yield items[offset : offset + size]


class MongoDatasetWriter:
    def __init__(self, uri: str, database: str):
        self.client = MongoClient(
            uri,
            appname="seattle-collision-ingestion",
            serverSelectionTimeoutMS=15_000,
            connectTimeoutMS=15_000,
            retryWrites=True,
        )
        self.database = self.client[database]

    def close(self) -> None:
        self.client.close()

    def record_failure(
        self,
        run_id: str,
        error: Exception,
        *,
        source_metadata: dict[str, Any] | None = None,
        manifest: dict[str, Any] | None = None,
    ) -> None:
        update: dict[str, Any] = {
            "status": "failed",
            "failedAt": datetime.now(timezone.utc),
            "error": str(error),
            "source": source_metadata or {},
        }
        if manifest is not None:
            update["manifest"] = manifest
            update["contentHash"] = manifest.get("contentHash")
            update["warnings"] = list(manifest.get("warnings", []))
        self.database.ingestion_runs.update_one(
            {"_id": run_id},
            {"$set": update, "$setOnInsert": {"startedAt": datetime.now(timezone.utc)}},
            upsert=True,
        )

    def ensure_indexes(self) -> None:
        self.database.collisions.create_index(
            [("datasetVersion", ASCENDING), ("COLDETKEY", ASCENDING)],
            unique=True,
            name="version_collision_key",
        )
        self.database.collisions.create_index(
            [("datasetVersion", ASCENDING), ("YEAR", ASCENDING), ("MAXSEVERITYDESC", ASCENDING)],
            name="version_year_severity",
        )
        self.database.neighborhood_annual.create_index(
            [("datasetVersion", ASCENDING), ("neighborhood_id", ASCENDING), ("YEAR", ASCENDING)],
            unique=True,
            name="version_neighborhood_year",
        )
        self.database.context_monthly.create_index(
            [("datasetVersion", ASCENDING), ("neighborhood_id", ASCENDING), ("period", ASCENDING)],
            unique=True,
            name="version_neighborhood_period",
        )

    @staticmethod
    def _collision_documents(frame: pd.DataFrame, version: str) -> list[dict[str, Any]]:
        columns = [column for column in COLLISION_COLUMNS if column in frame.columns]
        documents: list[dict[str, Any]] = []
        for row in frame[columns].to_dict("records"):
            document = {key: _native(value) for key, value in row.items()}
            collision_key = int(document["COLDETKEY"])
            document.update({
                "_id": f"{version}:{collision_key}",
                "datasetVersion": version,
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(document["X"]), float(document["Y"])],
                },
            })
            documents.append(document)
        return documents

    @staticmethod
    def _metric_documents(
        frame: pd.DataFrame,
        version: str,
        monthly: bool,
    ) -> list[dict[str, Any]]:
        documents: list[dict[str, Any]] = []
        for row in frame.to_dict("records"):
            document = {key: _native(value) for key, value in row.items()}
            suffix = str(document["period"] if monthly else document["YEAR"])
            document.update({
                "_id": f"{version}:{document['neighborhood_id']}:{suffix}",
                "datasetVersion": version,
            })
            documents.append(document)
        return documents

    def _delete_version(self, version: str) -> None:
        for name in ("collisions", "neighborhood_annual", "context_monthly", "neighborhoods"):
            self.database[name].delete_many({"datasetVersion": version})

    def _validate_written_version(self, bundle: DatasetBundle, version: str) -> None:
        collision_count = self.database.collisions.count_documents({"datasetVersion": version})
        annual_count = self.database.neighborhood_annual.count_documents({"datasetVersion": version})
        monthly_count = self.database.context_monthly.count_documents({"datasetVersion": version})
        if collision_count != len(bundle.collisions):
            raise RuntimeError(f"MongoDB wrote {collision_count} of {len(bundle.collisions)} collisions")
        if annual_count != len(bundle.annual) or monthly_count != len(bundle.monthly):
            raise RuntimeError("MongoDB aggregate document count did not reconcile")

        aggregate_columns = [
            "neighborhood_id", "YEAR", "collision_count", "injuries", "serious_injuries",
            "fatalities", "total_severity", "pedestrian_collisions", "intersection_collisions",
            "night_collisions", "weekend_collisions", "mean_severity",
        ]
        monthly_columns = [*aggregate_columns, "MONTH", "period"]
        stored_annual = pd.DataFrame(list(self.database.neighborhood_annual.find(
            {"datasetVersion": version},
            {"_id": 0, "datasetVersion": 0},
        )))[aggregate_columns].sort_values(["neighborhood_id", "YEAR"]).reset_index(drop=True)
        stored_monthly = pd.DataFrame(list(self.database.context_monthly.find(
            {"datasetVersion": version},
            {"_id": 0, "datasetVersion": 0},
        )))[monthly_columns].sort_values(["neighborhood_id", "YEAR", "MONTH"]).reset_index(drop=True)
        expected_annual = bundle.annual[aggregate_columns].sort_values(
            ["neighborhood_id", "YEAR"]
        ).reset_index(drop=True)
        expected_monthly = bundle.monthly[monthly_columns].sort_values(
            ["neighborhood_id", "YEAR", "MONTH"]
        ).reset_index(drop=True)
        try:
            pd.testing.assert_frame_equal(stored_annual, expected_annual, check_dtype=False)
            pd.testing.assert_frame_equal(stored_monthly, expected_monthly, check_dtype=False)
        except AssertionError as error:
            raise RuntimeError("MongoDB aggregate values did not match the staged dataset") from error

        citywide_annual = list(self.database.neighborhood_annual.aggregate([
            {"$match": {"datasetVersion": version, "neighborhood_id": "citywide"}},
            {"$group": {"_id": None, "total": {"$sum": "$collision_count"}}},
        ]))
        citywide_monthly = list(self.database.context_monthly.aggregate([
            {"$match": {"datasetVersion": version, "neighborhood_id": "citywide"}},
            {"$group": {"_id": None, "total": {"$sum": "$collision_count"}}},
        ]))
        expected = len(bundle.collisions)
        if not citywide_annual or citywide_annual[0]["total"] != expected:
            raise RuntimeError("Annual citywide metrics do not reconcile with collisions")
        if not citywide_monthly or citywide_monthly[0]["total"] != expected:
            raise RuntimeError("Monthly citywide metrics do not reconcile with collisions")

    def publish(
        self,
        bundle: DatasetBundle,
        version: str,
        content_hash: str,
        source_metadata: dict[str, Any],
        *,
        dry_run: bool = False,
        allow_row_decrease: bool = False,
    ) -> dict[str, Any]:
        self.client.admin.command("ping")
        state = self.database.dataset_state.find_one({"_id": "active"})
        current_version = state.get("activeVersion") if state else None
        current_count = int(state.get("collisionCount", 0)) if state else 0
        current_source_count = int(state.get("sourceFeatureCount", current_count)) if state else 0
        current_data_as_of = state.get("dataAsOf") if state else None

        new_count = int(bundle.manifest["collisionCount"])
        new_source_count = int(source_metadata.get("sourceFeatureCount", new_count))
        new_data_as_of = str(bundle.manifest["dataAsOf"])
        if current_data_as_of and new_data_as_of < str(current_data_as_of):
            raise RuntimeError(
                f"Newest incident date moved backward from {current_data_as_of} to {new_data_as_of}"
            )
        if (
            current_source_count
            and new_source_count < current_source_count * 0.99
            and not allow_row_decrease
        ):
            decrease = current_source_count - new_source_count
            raise RuntimeError(
                f"Source row count decreased by {decrease:,} "
                f"({decrease / current_source_count:.2%}); "
                "manual override required"
            )
        if state and state.get("contentHash") == content_hash:
            result = {
                "status": "no_change",
                "datasetVersion": str(current_version),
                "collisionCount": new_count,
                "sourceFeatureCount": new_source_count,
                "dataAsOf": new_data_as_of,
                "contentHash": content_hash,
            }
            if not dry_run:
                run_id = f"{version}:no-change:{uuid4().hex}"
                self.database.ingestion_runs.replace_one(
                    {"_id": run_id},
                    {
                        "_id": run_id,
                        "status": "no_change",
                        "startedAt": datetime.now(timezone.utc),
                        "completedAt": datetime.now(timezone.utc),
                        "source": source_metadata,
                        "contentHash": content_hash,
                        "manifest": bundle.manifest,
                        "warnings": list(bundle.manifest.get("warnings", [])),
                        "activeVersion": current_version,
                    },
                    upsert=True,
                )
            return result

        result = {
            "status": "dry_run" if dry_run else "published",
            "datasetVersion": version,
            "previousVersion": current_version,
            "collisionCount": new_count,
            "sourceFeatureCount": new_source_count,
            "dataAsOf": new_data_as_of,
            "contentHash": content_hash,
        }
        if dry_run:
            return result

        self.ensure_indexes()
        started_at = datetime.now(timezone.utc)
        run_document = {
            "_id": version,
            "status": "staging",
            "startedAt": started_at,
            "source": source_metadata,
            "contentHash": content_hash,
            "manifest": bundle.manifest,
            "warnings": list(bundle.manifest.get("warnings", [])),
        }
        self.database.ingestion_runs.replace_one({"_id": version}, run_document, upsert=True)

        try:
            self._delete_version(version)
            for batch in _batched(self._collision_documents(bundle.collisions, version)):
                self.database.collisions.insert_many(batch, ordered=False)
            for batch in _batched(self._metric_documents(bundle.annual, version, monthly=False)):
                self.database.neighborhood_annual.insert_many(batch, ordered=False)
            for batch in _batched(self._metric_documents(bundle.monthly, version, monthly=True)):
                self.database.context_monthly.insert_many(batch, ordered=False)
            self.database.neighborhoods.insert_one({
                "_id": version,
                "datasetVersion": version,
                "geojson": bundle.geojson,
            })
            self._validate_written_version(bundle, version)
            self.database.ingestion_runs.update_one(
                {"_id": version},
                {"$set": {"status": "validated", "validatedAt": datetime.now(timezone.utc)}},
            )

            published_at = datetime.now(timezone.utc)
            new_state = {
                "activeVersion": version,
                "previousVersion": current_version,
                "dataAsOf": new_data_as_of,
                "collisionCount": new_count,
                "sourceFeatureCount": new_source_count,
                "contentHash": content_hash,
                "lastPublishedAt": published_at,
            }
            if state:
                updated = self.database.dataset_state.find_one_and_update(
                    {"_id": "active", "activeVersion": current_version},
                    {"$set": new_state},
                    return_document=ReturnDocument.AFTER,
                )
                if updated is None:
                    raise RuntimeError("Active dataset changed during publication; retry the sync")
            else:
                try:
                    self.database.dataset_state.insert_one({"_id": "active", **new_state})
                except DuplicateKeyError as error:
                    raise RuntimeError("Another process published the first dataset concurrently") from error

            # The active pointer is the publication boundary. A transient error
            # while annotating the run must not report a successful publication
            # as failed or invite a retry that stages an already-active version.
            try:
                self.database.ingestion_runs.update_one(
                    {"_id": version},
                    {"$set": {"status": "published", "publishedAt": published_at}},
                )
            except Exception:
                pass
        except Exception as error:
            active = self.database.dataset_state.find_one({"_id": "active"})
            if not active or active.get("activeVersion") != version:
                self._delete_version(version)
            self.record_failure(
                version,
                error,
                source_metadata=source_metadata,
                manifest=bundle.manifest,
            )
            raise

        keep = [item for item in (version, current_version) if item]
        cleanup_filter = {"datasetVersion": {"$nin": keep}}
        for name in ("collisions", "neighborhood_annual", "context_monthly", "neighborhoods"):
            try:
                self.database[name].delete_many(cleanup_filter)
            except Exception:
                self.database.ingestion_runs.update_one(
                    {"_id": version},
                    {"$addToSet": {"warnings": f"Could not prune old {name} documents"}},
                )
        return result

    def rollback(self) -> dict[str, Any]:
        state = self.database.dataset_state.find_one({"_id": "active"})
        if not state or not state.get("previousVersion"):
            raise RuntimeError("No previous published dataset is available")
        active = str(state["activeVersion"])
        previous = str(state["previousVersion"])
        run = self.database.ingestion_runs.find_one({"_id": previous})
        if not run or "manifest" not in run:
            raise RuntimeError(f"Previous dataset {previous!r} is not available for rollback")

        manifest = run["manifest"]
        stored_count = self.database.collisions.count_documents({"datasetVersion": previous})
        if stored_count != int(manifest["collisionCount"]):
            raise RuntimeError(f"Previous dataset {previous!r} failed collision-count validation")
        updated = self.database.dataset_state.find_one_and_update(
            {"_id": "active", "activeVersion": active, "previousVersion": previous},
            {"$set": {
                "activeVersion": previous,
                "previousVersion": active,
                "dataAsOf": manifest["dataAsOf"],
                "collisionCount": manifest["collisionCount"],
                "sourceFeatureCount": int(
                    (run.get("source") or {}).get("sourceFeatureCount", manifest["collisionCount"])
                ),
                "contentHash": run["contentHash"],
                "lastPublishedAt": datetime.now(timezone.utc),
            }},
            return_document=ReturnDocument.AFTER,
        )
        if updated is None:
            raise RuntimeError("Active dataset changed during rollback; retry")
        return {"status": "rolled_back", "datasetVersion": previous, "previousVersion": active}
