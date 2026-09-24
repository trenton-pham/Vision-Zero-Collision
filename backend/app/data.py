from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import geopandas as gpd
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.stats import gaussian_kde
from shapely.geometry import Point

from .schemas import (
    AnnualMetric,
    CitywideSummary,
    CitywideTrendContext,
    DatasetMeta,
    DowntownAnnual,
    DowntownComparisonResponse,
    HeatmapPoint,
    HeatmapResponse,
    KdeCell,
    KdeResponse,
    MetricDefinition,
    MonthlyMetric,
    NeighborhoodContext,
    NeighborhoodMetricSet,
    ResolveResponse,
    ShiftPeriod,
    SpatialShiftResponse,
    TrendComparison,
    TrendPeriod,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT_DIR = ROOT / "data/dashboard"
PARTIAL_LABEL = "2026 partial · records received through August 31, 2026"
DOWNTOWN_BBOX = {"yMin": 47.595, "yMax": 47.620, "xMin": -122.345, "xMax": -122.320}
SEVERITY_KEYS = {
    "property-damage": "Property Damage Only Collision",
    "injury": "Injury Collision",
    "serious-injury": "Serious Injury Collision",
    "fatal": "Fatal Collision",
    "unknown": None,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class ArtifactError(RuntimeError):
    pass


class DataStore:
    def __init__(self, artifact_dir: Path = DEFAULT_ARTIFACT_DIR, validate_sources: bool = True):
        self.artifact_dir = Path(artifact_dir)
        self.manifest = self._read_manifest()
        if validate_sources:
            self._validate_sources()
        self.collisions = pd.read_parquet(self.artifact_dir / "collisions_assigned.parquet")
        self.annual = pd.read_parquet(self.artifact_dir / "neighborhood_annual.parquet")
        self.monthly = pd.read_parquet(self.artifact_dir / "context_monthly.parquet")
        self.geojson = json.loads((self.artifact_dir / "neighborhoods.geojson").read_text())
        self.neighborhoods = gpd.read_file(self.artifact_dir / "neighborhoods.geojson").sort_values("id")
        self.neighborhoods_projected = self.neighborhoods.to_crs("EPSG:26910")
        self.name_by_id = dict(zip(self.neighborhoods["id"], self.neighborhoods["name"], strict=True))

        self.collisions["severity_score"] = (
            self.collisions["INJURIES"].fillna(0)
            + 3 * self.collisions["SERIOUSINJURIES"].fillna(0)
            + 5 * self.collisions["FATALITIES"].fillna(0)
        )
        self.collisions["pedestrian_collision"] = self.collisions["PEDCOUNT"].fillna(0).gt(0)
        self.collisions["intersection"] = self.collisions["JUNCTIONTYPE"].fillna("").str.startswith("At Intersection")
        self.collisions["night"] = self.collisions["HOUR"].lt(6) | self.collisions["HOUR"].ge(20)
        self.collisions["weekend"] = self.collisions["Day_of_Week"].isin(["Saturday", "Sunday"])

    def _read_manifest(self) -> dict:
        path = self.artifact_dir / "manifest.json"
        required = [
            path,
            self.artifact_dir / "collisions_assigned.parquet",
            self.artifact_dir / "neighborhood_annual.parquet",
            self.artifact_dir / "context_monthly.parquet",
            self.artifact_dir / "neighborhoods.geojson",
        ]
        missing = [str(item) for item in required if not item.exists()]
        if missing:
            raise ArtifactError(
                "Dashboard artifacts are absent. Run `python -m backend.scripts.build_artifacts`. "
                f"Missing: {', '.join(missing)}"
            )
        return json.loads(path.read_text())

    def _validate_sources(self) -> None:
        for relative, expected in self.manifest.get("sourceHashes", {}).items():
            source = ROOT / relative
            if not source.exists() or sha256(source) != expected:
                raise ArtifactError(
                    f"Dashboard artifacts are stale for {relative}. "
                    "Run `python -m backend.scripts.build_artifacts`."
                )

    @property
    def available_years(self) -> list[int]:
        return [int(v) for v in self.manifest["availableYears"]]

    @property
    def partial_years(self) -> list[int]:
        return [int(v) for v in self.manifest["partialYears"]]

    def validate_year_range(self, start_year: int, end_year: int) -> None:
        minimum, maximum = min(self.available_years), max(self.available_years)
        if start_year > end_year:
            raise ValueError("start_year must be less than or equal to end_year")
        if start_year < minimum or end_year > maximum:
            raise ValueError(f"year range must be between {minimum} and {maximum}")

    def meta(self) -> DatasetMeta:
        definitions = [
            MetricDefinition(key="collisionCount", label="Collisions", definition="Recorded collisions in the selected years.", unit="count"),
            MetricDefinition(key="injuries", label="Injuries", definition="Sum of reported injuries.", unit="people"),
            MetricDefinition(key="seriousInjuries", label="Serious injuries", definition="Sum of reported serious injuries.", unit="people"),
            MetricDefinition(key="fatalities", label="Fatalities", definition="Sum of reported fatalities.", unit="people"),
            MetricDefinition(key="totalSeverity", label="Severity burden", definition="Injuries + 3× serious injuries + 5× fatalities.", unit="score"),
            MetricDefinition(key="meanSeverity", label="Mean severity", definition="Composite severity burden per collision.", unit="score/collision"),
            MetricDefinition(key="pedestrianCollisions", label="Pedestrian-involved", definition="Collisions where PEDCOUNT is greater than zero.", unit="count"),
            MetricDefinition(key="intersectionShare", label="Intersection share", definition="Share whose junction type starts with At Intersection.", unit="percent"),
            MetricDefinition(key="nightShare", label="Night share", definition="Share occurring from 20:00 through 05:59.", unit="percent"),
            MetricDefinition(key="weekendShare", label="Weekend share", definition="Share occurring Saturday or Sunday.", unit="percent"),
        ]
        return DatasetMeta(
            dataAsOf=self.manifest["dataAsOf"],
            availableYears=self.available_years,
            partialYears=self.partial_years,
            metricDefinitions=definitions,
            neighborhoodCount=int(self.manifest["neighborhoodCount"]),
            collisionCount=int(self.manifest["collisionCount"]),
            artifactVersion=self.manifest["artifactVersion"],
        )

    @staticmethod
    def _nullable_ratio(numerator: float, denominator: int) -> float | None:
        return round(float(numerator) / denominator, 4) if denominator else None

    def _metric_set_from_annual(self, neighborhood_id: str, rows: pd.DataFrame) -> NeighborhoodMetricSet:
        count = int(rows["collision_count"].sum())
        severity = int(rows["total_severity"].sum())
        return NeighborhoodMetricSet(
            id=neighborhood_id,
            name=self.name_by_id.get(neighborhood_id, "Citywide"),
            collisionCount=count,
            injuries=int(rows["injuries"].sum()),
            seriousInjuries=int(rows["serious_injuries"].sum()),
            fatalities=int(rows["fatalities"].sum()),
            totalSeverity=severity,
            meanSeverity=round(severity / count, 3) if count else None,
            pedestrianCollisions=int(rows["pedestrian_collisions"].sum()),
            intersectionShare=self._nullable_ratio(rows["intersection_collisions"].sum(), count),
            nightShare=self._nullable_ratio(rows["night_collisions"].sum(), count),
            weekendShare=self._nullable_ratio(rows["weekend_collisions"].sum(), count),
        )

    def neighborhood_summary(self, start_year: int, end_year: int) -> list[NeighborhoodMetricSet]:
        self.validate_year_range(start_year, end_year)
        subset = self.annual[self.annual["YEAR"].between(start_year, end_year)]
        return [
            self._metric_set_from_annual(hood_id, subset[subset["neighborhood_id"] == hood_id])
            for hood_id in self.neighborhoods["id"]
        ]

    def _trend(self, rows: pd.DataFrame) -> TrendComparison:
        complete = rows[~rows["YEAR"].isin(self.partial_years)].sort_values("YEAR")
        years = complete["YEAR"].astype(int).tolist()
        if len(years) < 6:
            return TrendComparison(
                status="insufficient_years",
                message="At least six complete years are required for non-overlapping three-year comparison periods.",
            )
        first_years, last_years = years[:3], years[-3:]
        first = complete[complete["YEAR"].isin(first_years)]
        last = complete[complete["YEAR"].isin(last_years)]
        first_collisions = float(first["collision_count"].mean())
        last_collisions = float(last["collision_count"].mean())
        first_severity = float(first["total_severity"].mean())
        last_severity = float(last["total_severity"].mean())

        def change(current: float, baseline: float) -> float | None:
            return round((current - baseline) / baseline * 100, 1) if baseline else None

        return TrendComparison(
            status="available",
            firstPeriod=TrendPeriod(years=first_years, averageCollisions=round(first_collisions, 1), averageSeverityBurden=round(first_severity, 1)),
            lastPeriod=TrendPeriod(years=last_years, averageCollisions=round(last_collisions, 1), averageSeverityBurden=round(last_severity, 1)),
            collisionChangePercent=change(last_collisions, first_collisions),
            severityChangePercent=change(last_severity, first_severity),
            message="Compares non-overlapping first and last three-year averages, excluding partial years.",
        )

    def _annual_metrics(self, rows: pd.DataFrame) -> list[AnnualMetric]:
        return [
            AnnualMetric(
                year=int(row.YEAR),
                collisionCount=int(row.collision_count),
                injuries=int(row.injuries),
                seriousInjuries=int(row.serious_injuries),
                fatalities=int(row.fatalities),
                totalSeverity=int(row.total_severity),
                meanSeverity=round(float(row.mean_severity), 3) if pd.notna(row.mean_severity) else None,
                isPartial=int(row.YEAR) in self.partial_years,
            )
            for row in rows.itertuples(index=False)
        ]

    def _monthly_metrics(self, rows: pd.DataFrame) -> list[MonthlyMetric]:
        return [
            MonthlyMetric(
                period=str(row.period),
                year=int(row.YEAR),
                month=int(row.MONTH),
                collisionCount=int(row.collision_count),
                injuries=int(row.injuries),
                seriousInjuries=int(row.serious_injuries),
                fatalities=int(row.fatalities),
                totalSeverity=int(row.total_severity),
                meanSeverity=round(float(row.mean_severity), 3) if pd.notna(row.mean_severity) else None,
                isPartial=int(row.YEAR) in self.partial_years,
            )
            for row in rows.itertuples(index=False)
        ]

    def _warnings(self, start_year: int, end_year: int) -> list[str]:
        includes_partial = any(year in self.partial_years for year in range(start_year, end_year + 1))
        return [PARTIAL_LABEL] if includes_partial else []

    def neighborhood_context(self, neighborhood_id: str, start_year: int, end_year: int) -> NeighborhoodContext:
        self.validate_year_range(start_year, end_year)
        if neighborhood_id not in self.name_by_id:
            raise KeyError(neighborhood_id)
        rows = self.annual[
            (self.annual["neighborhood_id"] == neighborhood_id)
            & self.annual["YEAR"].between(start_year, end_year)
        ].sort_values("YEAR")
        monthly_rows = self.monthly[
            (self.monthly["neighborhood_id"] == neighborhood_id)
            & self.monthly["YEAR"].between(start_year, end_year)
        ].sort_values(["YEAR", "MONTH"])
        return NeighborhoodContext(
            neighborhood={"id": neighborhood_id, "name": self.name_by_id[neighborhood_id]},
            selectedYears=[start_year, end_year],
            metrics=self._metric_set_from_annual(neighborhood_id, rows),
            annual=self._annual_metrics(rows),
            monthly=self._monthly_metrics(monthly_rows),
            comparison=self._trend(rows),
            warnings=self._warnings(start_year, end_year),
        )

    def citywide_trend(self, start_year: int, end_year: int) -> CitywideTrendContext:
        self.validate_year_range(start_year, end_year)
        annual_rows = self.annual[
            (self.annual["neighborhood_id"] == "citywide")
            & self.annual["YEAR"].between(start_year, end_year)
        ].sort_values("YEAR")
        metrics = self._metric_set_from_annual("citywide", annual_rows)
        monthly_rows = self.monthly[
            (self.monthly["neighborhood_id"] == "citywide")
            & self.monthly["YEAR"].between(start_year, end_year)
        ].sort_values(["YEAR", "MONTH"])
        return CitywideTrendContext(
            scope={"id": "citywide", "name": "Seattle citywide"},
            selectedYears=[start_year, end_year],
            metrics=metrics,
            annual=self._annual_metrics(annual_rows),
            monthly=self._monthly_metrics(monthly_rows),
            comparison=self._trend(annual_rows),
            warnings=self._warnings(start_year, end_year),
        )

    def resolve(self, lat: float, lng: float) -> ResolveResponse:
        point = Point(lng, lat)
        contained = self.neighborhoods[self.neighborhoods.geometry.contains(point)]
        if not contained.empty:
            row = contained.sort_values("id").iloc[0]
            return ResolveResponse(id=row.id, name=row["name"], method="contains", distanceMeters=0)
        boundary = self.neighborhoods[self.neighborhoods.geometry.intersects(point)]
        if not boundary.empty:
            candidates = boundary.copy()
            candidates["area"] = candidates.to_crs("EPSG:26910").area.values
            row = candidates.sort_values(["area", "id"]).iloc[0]
            return ResolveResponse(id=row.id, name=row["name"], method="boundary", distanceMeters=0)
        projected = gpd.GeoSeries([point], crs="EPSG:4326").to_crs("EPSG:26910").iloc[0]
        distances = self.neighborhoods_projected.geometry.distance(projected)
        minimum = float(distances.min())
        if minimum <= 25:
            nearest = self.neighborhoods_projected.loc[distances[distances == distances.min()].index].sort_values("id").iloc[0]
            return ResolveResponse(id=nearest.id, name=nearest["name"], method="nearest", distanceMeters=round(minimum, 2))
        return ResolveResponse(id=None, name=None, method="unassigned", distanceMeters=round(minimum, 2))

    def _filter_citywide(self, start_year: int, end_year: int, severities: Iterable[str]) -> pd.DataFrame:
        self.validate_year_range(start_year, end_year)
        selected = list(dict.fromkeys(severities))
        invalid = sorted(set(selected) - set(SEVERITY_KEYS))
        if invalid:
            raise ValueError(f"unknown severity filter: {', '.join(invalid)}")
        frame = self.collisions[self.collisions["YEAR"].between(start_year, end_year)]
        if selected:
            include_null = "unknown" in selected
            labels = [SEVERITY_KEYS[item] for item in selected if item != "unknown"]
            mask = frame["MAXSEVERITYDESC"].isin(labels)
            if include_null:
                mask |= frame["MAXSEVERITYDESC"].isna()
            frame = frame[mask]
        return frame

    def _metric_set_from_collisions(self, frame: pd.DataFrame) -> NeighborhoodMetricSet:
        count = len(frame)
        severity = int(frame["severity_score"].sum())
        return NeighborhoodMetricSet(
            id="citywide",
            name="Seattle citywide",
            collisionCount=count,
            injuries=int(frame["INJURIES"].sum()),
            seriousInjuries=int(frame["SERIOUSINJURIES"].sum()),
            fatalities=int(frame["FATALITIES"].sum()),
            totalSeverity=severity,
            meanSeverity=round(severity / count, 3) if count else None,
            pedestrianCollisions=int(frame["pedestrian_collision"].sum()),
            intersectionShare=self._nullable_ratio(frame["intersection"].sum(), count),
            nightShare=self._nullable_ratio(frame["night"].sum(), count),
            weekendShare=self._nullable_ratio(frame["weekend"].sum(), count),
        )

    def citywide_summary(self, start_year: int, end_year: int, severities: list[str]) -> CitywideSummary:
        frame = self._filter_citywide(start_year, end_year, severities)
        warnings = [PARTIAL_LABEL] if 2026 in range(start_year, end_year + 1) else []
        return CitywideSummary(
            selectedYears=[start_year, end_year],
            severities=severities,
            metrics=self._metric_set_from_collisions(frame),
            warnings=warnings,
        )

    def heatmap(self, start_year: int, end_year: int, severities: list[str]) -> HeatmapResponse:
        frame = self._filter_citywide(start_year, end_year, severities)
        if frame.empty:
            return HeatmapResponse(points=[], maxWeight=0, collisionCount=0)
        counts, lat_edges, lng_edges = np.histogram2d(frame["Y"], frame["X"], bins=[55, 55])
        points: list[HeatmapPoint] = []
        for row, column in np.argwhere(counts > 0):
            points.append(HeatmapPoint(
                lat=round(float((lat_edges[row] + lat_edges[row + 1]) / 2), 6),
                lng=round(float((lng_edges[column] + lng_edges[column + 1]) / 2), 6),
                weight=int(counts[row, column]),
            ))
        return HeatmapResponse(points=points, maxWeight=int(counts.max()), collisionCount=len(frame))

    def kde(self, start_year: int, end_year: int, severities: list[str]) -> KdeResponse:
        frame = self._filter_citywide(start_year, end_year, severities)
        bounds = [
            float(self.collisions["Y"].min()), float(self.collisions["X"].min()),
            float(self.collisions["Y"].max()), float(self.collisions["X"].max()),
        ]
        rows = columns = 42
        if len(frame) < 3:
            return KdeResponse(cells=[], rows=rows, columns=columns, bounds=bounds, collisionCount=len(frame))
        stride = max(1, len(frame) // 12_000)
        sample = frame.iloc[::stride, :].head(12_000)
        lat_values = np.linspace(bounds[0], bounds[2], rows)
        lng_values = np.linspace(bounds[1], bounds[3], columns)
        lng_grid, lat_grid = np.meshgrid(lng_values, lat_values)
        try:
            estimator = gaussian_kde(np.vstack([sample["X"], sample["Y"]]))
            density = estimator(np.vstack([lng_grid.ravel(), lat_grid.ravel()]))
        except np.linalg.LinAlgError:
            return KdeResponse(cells=[], rows=rows, columns=columns, bounds=bounds, collisionCount=len(frame))
        maximum = float(density.max()) or 1.0
        cells = [
            KdeCell(lat=round(float(lat), 6), lng=round(float(lng), 6), density=round(float(value / maximum), 6))
            for lat, lng, value in zip(lat_grid.ravel(), lng_grid.ravel(), density, strict=True)
        ]
        return KdeResponse(cells=cells, rows=rows, columns=columns, bounds=bounds, collisionCount=len(frame))

    def spatial_shift(self, start_year: int, end_year: int, severities: list[str]) -> SpatialShiftResponse:
        frame = self._filter_citywide(start_year, end_year, severities)
        complete = frame[~frame["YEAR"].isin(self.partial_years)]
        before = complete[complete["YEAR"] < 2020]
        after = complete[complete["YEAR"] >= 2020]
        forward = Transformer.from_crs("EPSG:4326", "EPSG:26910", always_xy=True)
        inverse = Transformer.from_crs("EPSG:26910", "EPSG:4326", always_xy=True)

        def period(label: str, rows: pd.DataFrame) -> tuple[ShiftPeriod, tuple[float, float] | None]:
            years = sorted(int(v) for v in rows["YEAR"].unique())
            if rows.empty:
                return ShiftPeriod(label=label, years=years, collisionCount=0, centroidLat=None, centroidLng=None), None
            xs, ys = forward.transform(rows["X"].to_numpy(), rows["Y"].to_numpy())
            centroid = (float(np.mean(xs)), float(np.mean(ys)))
            lng, lat = inverse.transform(*centroid)
            return ShiftPeriod(label=label, years=years, collisionCount=len(rows), centroidLat=round(lat, 6), centroidLng=round(lng, 6)), centroid

        before_period, before_xy = period("Pre-2020 complete years", before)
        after_period, after_xy = period("2020+ complete years", after)
        shift = None if before_xy is None or after_xy is None else round(float(np.hypot(after_xy[0] - before_xy[0], after_xy[1] - before_xy[1])), 1)
        return SpatialShiftResponse(
            before=before_period,
            after=after_period,
            shiftMeters=shift,
            excludedYears=[year for year in self.partial_years if start_year <= year <= end_year],
            status="available" if shift is not None else "insufficient_periods",
        )

    def downtown_comparison(self, start_year: int, end_year: int, severities: list[str]) -> DowntownComparisonResponse:
        frame = self._filter_citywide(start_year, end_year, severities).copy()
        frame["downtown"] = (
            frame["Y"].between(DOWNTOWN_BBOX["yMin"], DOWNTOWN_BBOX["yMax"])
            & frame["X"].between(DOWNTOWN_BBOX["xMin"], DOWNTOWN_BBOX["xMax"])
        )
        result: list[DowntownAnnual] = []
        for year in range(start_year, end_year + 1):
            year_rows = frame[frame["YEAR"] == year]
            downtown = year_rows[year_rows["downtown"]]
            outer = year_rows[~year_rows["downtown"]]
            result.append(DowntownAnnual(
                year=year,
                downtownCollisions=len(downtown),
                outerCollisions=len(outer),
                downtownMeanSeverity=round(float(downtown["severity_score"].mean()), 3) if len(downtown) else None,
                outerMeanSeverity=round(float(outer["severity_score"].mean()), 3) if len(outer) else None,
                isPartial=year in self.partial_years,
            ))
        return DowntownComparisonResponse(bbox=DOWNTOWN_BBOX, annual=result)


@lru_cache(maxsize=1)
def get_store() -> DataStore:
    return DataStore()
