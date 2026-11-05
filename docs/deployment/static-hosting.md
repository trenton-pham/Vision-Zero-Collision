# Static dashboard publication

The production target is `https://vision-zero-collision.rice-farmer-bot.workers.dev`. Treat it as live only after the production publication and browser checks succeed. Render remains available until cutover is verified.

React and versioned JSON responses are served directly by Cloudflare Workers Static Assets. There is no Worker request handler, production Python process, or browser database connection. Python/FastAPI remains the reference implementation and local development server. Atlas retains immutable datasets and the authoritative monthly synchronization process.

## Local development and verification

Use Python 3.11, uv, and Node 22.12 or later. From the repository root:

```sh
uv sync --frozen --extra test
uv run --frozen python -m backend.scripts.build_artifacts
uv run --frozen python -m backend.scripts.export_static --output build/export --backend artifacts --verify
npm --prefix frontend ci --legacy-peer-deps
npm --prefix frontend run build
uv run --frozen python -m backend.scripts.static_release assemble \
  --export-dir build/export --frontend-dir frontend/dist \
  --output build/site --archive-output build/current-release.tar.gz
uv run --frozen pytest backend/tests
npm --prefix frontend test
node --test frontend/scripts/publication-archives.test.mjs
npm --prefix frontend run test:e2e
```

Browser tests use one worker so strict animation timing is not measured under competing Chromium instances. Playwright always starts its own server rather than reusing an unknown listener.

Assembly requires a fresh output directory. Remove only the generated `build/site` before assembling it again. The exporter can reuse its output directory; publication copies only the current immutable release, excluding older or incomplete local candidates.

Run `npm --prefix frontend run dev` alongside `uv run --frozen uvicorn backend.app.main:app --reload`. Vite proxies `/data` to FastAPI, which serves `build/export/data`. Restart FastAPI after the first export if it was started before that directory existed. The reference API is available at `/docs` during local development.

`--verify` compares every generated year/severity selection with the independently wired FastAPI HTTP routes against the same pinned snapshot. Metadata and resolver geometry are also checked; Python-generated resolver fixtures test the equivalent browser operation. No requests go to a hosted API during verification.

To regenerate browser resolver fixtures:

```sh
uv run --frozen python -m backend.scripts.resolver_fixtures --output frontend/tests/resolver-fixtures.json
```

The checked-in fixtures cover shared boundaries, overlapping interiors, nearest ties, the 25-metre cutoff, holes, and MultiPolygons. `--real` adds all 94 real-neighborhood representative points to an output file selected by `--output`.

## Cloudflare and GitHub setup

1. Disable automatic deployment on the existing Render service before merging this migration. `render.yaml` records `autoDeploy: false`, but a repository change alone does not confirm the live setting changed. Preserve the existing deployed image; its Dockerfile is a legacy API reference, not the new publication path.
2. Install the locked frontend dependencies and authenticate with `frontend/node_modules/.bin/wrangler login`.
3. Bootstrap the new Worker once with `frontend/node_modules/.bin/wrangler deploy --config wrangler.bootstrap.jsonc`. Cloudflare requires an initial deployment before `versions upload`. This uses a minimal static page with the production workers.dev address disabled; preview URLs remain enabled. The bootstrap contains no dashboard data or handler.
4. In the GitHub `production` environment, set the variable `STATIC_WEBSITE_URL` to the production origin above.
5. Configure the following environment secrets. The export identity must have read-only access to `seattle_collision`.

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account containing `vision-zero-collision` |
| `CLOUDFLARE_API_TOKEN` | Account-scoped permission to upload Worker versions and manage their deployment/triggers |
| `MONGODB_EXPORT_URI` | Read-only Atlas connection used by the exporter |
| `MONGODB_INGEST_URI` | Existing separate ingestion/rollback connection with database write access |
| `ATLAS_PUBLIC_KEY`, `ATLAS_PRIVATE_KEY`, `ATLAS_PROJECT_ID` | Existing temporary runner IP access management |

Keep secrets in the GitHub environment or an explicitly selected, Git-ignored local file. The exporter accepts `--env-file .env.static-export`; it does not automatically load arbitrary `.env` files. Credentials never become Worker bindings or frontend variables.

Run the initial production publication through GitHub Actions so its recovery archive is recorded with its promoted Cloudflare version. Pull-request checks never receive production secrets or deploy. The workflow runs on main pushes, scheduled monthly updates, and manual dispatches.

## Publication behavior

The workflow **Collision data and static website** supports:

| Action | Behavior |
| --- | --- |
| Main push or manual `publish-only` | Export and publish the existing active Atlas version |
| Monthly schedule or manual `refresh-and-publish` | Perform the full authoritative ArcGIS synchronization, then export its published result |
| `dry_run` | Validate without changing the public website; refresh dry runs also leave Atlas unchanged |
| `website-rollback` | Restore a retained Cloudflare version without changing Atlas |

The schedule remains the eighth of each month at 3:17 AM America/Los_Angeles. Full synchronization preserves historical corrections and deletions, date checks, reconciliation, and both greater-than-one-percent decrease guards.

The exporter reads one explicit dataset version. A `no_change` ingestion result exports the already published version, not the candidate manifest. Production runs are serialized and check main's revision again immediately before promotion. For recovery, start a new manual workflow run instead of rerunning an older attempt. Reruns are rejected before archive restoration or cleanup can delete a still-live version's recovery material.

Each candidate includes its frontend, all analytical responses, a content-derived release ID, numerical dependency provenance, and per-file checksums. Local working-tree exports identify their source with a content fingerprint in addition to the base commit. Generated assets stay outside Git.

Before promotion, assembly checks every checksum, the 20,000-file and 25-MiB-per-file limits, unexpected source/raw-data files, and credential patterns. It retains the preceding release's data and hashed frontend assets. Each recovery archive contains only its own current release to prevent recursive growth. Two promoted archives are retained with a combined 200-MiB cap. Failed candidates do not displace promoted archives.

The workflow uploads a version without production traffic, checks its preview's files, cache policies, deep links and missing-data responses, saves its recovery archive, then promotes that exact version and enables its workers.dev address. Post-promotion smoke tests check the public origin. Archive restoration also checks the live pointer against the retained archive; a missing or inconsistent recovery archive stops publication for operator recovery.

Atlas and website publication are separate boundaries. Atlas can advance while website export fails. The website keeps its last coherent release; a new `publish-only` run can complete publication without downloading ArcGIS again. The workflow summary reports these outcomes separately.

## Recovery and cutover

For a website regression, dispatch `website-rollback` with the UUID of a version whose `collision-static-RUN_ID-VERSION_UUID` archive is retained. The workflow validates the archive and preview before restoring that version. The database remains unchanged.

For a bad source dataset, run the existing `backend.scripts.rollback_dataset` command with the separate ingestion identity, then dispatch a new `publish-only` run. Confirm the resulting public manifest's `datasetVersion` and `dataAsOf`. A website-only rollback does not undo an Atlas publication, and a later normal publication will use Atlas's active dataset.

If promotion succeeded but a later workflow step failed, use the pre-promotion recovery archive and the actual Cloudflare deployment record. Do not assume the failed workflow means production never changed. If the production pointer and latest retained archive disagree, reconcile the deployed version and archive before resuming automated publication.

During cutover, compare `/data/current.json` with the published Atlas metadata, exercise both views and map clicks on desktop and mobile, and verify that browser requests contain no `/api`, Render, or Atlas data calls. Verify an idle first visit after at least 15 minutes as well. Update project links and suspend Render only after those checks pass. Keep its configuration and last deployed image as a temporary recovery reference.

Open tabs poll the current manifest every five minutes. Queries and immutable URLs include the release ID; responses from an older release cannot populate a newer query. Missing expired releases trigger a bounded refresh while preserving URL filters. Expired lazy chunks can reload once per frontend build and URL.

The free hosting assumptions are documented by [Cloudflare's static asset pricing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) and [asset limits](https://developers.cloudflare.com/workers/platform/limits/). Initial bootstrap and subsequent version promotion follow [Cloudflare's deployment management requirements](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/).
