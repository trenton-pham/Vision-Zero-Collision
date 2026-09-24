# Seattle Collision Dashboard

A public, read-only React + FastAPI dashboard for observed Seattle collision patterns. The product provides a map-led Neighborhood Explorer for all 94 `S_HOOD` polygons and a separate Citywide Analysis route for heatmap, KDE, spatial-shift, and downtown-versus-outer analysis.

The old Streamlit, RAG, chat, and model-serving runtime has been removed. Historical notebooks and checked-in processed source data remain intact.

## Product rules

- Neighborhood metrics always include every severity level. Citywide severity filters cannot enter neighborhood API requests.
- Composite severity is `INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`.
- With no neighborhood selected, Neighborhood Explorer shows all-severity Seattle citywide summary statistics and trends. Selecting a neighborhood replaces the inspector with local statistics; clearing it restores the citywide baseline.
- Neighborhood Explorer inspector grids omit Night and Weekend distribution shares without removing those measures from the API or Citywide Analysis.
- Annual trend is the default; `grain=monthly` shows zero-filled monthly observations from January 2015 through the latest received month.
- 2026 is visible as **partial records received through August 31, 2026** and excluded from trend comparisons and spatial-shift comparisons.
- Trend comparisons use non-overlapping first and last three-year averages only when at least six complete years are present.
- No database, accounts, runtime model, RAG, or mutable production data store is required.

See [PRODUCT.md](./PRODUCT.md), [FIGMA.md](./FIGMA.md), and the generated `DESIGN.md` for the product and visual contracts.

## Repository layout

```text
backend/app/                 FastAPI routes, schemas, and analytical services
backend/scripts/             Deterministic artifact builder
backend/tests/               Assignment, metric, and API tests
frontend/src/                React/TypeScript application
frontend/tests/              Unit, browser, responsive, and accessibility tests
data/processed/              Preserved source Parquet, GeoJSON, and lineage
data/dashboard/              Reproducible generated artifacts (gitignored)
notebooks/                   Preserved historical research
```

## Local development

The backend requires Python 3.11. The frontend requires Node 22.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/python -m backend.scripts.build_artifacts

cd frontend
npm ci --legacy-peer-deps
npm run build
cd ..

.venv/bin/uvicorn backend.app.main:app --reload
```

Open `http://127.0.0.1:8000`. When `frontend/dist` exists, FastAPI serves both the API and the compiled single-page application from the same origin. During frontend development, run `npm run dev`; Vite proxies `/api` to port 8000.

## Generated artifacts

Run:

```bash
.venv/bin/python -m backend.scripts.build_artifacts
```

The build hashes the processed collision Parquet and neighborhood GeoJSON, assigns all spatial records, writes assigned-record, zero-filled annual, and zero-filled monthly Parquet artifacts, and creates a manifest. Monthly artifacts cover 94 neighborhoods plus a citywide scope and stop at the latest observed month rather than fabricating future partial-year zeroes. API startup fails clearly if the artifacts are absent or their source hashes are stale.

The current regression baseline is:

- 104,579 direct polygon assignments
- 1,193 nearest-neighborhood assignments within 25 metres
- 278 explicit unassigned records
- 106,050 total collision records
- 94 unique neighborhoods

## Verification

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npm run test:e2e
```

Playwright exercises 1440 px desktop and 390 px mobile layouts, keyboard-only neighborhood selection, URL restoration, route-specific filters, partial-year behavior, and automated accessibility checks.

## Docker

```bash
docker build -t seattle-collision-dashboard .
docker run --rm -p 8000:8000 seattle-collision-dashboard
```

The multi-stage image builds React with Node 22, generates analytics artifacts from checked-in sources, and serves the compiled application with FastAPI on Python 3.11.
