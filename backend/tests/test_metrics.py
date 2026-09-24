from __future__ import annotations

import pandas as pd

from backend.app.data import DataStore


def test_metric_formula_and_null_safe_shares(store: DataStore) -> None:
    rows = pd.DataFrame([
        {
            "collision_count": 2,
            "injuries": 3,
            "serious_injuries": 1,
            "fatalities": 1,
            "total_severity": 11,
            "pedestrian_collisions": 1,
            "intersection_collisions": 1,
            "night_collisions": 1,
            "weekend_collisions": 2,
        }
    ])
    metrics = store._metric_set_from_annual("ballard", rows)
    assert metrics.totalSeverity == 11
    assert metrics.meanSeverity == 5.5
    assert metrics.intersectionShare == 0.5
    assert metrics.nightShare == 0.5
    assert metrics.weekendShare == 1.0

    empty = rows.copy()
    for column in empty.columns:
        empty[column] = 0
    zero = store._metric_set_from_annual("ballard", empty)
    assert zero.collisionCount == 0
    assert zero.meanSeverity is None
    assert zero.intersectionShare is None


def test_annual_series_is_zero_filled_and_partial_excluded_from_trend(store: DataStore) -> None:
    context = store.neighborhood_context("ballard", 2015, 2026)
    assert [item.year for item in context.annual] == list(range(2015, 2027))
    assert context.annual[-1].isPartial is True
    assert context.comparison.status == "available"
    assert 2026 not in context.comparison.lastPeriod.years
    assert context.warnings == ["Partial through August 31, 2026"]


def test_short_range_returns_explicit_insufficient_years(store: DataStore) -> None:
    context = store.neighborhood_context("ballard", 2022, 2026)
    assert context.comparison.status == "insufficient_years"
    assert context.comparison.firstPeriod is None


def test_citywide_severity_filter_does_not_change_neighborhood_metrics(store: DataStore) -> None:
    before = store.neighborhood_context("ballard", 2021, 2025).metrics
    fatal_citywide = store.citywide_summary(2021, 2025, ["fatal"])
    after = store.neighborhood_context("ballard", 2021, 2025).metrics
    assert before == after
    assert fatal_citywide.metrics.collisionCount > 0
    assert fatal_citywide.metrics.collisionCount < before.collisionCount


def test_spatial_shift_excludes_partial_year(store: DataStore) -> None:
    shift = store.spatial_shift(2018, 2026, [])
    assert shift.excludedYears == [2026]
    assert 2026 not in shift.after.years

