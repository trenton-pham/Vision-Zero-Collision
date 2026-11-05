# Static migration verification

Recorded November 5, 2026. These are local implementation checks, not a claim that production cutover or GitHub Actions has completed.

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

## Live gates

The existing Render metadata reports 106,799 collisions through October 5, 2026, dataset `20261008T172723Z-fbef0eb54182`. The checked-in snapshot contains 106,050 records through August 31 and must not replace that newer public dataset during cutover.

Cloudflare bootstrap version `8612ba33-59ba-4f40-99ad-1046fc43a87d` initialized the static Worker with its production workers.dev address disabled. No public dashboard cutover is established by that initialization.

The current-Atlas export passed after the user added the computer’s temporary IP access rule. Public cutover requires preview HTTP/browser checks, an archive-backed promotion, live metadata comparison, and an idle-first-visit check. Keep Render available until those gates pass. Publication credentials remain GitHub production-environment prerequisites.

## Cloudflare preview

Version `93e65791-6bbe-4880-8be3-382cf61a88e1` contains the verified current Atlas snapshot. Desktop and mobile browser smoke checks passed against its preview with Render and Atlas requests blocked. The HTTP verifier now identifies itself as `VisionZeroStaticVerifier/1.0`; Cloudflare rejected the default Python user agent with error 1010. GitHub pull request [#3](https://github.com/trenton-pham/Vision-Zero-Collision/pull/3) contains only migration changes.
