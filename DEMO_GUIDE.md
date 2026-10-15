# Demo tiga menit — tiga role

## Persiapan

1. Jalankan `powershell -ExecutionPolicy Bypass -File scripts/setup.ps1` sebelum presentasi. Model dan footage harus sudah lokal.
2. Periksa `docker compose ps`: empat service healthy.
3. Buka tiga tab http://localhost:3000. Pilih **Operator**, **Petugas Damkar**, dan **POV Drone**, satu role per tab.
4. Biarkan **Mode senyap** aktif. Alarm visual tetap bekerja. Jangan aktifkan suara di ruang publik; suara alarm sengaja belum diuji.
5. Di Operator, pastikan tiga preview, worker fresh, model dan footage siap. Gunakan GeoJSON lokal, reset demo, dan pilih 8×.
6. Jelaskan: koordinat Kalimantan adalah demonstrasi; footage FIRESENSE bukan footage kamera Kalimantan. Penerbangan, regu, POV, dan pemindaian drone sepenuhnya virtual.

## Alur presentasi

| Waktu | Tindakan presenter | Hasil |
|---|---|---|
| 0:00–0:20 | Tunjukkan halaman pilihan role, lalu Operator. Klik **Mulai AI**. | Playback normal diikuti smoke asli; tombol mulai tidak membuat deteksi palsu. |
| 0:20–0:55 | Buka CAM-002, lihat frame AI/bbox, tunggu validator. | Kandidat dengan evidence inference dan alarm visual. CPU dapat membutuhkan waktu lebih lama. |
| 0:55–1:15 | Tinjau evidence. Klik **Verifikasi & kirim drone otomatis**, baca dan setujui dialog. | Konfirmasi insiden, approval, dan launch tercatat. Target awal sudah diperkirakan dari arah kamera; lingkaran menunjukkan ketidakpastian asumsi. |
| 1:15–1:35 | Tugaskan TEAM-01. Pindah ke tab Damkar, tunjukkan tugas; regu boleh belum menerima. | Drone tetap terbang, tidak menunggu acknowledgment regu. Petugas dapat menerima dan mulai merespons sendiri. |
| 1:35–2:15 | Pindah ke POV Drone. Tunjukkan hutan perspektif, HUD, telemetri, dan pemindaian ke bawah saat tiba. | Sudut pandang mengikuti posisi backend. Setelah 24 detik simulasi di lokasi, titik diperbarui dengan label pemindaian virtual; setelah 40 detik drone mulai pulang. |
| 2:15–2:40 | Tunjukkan drone kembali/completed. Di Damkar perbarui tiba dan selesai tugas. | Resource dilepas. Insiden tetap in progress sampai keputusan operator. |
| 2:40–3:00 | Operator menandai teratasi, menutup insiden, dan membuka/mengekspor laporan. | Timestamp tersimpan, asal deteksi, sumber estimasi lokasi, pemindaian virtual, dan timeline misi. |

Penerbangan bergantung posisi target dan speed simulasi. Estimasi otomatis bukan GPS api: jarak diasumsikan 60% jangkauan kamera. Radius awal dan radius pemindaian adalah parameter skenario, bukan angka akurasi. Jika operator mengubah titik manual di peta, pemindaian virtual tidak menimpanya.

Reconnaissance otomatis tidak melepas payload. Untuk demonstrasi payload, gunakan alur manual yang tetap tersedia: konfirmasi insiden, buat proposal **Suppression Simulation**, approve, launch, lalu release payload saat on-site dan return. Pelepasan virtual tidak menandai api padam. API juga mendukung misi suppression otomatis hanya dengan persetujuan operator eksplisit untuk tipe tersebut.

## Fallback manual

Jika model/footage tidak siap: reset, pilih mode manual, lalu **Buat Kejadian Simulasi Manual**. Lanjutkan verifikasi dan misi otomatis seperti di atas. Antrean, detail, dan laporan wajib disebut **simulasi manual**, bukan deteksi AI. POV selalu sintetis, termasuk saat evidence kamera darat berasal dari AI nyata.

## Pause, abort, dan replay

- Pause/resume di Operator mengendalikan waktu simulasi dan playback. POV tidak memajukan misi sendiri.
- Abort di panel operator membuat drone airborne kembali ke base sebelum resource dilepas.
- Replay mereset data demo dan memutar skenario dari awal. Ekspor laporan sebelum reset.
- Backend restart dengan misi airborne menjeda simulasi; lanjutkan lewat Operator.
- Semua tab memulihkan state melalui REST setelah WebSocket reconnect.

## Pemeriksaan tanpa suara

```powershell
python scripts/check_map_assets.py
docker compose run --rm --no-deps -v "${PWD}:/workspace" backend python /workspace/scripts/smoke_test.py --ai --automatic --output /data/smoke-test-auto-ai.json
```

Smoke test mereset data demo dan melakukan persetujuan operator melalui API untuk QA. Ia menunggu inference nyata, menjalankan reconnaissance otomatis, memeriksa pembaruan lokasi simulasi, dan membuktikan misi selesai meskipun tugas regu belum diterima. Tidak membuka audio browser atau membunyikan alarm. Setelah QA, reset untuk memulai presentasi dengan antrean kosong.
