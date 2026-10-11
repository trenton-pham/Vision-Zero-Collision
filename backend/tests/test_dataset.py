import pandas as pd
import pytest

from backend.app.dataset import add_metric_columns


@pytest.mark.parametrize("junction_dtype", ["object", "string", "category"])
def test_metric_enrichment_preserves_inputs_and_unknown_values(junction_dtype: str) -> None:
    frame = pd.DataFrame({
        "INJURIES": [3, 0, None],
        "SERIOUSINJURIES": [1, 0, None],
        "FATALITIES": [1, 0, None],
        "PEDCOUNT": [1, 0, None],
        "JUNCTIONTYPE": pd.Series(["At Intersection", "Mid-Block", None], dtype=junction_dtype),
        "HOUR": [21, 12, None],
        "Day_of_Week": ["Friday", "Saturday", None],
    })
    original = frame.copy(deep=True)

    enriched = add_metric_columns(frame)

    pd.testing.assert_frame_equal(frame, original)
    pd.testing.assert_frame_equal(enriched[frame.columns], original)
    assert enriched["severity_score"].tolist() == [11, 0, 0]
    assert enriched["pedestrian_collision"].tolist() == [True, False, False]
    assert enriched["intersection"].tolist() == [True, False, False]
    assert enriched["night"].tolist() == [True, False, False]
    assert enriched["weekend"].tolist() == [False, True, False]
    enriched.loc[0, "INJURIES"] = 99
    pd.testing.assert_frame_equal(frame, original)

    empty = add_metric_columns(frame.iloc[:0])
    assert empty.empty
    assert empty.columns.tolist() == enriched.columns.tolist()
