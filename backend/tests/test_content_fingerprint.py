from __future__ import annotations

from copy import deepcopy

import numpy as np
import pandas as pd
import pytest

from backend.app.repository import DatasetBundle
from backend.scripts.sync_collisions import _content_hash


@pytest.fixture
def snapshot(store):
    return DatasetBundle(
        manifest={
            "artifactVersion": "test-schema", "datasetVersion": "v1", "builtAt": "yesterday",
            "lastPublishedAt": None, "dataAsOf": "2026-01-01", "knownTimeNightShare": True,
            "source": {"sourceFeatureCount": 8, "unknownTimeRows": 0, "downloadAttempt": 1},
        },
        collisions=store.collisions.head(8).astype(object).copy(),
        annual=store.annual.head(3).copy(), monthly=store.monthly.head(4).copy(),
        geojson={"type": "FeatureCollection", "features": deepcopy(store.geojson["features"][:2])},
    )


def test_fingerprint_ignores_storage_order_and_publication_bookkeeping(snapshot):
    expected = _content_hash(snapshot)
    changed = DatasetBundle(
        {**snapshot.manifest, "datasetVersion": "v2", "builtAt": "today", "lastPublishedAt": "now",
         "contentHash": "previous", "source": {**snapshot.manifest["source"], "downloadAttempt": 9}},
        snapshot.collisions.iloc[::-1], snapshot.annual.iloc[::-1], snapshot.monthly.iloc[::-1],
        {**snapshot.geojson, "features": snapshot.geojson["features"][::-1]},
    )
    assert _content_hash(changed) == expected


@pytest.mark.parametrize("part", [
    "collision-label", "geometry", "geometry-precision", "geometry-label", "annual", "monthly",
    "schema", "analytical-metadata", "source-quality", "collision-precision", "source-modification",
])
def test_fingerprint_changes_with_every_published_component(snapshot, part):
    expected = _content_hash(snapshot)
    if part == "collision-label":
        snapshot.collisions.iloc[0, snapshot.collisions.columns.get_loc("neighborhood_name")] = "Changed name"
    elif part.startswith("geometry"):
        feature = snapshot.geojson["features"][0]
        if part == "geometry-label":
            feature["properties"]["name"] = "Changed name"
        else:
            feature["geometry"] = {"type": "Polygon", "coordinates": [[
                [-122.4, 47.5], [-122.3, 47.5], [-122.3, 47.6], [-122.4, 47.5],
            ]]}
            if part == "geometry-precision":
                original = _content_hash(snapshot)
                feature["geometry"]["coordinates"][0][0][0] = np.nextafter(-122.4, 0).item()
                assert _content_hash(snapshot) != original
    elif part in {"annual", "monthly"}:
        metrics = getattr(snapshot, part)
        metrics.iloc[0, metrics.columns.get_loc("collision_count")] += 1
    elif part == "schema":
        snapshot.manifest["artifactVersion"] = "next-schema"
    elif part == "analytical-metadata":
        snapshot.manifest["knownTimeNightShare"] = False
    elif part == "source-quality":
        snapshot.manifest["source"]["unknownTimeRows"] = 1
    elif part == "collision-precision":
        column = snapshot.collisions.columns.get_loc("X")
        snapshot.collisions.iloc[0, column] = np.nextafter(snapshot.collisions.iloc[0, column], 0).item()
    else:
        snapshot.collisions["MODDTTM"] = pd.Timestamp("2026-01-02", tz="UTC")
    assert _content_hash(snapshot) != expected
