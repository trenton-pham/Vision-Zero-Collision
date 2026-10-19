# Container onboarding corrections

- [x] Reproduce it yourself on the matching surface via the driver skill (Non-negotiables), even when a debug or instrumentation protocol says to ask the user to reproduce. Ask the user only with a stated, specific reason the control surface cannot reach the target, and only after driving it as far as it goes. If it won't reproduce directly, synthesize the trigger, tighten conditions, or instrument until it fires.
  - Prior audit confirmed unsupported host Python 3.10, incomplete Node minimum, stale notebook metadata, and the source-map-js advisory.
- [x] Binary-search the cause. Form the candidate hypotheses, then rule them out until one survives.
  - skip: The second-pass audit already traced these configuration and documentation defects.
- [x] Plan the fix. If it crosses a function boundary, `architect` first. Delegate implementation to a subagent using your configured bug-fix model (default in poteto-mode's Models section) with a specific scope.
  - Scope: Container-first README and architecture instructions, notebook kernel metadata, Node engine floor, targeted dependency fix, container interpreter selection, historical verification scope, and removal of the host Python 3.10 environment after container verification.
  - Data shape: Existing Markdown instructions, JSON configuration objects, and the npm dependency graph. No application API or data schema changes.
  - Throughput checkpoint: One documentation writer, parent-owned configuration and runtime verification, then independent review.
- [x] Verify on the same surface. The original repro now passes. "Inconclusive" or wrong-surface is not a pass. Flag it. Unit tests show branch behavior, not bug absence.
  - Fresh dev-container lifecycle, readiness, frontend tests/build/audit, Python tests, notebook imports and data-loading smoke checks on Python 3.11, and final diff review.
  - Passed the final creation hook, 79 frontend unit tests, 44 browser tests, backend tests with five optional MongoDB tests skipped, real Python 3.11 notebook kernels, and dependency audits. Host Python 3.10 files were removed; its empty directory remains after permission-denied directory removal. See container-onboarding-verification.md.
- [x] Stage the commits so the failing repro lands before the fix in git history.
  - skip: Deliver workspace edits. No commit was requested.
- [x] Run **Opening a PR**.
  - skip: Deliver workspace edits. No pull request was requested.
