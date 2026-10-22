# M08 — Tailwind CSS & Frontend Architecture Evaluation

Status: **DONE — ARCHITECTURE APPROVED / LOCAL AUDIT VERIFIED**, 2026-10-21.
Project Owner menyetujui **OPTION A — STRUCTURED VANILLA CSS**.
Dokumen ini mencatat keputusan audit dan roadmap; bukan otorisasi implementasi M09.

## Keputusan arsitektur — APPROVED

1. Pertahankan HTML, CSS, dan Vanilla JavaScript existing beserta batas modul
   public CMS dan admin. Tidak menambah framework, bundler, atau dependency.
2. Tidak melakukan migrasi Tailwind saat ini. Hybrid Tailwind dan Full Tailwind
   berstatus **DEFER**, bukan pekerjaan yang berjalan otomatis.
3. Komponen baru M09 menggunakan styling terstruktur dan scoped. Gunakan kembali
   token, renderer, validator, form, preview, dan lifecycle existing bila sesuai.
4. Tidak melakukan cleanup besar sebelum redesign M09. Hindari membangun serta
   menulis ulang komponen yang sama dengan dua pendekatan styling.
5. Global code cleanup dan file restructuring dijadwalkan pada M10 setelah M09,
   dengan prinsip **behavior-preserving** dan proposal scope sebelum perubahan.
6. Pertahankan pemilihan gambar desktop/mobile pada 650px, kontrak CMS, dirty
   tracking, upload/replacement M01, keamanan M02, dan sinkronisasi CV M06.

## Ringkasan audit M08 — hasil sebelumnya, tidak diulang

M08-01 sampai M08-05 selesai pada tingkat inspeksi source/configuration,
evaluasi kelayakan, perbandingan tiga opsi, strategi M09, dan laporan final.
Audit dilakukan read-only; hash **183/183 file identik** sebelum/sesudah audit.
Tidak ada Tailwind/build/pilot/browser/regresi penuh yang dijalankan pada M08.

Temuan source yang mendasari keputusan:

- Tiga stylesheet utama: `css/style.css`, `css/project-detail.css`, dan
  `admin/admin.css`; aplikasi produksi tidak memiliki build frontend.
- Definisi komponen dan override tersebar; contoh footer di `css/style.css`
  memakai definisi flex lalu grid. Aturan gambar Project memiliki specificity
  tinggi dan `!important`, sehingga migrasi utility memerlukan pengendalian cascade.
- Admin sudah mempunyai token dan komponen form reusable. Form helper privat
  pada modul technologies merupakan kandidat deduplikasi M10, bukan alasan
  migrasi styling.
- Dua halaman detail legacy memiliki blok CSS inline identik. Class/DOM,
  transform runtime dan nama animasi juga terikat pada controller JavaScript.
- Tailwind kompatibel dengan Vanilla JS, tetapi menambah generate/build CSS,
  keputusan source detection, reset/layer, browser support dan distribusi artifact.
  Manfaat ukuran output, performa dan produktivitas belum dibuktikan dengan pilot.

Opsi A dipilih untuk memusatkan M09 pada desain dan kontrak konten. Opsi B/C
memerlukan persetujuan teknologi/workflow terpisah jika dievaluasi kembali.
Tidak ada temuan dead code yang mengotorisasi penghapusan otomatis.

## Roadmap yang dikonfirmasi owner

| Milestone | Scope | Status |
| --- | --- | --- |
| M01–M06 | Implementasi milestone existing | DONE — LOCAL VERIFIED; blocker rilis tetap aktif |
| M07 | Performance Optimization, visual follow-up, isolated preview | DONE — LOCAL VERIFIED; closure owner disetujui |
| M08 | Tailwind CSS & Frontend Architecture Evaluation | DONE — ARCHITECTURE APPROVED / LOCAL AUDIT VERIFIED |
| M09 | Complete Projects Experience Redesign + CMS | PLANNED — implementasi belum dimulai |
| M10 | Clean Code & File Restructuring | DONE — LOCAL VERIFIED; penutupan disetujui owner, seluruh release blockers tetap aktif |
| M11 | Final QA & Release | PLANNED — memerlukan validasi dan otorisasi rilis |

Scope desain M09 yang telah dikonfirmasi:

- Homepage Projects: Category Filter + Compact Project Grid.
- Project Detail: Story-First Interactive Engineering Case Study.
- Integrasi Admin CMS dan advanced image positioning.

Persiapan M09 yang direkomendasikan, belum dilaksanakan:

1. Konfirmasi materi asli owner, kategori, struktur case study, timeline,
   architecture, gallery dan acceptance criteria responsive/accessibility.
2. Petakan penggunaan `card_category`, paragraphs/media/technologies dan metadata
   cover existing. Ajukan kontrak tambahan jika diperlukan; persetujuan arah
   desain tidak menetapkan schema/DDL, taxonomy, atau konfigurasi crop terpisah.
3. Tetapkan scope CSS serta batas renderer/controller. Rencanakan penghentian
   clone/autoplay/listener carousel Project ketika grid menggantikannya.
4. Gunakan kembali preview terisolasi untuk verifikasi yang kelak diotorisasi;
   pertahankan seluruh implementasi dan script regresi M01–M07.

## Release blockers dan batas verifikasi yang diteruskan

- Migration M02, M04, M06 tetap disiapkan lokal dan belum diterapkan menurut
  checkpoint. Edge Functions belum dideploy; lihat dokumen masing-masing.
- Database/PostgreSQL, Auth, owner/AAL2, Storage, RLS, direct access, metadata
  guards dan concurrency nyata belum terverifikasi oleh fixture lokal.
- Trusted proxy, limiter, retensi event, cache/URL publik atau signed historis,
  konsumen bucket bersama, recovery dan rollout terkoordinasi tetap perlu validasi.
- URL CV statis historis memerlukan keputusan transisi dan validasi cache.
- Audit referensi wajib mendahului cleanup; jangan menghapus orphan atau versi
  dokumen lama secara otomatis, khususnya ketika hasil operasi ambigu.
- Native zoom 200%, browser lain, perangkat fisik, screen reader dan deployment
  tetap NOT VERIFIED sesuai laporan. Fixture tidak membuktikan backend produksi.
- Favicon tetap DEFER sampai logo personal ditentukan. Item geometri expanded
  hero fan M05 tetap OPEN; tidak ada perubahan tambahan yang diotorisasi oleh
  closure ini. Materi detail E-Commerce asli masih dibutuhkan dari owner.

Rujukan: [M02 Security](../Security/M02-SECURITY-DELIVERY.md),
[M04 Project Cover](M04-PROJECT-COVER-CAROUSEL.md),
[M06 CV](M06-CV-MANAGEMENT.md),
[M07 Performance](M07-PERFORMANCE-OPTIMIZATION.md),
[M07 Follow-up](M07-REVIEW-FOLLOWUP.md),
[M07 Preview](M07-SAFE-LOCAL-PREVIEW.md).

## Checkpoint penutupan

Perubahan closure dibatasi pada dokumentasi status/keputusan/roadmap. Hasil uji
historis dan release blockers dipertahankan; tidak ada pengujian aplikasi ulang,
perubahan source, dependency, migration, deployment, akses produksi, atau Git
commit/push/merge/reset/clean. Berhenti sebelum M09 dan tunggu instruksi owner.
