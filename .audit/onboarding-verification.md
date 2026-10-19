# Onboarding verification

Checked October 18, 2026, America/Los_Angeles. The application source is at `2a7fa31`. Setup and documentation corrections remain in the working tree.

| Check | Result | Evidence |
| --- | --- | --- |
| MongoDB integration | Passed all 5 tests | Python 3.11 against disposable MongoDB 8.2. Publication, loading, rollback, failed publication, unchanged content, and row-decrease handling passed. |
| Browser suite | Passed all 44 tests | Chromium at 1440×1000 and 390×844. Includes real local response contracts, navigation, filters, density rendering, URL state, selection races, and accessibility checks. |
| Live Render deployment | Live | Service `srv-dar202u0tbcc738nhe10`, deployment `dep-db9fspom7kps73d83p40`, commit `2a7fa31`. Error-log query returned no entries. The queried failure/restart event history returned only the successful deployment event. |
| Live health and data | Passed | `/healthz`, `/readyz`, and `/api/meta` returned successfully after Render's initial loading page. Backend is `mongodb`, dataset version is `20261008T172723Z-fbef0eb54182`, coverage ends October 5, 2026, and metadata reports 106,799 collisions and 94 neighborhoods. |
| Live browser interactions | Passed | Selected Ballard, switched to monthly trends, navigated to Citywide, selected Fatal, and switched to KDE density. Related API requests returned HTTP 200. No alert appeared or new console error occurred after startup. No horizontal overflow at 390 or 1440 pixels. |
| SDOT source | Passed metadata check | The configured ArcGIS collision layer responded, supports queries, has point geometry, and includes the required identifiers, incident date, and injury/fatality fields checked. No ingestion or publication was triggered. |
| Atlas inspection through plugin | Blocked | The Atlas plugin reports that MCP access is disabled for every organization on the account. An Organization Owner must enable AI client access. No direct Atlas collection, index, or active-version-pointer inspection was possible. |

The self-managed MongoDB plugin connected to the disposable local instance. Database listings before and after the integration run confirmed that the tests removed their temporary databases. The Atlas plugin restriction does not prevent the live application from serving its MongoDB-backed snapshot.

The initial sandboxed browser-suite attempt could not bind the local server port. The rerun with local browser and network access passed all 44 tests against the Python 3.11 Docker server. The live Render site initially returned its loading page with HTTP 503, then became healthy without a deployment or restart request.

The temporary local test containers were removed and the MongoDB plugin connection was closed. Production configuration and data were not modified.

Live dashboard: https://seattle-collision-dashboard.onrender.com

Render service: https://dashboard.render.com/web/srv-dar202u0tbcc738nhe10
