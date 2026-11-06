# Static migration verification

Recorded November 5, 2026. Local verification, hosted verification, and the live Cloudflare cutover completed successfully. Render is suspended.

| Check | Observed result | Local receipt |
| --- | --- | --- |
| Complete backend suite against isolated MongoDB 8.2.0 | 101 passed, zero skipped | `.audit/static-migration/backend-tests-with-mongodb.txt` |
| Frontend unit tests | 141 passed | `.audit/static-migration/frontend-tests.txt` |
| TypeScript and Vite production build | Passed | `.audit/static-migration/frontend-build.txt` |
| Desktop/mobile browser suite with one worker | 114 passed | `.audit/static-migration/browser-tests-serial.txt` |
| Browser resolver versus Python oracle | 138 passed, including all 94 Seattle neighborhood representative points | `.audit/static-migration/real-resolver-verification.json` |
| Archive retention and rerun recovery | Five passed | `.audit/static-migration/archive-policy-tests.txt` |
| Checked-in snapshot export versus local HTTP API | 2,672 inventoried files, 467,876,489 bytes, `verified: true` | `.audit/static-migration/export-verification.txt` |
| Current published Atlas export versus local HTTP API | 2,672 inventoried files, 468,642,258 bytes, `verified: true` | `.audit/static-migration/live-export-verification.txt` |
| Static browser smoke | Two viewports passed, zero runtime API/database requests | `.audit/static-migration/dashboard-smoke.txt` |
| Static HTTP smoke | Asset checksums, cache headers, deep links and missing-data 404 passed | `.audit/static-migration/http-smoke.txt` |
| Wrangler deployment dry run | Static assets only, no bindings | `.audit/static-migration/wrangler-dry-run.txt` |

The initial parallel browser rerun passed 113 of 114 checks; one reduced-motion route assertion recorded opacity 0.65 instead of 0.8. Five isolated repetitions passed, followed by the complete serial suite. Browser verification now uses one worker and always starts its own server. The original parallel failure is retained in `.audit/static-migration/browser-tests.txt`; it is not reported as a passing run.

Independent reviews identified a repeated chunk-recovery guard, stale non-summary citywide placeholders during filter changes, and loss of recovery history across rejected workflow reruns. The implementation fixes these and the regression checks pass. Reviewers reported no remaining code blockers after re-review. These reviews did not verify Cloudflare production behavior. The subsequent live Atlas export and Cloudflare preview checks are recorded separately below.

The export verifier independently enumerates all inclusive year ranges and 32 severity selections and compares their responses with the reference HTTP API. A mutation test confirms that a consistently miswired export generator is rejected. Metadata and resolver geometry comparisons additionally check serialization consistency; the separate Python/browser oracle establishes resolver sample parity rather than the export verifier alone.

Reproduce the checks with the commands in the [static hosting guide](../deployment/static-hosting.md). Database checks need an isolated `MONGODB_TEST_URI`; never point the integration tests at the production database.

## Live cutover

Before cutover, Render metadata reported 106,799 collisions through October 5, 2026, dataset `20261008T172723Z-fbef0eb54182`. The checked-in snapshot contains 106,050 records through August 31 and must not replace that newer public dataset during cutover.

Cloudflare bootstrap version `8612ba33-59ba-4f40-99ad-1046fc43a87d` initialized the static Worker with its production workers.dev address disabled. No public dashboard cutover is established by that initialization.

The current-Atlas export passed after the computer's temporary IP access rule was added. Production publication and the live desktop/mobile checks passed. The Render service is suspended with automatic deployment off; its configuration and last deployment remain as a recovery reference. GitHub production credentials and the website URL are configured.

## Cloudflare preview

Version `93e65791-6bbe-4880-8be3-382cf61a88e1` contains the verified current Atlas snapshot. Desktop and mobile browser smoke checks passed against its preview with Render and Atlas requests blocked. The HTTP verifier now identifies itself as `VisionZeroStaticVerifier/1.0`; Cloudflare rejected the default Python user agent with error 1010. GitHub pull request [#3](https://github.com/trenton-pham/Vision-Zero-Collision/pull/3) contains only migration changes.

## Additional cutover verification

- Current Atlas geometry passed 232 Python/browser resolver cases: the 44 synthetic edge cases, plus an interior and exact polygon vertex for each of the 94 live neighborhoods. Receipts: `.audit/static-migration/live-resolver-reference.txt` and `live-resolver-verification.json`.
- Real desktop and mobile map clicks loaded resolver geometry lazily and changed both the selected neighborhood URL and inspector, with runtime Render/Atlas requests blocked. Receipt: `.audit/static-migration/cloudflare-preview-map-click.txt`.
- A real compressed release restored all 2,726 files with checksums matching its candidate. Two real releases assembled into 5,406 files; their two compressed archives totaled 103,150,034 bytes against a 209,715,200-byte budget. Receipts: `real-archive-recovery.json` and `real-previous-release-retention.json` in the audit folder.
- After 1,159 seconds without test requests, one fresh, unthrottled desktop Chromium visit received the preview document in 245 ms and rendered neighborhood map data in 3,359 ms. This is one observation, not a broad performance guarantee or proof of no third-party traffic. Receipt: `.audit/static-migration/cloudflare-idle-first-visit.json`.
- Cloudflare version metadata reports direct asset serving, no script handlers, an empty bindings list, and `raw_run_worker_first: false`. Receipt: `.audit/static-migration/cloudflare-preview-version.json`.

Pull-request verification run [42080838911](https://github.com/trenton-pham/Vision-Zero-Collision/actions/runs/42080838911) passed, including 141 frontend tests and 114 browser tests. Its exhaustive export/API step took 19 minutes 20 seconds. The migration was merged in [PR #3](https://github.com/trenton-pham/Vision-Zero-Collision/pull/3) as `4f8a5252397bbb0d76a79af6fd8da615d6bf772e`. The main-branch verification job also passed; production publication is tracked by run [42085397542](https://github.com/trenton-pham/Vision-Zero-Collision/actions/runs/42085397542).

## Completed production release

- Live dashboard: [vision-zero-collision.trentonpham.workers.dev](https://vision-zero-collision.trentonpham.workers.dev).
- Cloudflare version: `16b59408-4e03-40f8-a855-f93a9794ac93`.
- Release ID: `678bbee3b43575afef7ff81e1f5f9542d1aca36d5c6366e2e6d0aa8d9ccc224e`.
- Published dataset: `20261008T172723Z-fbef0eb54182`, 106,799 collisions through October 5, 2026. Atlas was not refreshed or rolled back during cutover.
- Publication code revision: `4f8a5252397bbb0d76a79af6fd8da615d6bf772e`.
- Production workflow [42085397542](https://github.com/trenton-pham/Vision-Zero-Collision/actions/runs/42085397542) passed verification, candidate checks, archive saving, promotion, production smoke, retention, and temporary Atlas IP cleanup. Its complete duration was 45.4 minutes.
- The retained GitHub archive `collision-static-42085397542-16b59408-4e03-40f8-a855-f93a9794ac93` downloaded with the expected GitHub digest. Restoring it validated all 2,726 files and matched the live manifest. Its compressed release is 51,878,679 bytes. This initial publication has one archive; later successful publications retain up to two.
- Production desktop/mobile checks covered both views and real map selection with runtime Render and Atlas requests blocked. The dashboard also passed the two-viewport smoke after Render was actually suspended.
- After 1,143 seconds without production test requests, one fresh desktop Chromium visit received the document response in 64 ms and rendered neighborhood map data in 2,660 ms. HTML returned `public, max-age=0, must-revalidate`. The observation was unthrottled; readiness means map data rendered, and it does not establish the absence of third-party traffic.
- Actual promoted-version metadata confirms direct static serving, no script handler, an empty bindings list, and `raw_run_worker_first: false`.

The hosted export matches 2,670 local analytical files byte for byte. Resolver geometry has platform projection differences of at most `1.862645149230957e-09` metres in coordinates and `9.369105100631714e-07` square metres in areas; WGS84 geometry and the projection definition match. Using the actual hosted geometry, all 232 Python/browser reference cases still match IDs, methods, and reported distances.

Website rollback was exercised on an isolated free Cloudflare Worker: version A  to  B  to  A restored both assets and headers. The temporary Worker was deleted. Atlas rollback was exercised in the isolated MongoDB integration suite. Production Atlas data was unchanged. The actual hosted recovery archive was restored separately, as described above.

Local receipts for the final checks are `.audit/static-migration/production-browser.txt`, `production-map-click.txt`, `post-render-browser.txt`, `production-idle-first-visit.json`, `github-production-archive-recovery.json`, `cloudflare-rollback-verification.json`, `hosted-resolver-verification.json`, and `resolver-platform-difference.json`.
