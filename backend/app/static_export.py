from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
from itertools import combinations_with_replacement
from pathlib import Path
from typing import Iterator

from shapely.geometry import mapping

from .data import DataStore, SEVERITY_KEYS


SCHEMA_VERSION = 1
MAX_ASSET_BYTES = 25 * 1024**2
MAX_ASSET_FILES = 20_000


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False,
    ).encode("ascii")


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def year_ranges(store: DataStore) -> list[tuple[int, int]]:
    minimum, maximum = min(store.available_years), max(store.available_years)
    return [(start, end) for start in range(minimum, maximum + 1) for end in range(start, maximum + 1)]


def severity_selection(mask: int) -> list[str]:
    return [key for bit, key in enumerate(SEVERITY_KEYS) if mask & (1 << bit)]


def dependency_provenance(lockfile: Path) -> dict:
    packages = (
        "fastapi", "geopandas", "numpy", "pandas", "pyarrow", "pydantic",
        "pymongo", "pyproj", "scipy", "shapely",
    )
    return {
        "python": platform.python_version(),
        "packages": {name: importlib.metadata.version(name) for name in packages},
        "lockSha256": digest(lockfile.read_bytes()),
    }


def resolver_geometry(store: DataStore) -> dict:
    return {
        "projection": store.neighborhoods_projected.crs.to_wkt(version="WKT1_GDAL"),
        "features": [
            {
                "id": str(row.id),
                "name": str(row["name"]),
                "area": float(store.neighborhoods_projected.loc[index].geometry.area),
                "geometry": mapping(row.geometry),
                "projectedGeometry": mapping(store.neighborhoods_projected.loc[index].geometry),
            }
            for index, row in store.neighborhoods.iterrows()
        ],
    }


def analytical_files(store: DataStore) -> Iterator[tuple[str, dict]]:
    yield "meta.json", store.meta().model_dump(mode="json")
    yield "neighborhoods.geojson", store.geojson
    yield "resolver.json", resolver_geometry(store)
    ranges = year_ranges(store)
    for start, end in ranges:
        yield f"explorer/{start}-{end}.json", {
            "summary": [item.model_dump(mode="json") for item in store.neighborhood_summary(start, end)],
            "citywideTrend": store.citywide_trend(start, end).model_dump(mode="json"),
        }
        for mask in range(1 << len(SEVERITY_KEYS)):
            severities = severity_selection(mask)
            yield f"citywide/{start}-{end}/{mask}.json", {
                "summary": store.citywide_summary(start, end, severities).model_dump(mode="json"),
                "heatmap": store.heatmap(start, end, severities).model_dump(mode="json"),
                "kde": store.kde(start, end, severities).model_dump(mode="json"),
                "spatialShift": store.spatial_shift(start, end, severities).model_dump(mode="json"),
                "downtownComparison": store.downtown_comparison(start, end, severities).model_dump(mode="json"),
            }
    for neighborhood in store.name_by_id:
        yield f"neighborhoods/{neighborhood}.json", {
            "contexts": {
                f"{start}-{end}": store.neighborhood_context(neighborhood, start, end).model_dump(mode="json")
                for start, end in ranges
            },
        }


def write_export(
    store: DataStore,
    directory: Path,
    *,
    code_revision: str,
    provenance: dict,
    verify: bool = False,
) -> dict:
    """Write a candidate release. The CLI publishes its manifest only after validation."""
    inventory = {}
    for relative, value in analytical_files(store):
        payload = canonical_json(value)
        if len(payload) > MAX_ASSET_BYTES:
            raise ValueError(f"Static asset exceeds 25 MiB: {relative}")
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        inventory[relative] = {"sha256": digest(payload), "size": len(payload)}
    payload = canonical_json(provenance)
    (directory / "provenance.json").write_bytes(payload)
    inventory["provenance.json"] = {"sha256": digest(payload), "size": len(payload)}
    if len(inventory) + 2 > MAX_ASSET_FILES:
        raise ValueError("Static export exceeds the free file limit")
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "datasetVersion": str(store.manifest["datasetVersion"]),
        "codeRevision": code_revision,
        "dependencyFingerprint": digest(payload),
        "meta": store.meta().model_dump(mode="json"),
        "files": inventory,
    }
    manifest["releaseId"] = digest(canonical_json(manifest))
    (directory / "manifest.json").write_bytes(canonical_json(manifest))
    verify_inventory(directory, manifest)
    if verify:
        verify_analytical_outputs(store, directory)
    return manifest


def verify_inventory(directory: Path, manifest: dict) -> None:
    expected = dict(manifest)
    release_id = expected.pop("releaseId")
    if digest(canonical_json(expected)) != release_id:
        raise ValueError("Static release identity does not match its contents")
    if (directory / "manifest.json").read_bytes() != canonical_json(manifest):
        raise ValueError("Stored static manifest differs from the release identity")
    files = manifest["files"]
    actual = {path.relative_to(directory).as_posix() for path in directory.rglob("*") if path.is_file()}
    if actual != set(files) | {"manifest.json"}:
        raise ValueError("Static release inventory does not match its files")
    for relative, info in files.items():
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Invalid static release path")
        payload = (directory / path).read_bytes()
        if len(payload) != info["size"] or digest(payload) != info["sha256"]:
            raise ValueError(f"Static release checksum mismatch: {relative}")


def verify_analytical_outputs(store: DataStore, directory: Path) -> int:
    """Compare the entire export with the independently wired local HTTP API."""
    from fastapi.testclient import TestClient
    from .main import app, get_store

    checked: set[str] = set()

    def compare(relative: str, expected: object) -> None:
        if json.loads((directory / relative).read_bytes()) != json.loads(canonical_json(expected)):
            raise ValueError(f"Static analytical result differs from the API: {relative}")
        checked.add(relative)

    previous = app.dependency_overrides.get(get_store)
    app.dependency_overrides[get_store] = lambda: store
    client = TestClient(app)

    def response(path: str, parameters: list[tuple[str, str]]) -> object:
        result = client.get(path, params=parameters)
        if result.status_code != 200:
            raise ValueError(f"Reference API failed for {path}")
        return result.json()

    try:
        compare("meta.json", store.meta().model_dump(mode="json"))
        compare("neighborhoods.geojson", response("/api/neighborhoods/geojson", []))
        compare("resolver.json", resolver_geometry(store))
        minimum, maximum = min(store.available_years), max(store.available_years)
        ranges = list(combinations_with_replacement(range(minimum, maximum + 1), 2))
        labels = ["property-damage", "injury", "serious-injury", "fatal", "unknown"]
        endpoints = {
            "summary": "summary", "heatmap": "heatmap", "kde": "kde",
            "spatialShift": "spatial-shift", "downtownComparison": "downtown-comparison",
        }
        for start, end in ranges:
            years = [("start_year", str(start)), ("end_year", str(end))]
            compare(f"explorer/{start}-{end}.json", {
                "summary": response("/api/neighborhoods/summary", years),
                "citywideTrend": response("/api/neighborhoods/citywide-trend", years),
            })
            for mask in range(32):
                filters = years + [("severity", label) for bit, label in enumerate(labels) if mask & (1 << bit)]
                compare(f"citywide/{start}-{end}/{mask}.json", {
                    key: response(f"/api/citywide/{endpoint}", filters) for key, endpoint in endpoints.items()
                })
        for neighborhood in store.name_by_id:
            compare(f"neighborhoods/{neighborhood}.json", {"contexts": {
                f"{start}-{end}": response(
                    f"/api/neighborhoods/{neighborhood}/context",
                    [("start_year", str(start)), ("end_year", str(end))],
                ) for start, end in ranges
            }})
        actual = {path.relative_to(directory).as_posix() for path in directory.rglob("*") if path.is_file()}
        if actual != checked | {"provenance.json", "manifest.json"}:
            raise ValueError("Static export does not cover exactly the supported API selections")
        return len(checked)
    finally:
        client.close()
        if previous is None:
            app.dependency_overrides.pop(get_store, None)
        else:
            app.dependency_overrides[get_store] = previous
