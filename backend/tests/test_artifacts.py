from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pytest

from backend.app.data import ArtifactError, DataStore
from backend.app.dataset import partial_years
from backend.app.repository import ArtifactDatasetRepository


def test_partial_year_survives_year_rollover_when_source_ends_early() -> None:
    assert partial_years(date(2026, 8, 31), date(2027, 1, 8)) == [2026]
    assert partial_years(date(2026, 12, 31), date(2027, 1, 8)) == []
    assert partial_years(date(2026, 12, 31), date(2026, 12, 31)) == [2026]


@pytest.mark.parametrize("validate_sources", [True, False])
def test_direct_store_keeps_missing_artifact_diagnostic(tmp_path: Path, validate_sources: bool) -> None:
    names = ["manifest.json", "collisions_assigned.parquet", "neighborhood_annual.parquet",
             "context_monthly.parquet", "neighborhoods.geojson"]
    message = (
        "Dashboard artifacts are absent. Run `python -m backend.scripts.build_artifacts`. "
        f"Missing: {', '.join(str(tmp_path / name) for name in names)}"
    )
    with pytest.raises(ArtifactError) as error:
        DataStore(tmp_path, validate_sources=validate_sources)
    assert str(error.value) == message


def test_direct_store_source_validation_remains_optional(tmp_path: Path, store: DataStore) -> None:
    for name in ["collisions_assigned.parquet", "neighborhood_annual.parquet",
                 "context_monthly.parquet", "neighborhoods.geojson"]:
        (tmp_path / name).symlink_to((store.artifact_dir / name).resolve())
    manifest = {**store.manifest, "sourceHashes": {"missing-collision-source.parquet": "invalid"}}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))

    with pytest.raises(ArtifactError) as error:
        DataStore(tmp_path)
    assert str(error.value) == (
        "Dashboard artifacts are stale for missing-collision-source.parquet. "
        "Run `python -m backend.scripts.build_artifacts`."
    )
    assert DataStore(tmp_path, validate_sources=False).meta() == store.meta()


def test_store_does_not_mutate_supplied_bundle(store: DataStore) -> None:
    bundle = ArtifactDatasetRepository(store.artifact_dir).load_active()
    collisions = bundle.collisions.copy(deep=True)
    annual = bundle.annual.copy(deep=True)
    monthly = bundle.monthly.copy(deep=True)
    manifest = dict(bundle.manifest)

    loaded = DataStore(bundle=bundle)
    loaded.collisions.loc[0, "INJURIES"] = 99
    loaded.annual.loc[0, "injuries"] = 99
    loaded.monthly.loc[0, "injuries"] = 99
    loaded.manifest["datasetVersion"] = "changed"

    pd.testing.assert_frame_equal(bundle.collisions, collisions)
    pd.testing.assert_frame_equal(bundle.annual, annual)
    pd.testing.assert_frame_equal(bundle.monthly, monthly)
    assert bundle.manifest == manifest


def test_assignment_regression_baseline(store: DataStore) -> None:
    assert len(store.collisions) == 106_050
    assert store.collisions["assignment_method"].value_counts().to_dict() == {
        "direct": 104_579,
        "nearest": 1_193,
        "unassigned": 278,
    }
    assert len(store.neighborhoods) == 94
    assert store.neighborhoods["id"].nunique() == 94


def test_manifest_sources_are_current(store: DataStore) -> None:
    assert store.manifest["artifactVersion"] == "neighborhood-context-v3"
    assert store.manifest["knownTimeNightShare"] is True
    assert store.manifest["dataAsOf"] == "2026-08-31"
    assert store.manifest["partialYears"] == [2026]


def test_monthly_artifact_is_zero_filled_bounded_and_reconciled(store: DataStore) -> None:
    assert len(store.monthly) == 95 * 140
    assert store.monthly.groupby("neighborhood_id").size().eq(140).all()
    assert store.monthly["period"].min() == "2015-01"
    assert store.monthly["period"].max() == "2026-08"
    assert not store.monthly["period"].isin(["2026-09", "2026-10", "2026-11", "2026-12"]).any()
    assert (
        store.monthly[
            (store.monthly["neighborhood_id"] == "north-beach-blue-ridge")
            & (store.monthly["collision_count"] == 0)
        ].shape[0]
        > 0
    )

    additive = ["collision_count", "injuries", "serious_injuries", "fatalities", "total_severity"]
    monthly_totals = store.monthly.groupby(["neighborhood_id", "YEAR"], as_index=False)[additive].sum()
    annual_totals = store.annual[["neighborhood_id", "YEAR", *additive]].sort_values(["neighborhood_id", "YEAR"])
    pd.testing.assert_frame_equal(
        monthly_totals.sort_values(["neighborhood_id", "YEAR"]).reset_index(drop=True),
        annual_totals.reset_index(drop=True),
        check_dtype=False,
    )
    assert int(store.annual[store.annual["neighborhood_id"] == "citywide"]["collision_count"].sum()) == 106_050


def test_resolver_interior_nearest_and_outside(store: DataStore) -> None:
    interior = store.neighborhoods[store.neighborhoods["id"] == "ballard"].geometry.iloc[0].representative_point()
    resolved = store.resolve(interior.y, interior.x)
    assert resolved.id == "ballard"
    assert resolved.method == "contains"

    nearest_row = store.collisions[store.collisions["assignment_method"] == "nearest"].iloc[0]
    nearest = store.resolve(float(nearest_row.Y), float(nearest_row.X))
    assert nearest.method == "nearest"
    assert nearest.id == nearest_row.neighborhood_id
    assert nearest.distanceMeters is not None and nearest.distanceMeters <= 25

    outside = store.resolve(47.0, -123.0)
    assert outside.id is None
    assert outside.method == "unassigned"


def test_shared_boundary_is_deterministic(store: DataStore) -> None:
    polygons = store.neighborhoods.reset_index(drop=True)
    boundary_point = None
    for left_index, left in polygons.iterrows():
        for right_index in range(left_index + 1, len(polygons)):
            intersection = left.geometry.boundary.intersection(polygons.iloc[right_index].geometry.boundary)
            if not intersection.is_empty:
                boundary_point = intersection.representative_point()
                break
        if boundary_point is not None:
            break
    assert boundary_point is not None
    first = store.resolve(boundary_point.y, boundary_point.x)
    second = store.resolve(boundary_point.y, boundary_point.x)
    assert first == second
    assert first.method in {"boundary", "contains"}
