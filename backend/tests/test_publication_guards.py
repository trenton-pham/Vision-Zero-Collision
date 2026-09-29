from __future__ import annotations

from types import SimpleNamespace

import pandas as pd
import pytest

from backend.app.mongo_writer import MongoDatasetWriter
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
