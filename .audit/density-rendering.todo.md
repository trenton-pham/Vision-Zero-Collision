# Density cache and renderer

- [x] 1. `how` over the affected subsystem.
- [x] 2. `architect` for parallel design exploration.
- [x] 3. Write the throughput checkpoint as four todo items.
- [x] 4. Delegate code-writing to a subagent.
- [x] 5. Verify on the matching surface.
- [ ] 6. Rebase into small, ordered commits. Stack follow-ups.
  skip: deliver local changes for review; no publication requested.
- [ ] 7. If the design is contested, `interrogate` before shipping.
  skip: two designs and an independent judge selected the accepted design in planning.
- [ ] 8. Run **Opening a PR**.
  skip: no GitHub publication requested.

## Throughput checkpoint
- [x] Blocking first steps. Capture uncached API responses, timings, and SVG production build before editing.
- [x] Independent workstreams. Backend implementation and renderer harness preparation use separate checkouts and outputs.
- [x] Shared mutable state. One backend writer; main checkout owns experiment artifacts. Benchmarks run alone.
- [x] Smallest safe decomposition. Backend cache plus browser experiment, followed by one integrated verification pass.

## Accepted design
Per-snapshot JSON LRU, 32 entries and 8 MiB payload, two density endpoints, short state lock and one compute lock per endpoint.
Five alternating SVG/Canvas pairs per layer and viewport. Adopt only with >=10% benefit beyond SVG range and no >10% regression.

## Results
- Backend: 70 passed, 5 MongoDB integration tests skipped without a test URI.
- Frontend: 79 unit tests passed, production build passed, 44 desktop/mobile browser checks passed.
- Canvas passed the agreed gate. Cache outputs matched uncached responses and timed hits did not recompute.
- Independent code and measurement review found no blocking issues. Strengthened image-change assertions from review.
- DENSITY-1: existing selected-text contrast fixed and accessibility checks passed.
- Reproduction scripts, profiles, raw measurements, screenshots and report are in .audit/density-rendering/.
