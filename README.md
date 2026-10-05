# Vision Zero Collision Analysis (Seattle, WA)

Motor-vehicle collisions pose a significant public health challenge, contributing to injuries and deaths each year. In order to support traffic safety for the growing population of Seattle, Washington, the Seattle Department of Transportation (SDOT) launched its [Vision Zero initiative](https://www.seattle.gov/transportation/projects-and-programs/safety-first/vision-zero) in 2015, with the goal of ending traffic deaths and serious injuries in Seattle by 2030.

## Project Overview

This analysis investigates Seattle collision data from 2015 through the latest received incident date, focusing on changes in collision frequency, severity, and spatial patterns in the context of SDOT's Vision Zero initiative. The checked-in spatial dataset contains 106,050 collisions through August 31, 2026; 2026 is a partial year. A central finding across complete years is that while average annual collision frequency was lower from 2020 onwards, serious and fatal collisions became a larger share of recorded collisions, suggesting that lower collision volume does not necessarily mean safer streets.

The project combines exploratory data analysis, geospatial analysis, and historical severity modeling with a public, read-only React + FastAPI dashboard. Neighborhood Explorer provides collision context for all 94 Seattle neighborhoods, while Citywide Analysis supports heatmap, KDE, spatial-shift, and downtown vs. outer-area comparisons. The analysis describes observed patterns; evaluating the causal impact of Vision Zero would require a separate study design.

**Research Questions:**

- How did the spatial distribution and severity of motor-vehicle collisions in Seattle change from pre-2020 to 2020 and onwards?
- Are high-density collision areas more likely to experience severe outcomes (injuries, serious injuries, fatalities)?
- Which geographical areas show a concentration of collision burden and severity that warrants further investigation for Vision Zero planning?
- How can collision risk analysis be expanded to better understand safe access to public transportation, walking, biking, and other urban mobility patterns?

## Tech Stack

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

- `data/raw/SDOT_Collisions_All_Years.geojson` — all collision records (raw); cleaned outputs: `data/cleaned/Collision_All_Filtered.parquet` and `.geojson`. The cleaner also accepts the older singular filename, `SDOT_Collision_All_Years.geojson`.
- `data/raw/SDOT_Vehicle.csv` — vehicle-level collision records (raw); cleaned outputs: `data/cleaned/Vehicle_Filtered.parquet` and `.csv`.
- `data/processed/Collision_Processed.parquet` — checked-in spatial collision dataset used by the modeling notebook and local dashboard artifact builder, with engineered severity and grid features.
- `data/processed/Neighborhood_Map_Atlas_Neighborhoods.geojson` — checked-in Seattle neighborhood boundaries containing 94 `S_HOOD` polygons.
- `data/processed/cleaning_manifest.json` — checked-in source dates, hashes, row counts, quality checks, and partial-year information.
- `data/dashboard/` — generated neighborhood assignments, annual/monthly aggregates, boundaries, and dashboard manifest.

The raw and cleaned datasets, processed collision GeoJSON, and generated dashboard artifacts are excluded from version control. The processed Parquet, neighborhood boundaries, and cleaning manifest are included so the local dashboard and modeling notebook can use the preserved snapshot without downloading the raw data.

The checked-in cleaning manifest records 109,040 cleaned collisions, including 2,990 records excluded from spatial analysis because of missing geometry. Its collision source extends through August 31, 2026, while the vehicle source extends through January 23, 2026. Vehicle trends therefore have a different coverage window and are not part of the monthly dashboard refresh. Live dashboard coverage is reported by `/api/meta` and can differ from the checked-in snapshot.

## Cleaning Data

| File | Description |
| --- | --- |
| `clean.py` | Coordinates collision and vehicle cleaning, writes Parquet/CSV/GeoJSON outputs, and records source lineage and quality checks |
| `cleaning_base.py` | Shared date parsing, analysis-window filtering, freshness checks, and source checksum validation |
| `collision_clean.py` | Adds temporal features (`YEAR`, `MONTH`, `DAY`, `HOUR`, `Day_of_Week`, `Season`), standardizes missing categories, flags geometry quality, and engineers spatial/severity features |
| `vehicle_clean.py` | Standardizes vehicle categories, validates vehicle keys, and separates records without matching collision keys |

To reproduce the full cleaning workflow, download [SDOT Collisions All Years](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-all-years/about) as GeoJSON and [SDOT Collisions Vehicles](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-vehicles) as CSV, and save them under the raw filenames listed above. After installing the Python dependencies in **Local development**, run from the repository root:

```bash
.venv/bin/python clean.py --start-year 2015 --end-year 2026
```

The cleaner preserves raw categorical values alongside standardized fields and retains collisions with missing geometry in the all-collision output. Only valid Seattle point geometries enter the processed spatial dataset. Incident records without a recorded time retain an unknown `HOUR`. Use `--skip-geojson` when only Parquet and CSV outputs are needed; `geo.ipynb` currently reads the cleaned GeoJSON. This workflow replaces the processed snapshot; it is optional for running the application from the checked-in data.

## Notebooks

| Notebook | Description |
| --- | --- |
| `notebooks/all_collisions_eda.ipynb` | Temporal and categorical EDA: monthly trends, day/hour/season, junction type, severity, collision type, weather, road/light conditions, and pedestrian/cyclist involvement |
| `notebooks/vehicle_eda.ipynb` | Vehicle category distribution and yearly vehicle involvement trends |
| `notebooks/geo.ipynb` | Spatial analysis: Folium heatmap, composite severity, all/severe collision KDE maps, polygon-based downtown density comparisons, and GeoJSON export |
| `notebooks/model.ipynb` | Historical grid-cell severity regression, target stabilization, and comparison of five tuned regressors |

## Notebook Information

### `all_collisions_eda.ipynb`

- Temporal trends: Monthly collision counts from 2015 through August 2026, alongside distributions by day of week, hour of day, and season.
- Categorical breakdowns: Junction type, severity description, top 10 collision descriptions, weather, road condition, and light condition, including intersection-related monthly trends and severity proportions.
- Pedestrian and cyclist involvement: Yearly mean involvement per collision using `PEDCOUNT + PEDCYLCOUNT`, supporting further investigation of vulnerable road users.

### `vehicle_eda.ipynb`

- Vehicle category analysis: A pie chart summarizes the distribution of standardized vehicle categories, and yearly line plots show changes in vehicle involvement from 2015 onward.
- Each row represents a vehicle involved in a collision. Vehicle counts and collision counts have different denominators.

### `geo.ipynb`

- Interactive heatmap: A Folium-based heatmap weighted by vehicle count (`VEHCOUNT`) across all collisions from 2015 onward, providing an interactive map view of collision hotspots.
- Severity index & KDE density estimation: A composite severity score (`SEVERITY = INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`) is computed per collision. Pre-2020 and 2020 onward severity distributions are compared using a Mann–Whitney U test, while Gaussian KDE maps show all collisions and collisions involving serious injuries or fatalities.
- Downtown vs. outer Seattle comparison: Collisions are joined to neighborhood polygons, with downtown defined by `L_HOOD = 'Downtown'`. Projected polygon areas provide collision density per km², and yearly plots compare density and mean severity.
- The notebook adds grid bins and combined pedestrian/cyclist involvement and exports `data/processed/Collision_Processed.geojson`. The cleaning workflow produces the canonical Parquet used by modeling and local dashboard artifacts.

### `model.ipynb`

- Grid aggregation: Complete-year collisions through 2025 are grouped into occupied cells within a 150×150 latitude/longitude grid. Cell summaries include collision count, severity totals/means, vehicle and pedestrian/cyclist involvement, and temporal and intersection shares.
- Severity target engineering: Raw mean severity is compared with a stabilized score that shrinks sparse cells toward a severity prior calculated from the training partition, with a smoothing weight of 10. Repeated 5-fold cross-validation selects the target.
- Regression comparison: Decision Tree, Random Forest, XGBoost, LightGBM, and CatBoost regressors are tuned with GridSearchCV or RandomizedSearchCV and ranked by training cross-validation R².
- Predictors: Cell coordinates, peak hour, night/weekend/seasonal ratios, average vehicle and pedestrian/cyclist involvement, and intersection share derived from `JUNCTIONTYPE`. Severity components, severity aggregates, collision count, and the former risk labels are excluded from the predictors. Median imputation is fitted within each cross-validation fold.
- Evaluation: An 80/20 cell split is used, with held-out R², MAE, RMSE, actual-vs.-predicted plots, residual distributions, and feature importance plots. This estimates historical cell-level severity rather than future collision probability.

### Running the notebooks

The application dependencies are defined in `pyproject.toml`; notebook visualization and modeling libraries are installed separately:

```bash
.venv/bin/pip install jupyterlab matplotlib seaborn folium scikit-learn xgboost lightgbm catboost
cd notebooks
../.venv/bin/jupyter lab
```

Run these commands after the Python setup in **Local development**. Starting Jupyter from `notebooks/` matches the notebooks' relative data paths. `model.ipynb` reads the checked-in Parquet directly; the EDA and spatial notebooks require the cleaned outputs from `clean.py`.

## EDA Findings

The comparisons below were recalculated from the checked-in `Collision_Processed.parquet`, using complete years: 2015–2019 versus 2020–2025. They describe the spatial subset; the all-collision EDA also includes records without geometry.

- Average annual recorded collisions declined from about **12,364** in 2015–2019 to **7,007** in 2020–2025.
- Serious/fatal collision records, identified by `MAXSEVERITYDESC`, increased from about **1.52%** to **3.42%** of all recorded collisions in the respective periods.
- Mean composite severity per collision increased from about **0.362** to **0.481**, reinforcing the need to examine severity alongside frequency.
- Intersection-related collisions accounted for about **39%** of pre-2020 and **43%** of 2020 onward records, using the notebook's at-intersection and intersection-related mid-block categories.
- The dashboard's projected centroid comparison shows a shift of about **309 metres**, mainly south, between the two periods. A centroid shift summarizes average location and requires additional hotspot analysis to identify specific priority areas.

## Model Findings (in progress)

The saved outputs in `model.ipynb` report the following results for stabilized historical severity:

| Model | 5-fold CV R² | Test R² | Test MAE | Test RMSE |
| --- | --- | --- | --- | --- |
| LightGBM | 0.224 | 0.241 | 0.073 | 0.107 |
| CatBoost | 0.222 | 0.238 | 0.073 | 0.108 |
| Random Forest | 0.222 | 0.237 | 0.073 | 0.108 |
| XGBoost | 0.215 | 0.230 | 0.074 | 0.108 |
| Decision Tree | 0.143 | 0.158 | 0.079 | 0.113 |

- Stabilized severity was selected over raw mean severity, with repeated cross-validation R² of **0.215 vs. 0.210** and lower fold-to-fold variation.
- LightGBM ranked first by training cross-validation R², while CatBoost and Random Forest performed similarly.
- The modest R² values indicate that much of the variation in historical severity remains unexplained. These results support further feature development and validation; the dashboard displays observed collision metrics and does not serve model predictions.

## Current Caveats

- The COVID-19 period disrupted travel and collision patterns. Compare results with and without 2020–2021 as a sensitivity analysis before attributing changes to policy or long-term trends.
- The checked-in 2026 data is partial, and recent records may be revised or arrive late. Some exploratory notebook comparisons include 2026; apply complete-year filters before comparing annual totals or pre/post averages. The model excludes 2026, and the dashboard excludes partial years from trend and spatial-shift comparisons.
- Spatial findings exclude collisions without usable geometry. Missing-location records remain available in the cleaned data and are summarized in the cleaning manifest.
- Collision counts, composite severity, and KDE describe observed burden. Exposure measures such as traffic volume, population, transit ridership, or pedestrian activity are needed to estimate collision risk per trip or per person.
- The model uses a random split of historical grid cells. Temporal validation and spatial holdouts are needed to assess future prediction and generalization to other areas; the latitude/longitude bins also have unequal physical dimensions.
- Spatial methods differ by workflow: `geo.ipynb` uses neighborhood polygons and projected areas for downtown density, while the dashboard uses a rectangular downtown boundary for count/severity comparisons. Notebook heatmaps are vehicle-weighted; dashboard heatmaps count collisions. KDE is calculated in latitude/longitude and shown as relative density in the dashboard.
- The dashboard is currently deployed on Render's free tier, which provides 512 MB of RAM and 0.1 CPU, constraining dataset loading and spatial calculations. Additionally, the system enters a sleep state, so slow startups (~1 minute) will occur. Current optimization work focuses on reducing memory usage and improving loading and calculation times. Monthly data ingestion runs separately through GitHub Actions.

## Next Steps

- Enhancing modeling: Add temporal and spatial validation, examine sparse-cell uncertainty, and test features derived from earlier observation periods for future-severity analysis.
- Refining spatial analysis: Use a projected grid and consistent downtown boundaries across notebooks and the dashboard, and incorporate exposure-adjusted collision rates.
- Expanding into public transportation and urban studies: Overlay collisions with bus stops, light rail stations, high-frequency transit corridors, bike lanes, school zones, and pedestrian-heavy areas to study safe access to transit.
- Building an equity and access layer: Compare collision burden by neighborhood, transit access, and vulnerable road user involvement to identify areas for further street-safety investigation.

## Learning Outcomes

- Working with government-sourced data and handling missing values and formatting issues, along with feature engineering on raw records.
- Applying geospatial tools, such as GeoPandas and Folium for spatial data manipulation and visualizations.
- Performing kernel density estimation (KDE) with SciPy to visualize spatial collision distributions.
- Building and comparing supervised regression models with target stabilization, hyperparameter tuning, and held-out evaluation.
- Translating notebook analysis into an interactive React + FastAPI dashboard for public-facing exploration.
- Building reproducible analytical artifacts and a validated, versioned MongoDB publication pipeline.
- Connecting data science methods to urban safety, public transportation access, and Vision Zero policy questions.

## Dashboard

The full-stack application provides two complementary views of observed collision patterns:

| View | Description |
| --- | --- |
| Neighborhood Explorer | Map and searchable neighborhood selection, all-severity collision/injury context, and annual or monthly trends |
| Citywide Analysis | Independent year/severity filters, collision heatmap, KDE density, pre/post-2020 centroid shift, and downtown vs. outer-area comparisons |

Deployment link: https://seattle-collision-dashboard.onrender.com

### Product rules

- Neighborhood metrics always include every severity level. Citywide severity filters cannot enter neighborhood API requests.
- Composite severity is `INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`.
- Night share uses only collisions with a recorded incident time; date-only timestamps have an unknown hour.
- With no neighborhood selected, Neighborhood Explorer shows all-severity Seattle citywide summary statistics and trends. Selecting a neighborhood replaces the inspector with local statistics; clearing it restores the citywide baseline.
- Neighborhood Explorer inspector grids omit Night and Weekend distribution shares without removing those measures from the API or Citywide Analysis.
- Annual trend is the default; `grain=monthly` shows zero-filled monthly observations from January 2015 through the latest received month.
- Partial years are labeled with the latest received incident date and excluded from trend and spatial-shift comparisons.
- Trend comparisons use non-overlapping first and last three-year averages only when at least six complete years are present.
- The dashboard remains public and read-only; publication and rollback use a separate ingestion identity with database write access.

See [PRODUCT.md](./PRODUCT.md), [FIGMA.md](./FIGMA.md), and [DESIGN.md](./DESIGN.md) for the product and visual contracts.

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

Use Python 3.11 and Node 22 to match Docker and CI. The Python package supports Python 3.11 through 3.14. Run these commands from the repository root; raw data downloads and notebook dependencies are optional for this setup.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -e '.[test]'
export DASHBOARD_DATA_BACKEND=artifacts
.venv/bin/python -m backend.scripts.build_artifacts

cd frontend
npm ci --legacy-peer-deps
npm run build
cd ..

.venv/bin/uvicorn backend.app.main:app --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). When `frontend/dist` exists, FastAPI serves both the API and the compiled single-page application from the same origin. API documentation is available at [/docs](http://127.0.0.1:8000/docs), and [/readyz](http://127.0.0.1:8000/readyz) confirms a validated dataset is loaded.

For frontend development, keep the API running and open a second terminal:

```bash
cd frontend
npm run dev
```

Open the Vite URL printed in that terminal (normally [http://localhost:5173](http://localhost:5173)). Vite proxies `/api` and `/healthz` to port 8000.

Local development defaults to `DASHBOARD_DATA_BACKEND=artifacts`. This path is deterministic and does not require MongoDB credentials.

### Configuration

`.env.example` lists the environment settings. The application reads exported environment variables; copying that file to `.env` alone does not load them.

| Variable | Default / Purpose |
| --- | --- |
| `DASHBOARD_DATA_BACKEND` | `artifacts` for local files; `mongodb` for a published database snapshot |
| `MONGODB_URI` | Required for MongoDB mode; use read-only credentials for the running dashboard and write credentials for ingestion/rollback |
| `MONGODB_DATABASE` | `seattle_collision` |
| `DATASET_REFRESH_SECONDS` | `60`; interval for checking published MongoDB versions, minimum 10 seconds |
| `ARC_GIS_LAYER_URL` | SDOT Collisions All Years feature layer used by the sync command; the default is listed in `.env.example` |

## Generated artifacts

Run:

```bash
.venv/bin/python -m backend.scripts.build_artifacts
```

The build hashes the processed collision Parquet and neighborhood GeoJSON, assigns spatial records by polygon containment with a nearest-neighborhood fallback within 25 metres, and writes assigned-record, zero-filled annual, and zero-filled monthly Parquet artifacts with a manifest. Monthly artifacts cover 94 neighborhoods plus a citywide scope and stop at the latest observed month. If artifacts are absent or their source hashes are stale, the API reports degraded health and `/readyz` returns 503; rebuild the artifacts before using data endpoints.

The checked-in spatial snapshot's regression baseline is:

- 104,579 direct polygon assignments
- 1,193 nearest-neighborhood assignments within 25 metres
- 278 explicit unassigned records
- 106,050 total collision records
- 94 unique neighborhoods

The local builder enforces this preserved row-count and assignment baseline. Replacing the processed source requires reviewing the baseline and related tests; the production sync validates changing live datasets separately.

## Monthly MongoDB pipeline

Production uses MongoDB as the durable source. Each collision and aggregate document is tagged with an immutable dataset version. A run writes and validates the entire new version before atomically switching the `dataset_state.activeVersion` pointer; failed runs leave the current dashboard untouched. The API checks for a new active version every 60 seconds and swaps its in-memory snapshot only after loading and validating it.

The ingestion job queries the ArcGIS object-ID list, downloads records in batches of 1,000, verifies that the layer did not change mid-download, validates collision fields and geometry, assigns neighborhoods, and reconciles annual and monthly totals. Its uploaded manifest reports the source and spatial row counts, accepted exclusions, normalized hash, and difference from the checked-in 106,050-record baseline. Historical edits and deletions are captured because every monthly run is a full authoritative sync. Vehicle data is intentionally not part of this dashboard refresh.

The publication gate checks both source feature count and usable spatial collision count for decreases greater than 1%.

Configure these secrets in the repository's GitHub `production` environment:

- `MONGODB_INGEST_URI`: database user with `readWrite` on `seattle_collision`
- `ATLAS_PUBLIC_KEY` and `ATLAS_PRIVATE_KEY`: Atlas API credentials allowed to create temporary project IP access-list entries
- `ATLAS_PROJECT_ID`: Atlas project identifier

The [Monthly collision sync workflow](./.github/workflows/monthly-collision-sync.yml) is configured for 3:17 AM America/Los_Angeles on the 8th of each month and can also be started manually in dry-run mode. Its runner IP is admitted to Atlas for two hours. Failed runs appear as failed Actions checks. [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) run from the default branch, can be delayed, and are disabled in public repositories after 60 days without activity; schedule notifications follow the settings of the user who last modified the cron schedule.

To run the sync manually, use the ingestion user's write credentials and ensure your machine's outbound IP is allowed in Atlas. Dry-run validates the candidate without publishing a new active version:

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

After investigating a source decrease greater than 1%, a manual operator can pass `--allow-row-decrease` to the sync command.

## Verification

After building the local artifacts, run from the repository root:

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npx playwright install chromium
mkdir -p ../.impeccable/review
npm run test:e2e
```

Playwright starts its own FastAPI server on port 4173 and exercises 1440 px desktop and 390 px mobile layouts, keyboard-only neighborhood selection, URL restoration, route-specific filters, partial-year behavior, and automated accessibility checks. The review directory stores browser-test screenshots.

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

## Credits & Sources

- [Seattle Open Data Portal](https://data.seattle.gov)
- [SDOT Collisions All Years](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-all-years/about)
- [SDOT Collisions Vehicles](https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::sdot-collisions-vehicles)
- [Seattle Vision Zero](https://www.seattle.gov/transportation/projects-and-programs/safety-first/vision-zero)
- [COGS 108 (UC San Diego) Repository](https://github.com/cogs108)
- Claude Code / Codex assistance

## Author

**Trenton Pham** <br>
Data Science @ UC San Diego
