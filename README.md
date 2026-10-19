# Vision Zero Collision Analysis (Seattle, WA)

Seattle's Department of Transportation (SDOT) launched [Vision Zero](https://www.seattle.gov/transportation/projects-and-programs/safety-first/vision-zero) in 2015 to end traffic deaths and serious injuries by 2030. This project examines recorded collisions during that period.

## Project overview

The checked-in spatial dataset contains 106,050 Seattle collisions from 2015 through August 31, 2026. The 2026 data covers a partial year. Across complete years, average annual collision counts fell after 2019, while the share of serious and fatal collisions rose.

Notebooks cover exploratory analysis, spatial patterns, and historical severity modeling. A public, read-only React and FastAPI dashboard shows observed collision metrics for all 94 Seattle neighborhoods and citywide maps. These analyses do not establish the causal effect of Vision Zero.

The research questions are:

- How did collision locations and severity change before 2020 and from 2020 onward?
- Are high-density collision areas more likely to experience severe outcomes (injuries, serious injuries, fatalities)?
- Which areas have high collision counts or severity and need further investigation?
- How can collision analysis expand to study safe access to transit, walking, and biking?

## Tech stack

| Component | Technology |
| --- | --- |
| Data Sources | Seattle Open Data Portal, SDOT ArcGIS services |
| Cleaning & Feature Engineering | Python, Pandas, GeoPandas, NumPy, PyArrow |
| EDA & Visualization | Matplotlib, Seaborn |
| Spatial Analysis | GeoPandas, Shapely, SciPy (KDE), Folium in notebooks |
| Modeling | Scikit-learn, XGBoost, LightGBM, CatBoost |
| Dashboard | React, TypeScript, Vite, React-Leaflet, Recharts |
| API & Data Storage | FastAPI, local Parquet artifacts, MongoDB Atlas |
| Deployment & Refresh | Docker, Render, GitHub Actions |

## Datasets

- `data/raw/SDOT_Collisions_All_Years.geojson` contains raw collision records. Cleaning writes `data/cleaned/Collision_All_Filtered.parquet` and `.geojson`. The cleaner also accepts the older filename `SDOT_Collision_All_Years.geojson`.
- `data/raw/SDOT_Vehicle.csv` contains raw vehicle records. Cleaning writes `data/cleaned/Vehicle_Filtered.parquet` and `.csv`.
- `data/processed/Collision_Processed.parquet` is the checked-in spatial dataset for the modeling notebook and local dashboard artifact builder. It includes severity and grid features.
- `data/processed/Neighborhood_Map_Atlas_Neighborhoods.geojson` contains the 94 checked-in `S_HOOD` neighborhood polygons.
- `data/processed/cleaning_manifest.json` records source dates, hashes, row counts, quality checks, and partial-year coverage.
- `data/dashboard/` contains generated neighborhood assignments, annual and monthly aggregates, boundaries, and a dashboard manifest.

Git excludes raw and cleaned datasets, processed collision GeoJSON, and generated dashboard artifacts. The checked-in Parquet, boundaries, and manifest let you run the local dashboard and modeling notebook without downloading raw data.

The cleaning manifest records 109,040 cleaned collisions. Spatial analysis excludes 2,990 of them because they lack geometry. Collision data ends August 31, 2026, and vehicle data ends January 23, 2026. The monthly dashboard refresh excludes vehicle data. Check `/api/meta` for live dashboard coverage, which may differ from this snapshot.

## Clean the data

| File | Description |
| --- | --- |
| `clean.py` | Coordinates collision and vehicle cleaning, writes Parquet/CSV/GeoJSON outputs, and records source lineage and quality checks |
| `cleaning_base.py` | Shared date parsing, analysis-window filtering, freshness checks, and source checksum validation |
| `collision_clean.py` | Adds temporal features (`YEAR`, `MONTH`, `DAY`, `HOUR`, `Day_of_Week`, `Season`), standardizes missing categories, flags geometry quality, and engineers spatial/severity features |
| `vehicle_clean.py` | Standardizes vehicle categories, validates vehicle keys, and separates records without matching collision keys |

Download [SDOT Collisions All Years](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-all-years/about) as GeoJSON and [SDOT Collisions Vehicles](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-vehicles) as CSV. Save them under the raw filenames listed above. Complete **Local development**, then run from the repository root in the container terminal:

```bash
.venv/bin/python clean.py --start-year 2015 --end-year 2026
```

Cleaning replaces the processed snapshot. You do not need to run it to use the checked-in data. The cleaner keeps raw categories alongside standardized fields and retains collisions with missing geometry in the all-collision output. Only valid Seattle points enter the spatial dataset. Records without a known incident time keep an unknown `HOUR`.

Use `--skip-geojson` if you only need Parquet and CSV. The spatial notebook still requires the cleaned GeoJSON. After cleaning, review the local builder's fixed baseline before rebuilding dashboard artifacts.

## Notebooks

| Notebook | Description |
| --- | --- |
| `notebooks/all_collisions_eda.ipynb` | Temporal and categorical EDA: monthly trends, day/hour/season, junction type, severity, collision type, weather, road/light conditions, and pedestrian/cyclist involvement |
| `notebooks/vehicle_eda.ipynb` | Vehicle category distribution and yearly vehicle involvement trends |
| `notebooks/geo.ipynb` | Spatial analysis: Folium heatmap, composite severity, all/severe collision KDE maps, polygon-based downtown density comparisons, and GeoJSON export |
| `notebooks/model.ipynb` | Historical grid-cell severity regression, target stabilization, and comparison of five tuned regressors |

### `all_collisions_eda.ipynb`

- Plots monthly collisions from 2015 through August 2026 and distributions by day, hour, and season.
- Summarizes junction type, severity, the top 10 collision descriptions, weather, road and light conditions, and intersection-related trends.
- Calculates yearly mean pedestrian and cyclist involvement per collision using `PEDCOUNT + PEDCYLCOUNT`.

### `vehicle_eda.ipynb`

- Plots standardized vehicle categories and yearly vehicle involvement from 2015 onward.
- Each row represents a vehicle involved in a collision. Vehicle counts and collision counts have different denominators.

### `geo.ipynb`

- Maps collisions from 2015 onward with a Folium heatmap weighted by vehicle count, `VEHCOUNT`.
- Calculates `SEVERITY = INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES` per collision. A Mann-Whitney U test compares severity before 2020 with severity from 2020 onward. Gaussian KDE maps show all collisions and those involving serious injuries or fatalities.
- Joins collisions to neighborhood polygons and defines downtown as `L_HOOD = 'Downtown'`. Projected areas give collision density per km². Yearly plots compare density and mean severity downtown and elsewhere in Seattle.
- The notebook adds grid bins and combined pedestrian/cyclist involvement and exports `data/processed/Collision_Processed.geojson`. The cleaning workflow produces the canonical Parquet used by modeling and local dashboard artifacts.

### `model.ipynb`

- Groups complete-year collisions through 2025 into occupied cells in a 150×150 latitude and longitude grid. Cell summaries include counts, severity, vehicle involvement, pedestrian and cyclist involvement, and temporal and intersection shares.
- Compares raw mean severity with a stabilized score. The latter shrinks sparse cells toward a training-partition severity prior with a smoothing weight of 10. Repeated 5-fold cross-validation selects the target.
- Tunes Decision Tree, Random Forest, XGBoost, LightGBM, and CatBoost regressors with GridSearchCV or RandomizedSearchCV. Training cross-validation R² determines their rank.
- Uses cell coordinates, peak hour, night, weekend and seasonal ratios, average vehicle and pedestrian/cyclist involvement, and intersection share derived from `JUNCTIONTYPE`. Predictors exclude severity components, severity aggregates, collision count, and former risk labels. Each cross-validation fold fits its own median imputation.
- Uses an 80/20 cell split and reports held-out R², MAE, RMSE, predictions, residuals, and feature importance. The model estimates historical cell-level severity, not future collision probability.

### Run the notebooks

Complete **Local development** first. In the container terminal at the repository root, install the notebook libraries separately:

```bash
.venv/bin/pip install jupyterlab matplotlib seaborn folium scikit-learn xgboost lightgbm catboost
cd notebooks
../.venv/bin/jupyter lab --ip=0.0.0.0 --no-browser
```

Forward the port printed by Jupyter, normally 8888, and open the URL with its token. Start Jupyter from `notebooks/` to match the relative data paths. If you use the VS Code notebook editor instead, select the container project's `.venv/bin/python` kernel. The container config sets each notebook's directory as its working directory. Confirm the kernel with `import sys; print(sys.executable, sys.version)` before running cells. It must report Python 3.11 from the container environment.

`model.ipynb` reads the checked-in Parquet. The EDA and spatial notebooks require cleaned outputs from `clean.py`. Notebook extras are optional and are not installed by the container creation hook.

## EDA findings

These comparisons use the checked-in `Collision_Processed.parquet` and complete years, 2015 to 2019 versus 2020 to 2025. They describe the spatial subset. The all-collision EDA also includes records without geometry.

- Average annual recorded collisions fell from about 12,364 to 7,007.
- Serious and fatal collision records, identified by `MAXSEVERITYDESC`, rose from about 1.52% to 3.42% of recorded collisions.
- Mean composite severity per collision rose from about 0.362 to 0.481.
- Intersection-related collisions accounted for about 39% and 43% of records, respectively. This uses the notebook's at-intersection and intersection-related mid-block categories.
- The dashboard's projected collision centroid shifted about 309 metres, mainly south. This describes the average location and does not identify individual hotspots.

## Model findings

Model development is ongoing. The saved outputs in `model.ipynb` report the following results for stabilized historical severity:

| Model | 5-fold CV R² | Test R² | Test MAE | Test RMSE |
| --- | --- | --- | --- | --- |
| LightGBM | 0.224 | 0.241 | 0.073 | 0.107 |
| CatBoost | 0.222 | 0.238 | 0.073 | 0.108 |
| Random Forest | 0.222 | 0.237 | 0.073 | 0.108 |
| XGBoost | 0.215 | 0.230 | 0.074 | 0.108 |
| Decision Tree | 0.143 | 0.158 | 0.079 | 0.113 |

- Stabilized severity had repeated cross-validation R² of 0.215 versus 0.210 for raw mean severity, with less variation between folds.
- LightGBM ranked first by training cross-validation R², while CatBoost and Random Forest performed similarly.
- Much of the variation in historical severity remains unexplained. The dashboard displays observed collision metrics and does not serve model predictions.

## Limits

- The COVID-19 period disrupted travel and collision patterns. Compare results with and without 2020 and 2021 before attributing changes to policy or long-term trends.
- The 2026 data is partial. Recent records may change or arrive late. Some notebook comparisons include 2026, so apply complete-year filters before comparing annual totals or period averages. The model excludes 2026. The dashboard excludes partial years from trend and spatial-shift comparisons.
- Spatial findings exclude collisions without usable geometry. Missing-location records remain available in the cleaned data and are summarized in the cleaning manifest.
- Collision counts, composite severity, and KDE describe observed burden. Exposure measures such as traffic volume, population, transit ridership, or pedestrian activity are needed to estimate collision risk per trip or per person.
- The model uses a random split of historical grid cells. Temporal validation and spatial holdouts are needed to assess future prediction and generalization to other areas. The latitude and longitude bins also have unequal physical dimensions.
- `geo.ipynb` uses neighborhood polygons and projected areas for downtown density. The dashboard uses a rectangular downtown boundary for count and severity comparisons. Notebook heatmaps weight vehicles, while dashboard heatmaps count collisions. The dashboard calculates KDE in latitude and longitude and displays relative density.
- The dashboard uses Render's free tier. Its memory and CPU limits constrain dataset loading and spatial calculations. Idle services sleep and take about a minute to wake. Monthly ingestion runs separately through GitHub Actions.

## Next steps

- Add temporal and spatial validation, measure sparse-cell uncertainty, and test predictors from earlier observation periods for future-severity analysis.
- Use a projected grid, align downtown boundaries across notebooks and the dashboard, and calculate exposure-adjusted collision rates.
- Overlay transit stops and corridors, bike lanes, school zones, and pedestrian-heavy areas to study safe access to transit.
- Compare collision burden by neighborhood, transit access, and vulnerable road user involvement.

## Learning outcomes

The project covers government-data cleaning, GeoPandas and Folium maps, SciPy KDE, and regression with target stabilization and held-out evaluation. It also turns notebook analysis into a React and FastAPI dashboard with reproducible artifacts and versioned MongoDB publication. The research questions concern street safety and transit access.

## Dashboard

The dashboard has two views:

| View | Description |
| --- | --- |
| Neighborhood Explorer | Map and searchable neighborhood selection, all-severity collision/injury context, and annual or monthly trends |
| Citywide Analysis | Independent year/severity filters, collision heatmap, KDE density, pre/post-2020 centroid shift, and downtown vs. outer-area comparisons |

[Open the dashboard](https://seattle-collision-dashboard.onrender.com).

### Product rules

- Neighborhood metrics always include every severity level. Citywide severity filters cannot enter neighborhood API requests.
- Composite severity is `INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`.
- Night share uses only collisions with a recorded incident time. Date-only timestamps have an unknown hour.
- With no neighborhood selected, Neighborhood Explorer shows all-severity Seattle statistics and trends. Selecting a neighborhood shows local statistics. Clearing it restores the citywide baseline.
- Neighborhood Explorer inspector grids omit Night and Weekend distribution shares without removing those measures from the API or Citywide Analysis.
- Annual trend is the default. `grain=monthly` shows zero-filled monthly observations from January 2015 through the latest received month.
- Partial years are labeled with the latest received incident date and excluded from trend and spatial-shift comparisons.
- Trend comparisons use non-overlapping first and last three-year averages only when at least six complete years are present.
- The dashboard is public and read-only. Publication and rollback use a separate ingestion identity with database write access.

See [PRODUCT.md](./PRODUCT.md), [FIGMA.md](./FIGMA.md), and [DESIGN.md](./DESIGN.md) for the product and visual contracts.

The [architecture guide](./docs/architecture/architecture-guide.md) describes request handling, dataset publication, response validation, and the source files behind them.

## Repository layout

```text
clean.py / *_clean.py         Collision and vehicle cleaning workflow
cleaning_base.py             Shared cleaning validation and lineage helpers
notebooks/                   EDA, geospatial analysis, and severity regression
backend/app/                 FastAPI routes, schemas, and analytical services
backend/scripts/             Artifact builder, ArcGIS sync, and rollback commands
backend/tests/               Assignment, metric, and API tests
frontend/src/                React/TypeScript application
frontend/tests/              Unit, browser, responsive, and accessibility tests
data/raw/                    Downloaded source files (gitignored)
data/cleaned/                Cleaned analytical inputs and exclusions (gitignored)
data/processed/              Preserved source Parquet, GeoJSON, and lineage
data/dashboard/              Reproducible generated artifacts (gitignored)
.github/workflows/           Monthly validation and publication workflow
```

## Local development

### Dev containers and Codespaces (recommended)

Install Docker and the VS Code Dev Containers extension, then open the repository with **Dev Containers: Reopen in Container**. You can also open the repository in GitHub Codespaces. Wait for container creation to finish before opening a terminal.

The container supplies Python 3.11 and Node 22.12 or later within Node 22. It installs dependencies, generates dashboard artifacts, builds React, and starts FastAPI on port 8000. Open forwarded port 8000 to use the dashboard. The container uses local artifact mode. You do not need host Python, a host `.venv`, MongoDB credentials, raw data downloads, or notebook extras for the dashboard.

Python and frontend dependencies live in container volumes mounted at `.venv` and `frontend/node_modules`. The container's `.venv` uses Python 3.11. An old host Python 3.10 `.venv` is unsupported and can be removed from the host after closing any processes that use it. Removing the host environment does not remove the container volume.

Run the cleaning, notebook, artifact, and verification commands in this README in the container terminal from the repository root unless a command changes directories. FastAPI already runs in the container. Do not start a second Uvicorn process on port 8000.

Confirm readiness or inspect startup failures with:

```bash
curl --fail http://127.0.0.1:8000/readyz
tail -n 100 /tmp/dashboard-api.log
```

Readiness confirms a validated dataset is loaded. API documentation is available at [/docs](http://127.0.0.1:8000/docs). Check `/readyz` directly on port 8000 because Vite does not proxy that route.

For live frontend development, open a container terminal and run:

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

Open forwarded port 5173. Vite proxies `/api` and `/healthz` to the existing API on port 8000. After changing processed inputs, rebuild the artifacts and restart the container as described below.

### Optional native setup

If you work outside the container, install Python 3.11 and Node 22.12 or later within Node 22. The application package supports Python 3.11 through 3.14. Python 3.11 matches the container and CI. Remove any existing Python 3.10 `.venv` before creating its replacement. Run from the repository root:

```bash
python3.11 --version
node --version
python3.11 -m venv .venv
.venv/bin/pip install -e '.[test]'
export DASHBOARD_DATA_BACKEND=artifacts
.venv/bin/python -m backend.scripts.build_artifacts
npm --prefix frontend ci --legacy-peer-deps
npm --prefix frontend run build
.venv/bin/uvicorn backend.app.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). FastAPI serves both the API and the compiled application when `frontend/dist` exists. The same artifact, notebook, and verification commands apply to this Python 3.11 environment.

### Configuration

`.env.example` lists the environment settings. Export the variables before starting the application. Copying the file to `.env` does not load them.

| Variable | Default / Purpose |
| --- | --- |
| `DASHBOARD_DATA_BACKEND` | `artifacts` for local files; `mongodb` for a published database snapshot |
| `MONGODB_URI` | Required for MongoDB mode; use read-only credentials for the running dashboard and write credentials for ingestion/rollback |
| `MONGODB_DATABASE` | `seattle_collision` |
| `DATASET_REFRESH_SECONDS` | `60`; interval for checking published MongoDB versions, minimum 10 seconds |
| `ARC_GIS_LAYER_URL` | SDOT Collisions All Years feature layer used by the sync command; the default is listed in `.env.example` |

## Generated artifacts

Run from the repository root in the container terminal:

```bash
.venv/bin/python -m backend.scripts.build_artifacts
```

The builder hashes the processed collision Parquet and neighborhood GeoJSON. It assigns collisions by polygon containment, with a nearest-neighborhood fallback within 25 metres. It writes assigned records, zero-filled annual and monthly aggregates, boundaries, and a manifest. Monthly aggregates cover 94 neighborhoods plus a citywide scope and end at the latest observed month.

Rebuild artifacts after changing either processed input, then restart the container. For optional native development, stop and rerun Uvicorn. The API validates the generated snapshot but does not compare its source hashes with the processed files. A healthy `/readyz` response does not prove the artifacts are current. Missing or invalid artifacts prevent initial loading and leave `/readyz` at HTTP 503. Direct `DataStore` construction and the artifact tests also check source hashes.

The checked-in spatial snapshot's regression baseline is:

- 104,579 direct polygon assignments
- 1,193 nearest-neighborhood assignments within 25 metres
- 278 explicit unassigned records
- 106,050 total collision records
- 94 unique neighborhoods

The local builder enforces this row-count and assignment baseline. If you replace the processed source, review the baseline and related tests. Production sync validates changing live datasets separately.

## Monthly MongoDB pipeline

Production stores versioned collision and aggregate documents in MongoDB. A sync writes and validates a new version before switching `dataset_state.activeVersion`. Failures before that switch leave the active version unchanged. After a failed job, check the active version before retrying or rolling back. The API checks for a new version every 60 seconds and loads and validates it before replacing its in-memory snapshot.

The ingestion job queries the ArcGIS object-ID list and downloads records in batches of 1,000. It checks for source edits during the download, validates collision fields and geometry, assigns neighborhoods, and reconciles annual and monthly totals. The uploaded manifest records source and spatial row counts, accepted exclusions, the normalized hash, and the difference from the 106,050-record baseline. Each monthly run downloads the full source, so it captures historical edits and deletions. It does not refresh vehicle data.

The publication gate checks both source feature count and usable spatial collision count for decreases greater than 1%.

Configure these secrets in the repository's GitHub `production` environment:

- `MONGODB_INGEST_URI`: database user with `readWrite` on `seattle_collision`
- `ATLAS_PUBLIC_KEY` and `ATLAS_PRIVATE_KEY`: Atlas API credentials allowed to create temporary project IP access-list entries
- `ATLAS_PROJECT_ID`: Atlas project identifier

The [Monthly collision sync workflow](./.github/workflows/monthly-collision-sync.yml) runs at 3:17 AM America/Los_Angeles on the 8th of each month. You can also start it manually and choose dry-run mode. It admits the runner IP to Atlas for two hours. Failures appear as failed Actions checks.

[GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) run from the default branch and may be delayed. GitHub disables schedules in public repositories after 60 days without activity. Schedule notifications follow the settings of the user who last changed the cron schedule.

To run the sync manually, use the ingestion user's write credentials and allow your machine's outbound IP in Atlas. Dry-run validates the candidate without publishing it:

```bash
export DASHBOARD_DATA_BACKEND=mongodb
export MONGODB_URI='mongodb+srv://...'
export MONGODB_DATABASE=seattle_collision
.venv/bin/python -m backend.scripts.sync_collisions --dry-run
.venv/bin/python -m backend.scripts.sync_collisions
```

To restore the retained previous dataset, use the same write credentials. Record `datasetVersion` and `dataAsOf` from `/readyz` before running:

```bash
.venv/bin/python -m backend.scripts.rollback_dataset
```

After the next refresh, normally within 60 seconds, check `/readyz` again and confirm `datasetVersion` matches the command's output. Rollback swaps the active and previous versions. Running it again reverses the rollback. The first publication has no previous version. Each publication keeps the active and previous datasets and attempts to prune older ones, so this command cannot step through the full publication history.

After investigating a source decrease greater than 1%, a manual operator can pass `--allow-row-decrease` to the sync command.

## Verification

After container setup has built the artifacts, run from the repository root in the container terminal:

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npx playwright install --with-deps chromium
mkdir -p ../.impeccable/review
npm run test:e2e
```

Playwright starts its own FastAPI server on port 4173 and exercises 1440 px desktop and 390 px mobile layouts, keyboard-only neighborhood selection, URL restoration, route-specific filters, partial-year behavior, and automated accessibility checks. The review directory stores browser-test screenshots.

The [October 18, 2026 verification record](./.audit/onboarding-verification.md) covers application commit `2a7fa31`, including its live deployment and browser checks. Those historical results do not establish that later commits are deployed. Container checks performed after later changes must be recorded separately. Direct Atlas inspection was blocked during that audit.

MongoDB integration tests run when `MONGODB_TEST_URI` is set. Use a separate test database instance; GitHub Actions supplies MongoDB 8.2 as a service container.

## Docker

Build from the repository root. Running the image requires an already published MongoDB dataset and a read-only runtime URI:

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
2. Create the Render service from `render.yaml`, set its `MONGODB_URI` secret to the read-only user, and add all [outbound IP ranges shown for the Render service](https://render.com/docs/outbound-ip-addresses) to the Atlas project IP access list.
3. Run the GitHub workflow manually once to seed the first live version, then deploy or restart Render.
4. Confirm `/readyz` reports the active dataset version and `/api/meta` reports its `dataAsOf` date.

[Render Free services](https://render.com/docs/free) sleep after 15 minutes without inbound traffic and take about a minute to wake. [Atlas Free clusters](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) have storage and throughput limits and do not include managed backups. Account for these constraints when choosing hosting for a public deployment.

## Credits and sources

- [Seattle Open Data Portal](https://data.seattle.gov)
- [SDOT Collisions All Years](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-all-years/about)
- [SDOT Collisions Vehicles](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-vehicles)
- [Seattle Vision Zero](https://www.seattle.gov/transportation/projects-and-programs/safety-first/vision-zero)
- [COGS 108 (UC San Diego) Repository](https://github.com/cogs108)
- Claude Code / Codex assistance

## Author

**Trenton Pham** <br>
Data Science @ UC San Diego
