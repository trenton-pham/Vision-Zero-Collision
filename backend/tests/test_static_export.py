from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from backend.app.data import DataStore
from backend.app.repository import DatasetBundle
from backend.app.static_export import (
    canonical_json, digest, severity_selection, verify_analytical_outputs, verify_inventory, write_export,
)
from backend.scripts.export_static import export_static


@pytest.fixture(scope="module")
def single_year_store(store: DataStore) -> DataStore:
    collisions = store.collisions.loc[store.collisions["YEAR"].eq(2025)].copy()
    manifest = {
        **store.manifest,
        "availableYears": [2025], "partialYears": [],
        "dataAsOf": "2025-12-31", "collisionCount": len(collisions),
    }
    return DataStore(bundle=DatasetBundle(
        manifest, collisions,
        store.annual.loc[store.annual["YEAR"].eq(2025)].copy(),
        store.monthly.loc[store.monthly["YEAR"].eq(2025)].copy(), store.geojson,
    ))


@pytest.fixture(scope="module")
def release(single_year_store: DataStore, tmp_path_factory) -> tuple[Path, dict]:
    directory = tmp_path_factory.mktemp("static-release")
    manifest = write_export(
        single_year_store, directory, code_revision="reference-code", provenance={"python": "locked"},
    )
    return directory, manifest


def test_every_exported_selection_matches_python(single_year_store: DataStore, release) -> None:
    directory, manifest = release
    assert len([key for key in manifest["files"] if key.startswith("citywide/")]) == 32
    assert len([key for key in manifest["files"] if key.startswith("neighborhoods/")]) == 94
    assert verify_analytical_outputs(single_year_store, directory) == 131
    for mask in range(32):
        value = json.loads((directory / f"citywide/2025-2025/{mask}.json").read_bytes())
        assert value["summary"]["severities"] == severity_selection(mask)
    assert severity_selection(0) == []
    assert len(severity_selection(31)) == 5
    assert "citywide/2025-2025/0.json" in manifest["files"]
    assert "citywide/2025-2025/31.json" in manifest["files"]


def test_export_includes_geometry_and_reproducible_content_identity(release) -> None:
    directory, manifest = release
    unsigned = {key: value for key, value in manifest.items() if key != "releaseId"}
    assert manifest["releaseId"] == digest(canonical_json(unsigned))
    assert json.loads((directory / "manifest.json").read_bytes()) == manifest
    resolver = json.loads((directory / "resolver.json").read_bytes())
    assert len(resolver["features"]) == 94
    assert "NAD83" in resolver["projection"]
    assert all(feature["area"] > 0 for feature in resolver["features"])
    assert all(feature["geometry"]["type"] in {"Polygon", "MultiPolygon"} for feature in resolver["features"])
    assert "MONGODB_URI" not in canonical_json(manifest).decode()
    assert not any("collisions" in key for key in manifest["files"])


def test_corrupt_candidate_is_rejected(release, tmp_path: Path) -> None:
    directory, manifest = release
    import shutil
    candidate = tmp_path / "candidate"
    shutil.copytree(directory, candidate)
    (candidate / "meta.json").write_text("{}")
    with pytest.raises(ValueError, match="checksum mismatch"):
        verify_inventory(candidate, manifest)
    altered = copy.deepcopy(manifest)
    altered["datasetVersion"] = "tampered"
    with pytest.raises(ValueError, match="identity"):
        verify_inventory(directory, altered)


def test_failed_export_preserves_current_release(single_year_store, tmp_path, monkeypatch) -> None:
    import backend.app.static_export as module
    first = export_static(tmp_path, single_year_store, code_revision="first")
    current = tmp_path / "data/current.json"
    previous = current.read_bytes()

    def fail_after_first_file(_):
        yield "meta.json", {"candidate": True}
        raise RuntimeError("candidate calculation failed")

    monkeypatch.setattr(module, "analytical_files", fail_after_first_file)
    with pytest.raises(RuntimeError, match="candidate calculation failed"):
        export_static(tmp_path, single_year_store, code_revision="second")
    assert current.read_bytes() == previous
    verify_inventory(tmp_path / "data/releases" / first["releaseId"], first)
    assert not list(tmp_path.glob(".static-candidate-*"))


def test_oversized_asset_cannot_be_published(single_year_store, tmp_path, monkeypatch) -> None:
    import backend.app.static_export as module
    monkeypatch.setattr(module, "MAX_ASSET_BYTES", 1)
    with pytest.raises(ValueError, match="exceeds 25 MiB"):
        export_static(tmp_path, single_year_store, code_revision="oversized")
    assert not (tmp_path / "data/current.json").exists()


def test_reference_api_catches_a_consistently_wrong_export_mapping(single_year_store, tmp_path, monkeypatch) -> None:
    import backend.app.static_export as module
    original = module.analytical_files

    def wrong_mapping(store):
        for relative, value in original(store):
            if relative.startswith("citywide/"):
                value["summary"]["metrics"]["collisionCount"] += 1
            yield relative, value

    monkeypatch.setattr(module, "analytical_files", wrong_mapping)
    write_export(single_year_store, tmp_path, code_revision="wrong", provenance={})
    with pytest.raises(ValueError, match="differs from the API"):
        verify_analytical_outputs(single_year_store, tmp_path)


def test_neighborhood_series_reconciles_with_raw_collision_unions(store: DataStore) -> None:
    from backend.app.static_export import neighborhood_series, MAX_ASSET_BYTES
    series = neighborhood_series(store)
    assert len(canonical_json(series)) < MAX_ASSET_BYTES
    assert set(series["neighborhoods"]) == set(store.name_by_id)
    for ids in [["ballard"], ["ballard", "fremont"], list(store.name_by_id)]:
        raw = store.collisions.loc[store.collisions["neighborhood_id"].isin(ids)]
        rows = [row for id in ids for row in series["neighborhoods"][id]["monthly"]]
        assert sum(row["collisionCount"] for row in rows) == len(raw)
        assert sum(row["totalSeverity"] for row in rows) == int(raw["severity_score"].sum())
        assert sum(row["intersectionCollisions"] for row in rows) == int(raw["intersection"].sum())
        assert sum(row["weekendCollisions"] for row in rows) == int(raw["weekend"].sum())
        if store.has_known_time_night_share:
            assert sum(row["knownTimeCollisions"] for row in rows) == int(raw["HOUR"].notna().sum())
        else:
            assert all(row["knownTimeCollisions"] is None for row in rows)
    for id in store.name_by_id:
        context = store.neighborhood_context(id, min(store.available_years), max(store.available_years))
        rows = series["neighborhoods"][id]["monthly"]
        assert [row["period"] for row in rows] == [row.period for row in context.monthly]
        for exported, expected in zip(rows, context.monthly, strict=True):
            assert exported["collisionCount"] == expected.collisionCount
            assert exported["totalSeverity"] == expected.totalSeverity


def test_neighborhood_series_uses_known_time_denominator(store: DataStore, monkeypatch) -> None:
    from backend.app.static_export import neighborhood_series
    monkeypatch.setattr(store, "has_known_time_night_share", True)
    rows = neighborhood_series(store)["neighborhoods"]["ballard"]["monthly"]
    for row in rows:
        year, month = map(int, row["period"].split("-"))
        raw = store.collisions.loc[
            store.collisions["neighborhood_id"].eq("ballard")
            & store.collisions["YEAR"].eq(year) & store.collisions["MONTH"].eq(month)
        ]
        assert row["knownTimeCollisions"] == int(raw["HOUR"].notna().sum())
