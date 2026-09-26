from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.data import DataStoreManager


@pytest.fixture(params=[False, True], ids=["without-frontend", "with-frontend"])
def probe_module(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """Import a fresh app without replacing the module used by other API tests."""
    frontend = main.FRONTEND_DIST
    original_exists = Path.exists

    def exists(path: Path) -> bool:
        if path == frontend:
            return request.param
        if path == frontend / "assets":
            return False
        return original_exists(path)

    monkeypatch.setattr(Path, "exists", exists)
    name = "backend.app._probe_test_main"
    spec = importlib.util.spec_from_file_location(name, main.__file__)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, name, module)
    spec.loader.exec_module(module)
    return module


def test_root_accepts_render_head_probe(
    probe_module: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager_lookup = Mock(side_effect=AssertionError("HEAD must not access the dataset"))
    monkeypatch.setattr(probe_module, "get_store_manager", manager_lookup)
    # Do not enter lifespan: startup deliberately attempts to load the dataset.
    client = TestClient(probe_module.app)
    response = client.head("/")
    assert response.status_code == 204
    assert response.content == b""
    assert "/" not in client.get("/openapi.json").json()["paths"]
    manager_lookup.assert_not_called()


def test_health_probes_do_not_load_an_unavailable_dataset(
    probe_module: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager = Mock(spec=DataStoreManager)
    manager.ready = False
    manager.current = None
    manager.backend = "mongodb"
    manager.last_error = "Dataset unavailable"
    manager.get.side_effect = AssertionError("Health probes must not load the dataset")
    manager.refresh.side_effect = AssertionError("Health probes must not refresh the dataset")
    monkeypatch.setattr(probe_module, "get_store_manager", lambda: manager)
    client = TestClient(probe_module.app)

    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["status"] == "degraded"
    assert health.json()["detail"] == "Dataset unavailable"

    ready = client.get("/readyz")
    assert ready.status_code == 503
    assert ready.json()["detail"] == "Dataset unavailable"
    manager.get.assert_not_called()
    manager.refresh.assert_not_called()
