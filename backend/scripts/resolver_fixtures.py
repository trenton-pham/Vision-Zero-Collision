from __future__ import annotations

import argparse
import json
from pathlib import Path

import geopandas as gpd
from pyproj import Transformer
from shapely import transform
from shapely.geometry import MultiPolygon, Polygon, box

from backend.app.data import DataStore
from backend.app.static_export import canonical_json, resolver_geometry


def reference_suite(name: str, geometries: list, points: list[tuple[float, float]]) -> dict:
    inverse = Transformer.from_crs(26910, 4326, always_xy=True)
    store = object.__new__(DataStore)
    store.neighborhoods = gpd.GeoDataFrame(
        [{"id": identity, "name": identity, "geometry": transform(geometry, inverse.transform, interleaved=False)}
         for identity, geometry in geometries], crs=4326,
    ).sort_values("id")
    store.neighborhoods_projected = store.neighborhoods.to_crs(26910)
    cases = []
    for x, y in points:
        lng, lat = inverse.transform(x, y)
        cases.append({"lat": lat, "lng": lng, "expected": store.resolve(lat, lng).model_dump()})
    # Vertices are exact WGS84 boundary inputs rather than reprojected approximations.
    for geometry in store.neighborhoods.geometry:
        polygons = list(geometry.geoms) if isinstance(geometry, MultiPolygon) else [geometry]
        for polygon in polygons:
            for lng, lat in list(polygon.exterior.coords)[:-1]:
                cases.append({"lat": lat, "lng": lng, "expected": store.resolve(lat, lng).model_dump()})
    return {"name": name, "resolver": resolver_geometry(store), "cases": cases}


def synthetic_fixtures() -> dict:
    x, y = Transformer.from_crs(4326, 26910, always_xy=True).transform(-122.33, 47.61)
    suites = [
        reference_suite("shared boundary and tie", [
            ("alpha", box(x, y, x + 10, y + 10)),
            ("beta", box(x + 10, y, x + 20, y + 10)),
        ], [(x + 5, y + 5), (x + 10, y + 5), (x + 10, y - 10), (x + 10, y + 100)]),
        reference_suite("overlapping interiors", [
            ("alpha", box(x, y, x + 20, y + 20)),
            ("beta", box(x, y, x + 10, y + 10)),
        ], [(x + 5, y + 5), (x, y), (x - 1, y - 1)]),
        reference_suite("nearest cutoff", [("alpha", box(x, y, x + 10, y + 10))], [
            (x + offset, y + 5) for offset in (-24.999, -25.001, -25, -0.01, -1000)
        ]),
        reference_suite("holes and multipolygons", [
            ("alpha", MultiPolygon([
                Polygon(box(x, y, x + 100, y + 100).exterior.coords,
                        [box(x + 20, y + 20, x + 80, y + 80).exterior.coords]),
                box(x + 200, y, x + 210, y + 10),
            ])),
        ], [(x + 5, y + 5), (x + 50, y + 50), (x + 21, y + 50), (x + 205, y + 5)]),
    ]
    return {"suites": suites}


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Python oracle cases for browser map resolution")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--real", action="store_true")
    args = parser.parse_args()
    fixtures = synthetic_fixtures()
    if args.real:
        store = DataStore()
        cases = []
        for geometry in store.neighborhoods.geometry:
            point = geometry.representative_point()
            cases.append({"lat": point.y, "lng": point.x, "expected": store.resolve(point.y, point.x).model_dump()})
        fixtures["suites"].append({"name": "Seattle neighborhoods", "resolver": resolver_geometry(store), "cases": cases})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(canonical_json(fixtures))
    print(json.dumps({"suites": len(fixtures["suites"]), "cases": sum(len(s["cases"]) for s in fixtures["suites"])}))


if __name__ == "__main__":
    main()
