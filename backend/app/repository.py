from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


@dataclass(frozen=True)
class DatasetBundle:
    manifest: dict[str, Any]
    collisions: pd.DataFrame
    annual: pd.DataFrame
    monthly: pd.DataFrame
    geojson: dict[str, Any]


class ArtifactDatasetRepository:
    def __init__(self, artifact_dir: Path):
        self.artifact_dir = Path(artifact_dir)

    def active_version(self) -> str:
        manifest = json.loads((self.artifact_dir / "manifest.json").read_text())
        return str(manifest.get("datasetVersion", manifest["artifactVersion"]))

    def load_active(self) -> DatasetBundle:
        manifest = json.loads((self.artifact_dir / "manifest.json").read_text())
        manifest.setdefault("datasetVersion", manifest["artifactVersion"])
        manifest.setdefault("lastPublishedAt", manifest.get("builtAt"))
        return DatasetBundle(
            manifest=manifest,
            collisions=pd.read_parquet(self.artifact_dir / "collisions_assigned.parquet"),
            annual=pd.read_parquet(self.artifact_dir / "neighborhood_annual.parquet"),
            monthly=pd.read_parquet(self.artifact_dir / "context_monthly.parquet"),
            geojson=json.loads((self.artifact_dir / "neighborhoods.geojson").read_text()),
        )

    def close(self) -> None:
        return None


class MongoDatasetRepository:
    def __init__(self, uri: str, database: str):
        from pymongo import MongoClient

        self.client = MongoClient(
            uri,
            appname="seattle-collision-dashboard",
            serverSelectionTimeoutMS=10_000,
            connectTimeoutMS=10_000,
            retryReads=True,
        )
        self.database = self.client[database]

    def active_state(self) -> dict[str, Any]:
        state = self.database.dataset_state.find_one({"_id": "active"})
        if not state or not state.get("activeVersion"):
            raise RuntimeError("MongoDB has no published collision dataset")
        return state

    def active_version(self) -> str:
        return str(self.active_state()["activeVersion"])

    @staticmethod
    def _frame(documents: Iterable[dict[str, Any]]) -> pd.DataFrame:
        rows = []
        for document in documents:
            row = dict(document)
            row.pop("_id", None)
            row.pop("datasetVersion", None)
            rows.append(row)
        return pd.DataFrame(rows)

    def load_active(self) -> DatasetBundle:
        state = self.active_state()
        version = str(state["activeVersion"])
        run = self.database.ingestion_runs.find_one({"_id": version})
        if not run or not run.get("manifest"):
            raise RuntimeError(f"Published dataset {version!r} has no ingestion manifest")

        collisions = self._frame(
            self.database.collisions.find(
                {"datasetVersion": version},
                {"datasetVersion": 0, "geometry": 0},
            )
        )
        annual = self._frame(
            self.database.neighborhood_annual.find({"datasetVersion": version}, {"datasetVersion": 0})
        )
        monthly = self._frame(
            self.database.context_monthly.find({"datasetVersion": version}, {"datasetVersion": 0})
        )
        neighborhoods = self.database.neighborhoods.find_one(
            {"datasetVersion": version}, {"_id": 0, "datasetVersion": 0}
        )
        if not neighborhoods or "geojson" not in neighborhoods:
            raise RuntimeError(f"Published dataset {version!r} has no neighborhood geometry")

        manifest = dict(run["manifest"])
        manifest["datasetVersion"] = version
        manifest["lastPublishedAt"] = _isoformat(state.get("lastPublishedAt"))
        if len(collisions) != int(manifest["collisionCount"]):
            raise RuntimeError(
                f"Published dataset {version!r} expected {manifest['collisionCount']} collisions; "
                f"loaded {len(collisions)}"
            )
        return DatasetBundle(
            manifest=manifest,
            collisions=collisions,
            annual=annual,
            monthly=monthly,
            geojson=neighborhoods["geojson"],
        )

    def close(self) -> None:
        self.client.close()


def _isoformat(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value)
