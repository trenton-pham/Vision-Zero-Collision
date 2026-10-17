# Density cache and Canvas results

Measured locally on October 15, 2026. The source baseline is c06e61df7a9d055eba83aef2a7200f6996c60d6b.

The implementation caches only heatmap and KDE results. Each dataset snapshot owns at most 32 entries and 8 MiB of serialized response payload. New snapshots start empty. Public API shapes and analytical calculations stay unchanged.

Laziness Protocol kept the scope to two density endpoints and the existing Leaflet renderer. Model the Domain gives each dataset ownership of its cache. Prove It Works shaped the real-response comparisons and browser checks.

Canvas passed the agreed performance gate. Its use is limited to the citywide map. Neighborhood polygons retain their existing renderer.

## API measurements

Each row uses five alternating uncached and warm-cache FastAPI TestClient HTTP requests against the same real 106,050-record snapshot. Timings include response serialization and client JSON decoding, and exclude dataset startup. All responses matched. Instrumented calculations ran during priming and did not run during timed cache hits.

| Endpoint and filter | Uncached median and range, ms | Cached median and range, ms |
| --- | --- | --- |
| heatmap, all-years | 10.92, 10.58 to 11.71 | 2.32, 2.13 to 23.22 |
| heatmap, severe | 2.79, 2.57 to 2.90 | 1.27, 1.25 to 1.34 |
| heatmap, unknown | 1.25, 1.23 to 1.36 | 0.75, 0.74 to 0.76 |
| kde, all-years | 57.38, 57.27 to 58.25 | 2.43, 2.37 to 2.51 |
| kde, severe | 9.80, 9.75 to 9.91 | 2.21, 2.19 to 2.51 |
| kde, unknown | 4.39, 4.19 to 23.90 | 2.16, 2.14 to 2.36 |

Full-range KDE is faster in this local sample. Its uncached requests took 57.27 to 58.25 ms, compared with 2.37 to 2.51 ms on warm hits. The separate uncached profile identifies density evaluation as the largest calculation. The warm profile contains validation and JSON model decoding instead.

The full-range heatmap has a lower cached median but one 23.22 ms cached outlier. Its tail improvement is inconclusive. No claim about production latency or a guaranteed speedup follows from these samples.

## Renderer measurements

Five alternating SVG and Canvas pairs ran for each layer and viewport, giving 40 timed samples. Both variants used production builds, identical recorded API responses, and identical local substitute tiles. Each variant had one unreported warm-up per scenario.

The overlay metric starts when the Leaflet map initializes and ends two animation frames after its expected circle layers are added. It includes drawing scheduled during those frames. This is not complete page loading or literal display presentation. Gestures use the same animated pan and zoom sequence. Assertions verify the renderer, layer counts, animation frames, and absence of HTTP or page errors.

| Viewport and layer | SVG overlay median and range, ms | Canvas overlay median and range, ms |
| --- | --- | --- |
| desktop, heatmap | 65.6, 57.3 to 68.7 | 57.3, 51.4 to 58.5 |
| desktop, kde | 54.9, 51.3 to 66.5 | 51.8, 38.9 to 56.0 |
| mobile, heatmap | 61.2, 53.3 to 62.5 | 50.1, 41.1 to 58.3 |
| mobile, kde | 53.2, 33.3 to 57.1 | 51.9, 51.2 to 54.7 |

Emulated mobile heatmap initialization improved by 11.1 ms, or 18.1%. That exceeds the 9.2 ms SVG baseline range and the required 10% threshold. No measured median regressed by more than 10%. The 95th-percentile animation-frame intervals remain near 16.7 to 16.8 ms for both renderers, so these runs show no material pan or zoom frame-rate improvement. Separate browser profiles confirm SVG path updates and Canvas drawing actually ran; gesture samples are mostly idle between animation frames.

Chromium version was 153.0.8010.12. Desktop used 1440 by 1000 pixels at device scale 1. Mobile used iPhone 13 device settings and 390 by 844 pixels in Chromium emulation. These are not physical iPhone or Safari results. The host reported 10 CPU cores and light background desktop activity. Runs alternated renderers to reduce drift. Profiles ran separately and are excluded from timings.

## Correctness and accessibility

Verification passed 70 backend tests, 79 frontend unit tests, and 44 desktop/mobile browser checks. Five MongoDB integration tests skipped without a test URI. TypeScript and the production build passed.

Independent final review approved the source changes and measurement evidence with no flags. The reviewer reported its model as GPT-6.

Tests cover response equality, filter canonicalization, invalid inputs, empty and singular density results, independent returned objects, count and byte eviction, oversized responses, retry, concurrent reuse, warm-hit progress, snapshot refresh, failure, rollback, and old-snapshot collection.

Browser checks exercise Canvas content, density-layer changes, zoom, severity and year changes against real API metrics, neighborhood navigation, responsive layouts, URL state, partial years, and accessibility. Settled density imagery must change after data changes.

DENSITY-1 is closed. The new mobile citywide accessibility check exposed existing selected-tab text at 4.21:1 contrast. Selected tab and severity text now use the existing brighter focus color. Focused desktop and mobile accessibility checks pass without excluding any rules.

## Limits and evidence

The 8 MiB limit bounds retained JSON payload, not total process memory or concurrent temporary allocations. Different cold requests for the same density endpoint queue behind its computation lock. The cache does not change Render sleep or startup behavior.

MongoDB integration tests require an isolated test URI and were skipped. No hosted Render checks, deployment, or physical-device measurements were performed.

Raw samples are in api-results.json and renderer-results.json. Reproduction scripts are capture_baseline.py, compare_api.py, and compare_renderers.mjs. Browser profiles have the .cpuprofile extension, and API profiles are in baseline-profile.txt and cached-profile.txt. The scripts use existing project dependencies and assert response and rendering correctness.
