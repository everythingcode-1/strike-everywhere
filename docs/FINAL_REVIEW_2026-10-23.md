# Final review — extension dan landing page

Tanggal: 23 Oktober 2026. Audit source, build, browser Chromium lokal; tidak menguji situs deployment publik karena URL deployment tidak tersedia. Kode produk tidak diubah. Build, screenshot, laporan verifikasi, dan probe audit lokal diperbarui/dibuat.

## Keputusan

Perbaikan audit A01–A07 sudah terlihat diterapkan dan alur utama ekstensi lulus pengujian browser. Landing page memiliki identitas visual yang konsisten, screenshot produk nyata, batasan simulasi yang jelas, dan layout desktop/mobile yang rapi. Belum siap disebut selesai untuk pengunjung publik: jalur memperoleh extension belum lengkap. Ada beberapa perbaikan terarah di bawah; tidak perlu mendesain ulang halaman.

## Verifikasi yang dijalankan

| Area | Perintah / pemeriksaan | Hasil |
|---|---|---|
| Extension | `npm run typecheck` | Exit 0 |
| Extension | `npm run test` | 20 test files passed; 135 tests passed |
| Extension | `npm run build` | Exit 0; 46 modules transformed |
| Extension | `node scripts/verify-browser.mjs <playwright> <chromium>` | Exit 0; tiga fixture, highlight, closed shadow, keyboard, simulator, gear Settings/Receipts, error kosong, viewport 320px; uncaught errors kosong |
| Ghost | `node scripts/verify-ghost.mjs <playwright> <chromium>` | Exit 0; quote BTC mainnet, preview, create, close, export, reload, freshness, claim navigation, duplicate/concurrent checks |
| Landing | `npm run typecheck`, `npm run lint`, `npm run build` di `landing/` | Semua exit 0; static export berhasil |
| Landing | `node scripts/verify-landing.mjs` di `landing/` | Desktop 1440px, mobile 390px, narrow 320px: overflow 0, gambar rusak 0, anchor hilang 0, console/page errors 0; menu, FAQ, salin perintah berjalan |
| Landing | `node scripts/axe-check.mjs` di `landing/` | Ketiga viewport: 0 violations; `color-contrast` masih incomplete, bukan bukti semua kontras lulus |
| Landing | `node .superpowers/final-landing-review.mjs` | Assertions laporan lulus; request awal hanya localhost; indikator fokus FAQ 1,1706:1 |

Path browser: `C:/Users/HP/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe`.
Path Playwright: `C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`.
Server uji static export: Python HTTP server pada port 4000, document root `landing/out`.

## Temuan untuk agent coding

### F01 — P1: Install tidak menyediakan source atau paket

Lokasi: `landing/src/app/page.tsx:497`, `:518`; `landing/src/lib/site.ts:58`.
Tombol Install hanya menuju instruksi `npm install && npm run build`. Pengunjung baru belum mempunyai source, URL repo, tombol download, atau langkah clone/cd. Inspeksi seluruh anchor menghasilkan hanya dua tautan HTTP eksternal: shadcn/ui dan Cult UI. Ini menghambat pengunjung/juri mencoba produk.

Perbaikan: gunakan URL repo/release milik owner yang benar; sediakan tautan source dan urutan clone → cd → install/build → Load unpacked `dist/`. Jika ZIP siap pakai tersedia, berikan pilihan download yang jelas. Jangan mengarang URL repo atau tautan Chrome Web Store.
Acceptance: dari browser/profil baru tanpa checkout proyek, pengguna dapat memperoleh source/paket melalui landing page dan mencapai langkah Load unpacked. Uji tautan aktual dan command dari folder bersih.

### F02 — P2: Domain publik masih placeholder dalam build

Lokasi: `landing/src/lib/site.ts:4`.
Canonical yang diuji adalah `https://strike-everywhere.example/`; sitemap, robots, serta metadata berbagi berasal dari konfigurasi yang sama. README sudah menjelaskan environment variable, tetapi build yang diuji belum dikonfigurasi untuk domain publik.

Perbaikan: atur `NEXT_PUBLIC_SITE_URL` ke domain deployment sebenarnya saat build production. Tambahkan pemeriksaan release yang menolak domain `.example` agar tidak lolos deploy tanpa sengaja; jangan menghalangi preview lokal yang memang disengaja.
Acceptance: periksa HTML hasil build, sitemap, robots, OG/JSON-LD dan live URL; semuanya menggunakan domain sebenarnya. Audit ini tidak menyatakan deployment yang belum diperiksa pasti salah.

### F03 — P2: Respons detail lama bisa mengganti pilihan terbaru

Lokasi: `src/popup/ghost-ui.ts:706`, `:857`; audit juga jalur refresh/close `:614`, `:642`.
Reviewer mengeksekusi fungsi source yang tidak diubah menggunakan transport terkontrol: pilih FIRST lalu SECOND, selesaikan respons SECOND lalu FIRST. Urutan render berakhir `trade:SECOND → trade:FIRST` dan `receipt:SECOND → receipt:FIRST`. Pengguna akhirnya melihat record yang bukan pilihan terakhirnya. Ini berbeda dari A04 yang sudah menangani urutan capture.

Perbaikan: gunakan token request/selection dan identitas tab/detail aktif sebelum render hasil async. Terapkan perlindungan setara pada refresh/close; hasil mutasi tetap boleh tersimpan, tetapi jangan memaksa tampilan kembali ke detail yang telah ditinggalkan.
Acceptance: regression test dengan deferred promises pada urutan di atas; terakhir tetap SECOND. Uji pindah tab ketika request tertunda. Bukti saat audit berupa eksekusi fungsi source dengan mock transport, bukan gesture browser nyata.

### F04 — P2: Klaim dari iframe tercatat sebagai halaman induk

Lokasi: `src/background/index.ts:522`.
Eksekusi listener aktual dengan `pageUrl=https://outer.example/article`, `frameUrl=https://author.example/claim`, `frameId=2` menghasilkan source URL induk pada capture. Receipt kehilangan atribusi frame tempat teks dipilih.

Perbaikan: pilih `info.frameUrl ?? info.pageUrl ?? tab?.url`, dengan validasi URL dan batas privasi yang sama. Pastikan judul induk tidak diklaim sebagai judul frame bila belum diketahui.
Acceptance: uji unit listener dengan iframe dan top-level, lalu gesture klik kanan nyata pada fixture iframe. Bagian gesture nyata belum diverifikasi dalam audit ini.

### F05 — P2: Fokus keyboard terlalu samar pada FAQ terang

Lokasi: `landing/src/app/globals.css:89`.
Computed style summary FAQ: outline `rgb(54,245,174)` solid 2px pada section `rgb(239,233,220)`. Rasio luminans WCAG terhitung **1,1706:1**, di bawah target indikator fokus 3:1. Axe tidak menyelesaikan seluruh pemeriksaan kontras; hasil nol violations tidak meniadakan temuan ini.

Perbaikan: override warna ring pada `.paper-section` menjadi warna gelap yang lulus 3:1. Periksa link/tombol lain pada section terang tanpa merusak fokus di latar gelap.
Acceptance: Tab/Shift+Tab menampilkan fokus yang jelas; hitung rasio dari computed colors pada kedua tema section.

### F06 — P2: Dua klaim privasi terlalu absolut

Lokasi: `landing/src/app/page.tsx:149`, `:469`.
“Nothing is sent to an exchange” dapat dibaca sebagai tidak ada request keluar, padahal public GET menuju Strike dilakukan. “Never read … page text beyond the ticker match” bertentangan dengan alur claim pilihan pengguna yang dijelaskan di bagian Jev pada halaman yang sama.

Perbaikan: gunakan kalimat spesifik seperti “No orders are sent. No wallet is connected.” Bedakan deteksi pasif ticker dengan teks yang secara eksplisit dipilih pengguna untuk Ghost/Jev. Pertahankan disclosure Jev bahwa claim dan market names dikirim setelah persetujuan.
Acceptance: semua klaim Network/Privacy konsisten dengan perilaku aktual, termasuk optional permissions; tidak ada janji bahwa seluruh data selalu tinggal di browser ketika Jev aktif.

## Penilaian visual dan narasi

- Desktop: hierarki hero, logo mint, contoh artikel dan kartu produk sudah koheren. Ini cukup profesional untuk demo; tidak memerlukan perubahan layout besar.
- Mobile 390px dan 320px: tidak ada horizontal overflow; menu, CTA, dan FAQ bekerja. Hero memprioritaskan teks, sementara contoh produk baru muncul setelah statistik; opsional, pendekkan hero agar demonstrasi produk lebih cepat terlihat.
- Narasi risiko sudah jujur: bukan ramalan, funding tidak direkonstruksi, dan screenshot simulator berlabel synthetic demo responses. Pertahankan batasan ini.
- Opsional setelah F01–F06: kurangi istilah implementasi seperti “line box”/“closed Shadow DOM” pada manfaat utama untuk trader; taruh detail tersebut di dokumentasi teknis. Jangan menambah klaim win rate atau akurasi AI tanpa bukti.

## Batas verifikasi

Authenticated Jev live call belum dijalankan; native context-menu gesture belum diuji; tiga real-position ground-truth M3 belum tersedia dan izin sebelumnya hanya membolehkan UI dengan label experimental. Pengujian mainnet di sini hanya membaca market data; create/close yang diuji adalah ledger virtual. Tidak menguji situs publik, instalasi dari Chrome Web Store, seluruh variasi halaman internet, atau semua kegagalan jaringan. Tidak ada `.git` metadata untuk membandingkan commit.

## Bukti lokal

- `docs/verification/browser-checks.json`, `docs/verification/ghost-checks.json`
- `landing/docs/screenshots/verify.json`, `axe.json`, `final-review.json`
- `landing/docs/screenshots/desktop-viewport.png`, `mobile-viewport.png`, `narrow-viewport.png`
- `landing/docs/screenshots/final-install.png`, `final-faq-focus.png`

Urutan penyelesaian: F01 → konfigurasi F02 sebelum deploy → F03/F04 → F05/F06 → ulangi build, tests, browser dan audit URL deployment. Tidak perlu dependency baru untuk perbaikan ini.
