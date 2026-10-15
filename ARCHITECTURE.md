# Architecture

## Runtime

Monorepo: `apps/web` (Next.js App Router), `services/api` (FastAPI modular monolith), dan `services/vision` (OpenCV/Ultralytics worker). PostgreSQL menyimpan state operasional. Tidak ada Redis, broker, physical drone integration, atau inference dalam event loop API.

Frontend berjalan pada :3000, backend :8000; Compose membatasi keduanya ke loopback. Database/worker berada di network internal. `.env` mengatur koneksi, service token, model, laju sampling, dan default simulasi.

## Data flow

Capture thread per kamera → latest-frame slot terbatas → inference serial model → confidence filter → validator per kamera/kelas → JPEG evidence atomik → POST `/internal/detections` → transaksi detection/incident/activity → event publisher → WebSocket → TanStack Query/cache/panel/map.

Capture dan preview tidak menunggu inference. Worker menulis raw JPEG sekitar 5 fps dan annotated JPEG setiap inference; annotated frame diberi timestamp untuk mencegah penampilan bounding box pada frame berbeda. Backend menyajikan MJPEG melalui pembacaan filesystem di thread. Evidence disimpan di `data/evidence`, bukan blob database.

Worker mengambil konfigurasi backend dan mengirim heartbeat. Epoch berubah saat reset/replay/configuration source; capture/validator lama dihentikan. Candidate retry mempertahankan ID yang sama. Backend menolak epoch lama, paused run, path evidence yang tidak aman, token tidak valid, dan deteksi AI saat skenario manual aktif.

## Database dan state machines

Tabel: cameras, detections, incidents, response_units, dispatches, drones, drone_missions, activity_logs, demo_state. Alembic 001 adalah snapshot schema awal; 002 menambahkan integrity association/status; 003 memisahkan timestamp capture dan inference; 004 menyimpan metadata estimasi lokasi dan pemindaian otomatis. UTC digunakan di penyimpanan; UI memakai WIB.

Incidents: pending_review → confirmed → dispatched → in_progress → resolved → closed; alternatif pending_review → false_alarm → closed. AI/manual hanya membuat candidate. Transaksi mutasi singkat dan tick simulator mengunci singleton runtime row untuk menghindari deadlock silang resource; pembacaan REST tetap concurrent. Row lock kamera dan partial unique index membatasi satu insiden aktif per kamera. Confirmation/rejection/resolution/closure merupakan tindakan operator.

Dispatch: assigned → accepted → responding → on_site → completed. Assignment mengunci insiden dan unit; unique active-unit index mencegah assignment ganda. Gerakan unit memakai geodesik langsung dan ditandai virtual. Completion melepaskan unit.

Mission: proposed → approved → en_route → on_site → suppression_simulation → returning → completed. Reconnaissance dapat kembali tanpa payload. Abort sebelum launch menghasilkan cancelled; saat airborne, kembali dahulu lalu aborted. Failure membekukan drone sebagai unavailable. Reserve dilakukan pada proposal; partial unique active-drone index, row lock, dan current-mission FK menjaga assignment.

Target mission merupakan snapshot koordinat perkiraan. Saat ingest, sistem menghitung arah kamera, disesuaikan pusat bbox horizontal bila lebar frame tersedia, dan mengasumsikan jarak 60% monitoring range. Radius awal 50% range (minimum 200 m) adalah asumsi demo, bukan confidence interval terukur. Operator dapat mengganti titik. Kamera/sektor tidak dianggap posisi GPS api. Payload release memiliki command ID idempotent; tidak mengubah status insiden.

`POST /api/incidents/{id}/respond` adalah satu persetujuan eksplisit operator untuk verifikasi, proposal, approval, dan launch dalam satu transaksi. Default reconnaissance. Tidak bergantung acknowledgment damkar. Mission `automatic=true` memindai selama 24 detik simulasi, mencatat pembaruan titik **drone_simulation** dengan radius asumsi 80 m, lalu kembali setelah 40 detik di lokasi. Ini skenario deterministik virtual, bukan ekstraksi lokasi dari video drone atau bukti peningkatan akurasi. Titik pilihan operator dipertahankan. Automatic suppression hanya melalui otorisasi eksplisit mission type tersebut. Abort dan cadangan baterai tetap berlaku.

## Tiga ruang kerja dan alarm

Setiap pembukaan halaman utama meminta pilihan Operator, Petugas Damkar, atau POV Drone. Ini pemisahan UI untuk demo lokal, bukan role-based authentication. Semua panel memakai REST/cache TanStack Query dan event WebSocket yang sama. Panel damkar mengelola acceptance/progres regunya; POV hanya membaca telemetri dan tidak menjalankan state mission.

POV memakai MP4 footage asli hutan/kebakaran dari Pexels. Tahap misi memilih footage pendekatan atau area target; kemajuan rute menyinkronkan posisi replay. Replay tidak menjadi evidence AI dan tidak menghitung koordinat. Telemetri, pemindaian, dan lokasi tetap simulasi backend.

Alarm visual mengikuti kandidat pending dari cache REST/realtime, termasuk setelah reconnect. Suara **nonaktif secara default**; AudioContext hanya dibuat setelah klik aktivasi dan konfirmasi pengguna. Pengakuan alarm tidak memverifikasi insiden. Verifikasi/penolakan menghapus kondisi alarm kandidat tersebut. Refresh/ganti sesi kembali ke mode senyap. Tidak ada tombol test sound.

## Simulator

Satu asyncio loop backend menjalankan tick sekitar satu detik, dengan operasi SQL sinkron dipindahkan ke thread. Leadership PostgreSQL advisory lock menolak backend kedua. `pyproj.Geod.inv/fwd` menghitung jarak dan langkah; movement di-clamp ke target.

Simulation seconds = elapsed monotonic wall time × speed (1/5/8/10). Delta wall time dibatasi 3 detik per tick untuk menghindari loncatan saat stall. Battery burn menggunakan simulation seconds, default endurance virtual 20 menit. Proposal/launch memperhitungkan round trip, 60 detik on-site, dan 20% reserve. Battery reserve kritis memicu return; depletion menghasilkan failed.

Posisi, route, payload, battery, simulation elapsed, dan transisi dipersist. Restart dengan mission airborne menandai paused; downtime tidak diterjemahkan menjadi penerbangan. Semua spesifikasi bersifat virtual.

## REST dan realtime

Seluruh endpoint wajib terdapat di OpenAPI, beserta tambahan bootstrap, camera configuration, incident location/notes/close/report, activities, demo control/replay/manual-event, worker configuration/heartbeat, dan health.

Pydantic memvalidasi input dan response. `scripts/export_api_types.py` menghasilkan kontrak TypeScript. Frontend menggunakan TanStack Query untuk server state dan Zustand untuk pilihan kamera/insiden/panel.

Activity rows menjadi event outbox dan history. Publisher mengambil log yang sudah committed menggunakan row lock `SKIP LOCKED`, kemudian menandai published dan broadcast. Envelope memiliki stable event ID, type, timestamp, sequence, dan data. Telemetry menyertakan timestamp state untuk menolak update yang lebih tua daripada snapshot REST.

Frontend menunggu REST resync saat koneksi terbuka/reconnect, menahan event sementara, dan mempertahankan deduplication sepanjang connection lifecycle. Telemetry memutakhirkan cache; event domain menginvalidasi query. REST polling 10 detik menjadi pemulihan tambahan. Delivery bukan exactly-once: disconnect/crash dapat kehilangan notifikasi sesaat, sementara state/history pulih lewat REST dan database.

## Demo, isolation, dan offline

`DEMO_MODE=true` menyediakan controller. Start AI mengubah playback, tanpa menciptakan kandidat. Mode manual membutuhkan tindakan eksplisit terpisah dan provenance manual_simulation. Reset membersihkan insiden demo dan resource terkait; evidence yang direferensikan juga dibersihkan. Laporan dari run normal persisten sampai reset yang relevan.

Semua role memakai basemap OpenStreetMap online sejak inisialisasi, dengan atribusi. GeoJSON hanya menjadi overlay kamera, FOV, insiden, dan rute. Tile gagal menampilkan pesan/coba kembali tanpa fallback basemap lokal. Model/video disiapkan sekali dan tidak diunduh saat startup.

Host/Origin dibatasi untuk aplikasi lokal; internal API memakai service token yang tidak dikirim ke browser. Ini local-demo isolation, bukan autentikasi deployment publik. Set `DEMO_MODE=false` untuk menonaktifkan tindakan demo; tetap gunakan binding localhost.


Operator kini membuka wall CCTV 2x2 dengan empat kamera, preview besar, overlay AI, dialog perbesar, dan Fullscreen API. Peta operasi tetap memakai basemap online. Video payload dipilih hanya untuk status suppression_simulation; klip helikopter menampilkan pelepasan air dan tidak mengubah state backend. Pilihan respons otomatis menjelaskan serta meminta persetujuan untuk payload virtual. Seed menambah CAM-004 secara idempotent dan menjaga sumber kamera kustom.
