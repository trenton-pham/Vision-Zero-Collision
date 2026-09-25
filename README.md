# Seattle Collision Dashboard

A public, read-only React + FastAPI dashboard for observed Seattle collision patterns. The product provides a map-led Neighborhood Explorer for all 94 `S_HOOD` polygons and a separate Citywide Analysis route for heatmap, KDE, spatial-shift, and downtown-versus-outer analysis.

The old Streamlit, RAG, chat, and model-serving runtime has been removed. Production reads versioned datasets from MongoDB Atlas; historical notebooks and checked-in processed source data remain available for local regression tests.

## Product rules

- Neighborhood metrics always include every severity level. Citywide severity filters cannot enter neighborhood API requests.
- Composite severity is `INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`.
- With no neighborhood selected, Neighborhood Explorer shows all-severity Seattle citywide summary statistics and trends. Selecting a neighborhood replaces the inspector with local statistics; clearing it restores the citywide baseline.
- Neighborhood Explorer inspector grids omit Night and Weekend distribution shares without removing those measures from the API or Citywide Analysis.
- Annual trend is the default; `grain=monthly` shows zero-filled monthly observations from January 2015 through the latest received month.
- The current year is labeled with the latest received incident date and excluded from trend and spatial-shift comparisons while partial.
- Trend comparisons use non-overlapping first and last three-year averages only when at least six complete years are present.
- The dashboard remains public and read-only; only the scheduled ingestion identity can publish datasets.

See [PRODUCT.md](./PRODUCT.md), [FIGMA.md](./FIGMA.md), and the generated `DESIGN.md` for the product and visual contracts.

## Repository layout

```text
backend/app/                 FastAPI routes, schemas, and analytical services
backend/scripts/             Artifact builder, ArcGIS sync, and rollback commands
backend/tests/               Assignment, metric, and API tests
frontend/src/                React/TypeScript application
frontend/tests/              Unit, browser, responsive, and accessibility tests
data/processed/              Preserved source Parquet, GeoJSON, and lineage
data/dashboard/              Reproducible generated artifacts (gitignored)
.github/workflows/           Monthly validation and publication workflow
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

Local development defaults to `DASHBOARD_DATA_BACKEND=artifacts`. This path is deterministic and does not require MongoDB credentials.

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

## Monthly MongoDB pipeline

Production uses MongoDB as the durable source. Each collision and aggregate document is tagged with an immutable dataset version. A run writes and validates the entire new version before atomically switching the `dataset_state.activeVersion` pointer; failed runs leave the current dashboard untouched. The API checks for a new active version every 60 seconds and swaps its in-memory snapshot only after loading and validating it.

The ingestion job queries the ArcGIS object-ID list, downloads records in batches of 1,000, verifies that the layer did not change mid-download, performs the existing cleaning and neighborhood assignment, and reconciles annual and monthly totals. Its uploaded manifest reports the source and spatial row counts, accepted exclusions, normalized hash, and difference from the checked-in 106,050-record baseline. Historical edits and deletions are captured because every monthly run is a full authoritative sync. Vehicle data is intentionally not part of this dashboard refresh.

Configure these GitHub environment secrets:

- `MONGODB_INGEST_URI`: database user with `readWrite` on `seattle_collision`
- `ATLAS_PUBLIC_KEY` and `ATLAS_PRIVATE_KEY`: Atlas API credentials allowed to create temporary project IP access-list entries
- `ATLAS_PROJECT_ID`: Atlas project identifier

The workflow runs at 3:17 AM America/Los_Angeles on the 8th of each month and can also be started manually in dry-run mode. Its runner IP is admitted to Atlas for two hours. Failed runs appear as failed Actions checks and use the repository owner's configured GitHub Actions notifications. Scheduled workflows can be delayed and can be disabled after 60 days without repository activity, so check the Actions page if a portfolio repository has been idle.

To run the sync manually:

```bash
export DASHBOARD_DATA_BACKEND=mongodb
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DATABASE=seattle_collision
.venv/bin/python -m backend.scripts.sync_collisions --dry-run
.venv/bin/python -m backend.scripts.sync_collisions
```

To roll back atomically to the immediately previous published version:

```bash
.venv/bin/python -m backend.scripts.rollback_dataset
```

The row-count safety gate blocks decreases greater than 1%. After investigating the source, a manual operator can pass `--allow-row-decrease`.

## Verification

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npm run test:e2e
```

Playwright exercises 1440 px desktop and 390 px mobile layouts, keyboard-only neighborhood selection, URL restoration, route-specific filters, partial-year behavior, and automated accessibility checks.

MongoDB integration tests run when `MONGODB_TEST_URI` is set. GitHub Actions supplies MongoDB 8 as a service container.

## Docker

```bash
docker build -t seattle-collision-dashboard .
docker run --rm -p 8000:8000 \
  -e DASHBOARD_DATA_BACKEND=mongodb \
  -e MONGODB_URI='mongodb+srv://...' \
  -e MONGODB_DATABASE=seattle_collision \
  seattle-collision-dashboard
```

The multi-stage image builds React with Node 22 and serves the compiled application with FastAPI on Python 3.11. It contains no production dataset.

## Render and Atlas setup

1. Create an Atlas Free cluster in AWS `us-west-2` and create separate read-only runtime and read/write ingestion database users.
2. Create the Render service from `render.yaml`, set its `MONGODB_URI` secret to the read-only user, and copy all Render Oregon outbound CIDR ranges into the Atlas project IP access list.
3. Run the GitHub workflow manually once to seed the first live version, then deploy or restart Render.
4. Confirm `/readyz` reports the active dataset version and `/api/meta` reports its `dataAsOf` date.

Render Free services sleep after inactivity and can take roughly a minute to wake. Atlas Free has shared-tier storage, throughput, and backup limitations; upgrade both services for production availability without changing the versioned publication design.
