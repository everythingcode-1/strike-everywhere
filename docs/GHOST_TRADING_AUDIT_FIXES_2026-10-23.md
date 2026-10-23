# Strike Everywhere — Audit dan Instruksi Perbaikan

**Tanggal:** 23 Oktober 2026, WIB.  
**Tujuan owner:** uji implementasi agent yang sudah selesai; tulis perbaikan dalam dokumen untuk coding agent berikutnya.  
**Mode pekerjaan:** read-only pada kode produk. Hanya dokumentasi, bukti pengujian dan probe audit yang ditambahkan. Build meregenerasi `dist/`; tidak ada patch source aplikasi/dependency dalam audit ini.

## 1. Kesimpulan

Alur dasar manual Ghost Trade sudah berjalan di build ekstensi sebenarnya: review entry → create → virtual close → export receipt → reload mempertahankan entry. Namun, jangan menandai keseluruhan upgrade selesai penuh sebelum perbaikan dan verification gates di bawah ditangani.

**Temuan terverifikasi: satu P1, lima P2 pada produk, dan satu P2 pada alat verifikasi.** P1 memengaruhi angka net yang dilihat pengguna sebelum membuat posisi. Tidak ditemukan bukti transaksi nyata atau kebocoran key pada alur yang diuji; pernyataan tersebut bukan sertifikasi keamanan menyeluruh.

| ID | Prioritas | Temuan | Status |
|---|---|---|---|
| A01 | P1 | Net preview mengabaikan selisih entry terhadap mark | Direproduksi dengan service asli dan market sintetis |
| A02 | P2 | Label freshness tidak bertambah tua selama view terbuka | Direproduksi pada build ekstensi dengan page clock |
| A03 | P2 | Direct virtual close menghilangkan monitoring gap | Direproduksi dengan service asli dan waktu terkontrol |
| A04 | P2 | Capture lama yang lambat menimpa pilihan terbaru | Direproduksi dengan completion order terbalik |
| A05 | P2 | Klaim baru tidak diperlihatkan ketika panel berada di view lain | Direproduksi lewat runtime event pada build ekstensi |
| A06 | P2 | Virtual exit mengabaikan maximum quantity pada rules | Direproduksi dengan pure execution engine |
| A07 | P2 | Skrip regresi browser lama gagal setelah navigasi baru | Command exit 1 pada Markets yang tersembunyi |

P1 = perbaiki sebelum pengguna mengandalkan hasil simulasi. P2 = perbaikan penting untuk ketepatan bukti, alur dan kualitas release; bukan bukti kehilangan dana nyata karena ekstensi tidak menempatkan order.

Dua acceptance gates tetap belum terverifikasi: request Jev authenticated dengan key owner, dan klik kanan native end-to-end. Keduanya dicatat terpisah dari bug; mocks/seeded claim tidak membuktikan integrasi tersebut.

## 2. Baseline dan bukti uji baru

Semua command dijalankan ulang dari workspace, bukan hanya membaca laporan implementer.

| Pemeriksaan | Hasil audit |
|---|---|
| `npm run typecheck` | Exit 0 |
| `npm run test` | Exit 0; 121 tes pada 16 file |
| `npm run build` | Exit 0; 45 modules |
| `scripts/verify-ghost.mjs` | Exit 0; create/close/export/reload, duplicate create dan concurrent refresh/close |
| `scripts/verify-unpacked.mjs` | Exit 0; public mainnet, registry 33 simbol, BTC/TSLA quote, watchlist, BTC replay 43.200 candle, diagnostics kosong |
| `scripts/verify-browser.mjs` | **Exit 1**, timeout menunggu Markets heading yang masih hidden; lihat A07 |
| Probe service/execution tambahan | 4/4 lulus **untuk membuktikan bug saat ini**, bukan menunjukkan bug sudah diperbaiki |
| Probe UI build ekstensi | Capture tetap di Settings; freshness label tidak menua setelah page clock +16 detik |
| `npm audit --omit=dev --json` | Exit 0; 0 production vulnerability yang dilaporkan registry pada saat audit |

Evidence:

- [Typecheck](verification/audit-2026-10-23-typecheck.txt), [tests](verification/audit-2026-10-23-tests.txt), [build](verification/audit-2026-10-23-build.txt).
- [Ghost live run](verification/audit-2026-10-23-ghost-checks.json), [unpacked live run](verification/audit-2026-10-23-unpacked-checks.json).
- [Browser regression failure](verification/audit-2026-10-23-browser.txt).
- [Focused probe output](verification/audit-2026-10-23-probes.txt), [production dependency audit](verification/audit-2026-10-23-dependencies.json).
- [Source SHA-256 fingerprints](verification/audit-2026-10-23-source-fingerprints.json). Workspace tidak memiliki `.git`; hash file mencatat versi yang diperiksa tanpa mengarang commit.

Production dependency audit tidak memeriksa seluruh dev dependency dan tidak menjamin tidak ada vulnerability yang belum diumumkan. Audit ini tidak melakukan upgrade atau `npm audit fix --force`.

## 3. A01 — [P1] Net preview tidak konsisten dengan posisi yang baru dibuat

**Lokasi:** `src/ghost/service.ts:246` dan `:260`; tampil di `src/popup/ghost-ui.ts:369` sebagai “Net at entry (before funding)”.

Preview menetapkan gross awal menjadi nol dan hanya mengurangi dua fee. Posisi yang baru dibuat justru dinilai memakai mark, yang dapat berbeda dari VWAP entry. Estimated exit fee preview juga memakai entry notional, sedangkan ringkasan posisi memakai mark notional. Akibatnya dua layar memberikan angka net berbeda pada market/time yang identik.

Reproduksi sintetis yang memakai implementasi service dan accounting asli:

```text
Side: Long
Mark: 100
Best bid: 95
Best ask / entry VWAP: 105
Requested notional: 105
Quantity: 1
Leverage: 5
Fee rate: 0.0005 per side

Preview netAtEntry: -0.105
Immediate created-position gross: -5
Immediate created-position net excluding unknown funding: -5.1025
```

Perhitungan mark-based yang konsisten:

```text
Gross = 1 × (100 − 105) = -5
Entry fee = 105 × 0.0005 = 0.0525
Estimated close fee at mark = 100 × 0.0005 = 0.05
Estimated net excluding unknown funding = -5.1025
```

Jika yang ingin ditampilkan adalah executable immediate-close result, gunakan bid 95 untuk long dan nyatakan modelnya; hasilnya -10.1. Jangan mencampur mark-based dan executable-close basis. Quote impact terhadap best ask boleh nol pada contoh ini; itu tidak berarti entry tidak memiliki mark-to-entry loss.

**Perbaikan:** gunakan helper accounting yang sama untuk preview dan open-position summary, dengan source/basis yang jelas. Alternatif minimal: ubah label angka fees-only menjadi total estimated fees, lalu tampilkan mark-based estimated net sebagai field terpisah. Jangan memperbaiki angka dengan mengurangkan slippage dua kali.

**Tes wajib:** long/short, mark berbeda dari entry, multi-level impact, mark sama dengan entry, dan preview vs immediate summary pada snapshot identik. Assert target -5.1025 untuk basis mark pada contoh di atas. Tetap pertahankan funding `null`/unknown.

**Bukti:** [preview-mismatch.json](verification/audit-2026-10-23-preview-mismatch.json), probe `verification/audit-probes/finance.test.ts`.

## 4. A02 — [P2] Freshness label tetap fresh setelah data kedaluwarsa

**Lokasi:** `src/popup/ghost-ui.ts:448–473`, khususnya “Mark freshness” pada `:468`.

Label dihitung hanya saat `renderTradeDetail()` dipanggil. Tidak ada mekanisme yang memperbarui umur ketika view tetap terbuka. Pemeriksaan juga memakai `observedAt` lokal, bukan `sourceTime`, sehingga data sumber yang sudah beberapa detik tua bisa dilabeli lebih segar daripada sebenarnya.

**Reproduksi pada production build:** buat Ghost Trade BTC dengan public mainnet di clean profile; lihat detail open, lalu majukan **page clock** 16.000 ms tanpa refresh.

```text
Before: Within 15 seconds
After:  Within 15 seconds
```

Backend masih memeriksa source freshness saat entry/close; temuan ini tidak berarti stale book otomatis diterima. Masalahnya adalah informasi freshness yang keliru pada UI pengguna.

**Perbaikan:** render umur dari source timestamp; gunakan receive/observed time hanya jika jelas dilabeli sebagai fallback. Update label secara lokal melalui timer selama detail aktif atau ketika visibility kembali, tanpa melakukan polling API lebih cepat. Cleanup timer saat pindah view/unmount. Jangan mengganti source timestamp dengan waktu kini.

**Tes wajib:** page clock +16 detik mengubah label menjadi stale tanpa reload; source time lebih tua dari receive time; missing source time; closed record tetap labelled closed; timer tidak memicu fetch berulang.

**Bukti:** [freshness.json](verification/audit-2026-10-23-freshness.json), [screenshot](verification/audit-2026-10-23-freshness.png).

## 5. A03 — [P2] Direct close tidak merekam jeda pemantauan

**Lokasi:** gap construction hanya di `src/ghost/service.ts:469–490`; `closeTrade()` pada `:548–628` langsung menambahkan close events, khususnya `:625`.

Create → tidak ada observasi 24 jam → close langsung menghasilkan receipt:

```text
dataQuality.gaps = 0
events = created, close_requested, closed_virtual
```

Setelah closed, `refreshTrade()` pada `:461` langsung mengembalikan record, sehingga gap tidak bisa dipulihkan oleh refresh berikutnya. Event timestamps memang menunjukkan interval, tetapi counter/quality receipt tetap melaporkan nol monitoring gaps walaupun threshold 10 menit terlewati.

**Perbaikan:** ekstrak helper gap-event yang dipakai refresh dan close. Sebelum menyimpan close, periksa last observed time dan tambahkan gap atomik bersama close events. Dedup berdasarkan batas interval; jangan menciptakan fill/funding/liquidation selama gap. Pertahankan entry snapshot dan close idempotency.

**Tes wajib:** direct close sesudah 24 jam mencatat satu gap; close sebelum threshold tidak; repeated close tidak menduplikasi; refresh lalu close tidak membuat gap identik dua kali. Receipt harus mempertahankan uncertainty tersebut setelah reload.

**Bukti:** `verification/audit-probes/security.test.ts`, [probe output](verification/audit-2026-10-23-probes.txt).

## 6. A04 — [P2] Capture lama menimpa klaim terbaru

**Lokasi:** `src/ghost/service.ts:122–154`, terutama `await loadRegistry()` sebelum ID/time/save; `src/ghost/store.ts:49–54` menulis pending tanpa membandingkan urutan capture.

Reproduksi controlled async completion:

```text
Pengguna memulai capture FIRST, lalu SECOND.
Registry SECOND selesai lebih dahulu → pending = SECOND.
Registry FIRST selesai belakangan → pending = FIRST.
```

Akibatnya panel atau boot berikutnya dapat menampilkan klaim lama, dan timestamp capture mengikuti completion alih-alih tindakan pengguna. Broadcast dapat membawa urutan salah yang sama.

**Perbaikan:** tetapkan capture ID/time/ordering token saat handler menerima gesture, sebelum await. Simpan setiap claim bila diinginkan, tetapi pending pointer dan broadcast latest hanya boleh berpindah ke capture terbaru. Gunakan token/sequence yang aman untuk dua gesture dalam milidetik sama; jangan hanya membandingkan completion time. Catat kebijakan ketika worker restart.

**Tes wajib:** completion SECOND→FIRST tetap meninggalkan SECOND sebagai pending; FIRST tetap tersimpan tanpa mengganti latest; failure capture lama tidak menimpa status capture baru; capture pada ms yang sama.

**Bukti:** `verification/audit-probes/security.test.ts`, [probe output](verification/audit-2026-10-23-probes.txt).

## 7. A05 — [P2] Klaim baru tersembunyi ketika panel sudah berada di Settings/Markets

**Lokasi:** `src/popup/ghost-ui.ts:299–309` dan runtime handler `:891–900`.

Ketika `claim:captured` tiba, handler memperbarui claim dan banner, tetapi tidak membuka Discover. Jika panel sudah di Settings, parent `#view-discover` tetap hidden. Pengguna baru saja memilih action Analyze, tetapi tidak langsung melihat teks/asset yang akan dianalisis.

Reproduksi pada build ekstensi menggunakan **runtime event sintetis**, bukan klaim bahwa native context-menu telah diuji:

```text
Open Settings → background broadcasts claim:captured
activeTab = settings
discoverHidden = true
claimRendered = true
```

**Perbaikan:** setelah menerima capture terbaru, buka Discover dan arahkan focus ke heading/claim secara terukur. Bila sengaja mempertahankan view pengguna, sediakan action “View selected claim” yang langsung terlihat dan dapat diakses keyboard, bukan banner instruksi tanpa navigasi. Pastikan capture error juga terlihat saat Discover hidden.

**Tes wajib:** capture ketika panel closed, ketika sudah di Discover, serta ketika di Markets/Ghost Trades/Receipts/Settings. User-selected claim harus bisa segera ditemukan. Pertahankan focus management dan no duplicate panel.

**Bukti:** [capture-settings.json](verification/audit-2026-10-23-capture-settings.json), [screenshot](verification/audit-2026-10-23-capture-settings.png).

## 8. A06 — [P2] Exit tidak memakai maximum quantity rules

**Lokasi:** `src/ghost/execution.ts:156–180`, parameter `_limits` pada `:160` tidak digunakan.

```text
Market maximum quantity = 1
Position quantity = 2
Available depth = 100
executeExit(...) returns filled quantity = 2
```

Melewati minimum entry pada virtual close dapat dibenarkan untuk menutup posisi kecil; maximum per-order merupakan aturan berbeda. Current entry biasanya membatasi quantity, tetapi rules dapat berubah saat posisi sudah terbuka. Dokumen implementer sebelumnya bahkan menyebut max masih berlaku, padahal implementasi saat audit mengabaikannya.

**Perbaikan:** tetapkan exit execution policy secara eksplisit. Terapkan maximum untuk single virtual market order, atau pecah menjadi modeled child orders dengan batas quantity dan evidence/costs per child yang jelas. Jangan menutup record secara diam-diam memakai fill yang melampaui policy/rules. Jangan membuat posisi kecil tidak bisa ditutup dengan menerapkan minimum entry kembali.

**Tes wajib:** close di bawah minimum entry tetap boleh; close di atas maximum memakai split policy yang benar atau menghasilkan unsupported/error yang jelas; rules berubah setelah entry; total quantity/notional/fees semua child konsisten.

**Bukti:** [exit-limit.json](verification/audit-2026-10-23-exit-limit.json), `verification/audit-probes/finance.test.ts`.

## 9. A07 — [P2, test harness] Regresi browser lama tidak mengikuti navigasi baru

**Lokasi:** `scripts/verify-browser.mjs:199–218`, kegagalan pertama pada `:200`.

Skrip menuju panel lalu langsung menunggu visible heading “Market discovery”. View default sekarang Discover; Markets hidden sampai tabnya dipilih. Command timeout dan exit 1. Langkah Detection settings di bagian sesudahnya juga harus diarahkan ke Settings, bukan diasumsikan selalu terlihat.

Ini bug harness, **bukan bukti market discovery rusak**: public mainnet flow di skrip unpacked tetap lulus. Namun current regression suite tidak boleh diklaim seluruhnya hijau.

**Perbaikan:** update mocks agar mencakup protokol GhostResult yang kini dipakai boot panel; pindah melalui tab Markets dan Settings sesuai UI. Pertahankan assertion card tiga layout, keyboard, closed shadow, no layout shift, view switching dan settings persistence. Jangan menghapus assertion atau membuat timeout diabaikan hanya agar command exit 0.

**Tes wajib:** jalankan skrip lengkap sampai exit 0 dan report baru berisi semua check, bukan hanya bagian sebelum popup. Pastikan fixture synthetic diberi label, bukan diganti market values agar dianggap live integration.

**Bukti:** [browser.txt](verification/audit-2026-10-23-browser.txt).

## 10. Coverage gaps dan kandidat lanjutan, belum dipromosikan menjadi bug terverifikasi

1. **Live Jev:** tidak ada key owner pada audit. Tes yang tersedia dan fallback missing-key lulus, tetapi authenticated request dari MV3, permission denial/revocation, 401/403/429, timeout dan provider schema aktual belum diuji end-to-end. Jangan meminta key ditempel di chat; gunakan session-key UI pada profil test owner dan catat hanya metadata sanitized.
2. **Native context menu:** automated Ghost script memakai seeded claim; UI probe audit memakai event sintetis. Lakukan satu klik kanan nyata, panel closed dan already open. Jangan menulis `realRightClickVerified: true` dari seeded event.
3. **Iframe attribution:** handler memakai `info.pageUrl ?? tab.url` dan tidak memprioritaskan `info.frameUrl`. Periksa capture dari iframe lintas domain agar receipt tidak salah mengatribusikan sumber; belum ada probe terfokus pada audit ini.
4. **Pending boot vs newer event:** boot `claim:get-pending` yang masih in-flight dapat bersaing dengan `claim:captured` yang baru; `if (pending) showClaim(pending)` pada `ghost-ui.ts:945` belum memiliki freshness token. Tambah controlled async test sebelum menetapkan fix; jangan menganggap A04 otomatis menyelesaikan race UI ini.
5. **Out-of-order detail requests:** review penerimaan respons ketika pengguna berpindah trade/receipt sebelum request sebelumnya selesai. Belum ada bukti terfokus untuk severity finding.
6. **Actual browser/worker restart:** browser suite melakukan panel reload, bukan seluruh browser session restart atau penghentian worker saat write. Ini belum membuktikan semua recovery path/migration/atomicity.
7. **Funding/liquidation:** unknown funding dan unavailable liquidation memang batas model yang dinyatakan, bukan angka yang boleh diisi palsu. Jangan memperbaikinya dengan memakai current funding sebagai observed history atau formula cross lama sebagai isolated liquidation.
8. **TSLA OHLC:** replay tetap menolak invalid candle range. Ini masalah data yang sudah diketahui; jangan mengubah validator agar demo selalu menghasilkan verdict.

## 11. Instruksi eksekusi untuk coding agent

Pekerjaan berikut adalah **patch terfokus**, bukan rewrite atau perluasan fitur. Baca `AGENTS.md`, `docs/GHOST_TRADING_IMPLEMENTATION_HANDOFF.md` dan source aktual sebelum mengedit. Utamakan pengecualian yang sudah diotorisasi owner; jangan mengubah HUMAN ONLY atau menambah dependency/host untuk menyelesaikan temuan ini.

Urutan yang disarankan:

1. A01: satukan basis angka preview/detail; tulis regression test yang gagal sebelum fix.
2. A03: helper gap refresh/close dan evidence atomik; tes idempotency.
3. A04: ordering capture service/store serta investigate boot race pada bagian 10.
4. A02 dan A05: UI freshness timer/source time, navigation/focus capture; controlled browser tests.
5. A06: documented exit policy dan tes limits tanpa memblokir small closes.
6. A07: sinkronkan harness dengan navigasi baru dan jalankan semua flows lama.
7. Jalankan review ulang, actual worker/browser restart, serta gates native right-click/Jev yang tersedia.

Untuk setiap temuan:

- Catat perubahan file dan basis keputusan.
- Ubah reproduksi bug menjadi tes expected behavior yang awalnya gagal.
- Implementasikan patch terkecil, lalu pastikan tes hijau.
- Simpan output/screenshot baru dengan label synthetic/live yang benar.
- Jangan menghapus unknowns, fee assumptions, source timestamps atau disclaimer.

Probe audit dapat dijalankan sekarang:

```powershell
npx vitest run --config docs/verification/audit-probes/vitest.config.ts
node docs/verification/audit-probes/browser.mjs
```

**Penting:** empat assertion probe sengaja mengonfirmasi perilaku salah yang ditemukan. “4 passed” saat ini berarti reproduksi sukses. Setelah fix, assertions tersebut harus diganti atau dipindahkan menjadi regression tests dengan expected behavior benar di `tests/`; jangan mempertahankan bug agar probe tetap hijau.

Browser probe memakai installed Playwright/Chromium path pada mesin owner dan workspace root sebagai working directory. Ia membuat profil test sendiri, synthetic claim event dan satu mainnet-data virtual trade, bukan order nyata. Sesudah patch A02/A05, update expected assertions yang sekarang mendokumentasikan kegagalan. Jangan menjalankan probe terhadap profil trading pengguna.

## 12. Definition of done untuk patch audit

- [ ] A01 net preview dan immediate summary memakai basis yang sama, dengan angka regresi di bagian 3.
- [ ] A02 freshness menua tanpa reload/fetch agresif, source time diprioritaskan.
- [ ] A03 direct close menyimpan monitoring gap yang benar tanpa double events.
- [ ] A04 latest capture tidak dapat ditimpa capture lama yang selesai lambat.
- [ ] A05 new claim langsung terlihat/dapat dibuka dengan action yang jelas dari semua view.
- [ ] A06 exit mematuhi policy quantity yang dinyatakan dan small close tetap bekerja.
- [ ] A07 controlled browser regression script lengkap exit 0.
- [ ] `npm run typecheck`, `npm run test`, `npm run build` exit 0.
- [ ] `verify-ghost.mjs` dan `verify-unpacked.mjs` lulus dengan output baru.
- [ ] Permission/key errors, claim privacy dan sender boundaries tidak regress.
- [ ] Live Jev/native click/browser restart diberi status benar: verified atau blocker spesifik, bukan klaim umum.
- [ ] `docs/verification/ghost-trading.md` diperbarui; jangan mempertahankan klaim “all checks passed” yang tidak lagi sesuai.

## 13. Prompt siap salin

> Baca `docs/GHOST_TRADING_AUDIT_FIXES_2026-10-23.md` dan bukti yang dirujuk. Perbaiki A01–A07 secara terfokus, gunakan regression tests sebelum patch, dan pertahankan UI/logo serta fitur yang sudah bekerja. Jangan rewrite arsitektur, menambah real orders/wallet/backend, menghapus validation atau mengisi unknown funding/liquidation dengan angka palsu. Audit probes saat ini sengaja membuktikan bug; ubah expected behavior setelah fix. Jalankan typecheck, tests, build dan semua browser checks sampai hasil aktual diketahui. Investigasi coverage gaps tanpa menyatakannya bug terverifikasi sebelum reproduksi. Update laporan di `docs/verification/ghost-trading.md` dengan evidence dan status live Jev/native context menu yang jujur. Kerjakan mandiri tanpa pertanyaan desain rutin; eskalasi hanya blocker izin/credential yang memang belum tersedia.
