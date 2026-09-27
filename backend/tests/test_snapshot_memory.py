from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from types import SimpleNamespace
from unittest.mock import Mock

import pandas as pd
import pytest

from backend.app import data, main
from backend.app.config import Settings
from backend.app.repository import COLLISION_CATEGORIES, MongoDatasetRepository


def test_streamed_documents_preserve_missing_values_and_precision() -> None:
    documents = [
        {"_id": "a", "datasetVersion": "v1", "YEAR": 2026, "MAXSEVERITYDESC": "Injury Collision", "X": -122.33456789},
        {"_id": "b", "YEAR": 2025, "MAXSEVERITYDESC": None, "INJURIES": 2},
        {"_id": "c", "YEAR": 2024, "MAXSEVERITYDESC": "Injury Collision", "X": -122.3},
    ]
    frame = MongoDatasetRepository._frame(iter(documents), COLLISION_CATEGORIES)
    expected = pd.DataFrame([
        {key: value for key, value in row.items() if key not in {"_id", "datasetVersion"}}
        for row in documents
    ])
    expected["MAXSEVERITYDESC"] = expected["MAXSEVERITYDESC"].astype("category")
    pd.testing.assert_frame_equal(frame, expected)
    assert documents[0]["_id"] == "a"


def test_collision_snapshot_fits_memory_budget(store: data.DataStore) -> None:
    # Leave space in a 512 MiB instance for imports, geometry, concurrent charts,
    # and the old snapshot while a new publication is validated.
    assert len(store.collisions) > 100_000
    assert store.collisions.memory_usage(deep=True).sum() < 20 * 1024**2


@pytest.mark.parametrize("loaded", [False, True], ids=["cold-start", "refresh"])
def test_concurrent_refreshes_load_once_and_keep_probes_available(monkeypatch, loaded) -> None:
    manager = data.DataStoreManager(Settings("artifacts", None, "test", 60, "unused"))
    previous = SimpleNamespace(manifest={"datasetVersion": "v1"}) if loaded else None
    candidate = SimpleNamespace(manifest={"datasetVersion": "v2"})
    manager._store = previous
    entered, release = Event(), Event()
    start = Barrier(3)

    def load():
        entered.set()
        assert release.wait(5), "Test did not release dataset load"
        return object()

    manager.repository = Mock()
    manager.repository.active_version.return_value = "v2"
    manager.repository.load_active.side_effect = load
    monkeypatch.setattr(data, "DataStore", Mock(return_value=candidate))

    def refresh():
        start.wait(timeout=5)
        return manager.refresh() if loaded else manager.get()

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(refresh) for _ in range(3)]
        try:
            assert entered.wait(5)
            assert pool.submit(lambda: manager.current).result(timeout=1) is previous
            assert manager.ready is loaded
        finally:
            release.set()
        results = [future.result(timeout=5) for future in futures]
    if loaded:
        assert results.count(True) == 1
    else:
        assert all(result is candidate for result in results)
    manager.repository.load_active.assert_called_once()
    assert manager.current is candidate


def test_failed_refresh_keeps_previous_snapshot(monkeypatch) -> None:
    manager = data.DataStoreManager(Settings("artifacts", None, "test", 60, "unused"))
    previous = SimpleNamespace(manifest={"datasetVersion": "v1"})
    manager._store = previous
    manager.repository = Mock()
    manager.repository.active_version.return_value = "v2"
    monkeypatch.setattr(data, "DataStore", Mock(side_effect=ValueError("Invalid dataset")))
    with pytest.raises(ValueError, match="Invalid dataset"):
        manager.refresh()
    assert manager.get() is previous
    assert manager.last_error == "Invalid dataset"


def test_metadata_reads_snapshot_without_refreshing(monkeypatch, store) -> None:
    manager = Mock()
    manager.backend = "mongodb"
    manager.get.return_value = store
    monkeypatch.setattr(main, "get_store_manager", lambda: manager)
    assert main.meta().collisionCount == len(store.collisions)
    manager.refresh.assert_not_called()
