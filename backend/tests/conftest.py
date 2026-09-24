from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.data import DataStore


@pytest.fixture(scope="session")
def store() -> DataStore:
    return DataStore(Path("data/dashboard"))

