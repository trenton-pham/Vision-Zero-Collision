# Container onboarding verification

Checked October 19, 2026, America/Los_Angeles, against `cd7d0fd` plus the workspace changes in this follow-up. These are local development checks. No deployment, publication, rollback, or Atlas inspection was performed.

## Changes verified

- Container-first README and architecture commands use Python 3.11. Native development remains optional.
- VS Code selects the container virtual environment and uses each notebook's directory for relative data paths.
- Notebook metadata uses the generic Python kernel name without claiming an unexecuted Python version. Notebook cells and saved outputs are unchanged.
- The frontend declares the Node engine minimum required by its tools. The only dependency version change is `source-map-js` from 1.2.1 to 1.2.2.
- The container creation hook removes the unused Yarn APT source inherited from the base image. That source failed signature validation and blocked Playwright's Linux dependency installation. Signature verification remains enabled for the retained repositories.
- Historical deployment checks remain scoped to application commit `2a7fa31` in `onboarding-verification.md`.

## Results

| Check | Result |
| --- | --- |
| Dev Containers CLI creation and startup | Passed with Python 3.11.13 and Node 22.23.3, isolated dependency volumes, generated artifacts, and compiled React. The final creation command, including the Yarn cleanup, was also executed directly from the saved configuration and passed. |
| `curl --fail http://127.0.0.1:8000/readyz` in the container | Passed. Artifact backend, snapshot through August 31, 2026. |
| `.venv/bin/python -m pytest backend/tests -q` | Passed. Five optional MongoDB integration tests skipped without `MONGODB_TEST_URI`. |
| `cd frontend && npm test` | Passed all 79 tests. |
| `cd frontend && npm audit --json` | Passed with zero vulnerabilities after the targeted update. |
| `npx playwright install --with-deps chromium` and `npm run test:e2e` | Passed installation after the Yarn source cleanup and all 44 desktop/mobile browser tests. |
| Python 3.11 Jupyter notebook smoke checks | Passed in real `python3` kernels from the container's `.venv`. Collision EDA cells 2/4 loaded 109,040 records; vehicle EDA cells 1/2 loaded 160,695 records; spatial cells 1/2 loaded 106,050 records. Modeling cells 5/7/9/11/14/15 loaded 103,861 complete-year records, formed 8,364 cells, and split them into 6,691 training and 1,673 test cells. |
| Host Python 3.10 environment retirement | Passed. Removed the interpreter, packages, and `pyvenv.cfg`; an empty host `.venv` directory remains because directory removal returns permission denied. Container Python 3.11.13, `pip check`, and `/readyz` still pass afterward. No host environment was recreated. |
| JSON, Markdown shell snippets, and whitespace | Passed configuration parsing, shell syntax checks, balanced fences, and `git diff --check`. |
| Independent diff review | Initial and closing reviews found no actionable defects in the documentation, interpreter selection, notebook metadata, dependency update, or final Yarn source cleanup. |

Notebook verification uses a real Jupyter kernel and executes the existing import and data/preprocessing cells from `notebooks/`. It does not rerun model tuning, regenerate notebook outputs, or download raw datasets. EDA smoke checks use existing gitignored cleaned inputs; the model uses checked-in Parquet.

## Limits

MongoDB publication and Atlas permissions are unchanged and were not inspected in this follow-up. The Python test run reports an upstream Starlette HTTPX deprecation warning. The frontend build reports upstream Zod annotation warnings; the build succeeds.
