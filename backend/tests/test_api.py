from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_meta_and_geojson_contracts() -> None:
    meta = client.get("/api/meta")
    assert meta.status_code == 200
    assert meta.json()["neighborhoodCount"] == 94
    assert meta.json()["partialYears"] == [2026]
    assert meta.json()["datasetVersion"].startswith("artifact-")
    assert meta.json()["lastPublishedAt"]

    geojson = client.get("/api/neighborhoods/geojson")
    assert geojson.status_code == 200
    assert len(geojson.json()["features"]) == 94

    ready = client.get("/readyz")
    assert ready.status_code == 200
    assert ready.json()["artifactVersion"] == meta.json()["artifactVersion"]
    assert ready.json()["datasetVersion"] == meta.json()["datasetVersion"]

    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["artifactVersion"] == meta.json()["artifactVersion"]


def test_neighborhood_context_and_invalid_id() -> None:
    response = client.get("/api/neighborhoods/ballard/context?start_year=2015&end_year=2026")
    assert response.status_code == 200
    assert response.json()["metrics"]["name"] == "Ballard"
    assert response.json()["annual"][-1]["isPartial"] is True
    assert response.json()["monthly"][-1]["period"] == "2026-08"

    invalid = client.get("/api/neighborhoods/not-a-place/context?start_year=2015&end_year=2026")
    assert invalid.status_code == 404


def test_year_validation_and_empty_citywide_filter() -> None:
    invalid = client.get("/api/neighborhoods/summary?start_year=2026&end_year=2015")
    assert invalid.status_code == 422

    empty = client.get(
        "/api/citywide/summary?start_year=2015&end_year=2015&severity=unknown"
    )
    assert empty.status_code == 200
    assert empty.json()["metrics"]["collisionCount"] >= 0


def test_citywide_neighborhood_trend_contract_and_range_validation() -> None:
    response = client.get("/api/neighborhoods/citywide-trend?start_year=2015&end_year=2026")
    assert response.status_code == 200
    body = response.json()
    assert body["scope"] == {"id": "citywide", "name": "Seattle citywide"}
    assert body["metrics"]["collisionCount"] == 106_050
    assert body["metrics"]["id"] == "citywide"
    assert body["monthly"][0]["period"] == "2015-01"
    assert body["monthly"][-1]["period"] == "2026-08"
    assert sum(item["collisionCount"] for item in body["monthly"]) == 106_050
    assert body["annual"][-1]["isPartial"] is True

    narrow = client.get("/api/neighborhoods/citywide-trend?start_year=2025&end_year=2025")
    assert narrow.status_code == 200
    assert narrow.json()["metrics"]["collisionCount"] == sum(
        item["collisionCount"] for item in narrow.json()["annual"]
    )
    assert len(narrow.json()["monthly"]) == 12
    assert narrow.json()["comparison"]["status"] == "insufficient_years"

    invalid = client.get("/api/neighborhoods/citywide-trend?start_year=2026&end_year=2015")
    assert invalid.status_code == 422

    parameters = client.get("/openapi.json").json()["paths"]["/api/neighborhoods/citywide-trend"]["get"]["parameters"]
    assert "severity" not in {parameter["name"] for parameter in parameters}


def test_all_citywide_routes() -> None:
    base = "start_year=2024&end_year=2026&severity=serious-injury&severity=fatal"
    for path in ["summary", "heatmap", "kde", "spatial-shift", "downtown-comparison"]:
        response = client.get(f"/api/citywide/{path}?{base}")
        assert response.status_code == 200, response.text
