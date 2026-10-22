# M07 — Safe Local Preview

Status: **DONE — LOCAL VERIFIED**, 2026-10-21. Project Owner menyetujui
hasil visual, launcher terisolasi, dan penutupan M07. M01–M06 tetap
DONE — LOCAL VERIFIED. Seluruh hasil uji berikut dicatat dari run sebelumnya;
tidak ada pengujian ulang untuk closure.

## Menjalankan dari terminal VS Code

Jalankan dari root repository, dengan Node.js dan Chrome yang sudah tersedia:

```powershell
node scripts/preview-portfolio.js
```

Chrome baru akan terbuka dengan profile sementara, judul `[LOCAL FIXTURE PREVIEW]`,
dan konten CMS bertanda DEMO. Tidak memerlukan Live Server, Supabase lokal,
login, dependency baru, atau kredensial produksi. Jangan membuka URL preview
di profile Chrome normal: URL virtual hanya bekerja di Chrome yang dikelola
launcher dan tidak diterbitkan oleh HTTP server.

Pilihan tambahan:

```powershell
node scripts/preview-portfolio.js --devtools
node scripts/preview-portfolio.js --mobile
node scripts/preview-portfolio.js --mobile --reduced-motion
node scripts/preview-portfolio.js --certificates 20 --projects 12
node scripts/preview-portfolio.js --certificates 0
node scripts/preview-portfolio.js --certificate-error
node scripts/preview-portfolio.js --help
```

Jumlah kartu menerima integer 0–20; default 8 sertifikat dan 8 project.
Fixture menyertakan deskripsi pendek, panjang, dan kosong serta cover/contain.
`--mobile` mengatur viewport 390×844, DPR 1, dan touch emulation; ini bukan
pengujian perangkat fisik. F12 atau `--devtools` membuka DevTools; device toolbar
dapat digunakan untuk review ukuran lain. Tombol CV hero/footer mengunduh satu
PDF DEMO, bukan CV asli. Launcher menampilkan folder download sementara.

Jika Chrome terpasang di lokasi lain, atur `CHROME_PATH` ke executable lokal.
Tutup seluruh jendela preview atau tekan Ctrl+C pada terminal launcher untuk
mengakhiri sesi. Profile dihapus setelah Chrome berhenti. Folder download dan
hasil tes di luar profile dipertahankan agar PDF/bukti dapat diperiksa. Jika
Windows masih mengunci profile, launcher melaporkan FAIL setelah retry terbatas;
tidak menghapus direktori lain. Penutupan paksa proses/OS crash tidak menjamin
cleanup; jangan memakai taskkill sebagai cara normal menghentikan launcher.

## File dan batas implementasi

- `scripts/preview-portfolio.js`: launcher dan routing CDP; tidak ada HTTP server
  yang menyajikan aplikasi, port debug publik, atau mode preview aplikasi.
- `scripts/fixtures/portfolio-preview/fixture.js`: data sintetis profile, hero,
  about, gallery, technologies, experience, projects, certificates, guestbook,
  metadata CV, pemetaan gambar existing, dan generator PDF satu halaman.
- `scripts/test-preview-portfolio.js`: pengujian terarah launcher dengan fixture.
- Dokumentasi M07 ini serta pointer pada dua laporan M07 existing diperbarui.

HTML, CSS, JavaScript produksi dan asset existing dibaca tanpa diubah. Renderer
CMS, carousel, pemilihan gambar pada 650px, loader dan kontrak link CV adalah
kode aplikasi asli. Injeksi browser terbatas pada label judul dan penolakan klik
protokol eksternal seperti mailto; tidak membuat UI atau CMS kedua. Metadata
dan byte PDF dipenuhi fixture, bukan Edge Function atau Supabase nyata.

## Isolasi network — VERIFIED FACT dalam pengujian lokal

1. Profile unik baru, tanpa profile normal, login atau cookie pengguna. CDP
   melalui pipe proses, bukan TCP debugging port. Browser mulai di about:blank.
2. Fetch interception aktif sebelum navigasi aplikasi. Probe origin `.invalid`
   wajib menghasilkan penolakan sintetis 403; setup gagal menghentikan Chrome
   sebelum aplikasi dimuat. Setiap tab/iframe baru dikonfigurasi sebelum resume;
   tipe target yang tidak didukung ditutup.
3. Routing hanya memenuhi GET file publik yang diizinkan, tabel CMS fixture,
   pemetaan media fixture dan versi PDF aktif fixture. File admin, tooling,
   konfigurasi, path private, CV asli statis, dokumen/versi asing, write dan
   origin/route lain ditolak. Guestbook GET hardcoded dipenuhi komentar DEMO;
   submit tidak menulis atau menghasilkan sukses palsu.
4. Tidak ada penerusan HTTP(S). DevTools hanya boleh melanjutkan resource bawaan
   `devtools://devtools/bundled/` dari instalasi Chrome; HTTP(S) DevTools juga
   melewati deny routing. Ini bukan CDN atau backend alternatif.
5. Fallback: proxy penolak milik launcher di loopback selama sesi, DNS denial,
   penghapusan bypass loopback implisit, QUIC off, pembatasan UDP WebRTC,
   cache/service-worker bypass dan penolakan WebSocket/file/FTP. Proxy hanya
   menutup socket; tidak membaca log body atau meneruskan request. Pemilikan
   port menghindari asumsi bahwa port tetap seperti 9 selalu kosong.
6. Probe khusus mematikan interception sebelum aplikasi, mencoba navigasi ke
   server perangkap sintetis di loopback, lalu memasang kembali interception.
   Hasil: `net::ERR_PROXY_CONNECTION_FAILED`, **0 koneksi ke server tujuan**,
   probe deny berikutnya 403. Tidak memakai endpoint produksi untuk probe.
7. Pengamatan CDP pada desktop/mobile: **0 respons berkoneksi nyata**, tidak ada
   respons cache/service-worker atau runtime exception aplikasi. Audit hanya
   mencatat jenis keputusan/status/method, bukan URL, header, body, token atau
   stderr browser. Tidak dilakukan packet capture atau firewall audit OS.

Isolasi ini berlaku untuk Chrome yang diluncurkan dan sesi terkelola. Membuka
URL dengan browser lain, menjalankan DevTools code yang mengubah proteksi,
atau menjalankan aplikasi eksternal secara manual berada di luar kontrak ini.

## Hasil pengujian aktual

Perintah:

```powershell
node --check scripts/preview-portfolio.js
node --check scripts/fixtures/portfolio-preview/fixture.js
node --check scripts/test-preview-portfolio.js
node scripts/test-preview-portfolio.js <folder-bukti-di-luar-repository>
```

Run final: **44 PASS, 0 FAIL**. Bukan pengulangan seluruh regresi M01–M06.

| Area | Status dan bukti |
| --- | --- |
| Routing, write/private/unknown denial, CLI, PDF xref | PASS; fixture dan path allowlist |
| Setup interception gagal | PASS; 0 navigasi aplikasi, profile dibersihkan |
| Interception dimatikan sebelum aplikasi | PASS; server perangkap 0 koneksi, kemudian interception kembali aktif |
| WebSocket dan klik mailto | PASS; ditolak tanpa koneksi luar |
| Homepage/public CMS | PASS; DEMO profile, 3 foto hero, 8 sertifikat, 8 project, komentar sintetis |
| Project cover/contain dan detail | PASS; metadata diterapkan dan detail asli dirender di tab terisolasi |
| Opening animation | PASS; animationend bar dan pseudo-element masing-masing >=2,99 detik sebelum overlay hilang |
| CV hero/footer | PASS; satu versi aktif, download attachment identik byte dengan PDF fixture |
| Keyboard | PASS; project menghentikan autoplay, flip/escape sertifikat, focus-visible |
| Mobile/reduced motion | PASS; varian mobile dipilih, loader selesai dan autoplay tidak aktif |
| Sertifikat 0/1/2 dan error | PASS; empty/simple/error state memakai renderer asli |
| Tab baru | PASS; interception dipasang sebelum resume dan request asing ditolak |
| Cleanup | PASS pada startup gagal, shutdown desktop/mobile dan smoke visible |
| Chrome terlihat + DevTools | PASS smoke terpisah; aplikasi loaded, UI DevTools hadir, 0 koneksi nyata, cleanup PASS |
| Source produksi/dependency | PASS; dibandingkan dengan hash baseline sebelum task |
| Tidak aktif otomatis pada deployment | PASS analisis statis; tidak ada import dari aplikasi, `scripts/` sudah dikecualikan `.vercelignore` |

Bukti di luar repository:
`C:\Users\USEPRE~1\AppData\Local\Temp\portfolio-preview-verification-fcs7v27s`.
Run final `final-verified/preview-results.json` memuat 44 assertion, keputusan
interception dan audit cleanup; screenshot desktop/mobile dan PDF ada di folder
yang sama. Smoke DevTools: `devtools-smoke-final.json`; smoke terlihat awal:
`visible-smoke.json`. `scope-check.json` membandingkan semua file baseline;
`preview-review.diff` memperlihatkan perubahan task ini, termasuk file baru.

Riwayat harness tetap disimpan: dua percobaan probe awal memakai syarat counter
proxy >0 yang tidak tepat; Chrome sudah menolak request sebelum socket proxy
tercapai. Run berikutnya menemukan Enter pada helper CDP belum menyertakan text
CR/native keycode yang dipakai harness existing. Probe dan helper tes diperbaiki;
tidak ada source produksi yang diubah untuk meloloskan tes tersebut. Run final
dan smoke DevTools di atas yang menjadi hasil terkini.

## Keterbatasan dan checkpoint

- Font/icon CDN tetap diblokir; sebagian ikon atau jenis huruf dapat berbeda.
  CSS/layout/motion dan gambar lokal existing dapat direview. Tidak mengunduh
  atau membundel asset eksternal baru.
- PostgreSQL, Auth, RLS, Storage, owner/AAL2, Edge Functions, cache CDN historis,
  concurrency, trusted proxy dan deployment nyata **NOT VERIFIED / NOT RUN**.
  Fixture tidak membuktikan integrasi backend atau authorization produksi.
- Konten sintetis tidak menggantikan materi portfolio asli atau keputusan
  privasi. Data static lain dalam HTML existing tetap dapat terlihat.
- Native zoom 200%, browser lain, perangkat fisik, screen reader dan interaksi
  manual Ctrl+C VS Code **NOT VERIFIED**. Cleanup yang diotomasi adalah startup
  gagal/Browser.close dan window lifecycle, bukan simulasi native Ctrl+C Windows.
- Seluruh release blockers M02/M04/M06, keputusan transisi URL CV statis,
  larangan cleanup orphan otomatis, favicon DEFER dan hero fan OPEN tetap aktif.

Tidak melakukan commit/push/merge/reset/clean, deployment, migration, perubahan
data/secrets/policies atau akses produksi. **M07 DONE — LOCAL VERIFIED** sesuai
persetujuan owner. Semua hasil uji, fixture, script, bukti, dan blocker tetap
dipertahankan; closure hanya memperbarui dokumentasi. Keputusan M08 dan roadmap
tersedia pada [M08 Frontend Architecture](M08-FRONTEND-ARCHITECTURE.md).
Implementasi M09 belum dimulai.
