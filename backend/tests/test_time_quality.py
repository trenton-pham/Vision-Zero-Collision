from __future__ import annotations

import json
from pathlib import Path

from collision_clean import CollisionCleaner
from backend.scripts.sync_collisions import clean_features


def features(times: list[str] | None = None) -> dict:
    times = times or ["1/15/2025", "1/15/2025 12:00:00 AM", "1/15/2025 9:00:00 PM"]
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-122.33, 47.61]},
                "properties": {
                    "OBJECTID": index,
                    "INCKEY": index,
                    "COLDETKEY": index,
                    "LOCATION": "Test street",
                    "MAXSEVERITYCODE": "1",
                    "MAXSEVERITYDESC": "Property Damage Only Collision",
                    "PERSONCOUNT": 1,
                    "PEDCOUNT": 0,
                    "PEDCYLCOUNT": 0,
                    "VEHCOUNT": 1,
                    "INJURIES": 0,
                    "SERIOUSINJURIES": 0,
                    "FATALITIES": 0,
                    "INCDATE": "Wed, 15 Jan 2025 08:00:00 GMT",
                    "INCDTTM": value,
                    "MODDTTM": None,
                    "JUNCTIONTYPE": "At Intersection",
                    "SDOT_COLCODE": "1",
                    "SDOT_COLDESC": "Test",
                    "UNDERINFL": "N",
                    "WEATHER": "Clear",
                    "ROADCOND": "Dry",
                    "LIGHTCOND": "Daylight",
                },
            }
            for index, value in enumerate(times, start=1)
        ],
    }


def test_monthly_cleaner_keeps_date_only_time_unknown() -> None:
    cleaned, quality = clean_features(features())
    assert cleaned["HOUR"].isna().tolist() == [True, False, False]
    assert cleaned["HOUR"].fillna(-1).astype(int).tolist() == [-1, 0, 21]
    assert quality["unknownTimeRows"] == 1


def test_historical_cleaner_keeps_date_only_time_unknown(tmp_path: Path) -> None:
    source = tmp_path / "collisions.geojson"
    source.write_text(json.dumps(features()))
    cleaned, stats = CollisionCleaner(
        start_year=2025, end_year=2025, max_freshness_days=10_000, source_path=source
    ).clean()
    assert cleaned["HOUR"].isna().tolist() == [True, False, False]
    assert cleaned["HOUR"].fillna(-1).astype(int).tolist() == [-1, 0, 21]
    assert stats["unknown_time_rows"] == 1
    assert stats["midnight_time_rows"] == 1


def test_both_cleaners_handle_wholly_unknown_incident_times(tmp_path: Path) -> None:
    collection = features(["1/15/2025", "1/16/2025"])
    synced, quality = clean_features(collection)
    assert synced["HOUR"].isna().all()
    assert quality["unknownTimeRows"] == 2

    source = tmp_path / "collisions.geojson"
    source.write_text(json.dumps(collection))
    cleaned, stats = CollisionCleaner(
        start_year=2025, end_year=2025, max_freshness_days=10_000, source_path=source
    ).clean()
    assert cleaned["HOUR"].isna().all()
    assert stats["unknown_time_rows"] == 2
    assert stats["midnight_time_rows"] == 0
