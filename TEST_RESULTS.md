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


## Verifikasi perubahan basemap, footage, dan alarm - 15 Oktober 2026

- Backend: 30 tes lulus, termasuk allowlist footage dan HTTP byte range 206 untuk seeking.
- Vision: 12 tes lulus, termasuk CPU bersama yang sebelumnya selalu menghapus riwayat temporal, empat hasil positif tanpa menunggu sampel kelima/keenam, cooldown, dan pemisahan kategori.
- Frontend: 10 tes lulus; TypeScript dan production build lulus.
- Chromium 1440x1000: tile OpenStreetMap HTTP 200; tile yang sengaja diblokir menampilkan pesan dan pulih lewat Coba kembali tanpa basemap lokal. Tidak ada error JavaScript.
- Replay drone: pendekatan 20,04 detik; on-site memakai footage api 14,64 detik dan benar-benar diputar; pause menghentikan video; returning memakai footage hutan. Tahap misi untuk tes UI diberikan lewat fixture browser tanpa meluncurkan misi backend.
- Model asli dengan input 416: tiga sampel hutan normal tidak menghasilkan deteksi; tiga sampel kamera asap menghasilkan smoke (confidence sekitar 0,68 sampai 0,81); tiga sampel api menghasilkan fire. Ini pemeriksaan sampel, bukan benchmark akurasi.
- Pipeline worker nyata menghasilkan insiden AI CAM-002 `INC-3761db2a6e2b` beserta JPEG evidence. Browser menampilkan PERINGATAN ASAP TERDETEKSI. Database demo tidak direset; alarm dibiarkan menunggu verifikasi operator.
- Aset unduhan baru diverifikasi SHA256. Video berlabel replay referensi; koordinat, penerbangan, dan pemindaian tetap virtual. Audio tidak diaktifkan saat pengujian.


## CCTV empat kamera dan footage payload - 16 Oktober 2026

- Backend: 32 tes suite lulus, lalu empat tes stream khusus lulus setelah endpoint video dibuat mengikuti registry kamera. CAM-004 melayani stream raw dan AI; ID tidak terdaftar ditolak dan kamera terputus tidak menyajikan frame lama.
- Frontend: 10 tes lulus, TypeScript serta production build lulus.
- Browser Chromium: empat stream memiliki frame nyata; perbesar kamera, dialog dalam fullscreen, layar penuh 2x2, overlay AI, serta akses peta online berhasil tanpa error JavaScript.
- Tahap on-site memainkan footage api. Saat status berubah menjadi suppression_simulation, browser memainkan footage helikopter melepas air (12 detik, muted, tidak loop). Pause menghentikan replay; returning beralih ke footage hutan.
- Pilihan respons pemindaian + payload tampil pada detail insiden. Dialog menyebut izin pelepasan air virtual; request suppression_simulation baru dikirim setelah konfirmasi. Tes ini memakai fixture/intersepsi browser tanpa meluncurkan misi backend.
- CAM-003 dan CAM-004 memakai footage hutan berbeda. Enam sampel video tambahan tidak menghasilkan deteksi smoke/fire. Seluruh sepuluh MP4 hasil persiapan sesuai SHA256 manifest.
- Bukti lokal: data/cctv-four-cameras.png, data/cctv-fullscreen.png, data/helicopter-payload.png, dan data/cctv-payload-checks.json.

Layout CCTV terakhir: keempat kartu berada dalam viewport 1440x1000 dan 1920x1080 tanpa perlu scroll untuk melihat kamera keempat. Viewport 390x844 memakai satu kolom tanpa overflow horizontal. Laporan pengukuran tersimpan di data/cctv-layout-checks.json.
