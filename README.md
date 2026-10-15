# KARHUTLA.AI

Command center untuk deteksi dini smoke/fire, verifikasi operator, dan koordinasi respons virtual. MVP hackathon bertema Sustainability, berjalan lokal dengan Docker Compose.

## Menjalankan di Windows

Prasyarat: Docker Desktop aktif dengan Linux containers, PowerShell, koneksi internet untuk **persiapan pertama**, dan ruang disk untuk image CPU PyTorch serta aset video. Tidak perlu memasang Python, PostgreSQL, atau Node secara native.

Dari direktori proyek:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

Script membuat `.env` bila belum ada dengan service token acak, membangun empat service, mengunduh model dan footage publik, menyiapkan MP4, menjalankan migrasi/seed, lalu menunggu health check. Unduhan footage sekitar 198 MB; model sekitar 44 MB. Proses pertama dapat memakan beberapa menit. Unduhan menggunakan resume dan checksum.

Buka **http://localhost:3000**. OpenAPI: **http://localhost:8000/docs**. PostgreSQL dan worker tidak memublikasikan port. Frontend/backend hanya terikat ke loopback.

Pada halaman awal, pilih **Operator**, **Petugas Damkar**, atau **POV Drone**. Pilihan role berlaku untuk tab tersebut; buka tiga tab untuk presentasi serentak. Ini role demo lokal tanpa autentikasi akun.

- **Operator:** tinjau evidence, klik **Verifikasi & kirim drone otomatis**, lalu setujui dialog. Satu persetujuan menjalankan verifikasi dan launch virtual; drone memindai lalu pulang tanpa menunggu petugas damkar. Assignment regu tetap dapat dilakukan terpisah.
- **Petugas Damkar:** pilih regu, terima penugasan dari operator, perbarui status berangkat/tiba/selesai.
- **POV Drone:** visual hutan prosedural mengikuti telemetri backend. Kamera virtual menghadap ke bawah saat memindai. POV dan pemindaian lokasi adalah simulasi, bukan feed kamera udara nyata.

Kandidat baru memicu alarm visual. **Suara mati secara default** dan hanya aktif setelah tombol aktivasi serta konfirmasi pengguna. Suara alarm belum diuji/dibunyikan atas permintaan pengguna. Deteksi tidak otomatis mengizinkan launch; persetujuan operator tetap wajib.

Titik awal dihitung dari arah kamera dan jarak asumsi (60% jangkauan), dengan lingkaran ketidakpastian asumsi. Bbox menyesuaikan arah bila lebar frame tersedia. Drone virtual memperbarui titik melalui skenario simulasi berlabel; ini belum merupakan pengukuran GPS atau peningkatan akurasi yang divalidasi. Pilihan lokasi manual operator tidak ditimpa.

Untuk menjalankan kembali setelah persiapan, termasuk tanpa internet:

```powershell
docker compose up -d --wait
docker compose ps
```

Untuk memperbarui kode:

```powershell
docker compose up -d --build --wait
```

Untuk berhenti, tanpa menghapus database:

```powershell
docker compose down
```

## Setup manual dan mode tanpa aset

```powershell
Copy-Item .env.example .env
# Ganti SERVICE_TOKEN pada .env dengan nilai acak.
docker compose build
docker compose run --rm --no-deps -v "${PWD}:/workspace" backend python /workspace/scripts/fetch_assets.py
docker compose run --rm --no-deps -v "${PWD}/assets:/assets" vision python -m vision.prepare
docker compose up -d --wait
```

Untuk mencoba workflow manual tanpa mengunduh model/footage:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -SkipAssets
```

Kamera akan menyatakan video tidak tersedia bila footage belum ada. Worker menyatakan AI tidak tersedia bila weights belum ada. Pilih **Mode manual**, kemudian **Buat Kejadian Simulasi Manual**. Kandidat dan laporan tetap ditandai simulasi.

## Yang berfungsi

- Dashboard gelap berbasis MapLibre dengan tiga kamera, sektor FOV, insiden, tim, drone, dan rute. GeoJSON lokal menjadi default; basemap OpenStreetMap opsional.
- Konfigurasi MP4/RTSP/webcam, preview MJPEG, frame AI beranotasi, reconnect capture, temporal validation, snapshot evidence, dan deduplikasi kandidat.
- Lifecycle insiden, koordinat perkiraan dari operator, dispatch regu, serta aktivitas tersimpan.
- Proposal, approval, launch, movement geodesik, reserve baterai, payload virtual, return, abort, dan completion mission.
- WebSocket, reconnect/resync REST, deduplikasi notifikasi, interpolasi marker, dan history/report JSON serta cetak dari browser.
- Demo start, pause/resume, reset, replay, pilihan kecepatan, dan mode manual terpisah.

## AI nyata dan simulasi

**AI nyata:** Ultralytics YOLO melakukan inference pada frame video, memakai weights khusus `smoke` dan `fire`. Threshold 0,60 dan validator 4 dari 6 hasil merupakan default eksperimental. Kandidat menyimpan class, confidence, bbox, timestamp, evidence, serta fingerprint weights. Confidence bukan akurasi model.

**Simulasi:** kamera dan koordinat pemantauan demonstrasi, gerakan tim, semua operasi drone, baterai, altitude, payload, serta kejadian manual. Video adalah footage asli yang diputar ulang; skenario menggabungkan klip normal dan smoke dengan edit yang didokumentasikan. Tombol **Mulai AI** hanya memulai playback, tidak membuat deteksi.

Drone/tim tidak terhubung ke perangkat fisik. Pelepasan payload tidak menyelesaikan insiden. Operator harus menekan **Tandai teratasi** dan **Tutup insiden**.

## Model dan sumber video

Model yang diuji: [odiug77/wildfire-smoke-fire](https://huggingface.co/odiug77/wildfire-smoke-fire), revision `9c81734ac75d14ba57c7834904891874074e451f`, kelas `smoke=0`, `fire=1`. Metadata publisher menyebut Apache-2.0. Library Ultralytics memiliki ketentuan lisensinya sendiri: [Ultralytics licensing](https://www.ultralytics.com/license).

Footage yang disiapkan: [FIRESENSE database](https://zenodo.org/records/836749), Nikos Grammalidis, Kosmas Dimitropoulos, Enis Cetin; **CC BY 4.0**. `normal.mp4` berasal dari 16 detik pertama `neg/testneg04.810.avi`. `scenario.mp4` menggabungkan 8 detik klip tersebut dengan 30 detik pertama `pos/testpos04.820.avi`. Footage bukan rekaman Kalimantan. Metadata, perubahan, dan checksum tersimpan di `assets/manifest.json`.

Kandidat Boreal Forest Fire dari tahap riset tidak digunakan dalam paket demo ini; FIRESENSE menyediakan klip yang dapat diunduh dan telah diuji langsung.

Untuk weights sendiri: salin `.pt` ke `assets/models`, ubah `MODEL_PATH=/models/nama-model.pt`, lalu:

```powershell
docker compose up -d --force-recreate vision
docker compose logs --tail 50 vision
```

Adapter memeriksa path lokal, task detection, dan mapping kelas. Model COCO tanpa smoke/fire ditolak. Tidak ada download weights saat startup. Device default CPU; image saat ini menggunakan PyTorch CPU.

Untuk MP4 sendiri: simpan di `assets/videos`, buka **Pengaturan → konfigurasi kamera**, dan isi path `/videos/nama.mp4` pada JSON `normal`/`scenario`. RTSP menggunakan `{"url":"rtsp://..."}`; webcam menggunakan `{"index":0}` dan memerlukan akses device/native setup yang sesuai.

## Database, reset, dan pemeriksaan

Migrasi/seed otomatis dijalankan sebelum API siap; dapat dijalankan ulang secara eksplisit:

```powershell
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python -m app.seed
```

Reset hanya berlaku saat `DEMO_MODE=true`, menghapus data/evidence insiden demo dan mengembalikan resource virtual. Database tetap persisten sampai reset atau volume dihapus. Ekspor laporan sebelum reset bila ingin menyimpannya.

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/demo/reset
```

Tes business rule memakai database terisolasi bernama `karhutla_test`, bukan database aplikasi:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
```

Smoke test terhadap service yang sedang berjalan **mereset data demo**:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" backend python /workspace/scripts/smoke_test.py --output /data/smoke-test-manual.json
docker compose run --rm --no-deps -v "${PWD}:/workspace" backend python /workspace/scripts/smoke_test.py --ai --output /data/smoke-test-ai.json
```

Mode `--ai` menunggu kandidat dari worker, memeriksa provenance dan JPEG evidence, kemudian menjalankan workflow operasional; gagal jika AI tidak menghasilkan kandidat. Ia tidak beralih ke kejadian manual.

Untuk menyegarkan kontrak TypeScript dari OpenAPI:

```powershell
docker compose run --rm --no-deps -v "${PWD}:/workspace" backend python /workspace/scripts/export_api_types.py
```

Jika peta tidak tampil, periksa aset frontend tanpa mereset data demo:

```powershell
python scripts/check_map_assets.py
```

Worker MapLibre disalin otomatis dari package terpasang saat `npm ci`, `npm run dev`, dan build. Worker dilayani dari `/maplibre/<versi>/` secara lokal, termasuk dalam image Docker; tidak membutuhkan CDN. Setelah memperbarui frontend, jalankan `docker compose up -d --build frontend` lalu tekan **Ctrl+F5** di browser.

Lihat [ARCHITECTURE.md](ARCHITECTURE.md), [DEMO_GUIDE.md](DEMO_GUIDE.md), dan [TEST_RESULTS.md](TEST_RESULTS.md).

## Keterbatasan

- Model belum divalidasi untuk deployment keselamatan atau kondisi Kalimantan. Sampling klip positif menunjukkan beberapa smoke tidak terdeteksi; tidak ada klaim akurasi.
- Inference ditargetkan 1 fps/kamera, tetapi CPU sesi ini lebih lambat; UI menampilkan fps total yang diukur. Demo AI telah berjalan end-to-end dengan laju aktual tersebut.
- Kabut/mist belum diuji memakai fixture yang telah direview. Smoke, visible flame, kondisi normal, dan awan telah diproses pada footage referensi; ini bukan benchmark terkontrol.
- Pemeriksaan visual browser, layout 1440/1920/tablet, interpolasi tampak, dan kegagalan tiles lewat browser belum diverifikasi karena tidak ada browser terhubung. Production build dan HTTP telah diperiksa.
- RTSP/webcam didukung adapter tetapi belum diuji dengan hardware/stream nyata; webcam Docker Windows memerlukan konfigurasi device tambahan.
- Satu backend process dan satu operator lokal. Tidak tersedia login multioperator, deployment internet, geolokasi api presisi, triangulasi, atau navigasi jalan.
- Saat backend restart dengan drone airborne, simulasi dijeda dan dilanjutkan operator; waktu downtime tidak menjadi pergerakan drone.
