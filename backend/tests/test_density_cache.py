from __future__ import annotations

import gc
import weakref
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from unittest.mock import Mock

import numpy as np
import pandas as pd
import pytest

from backend.app import data
from backend.app.config import Settings
from backend.app.repository import DatasetBundle
from backend.app.schemas import HeatmapPoint, HeatmapResponse, KdeCell, KdeResponse


@pytest.fixture
def small_bundle(monkeypatch) -> DatasetBundle:
    monkeypatch.setattr(data.DataStore, "_validate_bundle", lambda self: None)
    monkeypatch.setattr(data, "add_metric_columns", lambda frame: frame)
    return DatasetBundle(
        manifest={"artifactVersion": "v1", "datasetVersion": "v1", "availableYears": [2024, 2025, 2026]},
        collisions=pd.DataFrame({
            "YEAR": [2024, 2024, 2024, 2025, 2026],
            "MAXSEVERITYDESC": ["Property Damage Only Collision"] * 3 + ["Injury Collision", None],
            "X": [-122.34, -122.33, -122.35, -122.32, -122.36],
            "Y": [47.60, 47.62, 47.63, 47.64, 47.65],
        }),
        annual=pd.DataFrame(),
        monthly=pd.DataFrame(),
        geojson={"type": "FeatureCollection", "features": [{
            "type": "Feature",
            "properties": {"id": "test", "name": "Test"},
            "geometry": {"type": "Point", "coordinates": [-122.33, 47.61]},
        }]},
    )


@pytest.fixture
def density_store(small_bundle) -> data.DataStore:
    return data.DataStore(bundle=small_bundle)


def heatmap_response() -> HeatmapResponse:
    return HeatmapResponse(points=[HeatmapPoint(lat=47.6, lng=-122.3, weight=2)], maxWeight=2, collisionCount=2)


def kde_response() -> KdeResponse:
    return KdeResponse(cells=[KdeCell(lat=47.6, lng=-122.3, density=1)], rows=1, columns=1, bounds=[47, -123, 48, -122], collisionCount=2)


@pytest.mark.parametrize("endpoint", ["heatmap", "kde"])
def test_real_snapshot_cached_response_matches_uncached(store, endpoint) -> None:
    expected = getattr(store, f"_{endpoint}")(2024, 2026, ["serious-injury", "fatal"])
    first = getattr(store, endpoint)(2024, 2026, ["serious-injury", "fatal"])
    warm = getattr(store, endpoint)(2024, 2026, ["fatal", "serious-injury", "fatal"])
    assert first == warm == expected
    assert first is not warm


def test_filters_are_canonical_and_keys_keep_endpoint_years_and_empty_distinct(density_store, monkeypatch) -> None:
    heatmap = Mock(side_effect=lambda *args: heatmap_response())
    kde = Mock(side_effect=lambda *args: kde_response())
    monkeypatch.setattr(density_store, "_heatmap", heatmap)
    monkeypatch.setattr(density_store, "_kde", kde)
    density_store.heatmap(2024, 2026, ["fatal", "injury", "fatal"])
    density_store.heatmap(2024, 2026, ["injury", "fatal"])
    heatmap.assert_called_once_with(2024, 2026, ["fatal", "injury"])
    for start, end, severities in [(2025, 2026, ["fatal", "injury"]), (2024, 2025, ["fatal", "injury"]), (2024, 2026, []), (2024, 2026, list(data.SEVERITY_KEYS)), (2024, 2026, ["fatal"])]:
        density_store.heatmap(start, end, severities)
    density_store.kde(2024, 2026, ["fatal", "injury"])
    assert heatmap.call_count == 6
    assert kde.call_count == 1
    assert len(density_store._density_cache) == 7


@pytest.mark.parametrize("endpoint", ["heatmap", "kde"])
def test_warm_hits_validate_without_filtering(density_store, monkeypatch, endpoint) -> None:
    method = getattr(density_store, endpoint)
    expected = method(2024, 2026, [])
    monkeypatch.setattr(density_store, "_filter_citywide", Mock(side_effect=AssertionError("filtered warm hit")))
    assert method(2024, 2026, []) == expected
    for start, end, severities, message in [
        (2026, 2024, ["bad"], "start_year must be less than or equal to end_year"),
        (2023, 2026, ["bad"], "year range must be between 2024 and 2026"),
        (2024, 2026, ["zzz", "bad", "zzz"], "unknown severity filter: bad, zzz"),
    ]:
        with pytest.raises(ValueError) as error:
            method(start, end, severities)
        assert str(error.value) == message


@pytest.mark.parametrize("kind", ["empty", "sparse", "singular"])
def test_successful_empty_and_fallback_results_are_cached(density_store, monkeypatch, kind) -> None:
    severities = ["serious-injury"] if kind == "empty" else []
    start = end = 2025 if kind == "sparse" else 2024
    if kind == "singular":
        monkeypatch.setattr(data, "gaussian_kde", Mock(side_effect=np.linalg.LinAlgError("singular")))
    compute = Mock(wraps=density_store._kde)
    monkeypatch.setattr(density_store, "_kde", compute)
    first = density_store.kde(start, end, severities)
    assert first.cells == []
    assert density_store.kde(start, end, severities) == first
    assert compute.call_count == 1
    if kind == "empty":
        heatmap = Mock(wraps=density_store._heatmap)
        monkeypatch.setattr(density_store, "_heatmap", heatmap)
        assert density_store.heatmap(start, end, severities) == HeatmapResponse(points=[], maxWeight=0, collisionCount=0)
        density_store.heatmap(start, end, severities)
        assert heatmap.call_count == 1


@pytest.mark.parametrize("endpoint,response", [("heatmap", heatmap_response), ("kde", kde_response)])
def test_callers_cannot_mutate_cached_response(density_store, monkeypatch, endpoint, response) -> None:
    compute = Mock(side_effect=lambda *args: response())
    monkeypatch.setattr(density_store, f"_{endpoint}", compute)
    method = getattr(density_store, endpoint)
    first = method(2024, 2026, [])
    first.collisionCount = 100
    if endpoint == "heatmap":
        first.points[0].weight = 100
        first.points.clear()
    else:
        first.cells[0].density = 0
        first.bounds.clear()
    warm = method(2024, 2026, [])
    assert warm == response()
    warm.collisionCount = 200
    assert method(2024, 2026, []) == response()
    assert compute.call_count == 1


def test_combined_entry_limit_and_lru_recency(density_store, monkeypatch) -> None:
    monkeypatch.setattr(data, "_DENSITY_CACHE_MAX_ENTRIES", 2)
    heatmap = Mock(side_effect=lambda *args: heatmap_response())
    kde = Mock(side_effect=lambda *args: kde_response())
    monkeypatch.setattr(density_store, "_heatmap", heatmap)
    monkeypatch.setattr(density_store, "_kde", kde)
    density_store.heatmap(2024, 2024, [])
    density_store.kde(2024, 2024, [])
    density_store.heatmap(2024, 2024, [])
    density_store.heatmap(2025, 2025, [])
    density_store.heatmap(2024, 2024, [])
    assert heatmap.call_count == 2
    assert [key[0:3] for key in density_store._density_cache] == [("heatmap", 2025, 2025), ("heatmap", 2024, 2024)]
    density_store.kde(2024, 2024, [])
    assert kde.call_count == 2
    assert len(density_store._density_cache) == 2
    assert density_store._density_cache_bytes == sum(map(len, density_store._density_cache.values()))


def test_byte_limit_evicts_least_recent_and_oversize_preserves_cache(density_store, monkeypatch) -> None:
    size = len(heatmap_response().model_dump_json().encode())
    monkeypatch.setattr(data, "_DENSITY_CACHE_MAX_BYTES", size * 2)
    heatmap = Mock(side_effect=lambda *args: heatmap_response())
    monkeypatch.setattr(density_store, "_heatmap", heatmap)
    for year in [2024, 2025, 2024, 2026]:
        density_store.heatmap(year, year, [])
    assert [key[1] for key in density_store._density_cache] == [2024, 2026]
    assert density_store._density_cache_bytes == size * 2
    oversized = kde_response()
    oversized.cells *= 20
    kde = Mock(return_value=oversized)
    monkeypatch.setattr(density_store, "_kde", kde)
    before = list(density_store._density_cache.items())
    for _ in range(2):
        assert density_store.kde(2024, 2024, []) == oversized
    assert kde.call_count == 2
    assert list(density_store._density_cache.items()) == before
    assert density_store._density_cache_bytes == size * 2
    density_store.heatmap(2025, 2025, [])
    assert heatmap.call_count == 4


@pytest.mark.parametrize("endpoint,response", [("heatmap", heatmap_response), ("kde", kde_response)])
def test_exceptions_are_retried_and_release_locks(density_store, monkeypatch, endpoint, response) -> None:
    compute = Mock(side_effect=[RuntimeError("compute failed"), response()])
    monkeypatch.setattr(density_store, f"_{endpoint}", compute)
    method = getattr(density_store, endpoint)
    with pytest.raises(RuntimeError, match="compute failed"):
        method(2024, 2026, [])
    assert not density_store._density_cache
    with ThreadPoolExecutor(max_workers=1) as pool:
        assert pool.submit(method, 2024, 2026, []).result(timeout=2) == response()
    assert method(2024, 2026, []) == response()
    assert compute.call_count == 2


@pytest.mark.parametrize("endpoint,response,other,other_response", [
    ("heatmap", heatmap_response, "kde", kde_response),
    ("kde", kde_response, "heatmap", heatmap_response),
])
def test_concurrent_miss_computes_once_without_blocking_hits_or_other_operations(
    density_store, monkeypatch, endpoint, response, other, other_response,
) -> None:
    method = getattr(density_store, endpoint)
    monkeypatch.setattr(density_store, f"_{endpoint}", Mock(side_effect=lambda *args: response()))
    expected = method(2024, 2024, [])
    entered, release = Event(), Event()
    start = Barrier(3)

    def compute(*args):
        entered.set()
        assert release.wait(5), "Test did not release density computation"
        return response()

    compute_mock = Mock(side_effect=compute)
    monkeypatch.setattr(density_store, f"_{endpoint}", compute_mock)
    monkeypatch.setattr(density_store, f"_{other}", Mock(side_effect=lambda *args: other_response()))

    def cold():
        start.wait(timeout=5)
        return method(2025, 2025, [])

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(cold) for _ in range(3)]
        try:
            assert entered.wait(5)
            assert pool.submit(method, 2024, 2024, []).result(timeout=2) == expected
            assert pool.submit(getattr(density_store, other), 2025, 2025, []).result(timeout=2) == other_response()
            assert pool.submit(density_store._filter_citywide, 2025, 2025, []).result(timeout=2).shape[0] == 1
        finally:
            release.set()
        assert all(future.result(timeout=5) == response() for future in futures)
    assert compute_mock.call_count == 1


def test_new_snapshot_has_its_own_cache(small_bundle, monkeypatch) -> None:
    first = data.DataStore(bundle=small_bundle)
    second = data.DataStore(bundle=small_bundle)
    compute = Mock(side_effect=lambda *args: heatmap_response())
    monkeypatch.setattr(data.DataStore, "_heatmap", compute)
    first.heatmap(2024, 2026, [])
    assert not second._density_cache
    second.heatmap(2024, 2026, [])
    assert compute.call_count == 2
    assert first._density_cache is not second._density_cache


def test_manager_refresh_failure_rollback_and_old_snapshot_collection(small_bundle, monkeypatch) -> None:
    manager = data.DataStoreManager(Settings("artifacts", None, "test", 60, "unused"))
    manager.repository = Mock()
    manager.repository.active_version.return_value = "v1"
    manager.repository.load_active.return_value = small_bundle
    compute = Mock(side_effect=lambda *args: heatmap_response())
    monkeypatch.setattr(data.DataStore, "_heatmap", compute)
    assert manager.refresh()
    first = manager.get()
    first.heatmap(2024, 2026, [])
    assert not manager.refresh()
    manager.repository.active_version.return_value = "v2"
    manager.repository.load_active.side_effect = ValueError("invalid snapshot")
    with pytest.raises(ValueError, match="invalid snapshot"):
        manager.refresh()
    assert manager.get() is first
    first.heatmap(2024, 2026, [])
    assert compute.call_count == 1
    manager.repository.load_active.side_effect = None
    small_bundle.manifest["datasetVersion"] = "v2"
    assert manager.refresh()
    second = manager.get()
    assert not second._density_cache
    second.heatmap(2024, 2026, [])
    manager.repository.active_version.return_value = "v1"
    small_bundle.manifest["datasetVersion"] = "v1"
    assert manager.refresh()
    rollback = manager.get()
    assert rollback is not first and rollback is not second
    assert not rollback._density_cache
    rollback.heatmap(2024, 2026, [])
    assert compute.call_count == 3
    first_ref, second_ref = weakref.ref(first), weakref.ref(second)
    del first, second
    gc.collect()
    assert first_ref() is None and second_ref() is None
