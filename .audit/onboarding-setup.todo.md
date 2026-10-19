# Onboarding setup corrections

- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives.
  - skip: The prior audit identified the causes. Recheck the local files rather than repeat the investigation.
- [x] Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
  - Scope: Repair the development container, correct the architecture guide and six audited issues, and simplify README prose. No application API changes.
  - Checkpoint: Verify container configuration and launch commands, local artifact generation and HTTP readiness, documentation links, frontend build, and the final diff.
- [x] Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
  - Fresh Dev Containers CLI build, postCreate and postStart completed under Python 3.11 and Node 22.
  - Seeded broken host interpreter and frontend dependency marker survived unchanged outside the container volumes.
  - Artifact generation, frontend build, and HTTP checks for readiness, metadata, root, docs, and health passed.
  - Frontend tests passed, 79 tests. Backend suite passed with five MongoDB integration tests skipped because no test database was configured.
  - Config validation, lifecycle shell syntax, Markdown links and fences, and git diff whitespace checks passed.
  - Two independent reviews completed. Fixed their host-environment isolation and research-question wording findings.
- [x] Stage the commits so the failing repro lands before the fix in git history.
  - skip: Keep changes in the working tree. The task does not require commits.
- [x] Run **Opening a PR**.
  - skip: Deliver the local corrections for review. No PR was requested.

## Known issue outside this change

`npm audit` reports the existing high-severity `source-map-js` advisory GHSA-68fv-2mgg-jv7q. No dependency versions or lockfiles changed. The advisory concerns denial of service when processing indexed source maps. Follow-up: update the affected transitive build dependency and verify the frontend build and tests.

Follow-up verification passed all five MongoDB integration tests against local MongoDB 8.2 and all 44 desktop/mobile browser tests. Live Render health, dashboard interactions, and SDOT ArcGIS metadata checks passed. Direct Atlas inspection remains blocked because the organization disables AI client access. See [onboarding-verification.md](./onboarding-verification.md).

The host `.venv` still uses Python 3.10. Container checks used the supported Python 3.11 environment without changing the host environment.
