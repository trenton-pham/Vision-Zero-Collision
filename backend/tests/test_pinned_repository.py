from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.app.repository import MongoDatasetRepository


class Cursor(list):
    def sort(self, key: str, direction: int):
        return Cursor(sorted(self, key=lambda document: document[key], reverse=direction < 0))

    def batch_size(self, _: int):
        return self


class Collection:
    def __init__(self, documents):
        self.documents = documents

    def find(self, query, projection=None):
        return Cursor(document for document in self.documents if all(document.get(key) == value for key, value in query.items()))

    def find_one(self, query, projection=None):
        return next(iter(self.find(query, projection)), None)


@pytest.fixture
def repository():
    manifest = {"artifactVersion": "fixture", "collisionCount": 3, "dataAsOf": "2025-12-31"}
    published = datetime(2026, 1, 1, tzinfo=timezone.utc)
    repo = object.__new__(MongoDatasetRepository)
    repo.database = type("Database", (), {
        "dataset_state": Collection([{
            "_id": "active", "activeVersion": "new", "previousVersion": "old",
            "lastPublishedAt": datetime(2026, 2, 1, tzinfo=timezone.utc),
        }]),
        "ingestion_runs": Collection([
            {"_id": "old", "manifest": manifest, "status": "published", "publishedAt": published},
            {"_id": "new", "manifest": manifest, "status": "published", "publishedAt": published},
            {"_id": "candidate", "manifest": manifest, "status": "staging"},
        ]),
        "collisions": Collection([
            {"datasetVersion": version, "COLDETKEY": key, "YEAR": 2025}
            for version in ["old", "new"] for key in [9, 2, 7]
        ]),
        "neighborhood_annual": Collection([{"datasetVersion": version, "YEAR": 2025} for version in ["old", "new"]]),
        "context_monthly": Collection([{"datasetVersion": version, "period": "2025-12"} for version in ["old", "new"]]),
        "neighborhoods": Collection([{"datasetVersion": version, "geojson": {"features": []}} for version in ["old", "new"]]),
    })()
    return repo


def test_pinned_read_keeps_requested_version_and_sorts_collision_keys(repository) -> None:
    bundle = repository.load_version("old")
    assert bundle.manifest["datasetVersion"] == "old"
    assert bundle.manifest["lastPublishedAt"] == "2026-01-01T00:00:00+00:00"
    assert bundle.collisions["COLDETKEY"].tolist() == [2, 7, 9]


def test_active_read_preserves_current_publication_time(repository) -> None:
    bundle = repository.load_active()
    assert bundle.collisions["COLDETKEY"].tolist() == [2, 7, 9]
    assert bundle.manifest["datasetVersion"] == "new"
    assert bundle.manifest["lastPublishedAt"] == "2026-02-01T00:00:00+00:00"


def test_unpublished_and_missing_versions_cannot_be_exported(repository) -> None:
    with pytest.raises(RuntimeError, match="has not been published"):
        repository.load_version("candidate")
    with pytest.raises(RuntimeError, match="no ingestion manifest"):
        repository.load_version("missing")
