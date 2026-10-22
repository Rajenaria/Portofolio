# M10 — Clean Code & File Restructuring

Status: **DONE — LOCAL VERIFIED**.
Owner menyetujui penutupan M10 setelah menerima hasil refactoring dan visual
equivalence. M10-01–M10-07 selesai pada level implementasi dan verifikasi lokal.
Persetujuan ini tidak memulai M11 atau mengotorisasi integrasi/deployment.

## M10-01 — Inventaris sebelum perubahan source

Baseline 2026-10-21: branch `backup/portfolio-m06`, commit `e8eebd1`;
16 tracked modified dan 39 untracked entries. Seluruh 212 file baseline
disalin dan SHA-256 dicatat di luar repository:
`C:\Users\USEPRE~1\AppData\Local\Temp\portfolio-m10-ugd8gyo5`.
Baseline ini mencakup pekerjaan M01–M09 yang belum di-commit.

| Area / entry | Kepemilikan dan dependensi | Keputusan M10 |
| --- | --- | --- |
| `index.html`, `js/initial-loader.js`, `js/script.js` | Critical loader di head; controller, hero, experience, certificates, lalu CMS modules. `portfolioReady`, selector/state dan event timing mengikat lifecycle. | Requires verification; loader, hero dan certificates tetap. |
| `css/style.css` | Token/theme global, komponen homepage, breakpoint dan override berurutan; Project Grid scoped dalam `#portfolio`. | Tetap; tidak memecah stylesheet global atau menggabungkan breakpoint. |
| `js/cms/projects.js` | Controller filter, pagination desktop, native swipe <=650px, reveal observer dan cleanup media. | Organisasi fungsi dalam file yang sama; pertahankan DOM dan urutan event. |
| `js/cms/project-data.js`, `project-cover.js` | Catalog pagination, legacy fallback terkonfirmasi, M04 metadata dan shared crop/media helpers. | Tetap; tidak mengubah kontrak data atau error/fallback. |
| `project.html`, `js/cms/project-detail.js`, `project-case-study.js` | Detail CMS, shared renderer public/admin, TOC, graph, gallery/lightbox dan disposal. | Tetap; tidak mengekstrak modul tanpa kebutuhan. |
| `css/project-detail.css`, `css/project-case-study.css` | Generic detail base, kemudian scoped case-study; case-study juga dimuat sesudah admin.css. | Load order tetap. |
| `projects/*.html` | Dua URL legacy, satu inline style masing-masing, CSS identik byte-for-byte, tanpa `url(...)`. | Safe to consolidate ke satu stylesheet pada posisi style yang sama; verifikasi kedua route. |
| `admin/admin.js`, `admin/js/core/*` | Router, owner/MFA session, forms, dirty guard, modal dan gateway project. | Security-sensitive tetap; tidak mengubah API/authorization. |
| `admin/js/modules/projects/list-view.js` | List server gateway, status actions, Working Draft preview. Helper privat `publishBlockers`/`typedDeleteConfirm` hanya ditemukan pada deklarasinya; tidak diekspor. | Hapus helper/import yang terbukti tidak dipakai; koreksi komentar historis. |
| `case-study-editor.js`, `crop-editor.js`, `case-study-preview.js` | Draft state, CAS, reconciliation, uploads, shared renderer/media. | Tetap; fixture editor/crop menjadi bagian baseline/regresi. |
| `admin/js/modules/technologies.js` | Private form builders berbeda shape (`input`/`select`), spellcheck dan placeholder dari core/form. | DEFER konsolidasi: belum ekuivalen; jangan memaksa migrasi. |
| `supabase/migrations/*`, `supabase/functions/*` | Historical SQL, service-only RPC, owner+AAL2, request budgets, private delivery, snapshots, CAS/idempotency/recovery. | Security-sensitive / leave untouched, byte equality diperiksa pada akhir. |
| `assets/*`, `js/guestbook.js`, `js/cms/cv.js` | Historical URLs, static CV transition, dynamic delivery; responsive picture 650px. | Tetap; tidak menghapus media atau mengubah request contract. |
| `scripts/preview-portfolio.js`, `scripts/fixtures/*`, `scripts/test-*` | Chrome/CDP fail-closed, synthetic backend, local-only regression. | Reuse; tambahkan baseline/comparison test tanpa dependency. |
| `vercel.json`, `.vercelignore`, package manifests | Static deploy tanpa build; scripts/docs/Supabase dikecualikan dari frontend deploy. | Tetap; CSS baru berada dalam folder static existing. |

Selector dinamis (`project-card`, `project-reveal`, `is-revealed`, `pcs-*`,
`m09-*`, `cert-*`, `is-loaded`), animation names, `[hidden]`, focus dan
reduced-motion tidak diganti. Asset yang terlihat tidak terpakai secara statis
tidak dianggap dead: template, CMS, route legacy dan fixture juga konsumen.

## Rencana verifikasi

Simpan screenshot dan computed geometry sebelum perubahan source, memakai
launcher M07 asli dan data sintetis M09. Sesudah cleanup jalankan satu fase
regresi gabungan dan bandingkan viewport/state yang sama. Browser satu per
satu karena resource terbatas. Tidak menginstal dependency.

Status pengujian M10 saat inventaris: **NOT RUN** (catatan sebelum source edit).
Database/Auth/RLS/Storage/PostgreSQL nyata: **NOT RUN**, ditunda ke M11.

## M10-02 sampai M10-06 — Hasil implementasi

- **CSS:** 869 baris deklarasi asli dua route legacy identik dipindah ke
  `css/project-legacy.css`. Kedua link menggantikan style pada posisi yang
  sama; bytes stylesheet sama dengan isi style lama, tanpa URL relatif.
  Stylesheet global, token, breakpoint dan animasi tidak diubah. CSS shared
  case-study juga tetap: cleanup cascade lebih luas tidak memiliki bukti aman.
- **Public JS:** controller Projects tetap satu file dan satu import existing.
  Pembuatan kartu, pemulihan fokus setelah resize, dan reveal observer menjadi
  fungsi internal bernama. Urutan clear/render/focus/observe, DOM, media destroy,
  pagination, filter, error/retry dan readiness mark dipertahankan.
- **Admin:** helper privat `publishBlockers`, `typedDeleteConfirm`, query-column
  constant dan import yang tidak dipakai di daftar project dihapus setelah
  verifikasi semua referensi lokal. Entry tetap `createProjectList`; fungsi
  status/publish, `projectCommand`, preview, readback/error dan destroy tetap.
  Komentar obsolete yang menyarankan delete media diganti dengan kebijakan
  defer/audit referensi. Editor/crop, Technologies dan core form tetap.
- **Backend:** hubungan runtime → authorize `can_manage_projects` → service-only
  SQL RPC → draft/revision/asset registry ditinjau statis. M02 certificate/CV
  private delivery dan request budgets tetap. Tidak ada backend rewrite atau
  temuan baru yang dijadikan alasan melemahkan kontrak. Verifikasi nyata M11.
- **Dokumentasi:** PROJECT/README diperbarui untuk CMS/admin/Edge Functions,
  source/load-order ownership dan preview terisolasi; deskripsi lama “Supabase
  hanya guestbook”, “single stylesheet”, “open file langsung” dikoreksi.
  Dokumen milestone historis tidak dihapus atau ditulis ulang.
- **File move:** tidak ada rename route/module/media. Ekstraksi CSS legacy
  adalah satu-satunya pemisahan file aplikasi, menghapus duplikasi terverifikasi
  tanpa menambah wrapper, dependency atau layer baru.

Baseline visual berhasil **sebelum source edit**: 13 screenshot, probe isolasi,
0 koneksi nyata, tanpa launcher error, temporary profile cleanup PASS.
Satu percobaan awal harness admin gagal karena response MIME OPTIONS kosong;
launcher fail-closed menutup sesi. Harness diperbaiki menggunakan fallback
Content-Type seperti test M09 existing, lalu capture baseline lengkap berhasil.
Pillow tidak tersedia; tidak diinstal. PNG dibandingkan lewat canvas Chrome.

Pemeriksaan sintaks targeted kedua ES Module PASS menggunakan
`Get-Content <file> -Raw | node --input-type=module --check`.
`node --check <file.js>` sendiri memakai mode CommonJS package ini sehingga
menolak import; itu bukan parser yang sesuai untuk modul browser tersebut.

## Batas tetap

Tidak ada migration/config/backend/security edit, akses produksi, cleanup
orphan, commit/push/deploy atau perubahan route/branding. M01–M09 dipertahankan.
Hasil fixture tidak meningkatkan backend menjadi REAL VERIFIED.

## Acceptance dan deferred improvements

- Source delta M10 hanya tujuh file existing: dua dokumentasi, controller
  homepage Projects, daftar project admin, dua HTML legacy, dan test upload M09.
  Lima file baru: CSS legacy, laporan ini, test visual equivalence, test struktur
  dan test auth/router admin. Tidak ada source aplikasi tambahan yang berubah.
- Tidak ada route, selector, asset, migration, Edge Function, dependency,
  configuration atau workflow deployment yang dipindah/diubah.
- Shared CSS mengharuskan `css/project-legacy.css` ikut disajikan bersama HTML
  legacy. Ini menambah satu request stylesheet lokal pada route tersebut;
  pemeriksaan resource/cascade dan fixture tidak membuktikan deployment nyata.
- Perbandingan visual memakai Chrome/OS/font lokal yang sama. Font/icon CDN
  diblokir oleh preview; fidelity font eksternal produksi tidak dibuktikan.
  Freeze animation/transition hanya ada pada harness screenshot. Pengujian
  lifecycle/interaction existing dijalankan terpisah dengan animasi aktif.
- Screenshot viewport tidak mencakup seluruh panjang setiap halaman. Geometri
  subtree detail/editor dan regresi interaksi melengkapi, bukan menggantikan,
  visual review owner untuk seluruh konten aktual.
- Global CSS splitting/token normalization, public controller modularization
  lebih luas, Technologies form migration dan draft editor decomposition tetap
  DEFER sampai ada kebutuhan dan pembuktian perilaku. Tidak memaksa cleanup
  pada race/recovery code yang belum diuji dengan backend nyata.

## M11 integration dan release blockers yang tetap aktif

1. Environment disposable lokal/staging, Docker/Supabase CLI/resource dan
   target loopback harus diverifikasi sebelum service dijalankan. Guestbook
   remote/CDN harus diblokir atau dioverlay secara lokal. Seed hanya sintetis;
   jangan reset/hapus database atau volume existing.
2. Bootstrap/migration compatibility dan urutan rollout M02, M04, M06, M09
   belum dieksekusi pada PostgreSQL nyata. Termasuk
   `20261019020000_m04_project_cover_layout.sql`, schema lama dan cutover RPC.
3. Edge Functions belum dideploy/diverifikasi dalam runtime target. Perlu
   pemeriksaan environment server, package resolution, resource/timeout limits
   dan endpoint delivery. Tidak ada service-role secret di frontend.
4. Auth owner/AAL1/AAL2, MFA TOTP, RLS/grants/security-definer dan Storage nyata
   belum dibuktikan. Test anon/non-owner/owner AAL1 denial serta AAL2 success.
5. Bucket bersama M02 dan konsumen legacy, private original/draft M09, published
   derivative delivery, hide/archive revocation dan preview/download admin
   perlu pengujian backend nyata. Jangan melemahkan akses agar fixture lolos.
6. Trusted proxy/header, HMAC request budget dan concurrent PostgreSQL rate
   limiter belum diverifikasi. Fixture CAS tidak membuktikan transaksi/locks.
7. Publish/replacement/CAS/idempotency, konflik dua editor, kegagalan parsial
   dan hasil ambigu memerlukan pengujian concurrency/recovery nyata. Snapshot
   lama dan seluruh file tetap dipertahankan; audit referensi sebelum cleanup.
8. Historical public URLs, cache/CDN dan transisi bucket perlu keputusan dan
   verifikasi rilis. URL CV statis historis belum memiliki keputusan transisi;
   cache tidak dapat dianggap sudah dicabut oleh endpoint no-store baru.
9. Browser lain, perangkat fisik, screen reader, zoom native 200%, staging
   deployment/CSP dan production release belum diverifikasi M10.
10. Content E-Commerce menunggu materi asli owner; favicon DEFER sampai logo
    personal; expanded hero photo geometry tetap OPEN. Tidak diubah M10.

M11 hanya dapat dimulai dengan otorisasi berikutnya. M10 tidak menghapus atau
menurunkan blocker M02/M04/M06/M09 maupun blocker environment sebelumnya.

## M10-07 — Hasil akhir pengujian yang benar-benar dijalankan

Pengujian dijalankan sequential per browser, memakai source asli dan synthetic
SDK/database/Storage doubles. Tidak ada PostgreSQL/Auth/Storage nyata atau
deployment yang digunakan. Hasil akhir setelah koreksi harness: **1027 PASS,
0 FAIL**. Angka ini adalah jumlah assertion, bukan 1027 skenario independen;
sebagian coverage antar-script saling melengkapi/beririsan.

| Script | Hasil akhir | Klasifikasi |
| --- | --- | --- |
| `test-publish-upload-integrity.js` | 126 PASS | Local doubles / M01 legacy lifecycle |
| `test-m02-security.js` | 45 PASS | Local doubles + SQL static inspection |
| `test-m02-browser.js` | 47 PASS | Fixture browser, private delivery / guards |
| `test-m03-carousel.js` | 189 PASS | Fixture browser, responsive/keyboard/interactions |
| `test-m04-cover.js` | 34 PASS | Metadata/fallback local + SQL static |
| `test-m05-visual.js` | 97 PASS | Fixture browser, hero/navbar/keyboard |
| `test-m06-cv.js` | 72 PASS | Module/security doubles + SQL static |
| `test-m06-browser.js` | 42 PASS | Fixture browser, CV public/admin/error/cache behavior |
| `test-m07-performance.js … followup 1` | 18 PASS | Fixture browser, opening/lifecycle/reduced motion |
| `test-preview-portfolio.js` | 44 PASS | Fail-closed isolation, fixture data/download/cleanup |
| `test-m09-contract.js` | 40 PASS | Handler/contract doubles |
| `test-m09-media.js` | 31 PASS | Media/registry/recovery doubles |
| `test-m09-runtime.js` | 11 PASS | Actual runtime source with synthetic SDK, no Deno service |
| `test-m09-browser.js` | 67 PASS | Actual public/admin UI, synthetic backend |
| `test-m09-upload-browser.js` | 16 PASS | Actual browser File/encoder + handler, synthetic Storage |
| `test-m09-refinement.js` | 85 PASS | Native touch rail, crop geometry, responsive detail |
| `test-m10-structure.js` | 16 PASS | Static preservation/import/resource checks |
| `test-m10-equivalence.js … after` | 30 PASS | 26 exact comparisons + 4 isolation/cleanup assertions |
| `test-m10-admin.js` | 17 PASS | Actual admin entry/auth/router/list/editor with synthetic SDK |

M10 admin coverage: anonymous and invalid login, password → MFA gate, session
persistence, invalid TOTP, synthetic owner AAL2 dashboard, actual router/list,
search empty state, menu focus/Escape, Working Draft editor navigation, teardown
on session loss and non-owner rejection. This does **not** verify real token
issuance, TOTP cryptography, database authorization or RLS.

### Actual commands / artifacts

Semua script pada tabel dijalankan sebagai
`node --experimental-vm-modules scripts/<script> <external-output-directory>`.
Khusus performance assertions: suffix `followup 1`; structure memakai folder
baseline; equivalence memakai folder baseline dan suffix `before` / `after`.
Sintaks script CommonJS baru dan test upload juga diperiksa dengan `node --check`.

Evidence root: `C:\Users\USEPRE~1\AppData\Local\Temp\portfolio-m10-ugd8gyo5`.
`final-test-summary.json` merangkum angka aktual; tiap subfolder menyimpan JSON
dan log. Modul M01/M02/M04/M06/runtime menulis JSON ke stdout yang tersimpan
di `command.log`. `module-regression.json`, `browser-regression.json` dan
`browser-completion.json` mempertahankan riwayat, termasuk kegagalan awal.

Test upload awal **FAIL** karena selector `.m09-crop-editor .form-help` membaca
destination help M09 yang mendahului status. Diagnostik saat gagal sudah berisi
“Asset terverifikasi”. Komponen crop/client/backend byte-identical terhadap
baseline. Perubahan test hanya memeriksa pesan verified-upload pada editor
cover yang sama; upload/status/criteria tidak dilonggarkan. Pengujian ulang
terarah selesai 16/16 PASS. Perubahan ini dicatat sebagai maintenance test,
bukan perbaikan upload aplikasi. Harness M10 juga diperbaiki selama penyusunan
(selector hero, Content-Type OPTIONS dan scope variabel CDP), tanpa source fix.

Performance harness sempat dijalankan dengan default `baseline` (enam load
lokal setelah refactor, **0 assertions**, tidak dihitung PASS). Lalu mode
`followup 1` digunakan untuk 18 assertions opening/lifecycle. Rekaman angka
lokal bukan pembuktian peningkatan performa atau metrik produksi; baseline
visual sebelum source edit adalah screenshot/geometry, bukan benchmark ini.

### Visual equivalence

Screenshot 13/13 pasangan: **0 pixel berbeda**, tanpa tolerance. Seluruh
geometry/computed-style snapshots yang dibandingkan identik. Evidence:
`before/*.png`, `after/*.png`, masing-masing `results.json`.

| State | Viewport / cakupan |
| --- | --- |
| Homepage hero | 1440 × 900 |
| Homepage Projects | 1440 × 900, 800 × 900, 390 × 844 |
| Homepage Projects reduced motion | 390 × 844 |
| CMS Project Detail | 1440 × 900, 390 × 844 |
| Actual editor/crop components in local harness | 1440 × 900, masing-masing satu screenshot |
| Kedua route legacy | 1440 × 900 dan 390 × 844 per route |

Konten fixture DEMO, images decoded sebelum capture, CSS animation/transition
dibekukan hanya pada screenshot. Live lifecycle/keyboard/touch/animation tetap
diperiksa pada regresi existing. Screenshots komponen admin memakai harness;
login/router/shell asli diuji terpisah oleh `test-m10-admin.js`.

### Architecture and preservation

- Seluruh 212 file baseline tetap tersedia. Hanya tujuh file existing dalam
  scope yang berbeda; 34 file Supabase dan 49 asset tetap identik SHA-256.
- Seluruh 67 public/admin JS files dapat diparse. Static imports dan literal
  dynamic imports resolve dengan case path yang benar. Script/stylesheet lokal
  pada lima entry public/admin/legacy ditemukan. Dynamic data/remote resource
  availability tidak dibuktikan oleh pemeriksaan statis ini.
- Load/render/status/publish/hide/archive/trash/deferred-delete/reorder/destroy
  daftar admin dibandingkan dengan baseline, identik setelah normalisasi EOL.
- Vercel config, ignore rules, package/dependency manifests, loader/global
  styles/scripts, guestbook, CV dan backend tetap identik dengan baseline.
- `git diff --check` default: **FAIL**, 156 CRLF-as-whitespace reports pada
  `css/style.css` dan `js/script.js`, keduanya byte-identical sejak sebelum M10.
  `git -c core.whitespace=cr-at-eol diff --check`: **PASS**, exit 0.
  Ini opsi satu command, tidak mengubah Git config atau merapikan file existing.
- `npm test`, lint, typecheck/build: **NOT RUN**; tidak ada pipeline yang dapat
  diklaim lulus. Tidak ada dependency yang diinstal.

M04 browser carousel lama **SUPERSEDED / NOT RUN** karena desain M09 sudah
mengganti carousel project; tetap disimpan. Regresi M04 metadata/legacy fallback,
M09 grid/mobile swipe dan M01 pipeline/upload berjalan melalui script di atas.
Tidak mengulang atau mengklaim angka historis browser M01 3/3 dan subset
interaction M03 45/45 sebagai pengujian terpisah M10.

### Files / Git checkpoint

Existing berubah dibanding baseline M10:
`PROJECT.md`, `README.md`, `js/cms/projects.js`,
`admin/js/modules/projects/list-view.js`, kedua `projects/*.html`, dan
`scripts/test-m09-upload-browser.js`.

Baru: `css/project-legacy.css`, `docs/Features/M10-CLEAN-CODE.md`,
`scripts/test-m10-equivalence.js`, `scripts/test-m10-structure.js`,
`scripts/test-m10-admin.js`. Tidak ada file existing dihapus atau route diganti.

Branch tetap `backup/portfolio-m06`, commit terakhir tetap
`e8eebd1 checkpoint: M01-M06 local development`. Working tree:
**20 tracked modified, 44 untracked entries**, tidak ada staged changes.
Angka tersebut mencakup pekerjaan M01–M09 existing; bukan seluruhnya delta M10.
`m10-only.diff` membandingkan baseline fresh dengan hasil M10 agar perubahan
baru dapat direview terpisah dari Git diff kumulatif. `git-status-final.txt`
menyimpan status lengkap.

**Checkpoint penutupan: M10 — DONE — LOCAL VERIFIED.**
Owner menerima konsolidasi CSS legacy, perapian controller Projects, penghapusan
helper admin yang terverifikasi tidak dipakai, dan pembaruan dokumentasi
arsitektur. Backend, migrations, security contracts dan aset existing tidak
berubah dalam M10.

Bukti sebelumnya dipertahankan tanpa pengujian ulang untuk closure:
**1.027 assertion PASS, 0 FAIL setelah koreksi test harness** dan
**13 pasangan screenshot identik, 0 pixel berbeda**. `git diff --check` default
tetap FAIL karena CRLF existing pada `css/style.css` dan `js/script.js` di luar
delta M10; pemeriksaan dengan `cr-at-eol` PASS sesuai laporan verifikasi.

Real backend integration belum diverifikasi. Seluruh release blockers di atas
tetap aktif. Closure hanya memperbarui dokumentasi status; tidak ada perubahan
aplikasi, regresi ulang, commit, push, merge/reset/clean, migration, akses
produksi atau deploy. M11 belum dimulai dan memerlukan instruksi berikutnya.
