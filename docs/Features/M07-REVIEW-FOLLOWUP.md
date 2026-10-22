# M07 — Review Follow-up, Koreksi Intro, dan Diagnosis Preview

Status: DONE — LOCAL VERIFIED, 2026-10-21. Penutupan disetujui Project Owner.
M01–M06 tetap DONE — LOCAL VERIFIED.
Keputusan owner A/B diterapkan lokal. Diagnosis CMS read-only. Proposal preview
di bawah merupakan catatan historis sebelum persetujuan SAFE LOCAL PREVIEW.
Implementasi dan verifikasi terbarunya tersedia pada
[M07 Safe Local Preview](M07-SAFE-LOCAL-PREVIEW.md).
Keputusan M08 dan roadmap M09–M11 tersedia pada
[M08 Frontend Architecture](M08-FRONTEND-ARCHITECTURE.md). Implementasi M09 belum dimulai.

## 1. Koreksi opening animation — APPROVED / LOCAL VERIFIED

Sumber: `js/initial-loader.js:36`, `css/style.css:13455`, `:13477`.
Animasi bar `l8-0` dan marker `l8-1` pada `::after` masing-masing berdurasi 3 detik.
Versi awal M07 dapat menghapus loader sebelum keduanya selesai. Itu digantikan
oleh lifecycle satu iterasi dengan fill forwards; artwork, ukuran dan keyframes
existing dipertahankan.

- Handler capture dipasang dari head sebelum overlay selesai diparse. Penundaan
  DOMContentLoaded oleh script defer tidak menyebabkan event animasi terlewat.
- Penyelesaian bar dan pseudo-element dibedakan berdasarkan target, nama dan
  pseudoElement, lalu dideduplikasi melalui Set. Keduanya wajib selesai pada
  jalur normal sebelum fase keluar dimulai.
- Exit memakai opacity 0,45 s dan transform 0,55 s existing. Event transition
  anak diabaikan; kedua properti overlay harus selesai sebelum reveal/removal.
  Flag exiting/finished mencegah race dan handler dibersihkan setelah selesai.
- Tidak ada cutoff normal 2 detik. CMS readiness hanya memiliki budget paralel
  1,5 detik; section nonkritis dan request API tidak memperpanjang intro.
- Timer recovery bukan jalur normal: 4 detik jika animasi tidak pernah mulai;
  setelah animationstart, durasi CSS + 1,2 detik jika event akhir tidak tiba;
  900 ms untuk transisi yang tidak selesai. CSS animationcancel juga dipulihkan.
- Reduced motion tidak dipaksa menunggu siklus dekoratif. Background/pagehide
  memakai recovery pelepasan overlay, sehingga BFCache/tab tidak terkunci.
- Jika loader script gagal atau JavaScript dinonaktifkan, overlay default hidden
  dan konten tetap dapat diakses. Tidak menunggu seluruh gambar/font/API remote.

Optimasi WebP, sumber mobile 650px, defer Iconify, lifecycle partikel dan
pengurangan pekerjaan per frame dari M07 dipertahankan.

## 2. Project Carousel — APPROVED / LOCAL VERIFIED

Sumber: `index.html:1521`, `js/script.js:2620`, `css/style.css:6699`.
Tombol previous/next/pause, progress bars dan hint drag/swipe milik section
Project dihapus, termasuk pembuatan kontrol, listener indikator dan tiga blok
CSS indikator yang bertumpuk. Style yang hanya dipakai hint desktop/mobile
Project juga dihapus. Tidak ada kontrol atau label terlihat pengganti.
Hint About yang berada di luar section Project tetap memakai style bersama.

Kartu, cover/contain/focal point, varian mobile, detail links, infinite wrap dan
mekanisme drag/swipe existing dipertahankan. Tidak ada redesign kartu/detail.

Navigasi pada region project yang focusable:

- ArrowLeft/ArrowRight dan Home/End menavigasi kartu.
- Spasi pada region menjeda/mengaktifkan kembali autoplay; Escape menghentikan.
- Sentuhan/pointerdown/drag dan navigasi manual menghentikan autoplay secara
  persisten. Blur, watchdog, resize, atau meninggalkan hover tidak membatalkannya.
- Resume hanya dipilih kembali melalui Spasi. Hover/focus tetap memberi jeda
  sementara; reduced motion menonaktifkan autoplay. Enter pada link tetap normal.
- Instruksi dan status memakai teks nonvisual, aria-describedby, aria-keyshortcuts
  dan status announcement. Outline fokus existing dipertahankan.

[W3C G4](https://www.w3.org/WAI/WCAG22/Techniques/general/G4) mengizinkan mekanisme
pause/resume dengan shortcut yang didokumentasikan. Syarat pentingnya adalah
pause bertahan, bukan berhenti hanya selama fokus. Pengujian mencakup kondisi
ini dengan native Escape dan setelah fokus keluar, serta stop dari sentuhan.
Ini verifikasi mekanisme spesifik, bukan klaim sertifikasi WCAG atau pengujian
screen reader nyata. Pertimbangan discoverability shortcut tetap perlu review owner.

## 3. Performa terbaru — PENGUKURAN LOKAL

Metode sama dengan M07: Chrome headless 155, tiga run desktop/mobile, jendela
12 detik, HTTP/gzip loopback, cache browser disabled, fixture CMS yang sama,
semua koneksi produksi/CDN diblokir. Desktop 1440x900/DPR1/CPU1x/20Mbps/40ms;
mobile 390x844/DPR1/CPU4x/1,6Mbps/150ms. Ini bukan metrik produksi.

| Median | Desktop | Mobile |
| --- | ---: | ---: |
| FCP | 272 ms | 1.204 ms |
| LCP | 1.824 ms | 1.268 ms |
| Reveal intro terbaru | 3.837 ms | 4.688 ms |
| CLS | 0,01114 | 0,01084 |
| Transfer subresource | 15.789.909 byte | 633.619 byte |
| CDP TaskDuration | 2.068 ms | 4.199 ms |
| Long task count | 0 | 0 |

**Timing 1,7–1,9 detik pada laporan awal M07 adalah historis dan tidak berlaku
untuk intro yang kini disetujui.** Waktu reveal mencakup startup resource/CSS,
siklus animasi 3 detik dan exit sekitar 0,55 detik; waktu intentional animation
bukan waktu menunggu API. Enam run memverifikasi animationend kedua komponen
(elapsedTime 3 s) dan transitionend transform sebelum reveal.

LCP hampir sama dengan M07 awal (desktop 1.788 -> 1.824 ms, mobile 1.272 ->
1.268 ms); CLS desktop 0,01236 -> 0,01114. Variasi kecil ini bukan klaim
peningkatan statistik. TaskDuration tetap variabel dan tidak diklaim membaik.
FCP/LCP tidak mewakili saat overlay sudah memberi akses konten. Transfer tidak
mencakup main document/resource eksternal yang diblokir. Tidak ada Lighthouse,
INP, warm-cache atau metrik produksi baru. Hash kelima WebP tetap identik.

## 4. Diagnosis Live Server — READ-ONLY

| Temuan | Status dan bukti |
| --- | --- |
| Host loopback memilih Supabase lokal | VERIFIED FACT: `js/cms/client.js:27–56`; port API 54321, bukan data produksi. Admin memiliki pilihan host serupa pada `admin/js/core/config.js:21–41`. |
| API lokal saat diperiksa | VERIFIED FACT pada OS: tidak ditemukan listener TCP LISTEN pada port 54321. Tidak ada request produksi atau operasi DB/Storage nyata dijalankan. Ketersediaan dari browser Live Server owner belum diprobe langsung. |
| Guestbook berbeda environment | VERIFIED FACT: `js/guestbook.js:273–276` memakai endpoint produksi hardcoded; `:1037` membaca komentar approved dan `:1450` memanggilnya saat inisialisasi. Submit pada `:1215` juga menuju endpoint itu. Live Server biasa bukan lingkungan terisolasi. Source ini TIDAK diubah. |
| Host LAN/domain lain | VERIFIED FACT kode: host di luar whitelist loopback memilih konfigurasi produksi. Host/URL Live Server owner yang sebenarnya masih NOT VERIFIED. |
| Sertifikat harus datang dari CMS | VERIFIED FACT: section/shell ada pada index; controller memulai `build([], "Memuat sertifikat...")` di `js/certificates.js:1352`. Array CERTIFICATES historis masih ada, tetapi bukan fallback init yang diterbitkan. |
| Filter sertifikat | VERIFIED FACT: `js/cms/certificates.js:153–176` meminta published + deleted_at null, lalu memfilter status/title kembali. Draft/Hide/Archive/Trash tidak dipakai sebagai filler. |
| Kosong dan error | VERIFIED FACT: respons sukses tanpa record eligible memakai pesan belum ada published; catch `js/cms/certificates.js:207` membangun list kosong dengan pesan gagal dimuat. View sama-sama kosong tetapi pesan berbeda; fetch error tidak dinyatakan sebagai sukses. |
| Private delivery bukan prasyarat render kartu | VERIFIED FACT: link dokumen dibentuk di `js/cms/client.js:123`, tidak didownload sebelum render. Endpoint M02 yang belum tersedia mengganggu buka/download dokumen, bukan dengan sendirinya menyaring kartu keluar. Schema/query/RLS tetap harus sesuai agar record bisa dibaca. |
| CV hero/footer | VERIFIED FACT: dua tombol memakai `js/cms/cv.js:27–51`, satu metadata aktif dan endpoint versi. Error jaringan/metadata invalid menonaktifkan keduanya dengan retry, bukan fallback PDF lama. |
| CV legacy | VERIFIED FACT: fallback statis hanya setelah all-null CV atau explicit missing-schema ditambah read singleton legacy yang sukses. Tanpa API lokal, konfirmasi ini tidak terjadi; link unavailable adalah kontrak fail-closed M06. |
| Deployment CV/sertifikat | NOT VERIFIED pada target: file migrasi dan fungsi lokal tidak membuktikan penerapan. Checkpoint menyatakan migration M02/M04/M06 serta Edge Functions belum diterapkan/dideploy; blocker itu dipertahankan. |
| Sumber data lain | VERIFIED FACT: profile/about dari profile_content, hero_media, about_interests, about_organization, about_organization_skills, about_gallery (`js/cms/profile-about.js:654–689`); project dari projects (`js/cms/projects.js:395–407`); experience dari experiences (`js/experience-stack.js:355`). |
| Fallback berbeda antarmodul | VERIFIED FACT: profile mempertahankan markup kompatibel ketika belum dikonfigurasi/error; project/experience dapat mempertahankan fallback saat request gagal, namun successful empty response mengosongkan/menyembunyikan section. Sertifikat fail-closed tidak menghidupkan kartu historis kembali. |

**Kesimpulan terverifikasi:** Live Server melayani file frontend, bukan otomatis
menyediakan Supabase lokal, dataset, schema atau Edge Functions. Dengan pemilihan
host loopback dan tidak adanya listener API lokal, seluruh fitur CMS tidak dapat
dianggap siap untuk visual review. Error loading sertifikat dan CV unavailable
memiliki jalur source yang sesuai kondisi ini; bukan alasan membuka bucket atau
menampilkan CV lama saat gagal membaca metadata.

**HYPOTHESIS / NOT VERIFIED:** record published lokal benar-benar kosong,
schema/policies lokal lama, status deployment fungsi target, cache browser,
versi bundle online, mixed content/CORS pada URL owner, dan perbedaan dataset
produksi. Tidak ada produksi yang dibuka untuk memastikan hipotesis tersebut.

M03 render/interaksi dengan fixture dan M06 download attachment aktual lewat
backend sintetis sudah bisa diverifikasi. Preview UI lengkap memerlukan dataset
lokal yang sengaja disediakan atau stack Supabase lokal yang sesuai; Live Server
saja belum cukup dan guestbook masih berisiko mengakses produksi.

## 5. Proposal preview paling kecil — catatan sebelum persetujuan

Bagian ini mempertahankan proposal awal. Status terkini: APPROVED dan LOCAL
VERIFIED sesuai laporan Safe Local Preview; milestone M07 DONE — LOCAL VERIFIED
setelah persetujuan penutupan owner. Proposal dan hasil uji historis dipertahankan.

Rekomendasi: launcher developer-only yang menggunakan kembali mekanisme
Chrome/CDP dari test existing, dalam jendela Chrome terlihat dan profile baru.
Tidak menambah mode pada aplikasi normal, flag query publik, framework,
dependency, database, atau CMS kedua.

Entrypoint yang diusulkan (belum ada):

```text
node scripts/preview-portfolio.js
```

Fixture eksplisit di `scripts/fixtures/portfolio-preview/`: profile/hero,
experience, project beserta cover metadata, sertifikat published 3/5/8/12/20,
skenario 0/1/2 dan error, serta satu PDF sintetis valid untuk CV. Setiap data
berlabel demo/sintetis, bukan materi asli owner. Fixture/helper tests existing
menjadi sumber reusable; tidak membuat renderer visual duplikat.

Aktivasi dan isolasi yang diusulkan:

1. Hanya launcher eksplisit yang membuat session Chrome/CDP. Mulai about:blank,
   pasang interception/deny rules sebelum membuka halaman. Tidak menambah preview
   query switch ke index atau mengaktifkan fixture berdasarkan localhost saja.
2. Respons HTML/CSS/JS/gambar berasal dari file repository lewat CDP fulfillment,
   seperti test existing. Semua origin/route lain denied. Tidak perlu Live Server,
   Supabase lokal, akun produksi, token admin atau service-role key.
3. Dead proxy + DNS denial menutup koneksi nyata jika interception gagal. Origin
   preview virtual hanya bekerja di browser terkelola; URL itu bukan server yang
   menerbitkan fixture kepada browser lain. DevTools memakai pipe, bukan port
   debug publik. Setiap tab/target baru juga wajib dipasangi interception sebelum
   dijalankan; jika pemasangan gagal preview dihentikan. Detail launcher baru ini
   masih perlu dibuktikan saat implementasi, bukan dianggap sudah teruji.
   Tutup browser/session berarti berhenti memakai fixture.
4. REST fixture dan download CV hanya dipenuhi dari memory/file sintetis. Tidak
   ada request yang diteruskan ke Supabase, termasuk endpoint hardcoded guestbook.
   Guestbook di-stub/intersep seperti tests; bukan form yang dapat menulis live.
5. Frontend produksi tetap dirender oleh modul asli, sehingga carousel, cover
   metadata, hero, intro dan CV behavior memakai implementasi yang sama. Judul
   jendela menandai LOCAL FIXTURE PREVIEW. Error normal aplikasi tidak ditutupi
   karena tidak ada perubahan pada mode produksi/Live Server biasa.
6. Validasi wajib sebelum dipakai: probe origin terlarang ditolak, tidak ada
   real API forwarding, fresh profile tanpa credential pengguna, semua target
   asset di dalam repository, PDF attachment lokal, dan shutdown aman. Fixture
   publik bukan pengujian authorization/RLS/Storage nyata.

Batas fidelity: source CSS/motion aktual dapat direview, tetapi icon/font CDN
tertentu tetap diblokir. Tidak mengarang tampilan CDN yang belum dimuat. Aset
pihak ketiga offline/pinned beserta lisensinya dapat dievaluasi terpisah bila
owner menginginkan fidelity ikon penuh; tidak dibundel atau diunduh pada task ini.

Alternatif stack Supabase lokal penuh lebih dekat ke integrasi backend, tetapi
memerlukan runtime, migrasi, dataset disposable dan validasi izin tersendiri.
Untuk review visual frontend saat ini, launcher fixture lebih kecil dan tidak
menyentuh data nyata. Belum ada file launcher/fixture preview yang dibuat.

## 6. Pengujian terarah dan keterbatasan

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Normal intro, 3 desktop + 3 mobile | 6 assertion normal PASS; kedua animationend dan exit selesai sebelum reveal |
| Lifecycle/recovery final | 16 PASS, 0 FAIL, tanpa runtime error |
| Project/CMS/editor dan interaksi | 97 PASS, 0 FAIL; suite M04 disesuaikan dengan keputusan kontrol baru |
| Global/hero/keyboard | 21 PASS, 0 FAIL, interaksi M05 saja |
| Sertifikat dengan fixture | 45 PASS, 0 FAIL, interaksi M03 saja |
| CV admin -> frontend + attachment | 42 PASS, 0 FAIL dengan fixture M06 |

Kasus loader mencakup reduced motion, completion ganda satu elemen yang tidak
boleh membuka halaman, animasi yang dinonaktifkan/tidak mulai, animationcancel,
script gagal, JavaScript disabled, defer lambat, request nonkritis gagal/lambat,
dan pelestarian lifecycle partikel. Project mencakup 3 ukuran viewport, count
1/2/3/8/20, deskripsi pendek/panjang/kosong, cover/contain, varian 650px,
refresh CMS, drag/touch, native Escape, persistent stop, keyboard dan links.
Screenshot project `projects/public-projects.png` diperiksa; kontrol dan ruang
kontrolnya tidak ada. Gambar regresi adalah fixture, bukan portfolio asli.

Dua masalah harness dicatat, bukan dihapus dari riwayat:
- Run pengukuran gabungan menghasilkan 6 assertion normal PASS tetapi exit code
  1 akibat Invalid InterceptionId saat request dibatalkan oleh navigasi. Bukan
  exception aplikasi. Cancellation kini dicatat terpisah dan suite recovery
  diulang terarah: 16 PASS, errors kosong. Enam sampel normal tetap disimpan.
- Run interaksi M05 pertama: 20 PASS, 1 FAIL pada check navbar setelah delay tetap
  150 ms. Kode navbar tidak berubah. Harness kini menunggu kondisi observable
  yang sama dan menyimpan sampel scroll/rect; repeat 21 PASS. Sampel final setelah
  150 ms: scrollY 130, expanded true, top 10, loading false. Penyebab transien run
  pertama tidak dapat diatribusikan pasti; tidak diklaim sebagai bug aplikasi.

Tidak menjalankan ulang seluruh suite M01–M06. Backend/security tidak diubah.
Browser lain, perangkat fisik, zoom native 200%, screen reader, CDN/font/icon
nyata, backend production, cache/deployment: NOT VERIFIED. Real DB/Storage/RLS/
owner-AAL2/concurrency: NOT RUN. Phase 3 tidak melakukan browser Live Server
nyata karena source guestbook dapat mengakses produksi; diagnosis memakai
source, pemeriksaan listener lokal dan fixtures yang diblokir jaringan.

## 7. Scope, bukti dan checkpoint

Source aplikasi berubah hanya: `index.html`, `css/style.css`,
`js/initial-loader.js`, `js/script.js`. Test yang disesuaikan:
`scripts/test-m04-projects.js`, `scripts/test-m05-visual.js`,
`scripts/test-m07-performance.js`. Dokumen M07 diberi pointer ke follow-up ini.
Tidak mengubah modul CMS/admin, guestbook, Supabase configuration, SQL, fungsi,
policy, credential, WebP, mobile source, atau closure M06.

Bukti session di luar repository:
`C:/Users/USEPRE~1/AppData/Local/Temp/portfolio-m07-followup-9wrcuvhv`.
Berisi baseline/hash, performance/events, recovery, screenshots/regression,
performance-summary, scope/diff dan Git status. Script pengujian tetap tersedia.

Perintah pengujian yang dapat diulang (output wajib di luar repository):

```text
node scripts/test-m07-performance.js <output> followup 3
node scripts/test-m04-projects.js <output>
node scripts/test-m05-visual.js <output> --interactions-only
node scripts/test-m03-carousel.js <output> --interactions-only
node --experimental-vm-modules scripts/test-m06-browser.js <output>
```

Pemeriksaan hash mempertahankan 170 file baseline lainnya, termasuk semua WebP,
modul CMS/admin/guestbook/backend dan closure M06. Follow-up ini mengubah delapan
file existing dan menambah satu laporan; tidak menghapus file. Git status kumulatif:
tujuh tracked modified, delapan untracked, termasuk pekerjaan M06/M07 sebelumnya.
`scope-check.json` dan `review-followup.diff` memisahkan perubahan follow-up dari
baseline tersebut. Pemeriksaan sintaks, mobile sources/CV links, referensi kontrol
yang dihapus dan diff whitespace dengan cr-at-eol: PASS.


Seluruh blocker rilis M02/M04/M06 tetap aktif: migrasi/fungsi belum diterapkan
menurut checkpoint; Storage/RLS/owner-AAL2, trusted proxy, limiter/concurrency,
shared bucket, historical URL/cache, transisi CV statis, deployment terkoordinasi,
dan audit referensi sebelum cleanup. Tidak menghapus orphan otomatis. Favicon
DEFER dan visual hero fan OPEN tetap dipertahankan; materi asli E-Commerce
belum digantikan dengan konten rekaan.

Tidak ada commit/push/merge/reset/clean, deployment, remote migration, akses
produksi, atau perubahan data/izin nyata. Checkpoint historis Phase 4 di sini
telah dilanjutkan dengan persetujuan SAFE LOCAL PREVIEW; lihat laporan terbaru.
M07 DONE — LOCAL VERIFIED sesuai persetujuan owner atas hasil visual dan launcher.
Hasil uji, keterbatasan, dan release blockers di atas dipertahankan tanpa pengujian
ulang atau perubahan source saat closure. Status ini tidak menyatakan kesiapan
produksi. M08 ditutup dengan Opsi A; implementasi M09 belum dimulai.
