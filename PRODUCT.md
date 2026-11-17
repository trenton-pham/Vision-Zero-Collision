# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The dashboard is a portfolio and research piece. Its main readers are reviewers and prospective employers who are judging the analysis, data engineering, and product work. Seattle transportation planners and analysts are the audience it is designed for: people who go from a citywide safety pattern to one neighborhood, look at observed collision burden and severity, and compare complete-year trends before deciding where more analysis is warranted. It is public and read-only, and needs no account.

## Product Purpose

The Seattle Collision Dashboard turns weekly-synchronized SDOT collision records and Seattle neighborhood boundaries into a public evidence surface that readers can trust and explore. It covers the Vision Zero period from 2015 onward. Success means two things:

- A reader can select any one of the 94 neighborhoods, or a combination of them, and understand its collision and injury context for a chosen year range.
- The reader can compare that context with citywide spatial analyses without mistaking partial data, model output, or unrelated filters for observed results.

## Positioning

Neighborhood assignment is deterministic, and every analytical rule is transparent and scoped to its route. Neighborhood evidence counts every severity level and ignores citywide severity filters. The current partial year stays visible, but it is labeled as incomplete and left out of comparisons. Each public view reads one immutable, versioned release, so every number traces back to a pinned snapshot.

## Operating Context

- Neighborhood Explorer is the main workspace. The map and the searchable selector share one selection state, which lives in the URL. A selection can be a single neighborhood or a combined set.
- With no neighborhood selected, Neighborhood Explorer shows all-severity citywide statistics and trends. These include accepted collisions that have no neighborhood assignment. Selecting neighborhoods replaces the inspector with their release-scoped data.
- Inspector metric grids leave out the Night and Weekend distribution shares. The API and Citywide Analysis still provide those measures.
- Citywide Analysis keeps the research project's heatmap, KDE density, pre/post-2020 centroid shift, and downtown-versus-outer comparisons. It has its own year and severity controls.
- Production refresh runs weekly in GitHub Actions: ArcGIS → MongoDB Atlas (versioned, fully reconciled snapshots) → verified static export → Cloudflare Workers Static Assets. The browser resolves `/data/current.json` and reads one immutable release.
- FastAPI and Python serve as the analytical reference and the local server. Local development uses the checked-in Parquet and the local artifact backend. The legacy Render deployment is retired.
- The research notebooks are historical and methodological evidence. They are not part of the shipped runtime.

## Capabilities and Constraints

- Exactly 94 stable `S_HOOD` polygons can be selected, individually or combined.
- Collisions are assigned to neighborhoods in this order:
  1. Containment, with deterministic handling of shared boundaries.
  2. The nearest neighborhood in projected coordinates, if it is within 25 metres.
  3. Otherwise, an explicit unassigned state.
- `COLDETKEY` is the collision key. Counts are kept at collision grain. Vehicle rows have their own grain and are not part of the weekly dashboard refresh.
- Neighborhood metrics are:
  - collision count
  - injuries, serious injuries, and fatalities
  - total weighted severity burden and mean severity per collision
  - pedestrian-involved collisions
  - intersection, night, and weekend shares
- Weighted severity burden is `INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`. Total burden and mean severity are different measures.
- Counts and burden describe observed collisions. Risk rates would need exposure data, which the product does not have.
- Night share counts only collisions with a recorded incident hour. Date-only records have an unknown hour and are left out of the denominator.
- Trend grains:
  - **Annual** is the default.
  - **Monthly** values are zero-filled through the last observed month.
  - **Weekly** periods run Monday to Sunday through the latest accepted incident. Weeks clipped by the year selection or by snapshot coverage are marked partial. Weeks that end within 36 weeks of the snapshot date are marked provisional.
- Year slices are inclusive. A collision trend can be narrowed to an inclusive month range with the slider, the month selectors, or "Last 12 months". The range is shareable through the `trendFrom` and `trendThrough` URL parameters. The map, the inspector, and the annual comparison follow the observed years.
- Partial years are labeled from the pinned snapshot's `dataAsOf` and `partialYears`. They are excluded from trend comparisons and from the spatial shift.
- Trend comparison uses the average of the first three and the last three complete years, which do not overlap. It is shown only when at least six complete years are available.
- The chart's accessible table always matches the chart's values and filters.
- The URL holds the route, the selected neighborhoods, the year range, the map metric, the trend grain, and the trend month range.
- The product has no accounts, model serving, or shipped model training. The dashboard never shows model predictions.
- Planned: a ⌘K Ask drawer that answers natural-language questions from the same pinned release and offers "Apply to dashboard", which sets the URL state. Later it may add cited neighborhood news context. Answers describe observed burden only, never risk or causation, and must not cross dataset versions. The Ask drawer needs a server-side runtime that the static hosting does not have yet.

## Evidence on Hand

- `data/processed/Collision_Processed.parquet`: the checked-in spatial snapshot of 106,050 collisions, 2015 through August 31, 2026. Live coverage comes from `meta` in `/data/current.json`.
- `data/processed/Neighborhood_Map_Atlas_Neighborhoods.geojson`: the 94 neighborhood polygons.
- `data/processed/cleaning_manifest.json`: source dates, hashes, row counts, quality checks, and partial-year coverage.
- `notebooks/`: EDA, spatial analysis, and historical grid-cell severity modeling.
- README EDA findings: complete years, 2015–2019 compared with 2020–2025.
- Corrected model results are still pending. Do not show or invent model scores, rankings, or claims that Vision Zero caused any change.
- Live dashboard: https://vision-zero-collision.trentonpham.workers.dev

## Product Principles

1. Preserve observed evidence and make analytical exclusions explicit: partial years, unassigned records, unknown hours, and missing geometry.
2. Keep neighborhood context synchronized, linkable, and independent of citywide severity filtering.
3. Let the map lead, but never make it the only accessible way to select a neighborhood.
4. Prefer versioned publication, reproducible artifacts, and transparent calculations over runtime modeling or changing data in place.
5. Show the analytical rigor to a reviewer without overstating it. Describe burden, not risk or causation.

## Accessibility & Inclusion

Meet WCAG 2.2 AA:

- full keyboard operation and visible focus
- reduced motion
- state cues that do not rely on color alone
- adequate touch targets
- an accessible neighborhood selector
- an ARIA live announcement when the neighborhood selection changes
- a chart table that stays in sync with the chart
