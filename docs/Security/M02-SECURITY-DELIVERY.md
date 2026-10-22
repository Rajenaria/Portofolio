# M02 — kontrak keamanan dan prasyarat rilis

Status: **DONE — LOCAL VERIFIED**, penutupan disetujui pemilik proyek.
Status ini tidak membuktikan konfigurasi atau keamanan produksi.

## Sertifikat

- `portfolio-documents` private. Akses Storage langsung tetap owner + AAL2.
- Anonim menggunakan `certificate-document?id=<UUID>`. Endpoint memeriksa
  published, bukan Trash, bucket/path/type saat setiap permintaan. Pemeriksaan
  kedua setelah download menolak hide/replacement yang teramati selama I/O.
- Respons berisi bytes, bukan redirect atau signed URL. Respons sukses/error
  menggunakan no-store, nosniff, sandbox, dan pembatasan request.
- Draft (termasuk Hide), Archived, Trash, referensi tidak lengkap, kegagalan
  limiter/database/Storage ditolak. Mengubah status tidak menghapus dokumen.
- Owner membuka preview/download melalui Storage terautentikasi, bukan URL publik.
- Replacement memverifikasi objek dan membaca ulang referensi. Jika hasil commit
  ambigu, file baru dan lama dipertahankan. Versi lama tidak dihapus otomatis:
  mungkin masih direferensikan sertifikat lain. Cleanup memerlukan audit tersendiri.
- Minimum tiga published dihapus sebagai pembatas database/UI. Publik menampilkan
  empty state untuk 0, artikel sederhana untuk 1–2, dan carousel existing untuk 3+.
  Loading/error tidak menghidupkan kembali kartu historis.
- Tautan issuer eksternal bukan dokumen yang dikelola Storage kita. Hide menghapus
  kartu/link dari CMS, tetapi akses di layanan pihak ketiga bukan kontrol proyek ini.

Jaminan: permintaan baru yang memeriksa status setelah perubahan committed akan
ditolak jika tidak published. Salinan yang telah diunduh dan respons yang sedang
berlangsung tidak dapat ditarik kembali. Tidak ada klaim revocation cache historis.

## Limiter dan identitas jaringan

RPC service-only `consume_request_budget` memakai advisory transaction lock lalu
count/insert dalam transaksi yang sama. Guestbook: 3 percobaan / 10 menit;
delivery: 60 permintaan / menit. Kegagalan limiter menolak permintaan.

Identitas berupa HMAC alamat dengan `RATE_LIMIT_PEPPER`, tanpa User-Agent.
`TRUSTED_PROXY_IP_HEADER` hanya boleh dikonfigurasi setelah gateway terbukti
**menimpa** header dengan satu alamat asli (bukan meneruskan input pengguna).
Header yang didukung: x-forwarded-for, cf-connecting-ip, x-real-ip. Rantai alamat,
header hilang/tidak valid, atau konfigurasi kosong memakai kuota bersama konservatif.
Tanpa proxy terverifikasi, pembatasan tetap aktif tetapi semua pengunjung mungkin
berbagi kuota; jangan mengklaim limiter per-IP atau kesiapan rilis.

## Checklist sebelum deployment terpisah yang diotorisasi

1. Inventaris SELURUH objek/pemakai bucket dan seluruh policy Storage di target.
   Pencarian repository hanya menemukan sertifikat; ini bukan inventaris runtime.
   Dokumen lain dalam bucket akan kehilangan akses publik setelah bucket private.
2. Pastikan snapshot/backup dan akses pemulihan admin tersedia tanpa menghapus objek.
3. Review dan terapkan migration M02 hanya pada lingkungan yang diotorisasi.
   Config TOML hanya mengatur lokal; status bucket target harus diverifikasi tersendiri.
4. Koordinasikan rollout private bucket, function, config gateway, dan frontend.
   Jangan melakukan rollout frontend sendirian atau membuka bucket sebagai fallback.
   Guestbook juga memerlukan rollout RPC/function terkoordinasi. Tabel budget baru
   tidak mengimpor percobaan limiter lama: gunakan masa hening 10 menit atau rencana
   transisi budget yang direview; jangan mengklaim kuota lintas versi sudah terjaga.
5. Verifikasi gateway tidak me-cache endpoint dan benar-benar menimpa header IP.
   Function certificate-document publik memakai verify_jwt=false; file tetap dilindungi
   status check server. Service-role hanya environment function, tidak ke browser.
6. Uji URL publik lama, signed URL yang mungkin pernah diterbitkan, CDN/browser cache,
   dan seluruh jalur retrieval. Signed URL lama dapat tetap berlaku sampai expiry.
   Jika cache/link lama masih melayani file, blokir rilis klaim strict privacy;
   tentukan purge/masa tunggu terukur atau koordinasi penyedia. Tidak ada TTL rekaan.
7. Uji anonim/owner/non-owner/AAL1/AAL2 pada database dan Storage nyata, race status,
   replacement, dan concurrency limiter. Mock bukan bukti enforcement platform.
8. Batasi retensi event limiter: event kedaluwarsa dibersihkan saat identitas dipakai
   kembali; identitas tidak aktif membutuhkan job retensi tersendiri sebelum skala besar.
9. Jalankan regresi M01 dan M02, lalu verifikasi ulang seluruh acceptance criteria.

Tidak ada migration, function, policy, atau cleanup produksi yang dijalankan oleh
implementasi lokal ini. Jangan menghapus orphan M01/M02 secara otomatis.

## Verifikasi lokal M02 — DONE — LOCAL VERIFIED

- `node --experimental-vm-modules scripts/test-m02-security.js`: 45/45 PASS.
  Mencakup handler sertifikat, perubahan status/referensi saat download, respons
  error/no-store, replacement, validasi guestbook, moderasi, identitas, dan guard.
  Skenario 40 request paralel memakai model admission terurut: 3 diterima,
  37 ditolak. Ini **bukan** pengujian concurrency PostgreSQL.
- `node scripts/test-m02-browser.js <direktori-di-luar-repository>`: 47/47
  pemeriksaan PASS pada Chrome 155 headless, tanpa error runtime. Semua request
  diintersep: source lokal/fixture dipenuhi, request eksternal ditolak.
  Pengujian memakai editor/router/modal/CMS aktual dengan client sintetis.
  Mencakup jumlah 0/1/2/3 pada lebar 390/1280, transisi count, sidebar,
  Back/Forward, cancel/confirm bahasa/reload, save, preview/download bytes,
  upload dan replacement dengan kegagalan acknowledgement/readback/verifikasi.
- Regresi M01: 126/126 skrip otomatis dan 3/3 skenario browser terisolasi PASS.
  Helper media, editor proyek M01, dan skrip regresinya tidak diubah dalam M02.
- Pemeriksaan sintaks Node pada 66 file JS/entry TS yang bersintaks JavaScript:
  PASS. Ini bukan Deno typecheck/build.
- Diff whitespace diperiksa dengan opsi `cr-at-eol` untuk mempertahankan CRLF
  existing pada stylesheet dan script carousel; tidak ada konfigurasi Git diubah.
- SQL baru hanya direview statis; tidak ada PostgreSQL/Deno runtime yang dijalankan.
  Enforcement RLS/Storage, owner/AAL2 nyata, concurrency database, gateway/IP,
  cache/link lama, dan deployment: **NOT RUN / NOT VERIFIED**.

Status milestone: **DONE — LOCAL VERIFIED**, sesuai persetujuan penutupan.
Hasil di atas merupakan hasil pengujian yang telah dilaporkan; tidak ada pengujian
ulang saat penutupan. Implementasi M01/M02, migration, Edge Function, dan skrip
regresi dipertahankan. Perlindungan produksi belum dinyatakan aktif.

## Release blockers — belum diselesaikan

1. **Migration dan Storage nyata — NOT RUN:** validasi SQL pada lingkungan yang
   diotorisasi, status private bucket, seluruh policy, direct retrieval, delivery,
   transisi status, replacement, dan akses pemulihan admin.
2. **URL lama dan cache — NOT VERIFIED:** periksa URL publik/signed historis,
   CDN/browser cache, no-store gateway, serta prosedur invalidasi atau masa tunggu
   terukur. Jangan mengklaim pencabutan akses lama sebelum dibuktikan.
3. **Trusted proxy dan limiter — NOT VERIFIED / NOT RUN:** buktikan header IP
   ditimpa gateway; uji RPC dengan concurrency PostgreSQL nyata, transisi budget
   limiter lama, dampak kuota bersama, dan kebutuhan retensi event.
4. **Owner/AAL2 — NOT RUN:** uji owner AAL2, owner AAL1, non-owner, anonim,
   serta sesi kedaluwarsa pada Auth, RLS, Storage, dan alur admin nyata.
5. **Bucket bersama — NOT VERIFIED:** inventaris objek dan seluruh konsumen runtime,
   pastikan kompatibilitas dokumen selain sertifikat dan rollout terkoordinasi.
6. **Orphan dan versi lama — belum diaudit:** audit referensi dan recovery sebelum
   cleanup apa pun. Jangan menghapus file orphan M01/M02 secara otomatis.
7. **Deployment — NOT VERIFIED:** penerapan migration, perubahan Storage target,
   deployment function/frontend, dan validasi setelah rilis memerlukan otorisasi
   terpisah. Seluruh checklist rilis di atas tetap berlaku.

Tidak ada commit, push, deployment, penerapan migration, atau akses produksi pada
proses penutupan. M03 belum dimulai; berhenti pada checkpoint instruksi berikutnya.
