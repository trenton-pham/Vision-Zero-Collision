from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_ARCGIS_LAYER_URL = (
    "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/"
    "SDOT_Collisions_All_Years_1/FeatureServer/0"
)


@dataclass(frozen=True)
class Settings:
    data_backend: str
    mongodb_uri: str | None
    mongodb_database: str
    dataset_refresh_seconds: int
    arcgis_layer_url: str

    @classmethod
    def from_env(cls) -> "Settings":
        backend = os.getenv("DASHBOARD_DATA_BACKEND", "artifacts").strip().lower()
        if backend not in {"artifacts", "mongodb"}:
            raise ValueError("DASHBOARD_DATA_BACKEND must be 'artifacts' or 'mongodb'")

        refresh_seconds = int(os.getenv("DATASET_REFRESH_SECONDS", "60"))
        if refresh_seconds < 10:
            raise ValueError("DATASET_REFRESH_SECONDS must be at least 10")

        mongodb_uri = os.getenv("MONGODB_URI")
        if backend == "mongodb" and not mongodb_uri:
            raise ValueError("MONGODB_URI is required when DASHBOARD_DATA_BACKEND=mongodb")

        return cls(
            data_backend=backend,
            mongodb_uri=mongodb_uri,
            mongodb_database=os.getenv("MONGODB_DATABASE", "seattle_collision"),
            dataset_refresh_seconds=refresh_seconds,
            arcgis_layer_url=os.getenv("ARC_GIS_LAYER_URL", DEFAULT_ARCGIS_LAYER_URL).rstrip("/"),
        )

