from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform
import shutil
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


def neighborhood_series(store: DataStore) -> dict:
    known = store.collisions.loc[store.collisions["HOUR"].notna()]
    known_counts = known.groupby(["neighborhood_id", "YEAR", "MONTH"], observed=True).size()
    columns = {
        "collisionCount": "collision_count", "injuries": "injuries",
        "seriousInjuries": "serious_injuries", "fatalities": "fatalities",
        "totalSeverity": "total_severity", "pedestrianCollisions": "pedestrian_collisions",
        "intersectionCollisions": "intersection_collisions", "nightCollisions": "night_collisions",
        "weekendCollisions": "weekend_collisions",
    }
    neighborhoods = {}
    for neighborhood, rows in store.monthly.groupby("neighborhood_id", observed=True):
        if neighborhood not in store.name_by_id:
            continue
        neighborhoods[str(neighborhood)] = {"monthly": [
            {
                "period": str(row.period),
                **{key: int(getattr(row, column)) for key, column in columns.items()},
                "knownTimeCollisions": int(known_counts.get((neighborhood, row.YEAR, row.MONTH), 0))
                if store.has_known_time_night_share else None,
            }
            for row in rows.sort_values(["YEAR", "MONTH"]).itertuples(index=False)
        ]}
    return {"neighborhoods": neighborhoods}


def partition(items: list, index: int, count: int) -> list:
    if count < 1 or not 0 <= index < count:
        raise ValueError("Shard index must be within a positive shard count")
    return items[index::count]


def assigned_ranges(ranges: list[tuple[int, int]], index: int, count: int) -> list[tuple[int, int]]:
    return partition(sorted(ranges, key=lambda years: (-(years[1] - years[0]), years)), index, count)


def analytical_files(store: DataStore, shard_index: int = 0, shard_count: int = 1) -> Iterator[tuple[str, dict]]:
    if shard_index == 0:
        yield "meta.json", store.meta().model_dump(mode="json")
        yield "neighborhoods.geojson", store.geojson
        yield "resolver.json", resolver_geometry(store)
        yield "neighborhood-series.json", neighborhood_series(store)
    ranges = year_ranges(store)
    for start, end in assigned_ranges(ranges, shard_index, shard_count):
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
    for neighborhood in partition(sorted(store.name_by_id), shard_index, shard_count):
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
    shard_index: int | None = None,
    shard_count: int = 1,
) -> dict:
    """Write a candidate release. The CLI publishes its manifest only after validation."""
    inventory = {}
    values = analytical_files(store) if shard_index is None else analytical_files(store, shard_index, shard_count)
    for relative, value in values:
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
    if shard_index is not None:
        partition([], shard_index, shard_count)
        manifest["shard"] = {
            "index": shard_index, "count": shard_count, "verified": verify,
            "neighborhoods": sorted(store.name_by_id),
        }
    manifest["releaseId"] = digest(canonical_json(manifest))
    (directory / "manifest.json").write_bytes(canonical_json(manifest))
    verify_inventory(directory, manifest)
    if verify:
        verify_analytical_outputs(store, directory, shard_index=shard_index, shard_count=shard_count)
    return manifest


def verify_inventory(directory: Path, manifest: dict) -> None:
    expected = dict(manifest)
    release_id = expected.pop("releaseId")
    if digest(canonical_json(expected)) != release_id:
        raise ValueError("Static release identity does not match its contents")
    if (directory / "manifest.json").read_bytes() != canonical_json(manifest):
        raise ValueError("Stored static manifest differs from the release identity")
    files = manifest["files"]
    paths = list(directory.rglob("*"))
    if directory.is_symlink() or any(path.is_symlink() for path in paths):
        raise ValueError("Static release contains a symbolic link")
    actual = {path.relative_to(directory).as_posix() for path in paths if path.is_file()}
    if actual != set(files) | {"manifest.json"}:
        raise ValueError("Static release inventory does not match its files")
    for relative, info in files.items():
        path = Path(relative)
        if path.is_absolute() or ".." in path.parts or path.as_posix() != relative:
            raise ValueError("Invalid static release path")
        resolved = directory / path
        if resolved.stat().st_size > MAX_ASSET_BYTES:
            raise ValueError("Static asset exceeds 25 MiB")
        payload = resolved.read_bytes()
        if len(payload) != info["size"] or digest(payload) != info["sha256"]:
            raise ValueError(f"Static release checksum mismatch: {relative}")


def verify_analytical_outputs(
    store: DataStore, directory: Path, *, shard_index: int | None = None, shard_count: int = 1,
) -> int:
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
        if shard_index in (None, 0):
            compare("meta.json", store.meta().model_dump(mode="json"))
            compare("neighborhoods.geojson", response("/api/neighborhoods/geojson", []))
            compare("resolver.json", resolver_geometry(store))
            compare("neighborhood-series.json", neighborhood_series(store))
        minimum, maximum = min(store.available_years), max(store.available_years)
        ranges = list(combinations_with_replacement(range(minimum, maximum + 1), 2))
        labels = ["property-damage", "injury", "serious-injury", "fatal", "unknown"]
        endpoints = {
            "summary": "summary", "heatmap": "heatmap", "kde": "kde",
            "spatialShift": "spatial-shift", "downtownComparison": "downtown-comparison",
        }
        for start, end in assigned_ranges(ranges, shard_index or 0, shard_count):
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
        for neighborhood in partition(sorted(store.name_by_id), shard_index or 0, shard_count):
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


def merge_exports(
    shards: Path, directory: Path, *, code_revision: str, shard_count: int, dataset_version: str | None = None,
) -> dict:
    """Validate shard boundaries before producing the ordinary immutable manifest."""
    manifests = sorted(shards.glob("*/manifest.json"))
    if shard_count < 1 or len(manifests) != shard_count:
        raise ValueError("Missing or extra export shards")
    inventory: dict[str, dict] = {}
    seen = set()
    baseline = None
    for path in manifests:
        if path.is_symlink() or path.parent.is_symlink():
            raise ValueError("Static release contains a symbolic link")
        manifest = json.loads(path.read_bytes())
        verify_inventory(path.parent, manifest)
        shard = manifest.get("shard", {})
        index = shard.get("index")
        if type(index) is not int or not 0 <= index < shard_count or index in seen:
            raise ValueError("Duplicate or invalid export shard index")
        if shard.get("count") != shard_count or shard.get("verified") is not True:
            raise ValueError("Export shard is unverified or has a different count")
        seen.add(index)
        identity = {key: value for key, value in manifest.items() if key not in {"files", "releaseId", "shard"}}
        identity["neighborhoods"] = shard["neighborhoods"]
        if identity["codeRevision"] != code_revision or (baseline is not None and identity != baseline):
            raise ValueError("Export shard dataset, revision, or provenance differs")
        if dataset_version is not None and manifest["datasetVersion"] != dataset_version:
            raise ValueError("Export shard differs from the pinned dataset version")
        baseline = identity
        years = manifest["meta"]["availableYears"]
        ranges = list(combinations_with_replacement(range(min(years), max(years) + 1), 2))
        expected = {"provenance.json"}
        if index == 0:
            expected.update({"meta.json", "neighborhoods.geojson", "resolver.json", "neighborhood-series.json"})
        for start, end in assigned_ranges(ranges, index, shard_count):
            expected.add(f"explorer/{start}-{end}.json")
            expected.update(f"citywide/{start}-{end}/{mask}.json" for mask in range(32))
        expected.update(f"neighborhoods/{name}.json" for name in partition(shard["neighborhoods"], index, shard_count))
        if set(manifest["files"]) != expected:
            raise ValueError("Export shard does not cover exactly its assigned selections")
        if digest((path.parent / "provenance.json").read_bytes()) != manifest["dependencyFingerprint"]:
            raise ValueError("Export shard dependency provenance differs")
        for relative, info in manifest["files"].items():
            if relative in inventory:
                if relative == "provenance.json" and inventory[relative] == info:
                    continue
                raise ValueError("Overlapping export shard files")
            target = directory / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path.parent / relative, target)
            inventory[relative] = info
    neighborhoods = baseline.pop("neighborhoods")
    resolver_ids = sorted(item["id"] for item in json.loads((directory / "resolver.json").read_bytes())["features"])
    if neighborhoods != resolver_ids or len(neighborhoods) != baseline["meta"]["neighborhoodCount"]:
        raise ValueError("Export shard neighborhood coverage differs from the resolver")
    if json.loads((directory / "meta.json").read_bytes()) != baseline["meta"]:
        raise ValueError("Export shard metadata differs")
    if len(inventory) + 2 > MAX_ASSET_FILES:
        raise ValueError("Static export exceeds the free file limit")
    manifest = {**baseline, "files": inventory}
    manifest["releaseId"] = digest(canonical_json(manifest))
    (directory / "manifest.json").write_bytes(canonical_json(manifest))
    verify_inventory(directory, manifest)
    return manifest
