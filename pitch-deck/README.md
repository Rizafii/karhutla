# Pitch deck KARHUTLA.AI

Website mandiri berbahasa Indonesia dengan 12 slide 16:9 untuk pengumpulan karya hackathon. Buka `index.html` langsung di Chrome atau Edge; tidak memerlukan server, Docker, instalasi, maupun internet. Pertahankan folder `assets` di samping HTML saat memindahkan atau membagikan deck.

## Navigasi dan PDF

- Gunakan tombol sebelumnya/berikutnya, tombol panah kiri/kanan, Page Up/Page Down, atau Home/End. Semua slide juga dapat digulir.
- Klik **Cetak / Simpan PDF**, atau tekan **Ctrl+P**.
- Pilih **Simpan sebagai PDF**, skala **100%**, margin **Tidak ada**, aktifkan **Grafik latar belakang**, dan matikan **Header dan footer** browser.
- CSS menetapkan halaman **320 × 180 mm** (16:9); pilih ukuran dari halaman bila browser menyediakan opsi tersebut. Pastikan preview berisi **12 halaman**, satu slide per halaman. Jangan memilih A4 bila ingin mempertahankan 16:9.
- Isi dan layout tetap tersedia tanpa JavaScript; navigasi toolbar hanya muncul saat JavaScript aktif. Tampilan ponsel mempertahankan rasio slide; putar perangkat ke landscape atau zoom untuk membaca detail.
- `KARHUTLA-AI-pitch-deck.pdf`, bila tersedia, adalah hasil ekspor Chromium dari HTML ini.

## Materi dan batas klaim

Materi didasarkan pada `README.md`, `ARCHITECTURE.md`, `DEMO_GUIDE.md`, dan `TEST_RESULTS.md` di akar proyek. Angka tes adalah hasil QA terdokumentasi pada tanggal yang tercantum, bukan suite yang dijalankan ulang saat membuat deck. Deck tidak mengklaim akurasi AI, pengguna aktif, mitra, penghematan, atau dampak lingkungan terukur.

Inference smoke/fire berjalan pada frame video nyata. Kamera demo memakai replay footage. Penerbangan, baterai, payload, pemindaian lokasi, dan gerakan regu merupakan simulasi. Screenshot POV berasal dari QA UI dengan fixture misi; bukan bukti operasi drone fisik. Peta adalah cuplikan build sebelumnya dengan tiga kamera; MVP CCTV saat ini menampilkan empat kamera. Aplikasi utama memerlukan internet untuk basemap, sedangkan deck memakai gambar lokal.

Identitas hanya KARHUTLA.AI dan label generik Sustainability Hackathon. Belum mencantumkan nama acara resmi, tim, anggota, maupun tautan demo.

## Asal aset

| Aset deck | Asal lokal | Penggunaan |
| --- | --- | --- |
| `assets/cctv.png` | `data/cctv-layout-1920.png` | Screenshot CCTV empat kamera |
| `assets/map.png` | `data/pitch-map-crop.png` | Cuplikan peta demonstrasi; atribusi dipertahankan |
| `assets/drone.png` | `data/drone-footage.png` | Screenshot POV pemindaian virtual |
| `assets/payload.png` | `data/helicopter-payload.png` | Screenshot replay helikopter pada tahap payload virtual |

Screenshot disalin tanpa mengubah isi. Tidak ada gambar AI atau mockup yang diklaim sebagai screenshot produk. Diagram alur dan arsitektur adalah HTML/CSS; panel persetujuan diberi label ilustrasi.

Footage dalam screenshot mengikuti manifest `assets/footage-sources.json` pada akar proyek:

- [Hutan — 8K / Pexels](https://www.pexels.com/video/3859447/)
- [Kebakaran — 8K / Pexels](https://www.pexels.com/video/33643167/)
- [Hutan timur — James Cheney / Pexels](https://www.pexels.com/video/4124178/)
- [Hutan selatan — Florian Hillmann / Pexels](https://www.pexels.com/video/12744994/)
- [Helikopter melepas air — 8K / Pexels](https://www.pexels.com/video/29703477/)
- [Pexels License](https://www.pexels.com/license/)
- [Peta © OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

Footage referensi bukan rekaman di koordinat demonstrasi Kalimantan. Tautan atribusi dapat dibuka dengan internet, tetapi tidak dimuat otomatis oleh deck.

## Pemeriksaan deck

Diverifikasi pada 16 Oktober 2026 menggunakan Chromium melalui Playwright lokal:

- Dibuka melalui `file://` dengan jaringan offline; seluruh gambar tersedia, tanpa request HTTP atau error JavaScript.
- Viewport 1440 × 1000, 1920 × 1080, dan 390 × 844: 12 slide, tanpa overflow horizontal, elemen keluar slide, atau konten bertabrakan dengan footer.
- Navigasi tombol, keyboard, batas slide pertama/terakhir, tautan hash, dan pemanggilan cetak berhasil.
- Seluruh slide dapat dibuka dan dicetak saat JavaScript dimatikan.
- PDF hasil ekspor berisi 12 halaman 16:9, dengan teks yang dapat diekstrak/dipilih, nomor halaman sesuai, dan tanpa toolbar.

Artefak QA lokal tersimpan di `data/pitch-qa/` pada akar proyek (diabaikan Git). Pemeriksaan ini hanya untuk deck; suite aplikasi tidak dijalankan ulang.
