from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
import pyarrow.parquet as pq


# Keep the runtime snapshot small; source-only descriptions are not used by the API.
COLLISION_COLUMNS = (
    "OBJECTID", "INCKEY", "COLDETKEY", "MAXSEVERITYDESC", "INJURIES",
    "SERIOUSINJURIES", "FATALITIES", "PEDCOUNT", "INCDATE", "JUNCTIONTYPE",
    "YEAR", "MONTH", "HOUR", "Day_of_Week", "X", "Y", "neighborhood_id",
    "neighborhood_name", "assignment_method", "assignment_distance_m",
)
COLLISION_CATEGORIES = frozenset({
    "MAXSEVERITYDESC", "JUNCTIONTYPE", "Day_of_Week", "neighborhood_id",
    "neighborhood_name", "assignment_method",
})


def compact_collisions(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.loc[:, [column for column in COLLISION_COLUMNS if column in frame]].copy()
    for column in COLLISION_CATEGORIES.intersection(frame.columns):
        frame[column] = frame[column].astype("category")
    return frame


def read_collisions(path: Path) -> pd.DataFrame:
    available = set(pq.read_schema(path).names)
    columns = [column for column in COLLISION_COLUMNS if column in available]
    return compact_collisions(pd.read_parquet(path, columns=columns))


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
            collisions=read_collisions(self.artifact_dir / "collisions_assigned.parquet"),
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
    def _frame(
        documents: Iterable[dict[str, Any]],
        categories: frozenset[str] = frozenset(),
    ) -> pd.DataFrame:
        # Decode directly into columns instead of retaining every Mongo document.
        # Share repeated labels immediately, before allocating the DataFrame.
        columns: dict[str, list[Any]] = {}
        labels: dict[str, dict[str, str]] = {key: {} for key in categories}
        for count, document in enumerate(documents):
            for key in document:
                if key not in {"_id", "datasetVersion"} and key not in columns:
                    columns[key] = [None] * count
            for key, values in columns.items():
                value = document.get(key)
                if key in labels and isinstance(value, str):
                    value = labels[key].setdefault(value, value)
                values.append(value)
        frame = pd.DataFrame(columns)
        for key in categories.intersection(frame.columns):
            frame[key] = frame[key].astype("category")
        return frame

    def load_active(self) -> DatasetBundle:
        state = self.active_state()
        version = str(state["activeVersion"])
        run = self.database.ingestion_runs.find_one({"_id": version})
        if not run or not run.get("manifest"):
            raise RuntimeError(f"Published dataset {version!r} has no ingestion manifest")

        collisions = self._frame(
            self.database.collisions.find(
                {"datasetVersion": version},
                {"_id": 0, **dict.fromkeys(COLLISION_COLUMNS, 1)},
            ).batch_size(1_000),
            categories=COLLISION_CATEGORIES,
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
