# Organize offline cleaning scripts

- [x] Pin the behavior contract first.
  - Existing cleaning/time-quality tests, cleaning CLI help, and default input/output locations must stay unchanged.
  - Before the move, all 11 cleaning/time-quality tests passed under Python 3.11. CLI help was captured, and default data paths resolved to the repository's data directory.
- [x] Name the structure the code is missing per **principle-model-the-domain**.
  - The four existing modules form one offline cleaning package. No new abstraction or application behavior.
- [x] Name the target shape.
  - `scripts/clean.py`, `scripts/cleaning_base.py`, `scripts/collision_clean.py`, and `scripts/vehicle_clean.py`, with package-relative imports. Launch from the root with `python -m scripts.clean`. Backend operational commands stay in `backend/scripts/`.
- [x] Subtract before you add.
  - Replace the old root imports and paths without compatibility wrappers or unrelated cleanup.
- [x] Move in small behavior-preserving steps, each keeping the pin green.
  - Update source modules, both test callers, README, and the architecture guide together.
- [x] Prove behavior is unchanged on the real artifact, not "it compiles".
  - Run the Python suite in the existing Python 3.11 container, compare CLI help, and verify unchanged default data paths.
  - Passed 70 tests with five optional MongoDB tests skipped. CLI help matches the pre-move capture, default data paths are unchanged, and the running dashboard remains ready.
- [x] Confirm the change is worth keeping.
  - The root no longer mixes offline data preparation with application entry points.
- [x] Rebase into small ordered commits.
  - skip: Deliver workspace edits. No commit or pull request requested.

Throughput checkpoint: one mechanical-edit delegate, then parent verification and independent review. No notebook data regeneration or frontend changes.
