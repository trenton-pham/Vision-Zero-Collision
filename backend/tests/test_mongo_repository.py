from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import Mock
from uuid import uuid4

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest

from backend.app.config import Settings
from backend.app.data import DataStore
from backend.app.dataset import aggregate_annual, aggregate_monthly
from backend.app.mongo_writer import MongoDatasetWriter, PublicationLockedError
from backend.app.repository import DatasetBundle, MongoDatasetRepository
from backend.scripts import sync_collisions


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
        loaded = repository.load_active().collisions
        assert len(loaded) == 1
        assert loaded.loc[0, "X"] == -122.33
        assert loaded.loc[0, "MAXSEVERITYDESC"] == "Property Damage Only Collision"
        assert loaded["MAXSEVERITYDESC"].dtype == "category"
        assert not {"_id", "datasetVersion", "geometry", "MODDTTM"}.intersection(loaded.columns)

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
        assert writer.database.dataset_state.find_one({"_id": "publication-lock"}) is None
    finally:
        writer.client.drop_database(database)
        writer.close()


def test_post_commit_annotation_failure_does_not_fail_publication(monkeypatch) -> None:
    writer = MongoDatasetWriter(os.environ["MONGODB_TEST_URI"], f"collision_test_{uuid4().hex}")
    collection_type = type(writer.database.ingestion_runs)
    update_one = collection_type.update_one

    def unavailable_annotation(collection, query, update, *args, **kwargs):
        if update.get("$set", {}).get("status") == "published":
            raise RuntimeError("Run annotation unavailable")
        return update_one(collection, query, update, *args, **kwargs)

    monkeypatch.setattr(collection_type, "update_one", unavailable_annotation)
    try:
        assert writer.publish(bundle("v1"), "v1", "hash-v1", {})["status"] == "published"
        assert writer.database.dataset_state.find_one({"_id": "active"})["activeVersion"] == "v1"
        assert writer.database.ingestion_runs.find_one({"_id": "v1"})["status"] == "validated"
        assert writer.database.collisions.count_documents({"datasetVersion": "v1"}) == 1
    finally:
        writer.client.drop_database(writer.database.name)
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
        assert writer.database.dataset_state.find_one({"_id": "publication-lock"}) is None
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


@pytest.fixture
def writers():
    uri = os.environ["MONGODB_TEST_URI"]
    database = f"collision_test_{uuid4().hex}"
    first = MongoDatasetWriter(uri, database)
    second = MongoDatasetWriter(uri, database)
    try:
        yield first, second
    finally:
        first.client.drop_database(database)
        first.close()
        second.close()


def assert_retained(writer, versions):
    for name in ("collisions", "neighborhood_annual", "context_monthly", "neighborhoods"):
        collection = writer.database[name]
        assert set(collection.distinct("datasetVersion")) == set(versions)
        for version, count in versions.items():
            assert collection.count_documents({"datasetVersion": version}) == (
                count if name == "collisions" else 1
            )


@pytest.mark.parametrize("phase", ["staging", "cleanup"])
def test_publication_excludes_other_writers_through_cleanup(writers, monkeypatch, phase):
    first, second = writers
    first.publish(bundle("v0"), "v0", "hash-v0", {})
    paused, resume = Event(), Event()

    def pause():
        paused.set()
        assert resume.wait(10), "Timed out waiting to resume publication"

    if phase == "staging":
        validate = first._validate_written_version

        def paused_validation(*args):
            pause()
            return validate(*args)

        monkeypatch.setattr(first, "_validate_written_version", paused_validation)
    else:
        collection_type = type(first.database.collisions)
        delete_many = collection_type.delete_many

        def paused_cleanup(collection, query, *args, **kwargs):
            if collection.name == "collisions" and "$nin" in query.get("datasetVersion", {}):
                pause()
            return delete_many(collection, query, *args, **kwargs)

        monkeypatch.setattr(collection_type, "delete_many", paused_cleanup)

    with ThreadPoolExecutor(max_workers=1) as executor:
        publication = executor.submit(first.publish, bundle("v1", 2), "v1", "hash-v1", {})
        try:
            assert paused.wait(10), "Publication did not reach the pause"
            state = first.database.dataset_state.find_one({"_id": "active"})
            run = first.database.ingestion_runs.find_one({"_id": "v1"})
            lock = first.database.dataset_state.find_one({"_id": "publication-lock"})
            for version, count in [("v1", 2), ("v2", 3), ("v0", 1)]:
                with pytest.raises(PublicationLockedError, match="Publication already running"):
                    second.publish(bundle(version, count), version, f"hash-{version}", {})
            with pytest.raises(PublicationLockedError):
                second.rollback()
            assert first.database.dataset_state.find_one({"_id": "active"}) == state
            assert first.database.ingestion_runs.find_one({"_id": "v1"}) == run
            assert first.database.dataset_state.find_one({"_id": "publication-lock"}) == lock
            assert first.database.ingestion_runs.find_one({"_id": "v2"}) is None
        finally:
            resume.set()
        assert publication.result(timeout=10)["status"] == "published"

    assert_retained(first, {"v0": 1, "v1": 2})
    assert second.publish(bundle("v2", 3), "v2", "hash-v2", {})["status"] == "published"
    assert_retained(first, {"v1": 2, "v2": 3})
    assert second.rollback()["datasetVersion"] == "v1"
    assert_retained(first, {"v1": 2, "v2": 3})
    assert first.database.dataset_state.find_one({"_id": "publication-lock"}) is None


def test_abandoned_lock_requires_owner_checked_manual_removal(writers):
    first, second = writers
    first.publish(bundle("v0"), "v0", "hash-v0", {})
    lock = {"_id": "publication-lock", "owner": "stopped-writer", "operation": "publish"}
    first.database.dataset_state.insert_one(lock)
    for operation in [lambda: second.publish(bundle("v1"), "v1", "hash-v1", {}), second.rollback]:
        with pytest.raises(PublicationLockedError):
            operation()
    runs = list(first.database.ingestion_runs.find())
    assert second.publish(bundle("v1"), "v1", "hash-v1", {}, dry_run=True)["status"] == "dry_run"
    assert list(first.database.ingestion_runs.find()) == runs
    assert first.database.dataset_state.find_one({"_id": "publication-lock"}) == lock
    assert first.database.dataset_state.delete_one({**lock, "owner": "different-writer"}).deleted_count == 0
    assert first.database.dataset_state.delete_one(lock).deleted_count == 1
    assert second.publish(bundle("v1"), "v1", "hash-v1", {})["status"] == "published"


@pytest.mark.parametrize("failure", ["unavailable", "different-owner"])
def test_lock_release_failure_warns_without_undoing_publication(writers, monkeypatch, failure):
    first, _ = writers
    collection_type = type(first.database.dataset_state)
    delete_one = collection_type.delete_one

    def failed_release(collection, query, *args, **kwargs):
        if collection.name == "dataset_state" and query.get("_id") == "publication-lock":
            if failure == "unavailable":
                raise RuntimeError("Database unavailable")
            collection.update_one({"_id": "publication-lock"}, {"$set": {"owner": "different-writer"}})
        return delete_one(collection, query, *args, **kwargs)

    monkeypatch.setattr(collection_type, "delete_one", failed_release)
    with pytest.warns(RuntimeWarning, match="Could not release publication lock"):
        assert first.publish(bundle("v1"), "v1", "hash-v1", {})["status"] == "published"
    assert first.database.dataset_state.find_one({"_id": "active"})["activeVersion"] == "v1"
    assert first.database.ingestion_runs.find_one({"_id": "v1"})["status"] == "published"
    assert_retained(first, {"v1": 1})
    lock = first.database.dataset_state.find_one({"_id": "publication-lock"})
    assert lock is not None
    assert lock["operation"] == "publish"
    assert lock["acquiredAt"] is not None
    if failure == "different-owner":
        assert lock["owner"] == "different-writer"


def test_kde_is_identical_across_storage_orders_and_query_plans(writers, monkeypatch):
    first, _ = writers
    source = bundle("v1", 24_000)
    frame = source.collisions
    keys = frame["COLDETKEY"].to_numpy()
    frame["YEAR"] = 2025 + keys % 2
    frame["MONTH"] = np.where(frame["YEAR"].eq(2025), keys // 2 % 12 + 1, 1)
    frame["INCDATE"] = pd.to_datetime({
        "year": frame["YEAR"], "month": frame["MONTH"], "day": 1,
    }, utc=True)
    frame["X"] = -122.34 + 0.01 * np.sin(keys / 13)
    frame["Y"] = 47.60 + 0.01 * np.cos(keys / 17)
    polygons = gpd.GeoDataFrame.from_features(source.geojson, crs="EPSG:4326")
    manifest = {**source.manifest, "availableYears": [2025, 2026]}
    for seed, version in enumerate(["v1", "v2"]):
        snapshot = DatasetBundle(
            {**manifest, "datasetVersion": version},
            frame.sample(frac=1, random_state=seed).reset_index(drop=True),
            aggregate_annual(frame, polygons), aggregate_monthly(frame, polygons), source.geojson,
        )
        first.publish(snapshot, version, f"hash-{version}", {})

    repository = MongoDatasetRepository(os.environ["MONGODB_TEST_URI"], first.database.name)
    collection_type = type(first.database.collisions)
    find = collection_type.find
    expected_rows = None
    expected_kde = None
    try:
        for hint in ["$natural", "version_year_severity", "version_collision_key"]:
            def hinted_find(collection, *args, **kwargs):
                cursor = find(collection, *args, **kwargs)
                if collection.name == "collisions":
                    return cursor.hint([(hint, 1)] if hint == "$natural" else hint)
                return cursor

            with monkeypatch.context() as patch:
                patch.setattr(collection_type, "find", hinted_find)
                for loaded in [repository.load_version("v1"), repository.load_active()]:
                    assert loaded.collisions["COLDETKEY"].tolist() == list(range(1, 24_001))
                    response = DataStore(bundle=loaded).kde(2025, 2026, []).model_dump()
                    assert response["collisionCount"] == 24_000
                    assert response["cells"]
                    if expected_rows is None:
                        expected_rows, expected_kde = loaded.collisions, response
                    else:
                        pd.testing.assert_frame_equal(loaded.collisions, expected_rows)
                        assert response == expected_kde
    finally:
        repository.close()


def test_failed_rollback_releases_lock(writers):
    first, second = writers
    first.publish(bundle("v1"), "v1", "hash-v1", {})
    with pytest.raises(RuntimeError, match="No previous published dataset"):
        second.rollback()
    assert first.database.dataset_state.find_one({"_id": "publication-lock"}) is None
    assert first.publish(bundle("v2"), "v2", "hash-v2", {})["status"] == "published"


def test_geometry_only_refresh_publishes_then_identical_refresh_is_no_change(writers):
    first, _ = writers
    old = bundle("v1")
    old_hash = sync_collisions._content_hash(old)
    first.publish(old, "v1", old_hash, {})
    changed = bundle("v2")
    changed.geojson["features"][0]["geometry"]["coordinates"][0][0][0] -= 0.001
    changed_hash = sync_collisions._content_hash(changed)
    assert changed_hash != old_hash
    assert first.publish(changed, "v2", changed_hash, {})["status"] == "published"
    assert first.database.neighborhoods.find_one({"datasetVersion": "v2"})["geojson"] == changed.geojson
    assert first.publish(changed, "v3", changed_hash, {})["status"] == "no_change"
    assert first.rollback()["datasetVersion"] == "v1"


@pytest.mark.parametrize("stage", ["download", "build", "validation"])
def test_failed_dry_run_leaves_the_database_unchanged(writers, monkeypatch, stage):
    first, _ = writers
    first.publish(bundle("v1"), "v1", "hash-v1", {})
    before = {name: list(first.database[name].find()) for name in first.database.list_collection_names()}
    source = Mock()
    source.download_consistent_snapshot.return_value = ({}, {})
    candidate = bundle("v2")
    candidate.manifest["dataAsOf"] = "2025-01-01"
    build = Mock(return_value=(candidate, "hash-v2", {}))
    if stage == "download":
        source.download_consistent_snapshot.side_effect = RuntimeError("Download failed")
    elif stage == "build":
        build.side_effect = RuntimeError("Build failed")
    monkeypatch.setattr(sync_collisions, "ArcGISClient", lambda _: source)
    monkeypatch.setattr(sync_collisions, "build_bundle", build)
    settings = Settings("mongodb", os.environ["MONGODB_TEST_URI"], first.database.name, 60, "unused")
    with pytest.raises(RuntimeError):
        sync_collisions.run_sync(settings=settings, dry_run=True)
    after = {name: list(first.database[name].find()) for name in first.database.list_collection_names()}
    assert after == before
    source.close.assert_called_once()
