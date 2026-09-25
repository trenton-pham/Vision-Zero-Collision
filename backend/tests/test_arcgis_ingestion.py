from __future__ import annotations

from urllib.parse import parse_qs

import httpx
import pytest

import backend.scripts.sync_collisions as sync_module
from backend.scripts.sync_collisions import ArcGISClient, REQUIRED_FIELD_TYPES


def metadata(last_edit: int = 100) -> dict:
    return {
        "geometryType": "esriGeometryPoint",
        "editingInfo": {"lastEditDate": last_edit},
        "fields": [
            {"name": name, "type": field_type}
            for name, field_type in REQUIRED_FIELD_TYPES.items()
        ],
    }


def test_download_uses_id_batches_and_reconciles_more_than_transfer_limit() -> None:
    object_ids = list(range(1, 2_502))
    batch_sizes: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = parse_qs(request.url.query.decode())
        if request.url.path.endswith("/query") and params.get("returnIdsOnly") == ["true"]:
            return httpx.Response(200, json={"objectIdFieldName": "OBJECTID", "objectIds": object_ids})
        if request.url.path.endswith("/query"):
            batch = [int(value) for value in params["objectIds"][0].split(",")]
            batch_sizes.append(len(batch))
            return httpx.Response(200, json={
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "geometry": None, "properties": {"OBJECTID": value}}
                    for value in batch
                ],
            })
        return httpx.Response(200, json=metadata())

    client = ArcGISClient("https://example.test/layer", httpx.Client(transport=httpx.MockTransport(handler)))
    collection, source = client.download_consistent_snapshot()
    assert len(collection["features"]) == 2_501
    assert batch_sizes == [1_000, 1_000, 501]
    assert source["sourceFeatureCount"] == 2_501


def test_download_restarts_when_layer_changes_mid_fetch() -> None:
    metadata_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal metadata_calls
        params = parse_qs(request.url.query.decode())
        if request.url.path.endswith("/query") and params.get("returnIdsOnly") == ["true"]:
            return httpx.Response(200, json={"objectIds": [1]})
        if request.url.path.endswith("/query"):
            return httpx.Response(200, json={
                "type": "FeatureCollection",
                "features": [{"type": "Feature", "geometry": None, "properties": {"OBJECTID": 1}}],
            })
        metadata_calls += 1
        return httpx.Response(200, json=metadata([100, 101, 101, 101][metadata_calls - 1]))

    client = ArcGISClient("https://example.test/layer", httpx.Client(transport=httpx.MockTransport(handler)))
    _, source = client.download_consistent_snapshot()
    assert source["downloadAttempt"] == 2


def test_schema_drift_fails_before_downloading_records() -> None:
    changed = metadata()
    changed["fields"] = [field for field in changed["fields"] if field["name"] != "COLDETKEY"]
    with pytest.raises(RuntimeError, match="schema drift"):
        ArcGISClient.validate_schema(changed)


def test_transient_http_failure_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    metadata_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal metadata_calls
        params = parse_qs(request.url.query.decode())
        if request.url.path.endswith("/query") and params.get("returnIdsOnly") == ["true"]:
            return httpx.Response(200, json={"objectIds": [1]})
        if request.url.path.endswith("/query"):
            return httpx.Response(200, json={
                "type": "FeatureCollection",
                "features": [{"type": "Feature", "geometry": None, "properties": {"OBJECTID": 1}}],
            })
        metadata_calls += 1
        if metadata_calls == 1:
            return httpx.Response(503, json={"message": "temporarily unavailable"})
        return httpx.Response(200, json=metadata())

    monkeypatch.setattr(sync_module.time, "sleep", lambda _: None)
    client = ArcGISClient("https://example.test/layer", httpx.Client(transport=httpx.MockTransport(handler)))
    collection, _ = client.download_consistent_snapshot()
    assert len(collection["features"]) == 1
    assert metadata_calls == 3
