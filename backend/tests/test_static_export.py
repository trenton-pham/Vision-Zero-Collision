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


@pytest.fixture(scope="module")
def sharded_release(store, tmp_path_factory):
    from backend.app.dataset import aggregate_annual, aggregate_monthly
    from backend.scripts.export_static import merge_static_exports

    collisions = store.collisions.loc[
        store.collisions["YEAR"].isin([2024, 2025])
        & store.collisions["neighborhood_id"].isin(["ballard", "fremont"])
    ].groupby(["YEAR", "MONTH", "neighborhood_id"], observed=True).head(1).copy()
    polygons = store.neighborhoods.loc[store.neighborhoods["id"].isin(["ballard", "fremont"])].copy()
    manifest = {
        **store.manifest, "availableYears": [2024, 2025], "partialYears": [],
        "collisionCount": len(collisions), "neighborhoodCount": len(polygons),
        "dataAsOf": str(collisions["INCDATE"].max())[:10],
    }
    geojson = {**store.geojson, "features": [
        feature for feature in store.geojson["features"] if feature["properties"]["id"] in {"ballard", "fremont"}
    ]}
    small = DataStore(bundle=DatasetBundle(
        manifest, collisions, aggregate_annual(collisions, polygons),
        aggregate_monthly(collisions, polygons), geojson,
    ))
    root = tmp_path_factory.mktemp("export-shards")
    full = export_static(root / "full", small, code_revision="same-code")
    shards = root / "shards"
    for index in range(3):
        export_static(shards / str(index), small, code_revision="same-code", verify=True, shard_index=index, shard_count=3)
    merged = merge_static_exports(root / "merged", shards, code_revision="same-code", shard_count=3)
    return root, full, merged, small


def test_sharded_export_matches_unsharded_bytes_and_identity(sharded_release):
    root, full, merged, _ = sharded_release
    assert full == merged
    relative = Path("data/releases") / full["releaseId"]
    expected = root / "full" / relative
    actual = root / "merged" / relative
    assert {p.relative_to(actual): p.read_bytes() for p in actual.rglob("*") if p.is_file()} == {
        p.relative_to(expected): p.read_bytes() for p in expected.rglob("*") if p.is_file()
    }
    assert not list((root / "shards").rglob("current.json"))


@pytest.mark.parametrize("failure", ["missing", "duplicate", "dataset", "revision", "provenance", "unverified", "corrupt", "omission", "overlap", "symlink"])
def test_invalid_shards_preserve_current_release(sharded_release, tmp_path, failure):
    import shutil
    from backend.scripts.export_static import merge_static_exports

    root, full, _, _ = sharded_release
    shards = tmp_path / "shards"
    shutil.copytree(root / "shards", shards)
    output = tmp_path / "published"
    shutil.copytree(root / "full", output)
    current = (output / "data/current.json").read_bytes()
    folder = shards / "1"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_bytes())
    if failure == "missing":
        shutil.rmtree(folder)
    elif failure == "corrupt":
        asset = next(name for name in manifest["files"] if name != "provenance.json")
        (folder / asset).write_bytes(b"{}")
    elif failure == "symlink":
        asset = next(name for name in manifest["files"] if name != "provenance.json")
        original = folder / asset
        external = tmp_path / "external.json"
        original.rename(external)
        original.symlink_to(external)
    else:
        if failure == "duplicate":
            manifest["shard"]["index"] = 0
        elif failure == "dataset":
            manifest["datasetVersion"] = "other"
        elif failure == "revision":
            manifest["codeRevision"] = "other"
        elif failure == "provenance":
            manifest["dependencyFingerprint"] = "other"
        elif failure == "unverified":
            manifest["shard"]["verified"] = False
        elif failure == "omission":
            asset = next(name for name in manifest["files"] if name != "provenance.json")
            del manifest["files"][asset]
            (folder / asset).unlink()
        elif failure == "overlap":
            asset = "meta.json"
            shutil.copyfile(shards / "0" / asset, folder / asset)
            manifest["files"][asset] = json.loads((shards / "0/manifest.json").read_bytes())["files"][asset]
        del manifest["releaseId"]
        manifest["releaseId"] = digest(canonical_json(manifest))
        manifest_path.write_bytes(canonical_json(manifest))
    with pytest.raises(ValueError):
        merge_static_exports(output, shards, code_revision="same-code", shard_count=3)
    assert (output / "data/current.json").read_bytes() == current
    verify_inventory(output / "data/releases" / full["releaseId"], full)
    assert not list(output.glob(".static-candidate-*"))


def test_failed_shard_leaves_no_output(sharded_release, tmp_path, monkeypatch):
    import backend.app.static_export as module
    _, _, _, small = sharded_release

    def fail_after_first_file(*_):
        yield "meta.json", {}
        raise RuntimeError("calculation failed")

    monkeypatch.setattr(module, "analytical_files", fail_after_first_file)
    output = tmp_path / "shard"
    with pytest.raises(RuntimeError, match="calculation failed"):
        export_static(output, small, code_revision="same-code", verify=True, shard_index=0, shard_count=3)
    assert not output.exists()
    assert not list(tmp_path.glob(".static-candidate-*"))


@pytest.mark.parametrize("index,count", [(-1, 3), (3, 3), (0, 0)])
def test_invalid_partition_is_rejected(index, count):
    from backend.app.static_export import partition
    with pytest.raises(ValueError, match="Shard index"):
        partition([], index, count)


def test_merge_rejects_an_unexpected_pinned_dataset(sharded_release, tmp_path):
    from backend.scripts.export_static import merge_static_exports
    root, _, _, _ = sharded_release
    with pytest.raises(ValueError, match="pinned dataset"):
        merge_static_exports(
            tmp_path, root / "shards", code_revision="same-code", shard_count=3,
            dataset_version="unexpected-dataset",
        )
    assert not (tmp_path / "data/current.json").exists()


def test_empty_shard_is_verified_without_a_current_pointer(sharded_release, tmp_path):
    _, _, _, small = sharded_release
    output = tmp_path / "empty-shard"
    manifest = export_static(output, small, code_revision="same-code", verify=True, shard_index=11, shard_count=12)
    assert set(manifest["files"]) == {"provenance.json"}
    assert manifest["shard"]["verified"] is True
    assert not (output / "data/current.json").exists()


def test_merge_cli_needs_no_source_store(sharded_release, tmp_path, monkeypatch, capsys):
    import backend.scripts.export_static as module
    root, full, _, _ = sharded_release
    monkeypatch.setattr("sys.argv", [
        "export_static", "--merge-shards", str(root / "shards"), "--output", str(tmp_path),
        "--code-revision", "same-code", "--shard-count", "3", "--dataset-version", full["datasetVersion"],
    ])
    monkeypatch.setattr(module, "DataStore", lambda *_args, **_kwargs: pytest.fail("Merge loaded source data"))
    module.main()
    assert json.loads(capsys.readouterr().out)["releaseId"] == full["releaseId"]
    assert json.loads((tmp_path / "data/current.json").read_bytes()) == full


@pytest.mark.parametrize("expected", [None, "active", "other"])
def test_pin_cli_reads_only_the_active_version(monkeypatch, capsys, expected):
    import backend.scripts.export_static as module

    closed = []
    class Repository:
        def __init__(self, *_):
            pass
        def active_state(self):
            return {"activeVersion": "active"}
        def close(self):
            closed.append(True)

    arguments = ["export_static", "--backend", "mongodb", "--pin-dataset", "--code-revision", "same-code"]
    if expected:
        arguments += ["--dataset-version", expected]
    monkeypatch.setattr("sys.argv", arguments)
    monkeypatch.setenv("MONGODB_URI", "mongodb://unused")
    monkeypatch.setattr(module, "MongoDatasetRepository", Repository)
    if expected == "other":
        with pytest.raises(SystemExit) as error:
            module.main()
        assert error.value.code == 2
        assert "not the active published version" in capsys.readouterr().err
    else:
        module.main()
        assert json.loads(capsys.readouterr().out) == {"datasetVersion": "active"}
    assert closed == [True]


def test_merged_export_enforces_aggregate_file_limit(sharded_release, tmp_path, monkeypatch):
    import backend.app.static_export as module
    from backend.scripts.export_static import merge_static_exports
    root, full, _, _ = sharded_release
    monkeypatch.setattr(module, "MAX_ASSET_FILES", len(full["files"]))
    with pytest.raises(ValueError, match="free file limit"):
        merge_static_exports(tmp_path, root / "shards", code_revision="same-code", shard_count=3)
    assert not (tmp_path / "data/current.json").exists()
    assert not list(tmp_path.glob(".static-candidate-*"))


def test_inventory_allows_ancestor_alias_but_rejects_extra_symlinks(release, tmp_path):
    directory, manifest = release
    alias = tmp_path / "ancestor"
    alias.symlink_to(directory.parent, target_is_directory=True)
    verify_inventory(alias / directory.name, manifest)
    extra = directory / "unexpected-link"
    extra.symlink_to("missing.json")
    try:
        with pytest.raises(ValueError, match="symbolic link"):
            verify_inventory(directory, manifest)
    finally:
        extra.unlink()
