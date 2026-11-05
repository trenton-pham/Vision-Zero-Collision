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

Implementation and independent code review are complete. Verification results and remaining live gates are recorded in `static-migration-verification.md`. Existing README modeling edits and the notebook edits belong to the user and are excluded from the migration publication.

Local checks passed: 101 backend tests including isolated MongoDB integration, 141 frontend unit tests, 114 serial desktop/mobile browser tests, 138 Python/browser resolver examples, and five archive-policy tests. The full checked-in snapshot export passed independent HTTP API comparison. The local static-site browser smoke completed without runtime data requests.

Cloudflare authentication and private bootstrap are complete. The current Atlas export passed independent verification: 106,799 records through October 5, dataset `20261008T172723Z-fbef0eb54182`, release `aab9f54b607c29a8697e3f76a1d1389a76c918f6e63fcc20e8563292d86098f7`. Public cutover remains a separate gate. Render has not been suspended.
