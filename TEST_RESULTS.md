# Verification results

Executed locally with Docker Desktop on 14 October 2026 (WIB). These are software checks and measured QA runs, not model accuracy measurements.

| Check | Actual result |
|---|---|
| Backend/API/PostgreSQL tests | **28 passed**; one upstream AnyIO deprecation warning |
| Vision adapter/temporal tests | **10 passed** |
| Frontend telemetry/reconnect/POV/worker tests | **10 passed** |
| TypeScript | Passed |
| Docker production build | Backend, vision, frontend passed; frontend build also runs typecheck and ten tests on Node 22 |
| Fresh migrations | Upgrade 001→002→003→004, schema comparison, and downgrade to base passed in isolated test database |
| Dependency audit | `npm audit --omit=dev`: zero reported vulnerabilities at execution time |
| Running services | Four health checks passed; frontend HTTP 200 and backend health succeeded |

Total: **48 automated tests passed** after the three-role update. Backend tests use the isolated `karhutla_test` database and a controlled scheduler; separate live-service smoke tests exercise the running simulator. The new tests cover automatic reconnaissance, concurrent duplicate requests, rollback on insufficient battery, simulated location refinement, operator location preservation, abort, automatic payload release, and POV projection. Audio alarms were deliberately not activated or tested.

## Live end-to-end runs

These runs used the deployed Compose services, actual PostgreSQL persistence, and a WebSocket subscriber. QA automation performed operator actions through the REST API; the UI requires explicit human confirmation.

| Run | Wall-clock duration | Received drone telemetry | Result |
|---|---:|---:|---|
| **Real AI + automatic reconnaissance**, three-role build | **79.70 s** | **35 events** | Passed |
| **Real AI**, earlier manual-mission flow | **54.34 s** | **26 events** | Passed |
| Explicit manual simulation, earlier manual-mission flow | **29.59 s** | **26 events** | Passed |

Workflow verified: scenario reset/start → candidate → confirmation → estimated coordinates → firefighter assignment/response → mission proposal → approval → launch → geographic movement → arrival → virtual payload release → return → mission completion → explicit incident resolution/closure → persisted report.

The new `--ai --automatic` run verified automatic camera-bearing estimates, genuine model evidence, a single explicit operator authorization, autonomous reconnaissance/return, and a persisted `incident.location_refined` event marked `simulated=true`. The firefighter assignment remained `assigned` until after drone completion, proving no dependency on firefighter acknowledgment. The test then completed the team workflow and explicitly resolved/closed the incident. Reconnaissance did not release payload. `data/smoke-test-auto-ai.json` and its adjacent JPEG preserve the run. The first attempt hit the worker-readiness guard immediately after reset; the smoke script now waits for a fresh ready heartbeat before starting AI.

The deployed homepage returned all three role choices and the initial silent-mode label. The deployed map asset/CSS smoke check passed. No audio context was activated, no alarm sound was played, and no audio alarm test was run. A browser connection remained unavailable, so visible role interactions and the rendered POV remain unverified in a browser.

Real-AI mode waited for the worker. It verified `provenance=ai`, an actual JPEG evidence image, and the configured model fingerprint. It did not call the manual-event endpoint. Payload release was checked to leave the incident in progress. Drone availability was released after mission completion.

Local QA artifacts (ignored by Git, preserved after demo reset):

- `data/smoke-test-ai.json`
- `data/smoke-test-ai.jpg` — genuine inference evidence, smoke confidence approximately 0.84 on this frame
- `data/smoke-test-manual.json`
- `data/evaluation/fixture-results.json`
- `data/evaluation/fixture-contact-sheet.jpg`

The durations describe automated QA runs on this machine. They are not validated operational response times, model throughput guarantees, or firefighter/drone performance claims.

## Vision fixture sampling

Processed **64 sampled frames from 22 FIRESENSE videos**, with the configured smoke/fire weights and threshold 0.60. Both smoke and fire detections occurred in the samples. Reviewed source frames include ordinary outdoor vegetation, clouds, smoke, and visible flame. Several positive clips produced no detections in the sparse samples.

This sampling checks inference integration and informs demo-clip selection. It does not establish precision, recall, mAP, accuracy, or robustness. Fog/mist fixtures remain untested.

## Verification limits

Map repair follow-up on 14 October 2026:

- Fixed the map container selector so MapLibre's own `position: relative` rule cannot collapse its height.
- Published the version-matched MapLibre 6 worker modules locally and configured the worker URL explicitly. Previously the deployed worker asset returned HTTP 404.
- Frontend typecheck, **7 frontend tests** (including a new actual worker-module boot test), and the Docker production build passed.
- Recreated the frontend container. `python scripts/check_map_assets.py` passed against `localhost:3000`: map sizing rule present; worker and shared module HTTP 200 with `application/javascript`. The shared module is empty in the installed upstream package.
- Frontend and vision health checks passed after restarting. This follow-up did not rerun the backend/vision suites or incident workflow.

- No browser connection was available. Visual layout at 1440/1920/tablet, interactive map rendering, visible interpolation, and offline tile-failure behavior have not been browser-verified. The source implements these behaviors; build, typecheck, and HTTP checks passed.
- RTSP and webcam adapters have not been exercised against real streams/devices.
- Actual CPU inference was below the configured target of one result per second per camera; the dashboard reports measured total worker fps.
- Reconnect/resync/deduplication have automated client tests, and live WebSocket incident/telemetry have server and end-to-end tests. A full browser reconnect journey remains unverified.
- Real drone hardware is intentionally unsupported. Battery, payload, movement, and response-team travel are virtual.
