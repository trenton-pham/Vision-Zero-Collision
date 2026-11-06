import json
from pathlib import Path

import numpy as np
import pandas as pd


def test_notebook_night_share_uses_only_recorded_times():
    notebook = json.loads((Path(__file__).resolve().parents[2] / 'notebooks/model.ipynb').read_text())
    source = next(''.join(cell['source']) for cell in notebook['cells'] if "night_ratio=('HOUR'" in ''.join(cell.get('source', [])))
    hours = [21, np.nan, np.nan, np.nan, 6, 20, 5, 19]
    frame = pd.DataFrame({
        'lat_bin': [0, 0, 1, 1, 2, 2, 2, 2], 'lon_bin': 0, 'HOUR': hours,
        'COLDETKEY': range(len(hours)), 'SEVERITY': 0, 'INJURIES': 0,
        'SERIOUSINJURIES': 0, 'FATALITIES': 0, 'VEHCOUNT': 1, 'TOTAL_PED': 0,
        'Y': 47.6, 'X': -122.3, 'Day_of_Week': 'Monday', 'Season': 'Summer',
        'JUNCTIONTYPE': 'At Intersection',
    })
    namespace = {'gdf': frame, 'pd': pd, 'np': np}
    exec(compile(source, 'model.ipynb night feature cell', 'exec'), namespace)
    ratios = namespace['grid'].set_index('lat_bin')['night_ratio']
    assert ratios[0] == 1.0
    assert pd.isna(ratios[1])
    assert ratios[2] == 0.5
