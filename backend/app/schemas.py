from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class MetricDefinition(ApiModel):
    key: str
    label: str
    definition: str
    unit: str


class DatasetMeta(ApiModel):
    dataAsOf: str
    availableYears: list[int]
    partialYears: list[int]
    metricDefinitions: list[MetricDefinition]
    neighborhoodCount: int
    collisionCount: int
    artifactVersion: str


class NeighborhoodMetricSet(ApiModel):
    id: str
    name: str
    collisionCount: int
    injuries: int
    seriousInjuries: int
    fatalities: int
    totalSeverity: int
    meanSeverity: float | None
    pedestrianCollisions: int
    intersectionShare: float | None
    nightShare: float | None
    weekendShare: float | None


class AnnualMetric(ApiModel):
    year: int
    collisionCount: int
    injuries: int
    seriousInjuries: int
    fatalities: int
    totalSeverity: int
    meanSeverity: float | None
    isPartial: bool


class MonthlyMetric(ApiModel):
    period: str
    year: int
    month: int
    collisionCount: int
    injuries: int
    seriousInjuries: int
    fatalities: int
    totalSeverity: int
    meanSeverity: float | None
    isPartial: bool


class TrendPeriod(ApiModel):
    years: list[int]
    averageCollisions: float
    averageSeverityBurden: float


class TrendComparison(ApiModel):
    status: Literal["available", "insufficient_years"]
    firstPeriod: TrendPeriod | None = None
    lastPeriod: TrendPeriod | None = None
    collisionChangePercent: float | None = None
    severityChangePercent: float | None = None
    message: str


class NeighborhoodContext(ApiModel):
    neighborhood: dict[str, str]
    selectedYears: list[int]
    metrics: NeighborhoodMetricSet
    annual: list[AnnualMetric]
    monthly: list[MonthlyMetric]
    comparison: TrendComparison
    warnings: list[str]


class CitywideTrendContext(ApiModel):
    scope: dict[str, str]
    selectedYears: list[int]
    metrics: NeighborhoodMetricSet
    annual: list[AnnualMetric]
    monthly: list[MonthlyMetric]
    comparison: TrendComparison
    warnings: list[str]


class ResolveResponse(ApiModel):
    id: str | None
    name: str | None
    method: Literal["contains", "boundary", "nearest", "unassigned"]
    distanceMeters: float | None = None


class CitywideSummary(ApiModel):
    selectedYears: list[int]
    severities: list[str]
    metrics: NeighborhoodMetricSet
    warnings: list[str]


class HeatmapPoint(ApiModel):
    lat: float
    lng: float
    weight: int


class HeatmapResponse(ApiModel):
    points: list[HeatmapPoint]
    maxWeight: int
    collisionCount: int


class KdeCell(ApiModel):
    lat: float
    lng: float
    density: float


class KdeResponse(ApiModel):
    cells: list[KdeCell]
    rows: int
    columns: int
    bounds: list[float]
    collisionCount: int


class ShiftPeriod(ApiModel):
    label: str
    years: list[int]
    collisionCount: int
    centroidLat: float | None
    centroidLng: float | None


class SpatialShiftResponse(ApiModel):
    before: ShiftPeriod
    after: ShiftPeriod
    shiftMeters: float | None
    excludedYears: list[int]
    status: Literal["available", "insufficient_periods"]


class DowntownAnnual(ApiModel):
    year: int
    downtownCollisions: int
    outerCollisions: int
    downtownMeanSeverity: float | None
    outerMeanSeverity: float | None
    isPartial: bool


class DowntownComparisonResponse(ApiModel):
    bbox: dict[str, float]
    annual: list[DowntownAnnual]


class ErrorResponse(ApiModel):
    detail: str


GeoJson = dict[str, Any]
