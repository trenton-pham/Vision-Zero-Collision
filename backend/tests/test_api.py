from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_meta_and_geojson_contracts() -> None:
    meta = client.get("/api/meta")
    assert meta.status_code == 200
    assert meta.json()["neighborhoodCount"] == 94
    assert meta.json()["partialYears"] == [2026]

    geojson = client.get("/api/neighborhoods/geojson")
    assert geojson.status_code == 200
    assert len(geojson.json()["features"]) == 94


def test_neighborhood_context_and_invalid_id() -> None:
    response = client.get("/api/neighborhoods/ballard/context?start_year=2015&end_year=2026")
    assert response.status_code == 200
    assert response.json()["metrics"]["name"] == "Ballard"
    assert response.json()["annual"][-1]["isPartial"] is True

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


def test_all_citywide_routes() -> None:
    base = "start_year=2024&end_year=2026&severity=serious-injury&severity=fatal"
    for path in ["summary", "heatmap", "kde", "spatial-shift", "downtown-comparison"]:
        response = client.get(f"/api/citywide/{path}?{base}")
        assert response.status_code == 200, response.text

