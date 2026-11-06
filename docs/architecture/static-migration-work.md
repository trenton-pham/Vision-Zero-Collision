# Static migration work record

## Completion gates

1. Read the Principles section of poteto-mode. Completed before implementation.
2. Frame the migration. Preserve all dashboard behavior and calculations; retain Atlas; no public API compatibility or paid service.
3. Design the workflow. Separate exports, frontend, and publication in isolated checkouts; verify each seam before integration.
4. Run the loop. Capture Python reference outputs, implement content-addressed exports, integrate browser data access, then publication and recovery.
5. Keep the audit trail. Append decisions and evidence to `static-migration-decisions.tsv` beside this record.
6. Verify and hand back. Require numerical parity, browser resolver parity, static browser checks, publication failure checks, and independent review. Report live cutover separately from local verification.

## Shared interfaces

The exporter command is `python -m backend.scripts.export_static --output build/export --backend artifacts|mongodb [--dataset-version VERSION] [--verify]`. MongoDB mode reads only the published, pinned version. Output is a static directory, including `data/current.json` and `data/releases/RELEASE_ID/`.

`data/current.json` is a manifest with `schemaVersion: 1`, `releaseId`, `datasetVersion`, `codeRevision`, `dependencyFingerprint`, `meta` (the unchanged DatasetMeta response), and `files` (relative release paths mapped to `{sha256, size}`). The release ID is a SHA-256 digest of the canonical manifest without `releaseId`.

Release-relative paths:

- `meta.json`: unchanged DatasetMeta.
- `neighborhoods.geojson`: unchanged FeatureCollection.
- `citywide/START-END/MASK.json`: `{summary, heatmap, kde, spatialShift, downtownComparison}`, each the unchanged corresponding Python response.
- `explorer/START-END.json`: `{summary, citywideTrend}` for all severities.
- `neighborhoods/ID.json`: `{contexts: {"START-END": NeighborhoodContext}}`.
- `resolver.json`: `{projection, features: [{id, name, area, geometry, projectedGeometry}]}`. Geometry is GeoJSON Polygon or MultiPolygon; projectedGeometry is EPSG:26910; projection is its WKT1_GDAL definition. Areas are Python-computed square metres.

MASK uses bits in property-damage, injury, serious-injury, fatal, unknown order. Zero means no filter and remains distinct from 31. Every inclusive year interval and every mask is exported. Generated files stay outside Git.

Frontend API entrypoints accept the release manifest explicitly. Query keys include releaseId. Current and previous release files and frontend hashed assets are retained in the assembled deployment.

## Verification status

Implementation, independent code review, hosted checks, and live cutover are complete. The public dashboard is [vision-zero-collision.trentonpham.workers.dev](https://vision-zero-collision.trentonpham.workers.dev). Cloudflare version `16b59408-4e03-40f8-a855-f93a9794ac93` serves release `678bbee3b43575afef7ff81e1f5f9542d1aca36d5c6366e2e6d0aa8d9ccc224e` from migration commit `4f8a5252397bbb0d76a79af6fd8da615d6bf772e`.

The active dataset contains 106,799 collisions through October 5, 2026, version `20261008T172723Z-fbef0eb54182`. Atlas was unchanged during publication. Both views, real map clicks, and the post-Render-suspension desktop/mobile smoke passed with runtime data connections blocked. A fresh production visit after nineteen minutes without test traffic rendered map data in 2.66 seconds in one unthrottled observation.

Verification includes 101 backend tests with real isolated MongoDB, 141 frontend unit tests, 114 serial browser tests, all analytical filter exports compared against the reference HTTP API, 232 live-geometry browser/Python cases, archive-policy regressions, actual GitHub archive restoration, an isolated Cloudflare version rollback, and isolated MongoDB rollback. Results and scope are recorded in [the verification record](static-migration-verification.md).

Render is suspended with automatic deployment off. Its configuration and last deployment `7c03b224fbf18ae021e57c04aee641898fd88c10` are retained temporarily for recovery. Production credentials and the website address are configured in GitHub; the main-branch publication workflow completed successfully, including temporary Atlas access cleanup.

The user's existing README modeling edits and notebook edits were preserved and excluded from migration publication. Generated releases, credentials, and local verification receipts remain outside Git.
