from __future__ import annotations

import os
from uuid import uuid4

import pandas as pd
import pytest

from backend.app.mongo_writer import MongoDatasetWriter
from backend.app.repository import DatasetBundle, MongoDatasetRepository


pytestmark = pytest.mark.skipif(
    not os.getenv("MONGODB_TEST_URI"),
    reason="MONGODB_TEST_URI is required for MongoDB integration tests",
)


def bundle(version: str, collision_count: int = 1) -> DatasetBundle:
    collisions = pd.DataFrame([
        {
            "OBJECTID": index,
            "INCKEY": index,
            "COLDETKEY": index,
            "MAXSEVERITYDESC": "Property Damage Only Collision",
            "INJURIES": 0,
            "SERIOUSINJURIES": 0,
            "FATALITIES": 0,
            "PEDCOUNT": 0,
            "INCDATE": pd.Timestamp("2026-01-01", tz="UTC"),
            "MODDTTM": pd.Timestamp("2026-01-02", tz="UTC"),
            "JUNCTIONTYPE": "Unknown",
            "YEAR": 2026,
            "MONTH": 1,
            "HOUR": 12,
            "Day_of_Week": "Thursday",
            "X": -122.33,
            "Y": 47.60,
            "neighborhood_id": "test",
            "neighborhood_name": "Test",
            "assignment_method": "direct",
            "assignment_distance_m": 0.0,
        }
        for index in range(1, collision_count + 1)
    ])
    metric = {
        "neighborhood_id": "citywide",
        "YEAR": 2026,
        "collision_count": collision_count,
        "injuries": 0,
        "serious_injuries": 0,
        "fatalities": 0,
        "total_severity": 0,
        "pedestrian_collisions": 0,
        "intersection_collisions": 0,
        "night_collisions": 0,
        "weekend_collisions": 0,
        "mean_severity": 0.0,
    }
    annual = pd.DataFrame([metric])
    monthly = pd.DataFrame([{**metric, "MONTH": 1, "period": "2026-01"}])
    manifest = {
        "artifactVersion": "test-v1",
        "datasetVersion": version,
        "builtAt": "2026-02-08T11:17:00+00:00",
        "lastPublishedAt": None,
        "dataAsOf": "2026-01-01",
        "availableYears": [2026],
        "partialYears": [2026],
        "collisionCount": collision_count,
        "neighborhoodCount": 1,
        "assignmentCounts": {"direct": collision_count},
    }
    geojson = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"id": "test", "name": "Test", "largeNeighborhood": "Test"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[-122.4, 47.5], [-122.3, 47.5], [-122.3, 47.7], [-122.4, 47.5]]],
            },
        }],
    }
    return DatasetBundle(manifest, collisions, annual, monthly, geojson)


def test_version_publication_loading_and_rollback() -> None:
    uri = os.environ["MONGODB_TEST_URI"]
    database = f"collision_test_{uuid4().hex}"
    writer = MongoDatasetWriter(uri, database)
    repository = MongoDatasetRepository(uri, database)
    try:
        first = bundle("v1")
        assert writer.publish(first, "v1", "hash-v1", {})["status"] == "published"
        assert repository.active_version() == "v1"
        assert writer.database.collisions.find_one({"datasetVersion": "v1"})["geometry"] == {
            "type": "Point",
            "coordinates": [-122.33, 47.60],
        }
        assert len(repository.load_active().collisions) == 1

        second = bundle("v2", collision_count=2)
        assert writer.publish(second, "v2", "hash-v2", {})["status"] == "published"
        assert repository.active_version() == "v2"
        assert len(repository.load_active().collisions) == 2

        assert writer.rollback()["datasetVersion"] == "v1"
        assert repository.active_version() == "v1"
    finally:
        repository.close()
        writer.client.drop_database(database)
        writer.close()


def test_failed_version_never_replaces_active_pointer() -> None:
    uri = os.environ["MONGODB_TEST_URI"]
    database = f"collision_test_{uuid4().hex}"
    writer = MongoDatasetWriter(uri, database)
    try:
        first = bundle("v1")
        writer.publish(first, "v1", "hash-v1", {})
        broken = bundle("broken", collision_count=2)
        broken.annual.loc[0, "collision_count"] = 1
        with pytest.raises(RuntimeError, match="Annual citywide"):
            writer.publish(broken, "broken", "hash-broken", {})
        assert writer.database.dataset_state.find_one({"_id": "active"})["activeVersion"] == "v1"
        assert writer.database.collisions.count_documents({"datasetVersion": "broken"}) == 0
        failed_run = writer.database.ingestion_runs.find_one({"_id": "broken"})
        assert failed_run["status"] == "failed"
        assert "Annual citywide" in failed_run["error"]
    finally:
        writer.client.drop_database(database)
        writer.close()


def test_no_change_run_does_not_create_or_switch_a_snapshot() -> None:
    uri = os.environ["MONGODB_TEST_URI"]
    database = f"collision_test_{uuid4().hex}"
    writer = MongoDatasetWriter(uri, database)
    try:
        writer.publish(bundle("v1"), "v1", "same-hash", {})
        result = writer.publish(bundle("v2"), "v2", "same-hash", {})
        assert result["status"] == "no_change"
        assert result["datasetVersion"] == "v1"
        assert writer.database.dataset_state.find_one({"_id": "active"})["activeVersion"] == "v1"
        assert writer.database.ingestion_runs.find_one({"_id": "v1"})["status"] == "published"
        assert writer.database.ingestion_runs.count_documents({"status": "no_change"}) == 1
        assert writer.database.collisions.count_documents({"datasetVersion": "v2"}) == 0
    finally:
        writer.client.drop_database(database)
        writer.close()


def test_large_source_row_decrease_requires_manual_override() -> None:
    uri = os.environ["MONGODB_TEST_URI"]
    database = f"collision_test_{uuid4().hex}"
    writer = MongoDatasetWriter(uri, database)
    try:
        writer.publish(
            bundle("v1", collision_count=1),
            "v1",
            "hash-v1",
            {"sourceFeatureCount": 100},
        )
        changed = bundle("v2", collision_count=2)
        with pytest.raises(RuntimeError, match="manual override required"):
            writer.publish(
                changed,
                "v2",
                "hash-v2",
                {"sourceFeatureCount": 98},
            )
        assert writer.database.dataset_state.find_one({"_id": "active"})["activeVersion"] == "v1"

        result = writer.publish(
            changed,
            "v2",
            "hash-v2",
            {"sourceFeatureCount": 98},
            allow_row_decrease=True,
        )
        assert result["status"] == "published"
        assert writer.database.dataset_state.find_one({"_id": "active"})["activeVersion"] == "v2"
    finally:
        writer.client.drop_database(database)
        writer.close()
