import hashlib
from pathlib import Path

import pandas as pd
import pytest

from clean import write_dataframe, write_json
from vehicle_clean import VehicleCleaner


@pytest.fixture
def vehicle_source(tmp_path: Path) -> Path:
    source = tmp_path / "vehicles.csv"
    pd.DataFrame({
        "COLLISIONVEHDETKEY": [1, 2, 3],
        "COLDETKEY": [10, 10, 99],
        "ST_VEH_TYPE_DESC": ["Passenger Car", "Taxi", "Bus or Motor Stage"],
        "Incident Date": ["01/15/2025 12:00:00 PM"] * 3,
    }).to_csv(source, index=False)
    return source


def test_vehicle_cleaner_separates_orphans_and_preserves_lineage(vehicle_source: Path) -> None:
    cleaned, orphaned, stats = VehicleCleaner(
        start_year=2025, end_year=2025, max_freshness_days=10_000, source_path=vehicle_source,
    ).clean([10])

    assert cleaned["COLLISIONVEHDETKEY"].tolist() == [1, 2]
    assert cleaned["VEHICLE_CATEGORY"].tolist() == ["Passenger Vehicle", "Passenger Vehicle"]
    assert orphaned["COLLISIONVEHDETKEY"].tolist() == [3]
    assert orphaned["VEHICLE_CATEGORY"].tolist() == ["Bus"]
    assert stats["orphan_vehicle_rows"] == 1
    assert stats["orphan_collision_keys"] == 1
    assert stats["source"]["rows"] == 3
    assert stats["source"]["sha256"] == hashlib.sha256(vehicle_source.read_bytes()).hexdigest()


def test_vehicle_cleaner_rejects_duplicate_vehicle_keys(vehicle_source: Path) -> None:
    records = pd.read_csv(vehicle_source)
    records.loc[1, "COLLISIONVEHDETKEY"] = 1
    records.to_csv(vehicle_source, index=False)

    with pytest.raises(ValueError, match="duplicate vehicle keys"):
        VehicleCleaner(max_freshness_days=10_000, source_path=vehicle_source).clean([10])


def test_vehicle_cleaner_rejects_a_source_changed_during_read(vehicle_source: Path, monkeypatch) -> None:
    read_csv = pd.read_csv

    def changed_read(*args, **kwargs):
        records = read_csv(*args, **kwargs)
        with vehicle_source.open("a") as handle:
            handle.write("\n")
        return records

    monkeypatch.setattr(pd, "read_csv", changed_read)
    with pytest.raises(ValueError, match="changed while it was being read"):
        VehicleCleaner(max_freshness_days=10_000, source_path=vehicle_source).clean([10])


def test_source_change_during_checksum_is_rejected(vehicle_source: Path, monkeypatch) -> None:
    cleaner = VehicleCleaner(source_path=vehicle_source)
    cleaner.capture_source_stat()
    file_digest = hashlib.file_digest

    def changed_digest(handle, algorithm):
        digest = file_digest(handle, algorithm)
        with vehicle_source.open("a") as source:
            source.write("\n")
        return digest

    monkeypatch.setattr(hashlib, "file_digest", changed_digest)
    with pytest.raises(ValueError, match="changed while its checksum was calculated"):
        cleaner.source_details(3, pd.Timestamp("2025-01-15"), pd.Timestamp("2025-01-15"), 0)


@pytest.mark.parametrize("output_format", ["parquet", "csv", "geojson", "json"])
def test_failed_serialization_preserves_existing_file_and_removes_temporary_file(
    tmp_path: Path, monkeypatch, output_format: str,
) -> None:
    target = tmp_path / f"output.{output_format}"
    target.write_bytes(b"previous output")

    def fail(*args, **kwargs):
        raise OSError("Serialization failed")

    if output_format == "json":
        from clean import json
        monkeypatch.setattr(json, "dumps", fail)
        write = lambda: write_json({"rows": 1}, target)
    else:
        frame = pd.DataFrame({"rows": [1]})

        def partially_write(path, *args, **kwargs):
            Path(path).write_bytes(b"partial output")
            fail()

        method = {"parquet": "to_parquet", "csv": "to_csv", "geojson": "to_file"}[output_format]
        monkeypatch.setattr(frame, method, partially_write, raising=False)
        write = lambda: write_dataframe(frame, target, output_format)

    with pytest.raises(OSError, match="Serialization failed"):
        write()
    assert target.read_bytes() == b"previous output"
    assert list(tmp_path.iterdir()) == [target]
