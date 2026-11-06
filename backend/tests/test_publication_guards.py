from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from backend.app.config import Settings
from backend.app.mongo_writer import MongoDatasetWriter, PublicationLockedError
from backend.scripts import sync_collisions
from backend.app.repository import DatasetBundle


def test_usable_collision_drop_requires_manual_override_even_when_source_count_is_steady() -> None:
    writer = object.__new__(MongoDatasetWriter)
    writer.client = SimpleNamespace(admin=SimpleNamespace(command=lambda _: None))
    writer.database = SimpleNamespace(dataset_state=SimpleNamespace(find_one=lambda _: {
        "activeVersion": "v1",
        "collisionCount": 100,
        "sourceFeatureCount": 120,
        "dataAsOf": "2025-12-31",
        "contentHash": "old",
    }))
    bundle = DatasetBundle(
        manifest={"collisionCount": 98, "dataAsOf": "2026-01-01"},
        collisions=pd.DataFrame(), annual=pd.DataFrame(), monthly=pd.DataFrame(), geojson={},
    )
    with pytest.raises(RuntimeError, match="Usable collision count decreased"):
        writer.publish(bundle, "v2", "new", {"sourceFeatureCount": 120}, dry_run=True)
    assert writer.publish(
        bundle, "v2", "new", {"sourceFeatureCount": 120},
        dry_run=True, allow_row_decrease=True,
    )["status"] == "dry_run"


@pytest.mark.parametrize("error", [
    PublicationLockedError("Publication already running"), RuntimeError("Failed"),
])
def test_failed_sync_does_not_overwrite_a_dataset_ingestion_record(monkeypatch, error):
    source = Mock()
    source.download_consistent_snapshot.return_value = ({}, {})
    writer = Mock()
    writer.publish.side_effect = error
    snapshot = DatasetBundle(
        manifest={"datasetVersion": "same-version-as-running-writer"},
        collisions=pd.DataFrame(), annual=pd.DataFrame(), monthly=pd.DataFrame(), geojson={},
    )
    monkeypatch.setattr(sync_collisions, "ArcGISClient", lambda _: source)
    monkeypatch.setattr(sync_collisions, "MongoDatasetWriter", lambda *args: writer)
    monkeypatch.setattr(sync_collisions, "build_bundle", lambda *args: (snapshot, "hash", {}))
    settings = Settings("mongodb", "mongodb://unused", "test", 60, "unused")

    with pytest.raises(type(error)):
        sync_collisions.run_sync(settings=settings)

    if isinstance(error, PublicationLockedError):
        writer.record_failure.assert_not_called()
    else:
        run_id = writer.record_failure.call_args.args[0]
        assert run_id.startswith("same-version-as-running-writer:failed:")
        assert writer.record_failure.call_count == 1
    source.close.assert_called_once()
    writer.close.assert_called_once()


@pytest.mark.parametrize("stage", ["download", "build", "validation"])
@pytest.mark.parametrize("dry_run", [True, False])
def test_sync_failure_writes_failure_records_only_outside_dry_run(monkeypatch, stage, dry_run):
    source, writer = Mock(), Mock()
    source.download_consistent_snapshot.return_value = ({}, {})
    snapshot = DatasetBundle(
        {"datasetVersion": "candidate"}, pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), {},
    )
    build = Mock(return_value=(snapshot, "hash", {}))
    error = RuntimeError(f"Failed during {stage}")
    if stage == "download":
        source.download_consistent_snapshot.side_effect = error
    elif stage == "build":
        build.side_effect = error
    else:
        writer.publish.side_effect = error
    monkeypatch.setattr(sync_collisions, "ArcGISClient", lambda _: source)
    monkeypatch.setattr(sync_collisions, "MongoDatasetWriter", lambda *args: writer)
    monkeypatch.setattr(sync_collisions, "build_bundle", build)
    settings = Settings("mongodb", "mongodb://unused", "test", 60, "unused")
    with pytest.raises(RuntimeError, match=f"Failed during {stage}"):
        sync_collisions.run_sync(settings=settings, dry_run=dry_run)
    assert writer.record_failure.call_count == (0 if dry_run else 1)
    source.close.assert_called_once()
    writer.close.assert_called_once()
