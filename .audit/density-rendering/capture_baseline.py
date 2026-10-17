import cProfile
import json
import pstats
import statistics
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.data import DataStore
from backend.app.main import app, get_store


OUTPUT = Path(__file__).resolve().parent
store = DataStore()
app.dependency_overrides[get_store] = lambda: store
client = TestClient(app)
payloads = {}
timings = {}
paths = ["/api/meta", "/api/neighborhoods/geojson"]
for operation in ["summary", "heatmap", "kde", "spatial-shift", "downtown-comparison"]:
    paths.append(f"/api/citywide/{operation}?start_year=2015&end_year=2026")
for path in paths:
    response = client.get(path)
    assert response.status_code == 200, (path, response.text)
    payloads[path] = response.json()
for operation in ["heatmap", "kde"]:
    path = f"/api/citywide/{operation}?start_year=2015&end_year=2026"
    samples = []
    for _ in range(5):
        started = time.perf_counter()
        response = client.get(path)
        samples.append((time.perf_counter() - started) * 1000)
        assert response.status_code == 200
        assert response.json() == payloads[path]
    timings[operation] = {"samples_ms": samples, "median_ms": statistics.median(samples)}
profiler = cProfile.Profile()
profiler.runcall(store.kde, 2015, 2026, [])
with (OUTPUT / "baseline-profile.txt").open("w") as stream:
    pstats.Stats(profiler, stream=stream).sort_stats("cumulative").print_stats(25)
(OUTPUT / "payloads.json").write_text(json.dumps(payloads))
(OUTPUT / "baseline-api.json").write_text(json.dumps(timings, indent=2))
print(json.dumps(timings, indent=2))
