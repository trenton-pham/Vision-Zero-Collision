import cProfile
import importlib.util
import json
import pstats
import statistics
import time
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.data import DataStore
from backend.app.main import app, get_store


OUTPUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("backend.app.baseline_data", OUTPUT / "baseline_data.py")
baseline_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline_module)
baseline = baseline_module.DataStore()
candidate = DataStore()
active = [baseline]
app.dependency_overrides[get_store] = lambda: active[0]
client = TestClient(app)
samples = []
errors = []
scenarios = [
    ("all-years", 2015, 2026, []),
    ("severe", 2021, 2025, ["serious-injury", "fatal"]),
    ("unknown", 2025, 2025, ["unknown"]),
]

for operation in ["heatmap", "kde"]:
    with patch.object(candidate, f"_{operation}", wraps=getattr(candidate, f"_{operation}")) as calculate:
        for label, start, end, severities in scenarios:
            path = f"/api/citywide/{operation}?start_year={start}&end_year={end}"
            path += "".join(f"&severity={severity}" for severity in severities)
            active[0] = baseline
            expected = client.get(path)
            assert expected.status_code == 200
            expected = expected.json()
            active[0] = candidate
            before = calculate.call_count
            assert client.get(path).json() == expected
            assert calculate.call_count == before + 1, "Prime must execute the real calculation"
            for pair in range(5):
                for variant, store in [("uncached", baseline), ("cached", candidate)]:
                    active[0] = store
                    started = time.perf_counter()
                    response = client.get(path)
                    response.raise_for_status()
                    body = response.json()
                    duration = (time.perf_counter() - started) * 1000
                    if body != expected:
                        errors.append({"operation": operation, "scenario": label, "variant": variant})
                    samples.append({"operation": operation, "scenario": label, "variant": variant, "pair": pair, "http_ms": duration, "collisionCount":body["collisionCount"]})
            assert calculate.call_count == before + 1, "Warm requests must not recompute the density"

assert not errors, errors
summaries = []
for operation in ["heatmap", "kde"]:
    for label, *_ in scenarios:
        group = [sample for sample in samples if sample["operation"] == operation and sample["scenario"] == label]
        result = {"operation": operation, "scenario":label}
        for variant in ["uncached", "cached"]:
            values = [sample["http_ms"] for sample in group if sample["variant"] == variant]
            result[variant] = {"median_ms":statistics.median(values), "range_ms":[min(values), max(values)]}
        result["improvement_percent"] = 100 * (1 - result["cached"]["median_ms"] / result["uncached"]["median_ms"])
        summaries.append(result)

profiler = cProfile.Profile()
profiler.runcall(candidate.kde, 2015, 2026, [])
with (OUTPUT / "cached-profile.txt").open("w") as stream:
    pstats.Stats(profiler, stream=stream).sort_stats("cumulative").print_stats(20)
result = {"method":"FastAPI TestClient HTTP requests with JSON decoding; loaded real snapshot; five alternating pairs per scenario; profile excluded from samples", "errors":errors, "samples":samples, "summaries":summaries}
(OUTPUT / "api-results.json").write_text(json.dumps(result, indent=2))
print(json.dumps(summaries, indent=2))
