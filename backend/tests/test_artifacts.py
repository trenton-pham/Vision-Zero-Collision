from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd

from backend.app.data import DataStore


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
    assert store.manifest["dataAsOf"] == "2026-08-31"
    assert store.manifest["partialYears"] == [2026]


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

