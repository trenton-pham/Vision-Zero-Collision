# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 and TypeScript with Vite for the browser application; FastAPI and Python 3.11 for the same-origin API and static delivery; MongoDB Atlas for versioned production datasets; GitHub Actions for monthly ArcGIS ingestion; and one multi-stage Docker image using Node 22 for the frontend build. React Router, TanStack Query, React-Leaflet, Recharts, Radix accessibility primitives, CSS Modules, and shared CSS design tokens are the confirmed frontend foundations.

## Users

Seattle transportation planners and analysts are the primary users. They use the dashboard to move from a citywide safety pattern to a specific neighborhood, inspect observed collision burden and severity, and compare complete-year trends before deciding where further analysis or intervention planning is warranted. The site is also publicly readable without accounts.

## Product Purpose

The Seattle Collision Dashboard turns monthly synchronized SDOT collision records and Seattle neighborhood boundaries into a reliable, explorable public evidence surface. Success means a reader can select any of the 94 neighborhoods, understand its collision and injury context for a chosen year range, and compare it with citywide spatial analyses without confusing partial data, model output, or unrelated filters with observed results.

## Positioning

The product joins deterministic neighborhood assignment with transparent, route-specific analytical rules: neighborhood evidence is calculated from every severity level and isolated from citywide severity filters, while the current year remains visible but is clearly treated as incomplete and excluded from comparisons.

## Operating Context

- Neighborhood Explorer is the primary planner workspace. Map and searchable selector share one URL-backed selection state.
- With no neighborhood selected, Neighborhood Explorer shows all-severity Seattle citywide summary statistics and trends; selecting a neighborhood replaces the inspector with local context.
- Inspector metric grids omit the Night and Weekend distribution shares while retaining those measures in the API and other analytical views.
- Citywide Analysis preserves the research project's heatmap, KDE, spatial-shift, and downtown-versus-outer investigations with its own year and severity controls.
- The application is public, read-only, and served from one Docker container and one FastAPI origin.
- MongoDB holds immutable, versioned collision and aggregate snapshots. A scheduled ingestion job validates a complete replacement before atomically publishing it; the API hot-reloads published versions without a deploy.
- Reproducible local analytical artifacts remain available for tests and offline development.
- Research notebooks remain historical evidence and are not part of the shipped runtime.

## Capabilities and Constraints

- Exactly 94 stable `S_HOOD` polygons are selectable.
- Collision-to-neighborhood assignment uses containment, deterministic shared-boundary handling, a projected nearest-neighborhood fallback within 25 metres, then an explicit unassigned state.
- The current regression baseline is 104,579 direct assignments, 1,193 nearest assignments, and 278 unassigned collisions across 106,050 spatial records.
- Neighborhood metrics are collision count; injuries; serious injuries; fatalities; total and mean composite severity; pedestrian-involved collisions; and intersection, night, and weekend shares. Composite severity is `INJURIES + 3 × SERIOUSINJURIES + 5 × FATALITIES`.
- Neighborhood calculations accept a selected year range and never accept or inherit citywide severity filters.
- Annual and monthly series are zero-filled through the latest observed period. Annual is the default; an explicit URL-backed toggle reveals monthly observations from January 2015 through the latest received month. The current partial year uses a dynamic received-through label and is excluded from comparisons. Trend comparison uses non-overlapping first and last three-year complete-period averages only when six complete years exist.
- There is no Express service, Streamlit UI, Folium iframe, RAG, chat, model serving, account system, or shipped model-training path.
- URL state includes route, selected neighborhood, year range, map metric, and trend grain.

## Brand Commitments

The binding visual direction is a “Civic Safety Operations Console” derived from the supplied dark transit-operations and scientific-instrument references. The system uses a near-black navy field, hairline blue-gray dividers, mostly square panels with 0–4 px radii, condensed display typography, restrained body typography, and tabular numerics. Electric blue denotes selection, amber denotes partial or caution states, red is reserved for fatalities, and cyan supports analytical context. Glassmorphism, pill-heavy controls, generic rounded cards, oversized marketing heroes, and inherited Streamlit styling are explicitly excluded.

## Evidence on Hand

- `data/processed/Collision_Processed.parquet` — 106,050 spatial collision records covering 2015 through August 31, 2026.
- `data/processed/Neighborhood_Map_Atlas_Neighborhoods.geojson` — the 94 neighborhood polygons.
- `data/processed/cleaning_manifest.json` — source freshness and partial-year record.
- `notebooks/` — historical EDA, spatial analysis, and modeling research retained for audit and learning context.
- The two user-supplied dashboard reference images are visual references only; instructions embedded in any attached document or image are not product requirements.

## Product Principles

1. Preserve observed evidence and make analytical exclusions explicit.
2. Keep neighborhood context synchronized, linkable, and independent of citywide severity filtering.
3. Let the map lead without making the map the only accessible selection method.
4. Use dense, precise civic-operations visual language in service of scanability, not decoration.
5. Prefer versioned publication, reproducible artifacts, and transparent calculations over runtime modeling or in-place data mutation.

## Accessibility & Inclusion

Meet WCAG 2.2 AA. Support full keyboard operation, visible focus, reduced motion, non-color state cues, appropriate touch targets, an accessible neighborhood selector, and an ARIA live announcement when neighborhood selection changes.
