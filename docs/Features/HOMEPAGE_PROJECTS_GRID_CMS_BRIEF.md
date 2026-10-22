# MASTER PROMPT — HOMEPAGE PROJECTS SECTION REDESIGN & CMS INTEGRATION

## ROLE

Act as a Senior Frontend Engineer, UI/UX Designer, Full-Stack Developer, and CMS Integration Specialist.

Saya ingin melakukan redesign pada **Projects Section di halaman utama (homepage) portfolio**, bukan pada halaman detail masing-masing project.

Gunakan konteks repository, struktur frontend, backend, database, dan Admin CMS yang sudah tersedia pada project ini.

**Tujuan utama:** Mengubah Projects Section dari horizontal auto-scrolling carousel menjadi **Category Filter + Compact Project Grid** yang lebih modern, minimalis, elegan, responsif, serta mudah dipahami pengunjung.

Pertahankan identitas visual portfolio yang sudah ada.

---

## 1. AUDIT EXISTING IMPLEMENTATION

Sebelum mengubah kode, periksa:

- Komponen Projects Section di homepage.
- Implementasi carousel dan seluruh dependensinya.
- Animasi auto-scroll dan horizontal drag.
- Pagination dots, navigation arrows, pause/play button.
- Sistem pengambilan data project.
- Struktur project card.
- Pengelolaan project melalui Admin CMS.
- Struktur kategori dan teknologi project.
- Sistem upload dan penampilan thumbnail.
- Routing ke Project Detail Page.
- Responsive layout dan styling yang digunakan.

Gunakan komponen, styling, dan arsitektur existing jika memungkinkan.

Jangan membuat sistem baru yang menduplikasi fungsi yang sudah tersedia.

## 2. REMOVE HORIZONTAL CAROUSEL COMPLETELY

Hapus seluruh perilaku carousel dari homepage Projects Section.

Termasuk:

- Automatic horizontal scrolling.
- Running/continuous card animation.
- Auto-slide intervals.
- Horizontal drag-to-explore.
- Carousel pagination dots.
- Previous/next carousel arrows.
- Pause/play carousel control.
- Auto-advance behavior.
- Scroll hijacking yang menggerakkan card ke samping.

Ganti dengan grid statis yang tidak bergerak secara otomatis.

**Penting:** Static grid bukan berarti tanpa animasi. Animasi ringan saat card muncul dan saat hover tetap diperbolehkan.

Hapus kode carousel yang sudah tidak digunakan hanya setelah memastikan tidak dipakai pada bagian lain website.

Jangan merusak komponen carousel global apabila masih digunakan di section lain.

## 3. NEW DESIGN — CATEGORY FILTER + PROJECT GRID

Bangun Projects Section dengan struktur:

**Section Header**
- Label kecil: PORTFOLIO.
- Heading: Project yang Pernah Saya Kerjakan.
- Deskripsi singkat.
- Opsional link "Lihat Semua Project" hanya jika ada tujuan navigasi yang valid.

**Category Filters**

Contoh kategori:
- All.
- Embedded Systems.
- Web Development.
- UI/UX Design.
- AI / Computer Vision.

Kategori harus berasal dari data CMS/database existing, bukan hardcoded jika sudah tersedia sistem kategori.

Filter harus:
- Berfungsi tanpa reload halaman.
- Menampilkan active state yang jelas.
- Memiliki transisi halus.
- Mendukung keyboard navigation.
- Responsif pada mobile.
- Memiliki empty state jika suatu kategori tidak mempunyai project.
- Tetap mudah digunakan ketika jumlah kategori bertambah.

Gunakan filter chips atau tab minimalis dengan aksen biru yang konsisten.

**Project Grid**

Desktop:
- 3 kolom pada layar yang cukup lebar.

Tablet:
- 2 kolom.

Mobile:
- 1 kolom.

Gunakan CSS grid responsif sesuai breakpoint project existing.

Tidak boleh ada horizontal overflow atau auto-scrolling.

## 4. COMPACT EDITORIAL PROJECT CARDS

Redesign card supaya lebih compact dibanding desain carousel sebelumnya.

Tujuan utamanya adalah memberikan preview singkat, bukan seluruh informasi project.

Setiap card berisi:

1. Thumbnail project.
2. Category label.
3. Project title.
4. Short description maksimal 2 baris.
5. Maksimal 2–3 teknologi utama.
6. CTA "Lihat Project".
7. Featured indicator jika diperlukan.

**Visual Design**

- Thumbnail menggunakan proporsi konsisten.
- Gunakan aspek rasio sekitar 16:10 atau rasio lain yang paling cocok berdasarkan desain.
- Border tipis dan halus.
- Rounded corners konsisten.
- Background putih atau soft-gray.
- Typography jelas.
- Spacing compact tetapi tetap lega.
- Judul maksimal 2 baris.
- Deskripsi dipotong secara visual dengan line-clamp.
- Tag teknologi kecil dan tidak mendominasi card.
- Tinggi card relatif konsisten dalam satu baris grid.
- Hindari whitespace berlebihan dan footer card yang terlalu besar.

Gunakan data CMS sebagai source of truth.

Pastikan gambar asli tidak rusak akibat perubahan ukuran thumbnail.

## 5. PREMIUM CTA — TEXT + CIRCULAR ARROW

Redesign tombol "Lihat Project" menjadi lebih menarik tanpa membuatnya terlalu besar.

Gunakan konsep:

**Lihat Project  ↗**

Dengan:
- Teks medium atau semibold.
- Ikon diagonal arrow di dalam lingkaran kecil.
- Background circle netral atau biru sangat muda.
- Border halus.
- Spacing seimbang.
- Ukuran compact.

**Hover Interaction**
- Warna circle berubah secara subtle.
- Arrow bergerak sekitar 2–4px secara halus.
- Teks sedikit berubah warna.
- Transisi sekitar 200–300ms.
- Tidak ada bounce atau efek berlebihan.

**Accessibility**
- CTA memiliki focus-visible state.
- Area klik nyaman pada touch device.
- Gunakan semantic link untuk navigasi.
- Seluruh interaksi tetap dapat digunakan tanpa hover.

Pastikan CTA mengarah ke halaman detail project yang sesuai.

Jangan mengubah route existing tanpa alasan teknis yang jelas.

## 6. REFINED ANIMATION SYSTEM

Gunakan animasi minimalis dan elegan.

**Scroll Reveal**
- Card muncul saat memasuki viewport.
- Fade-in dan translateY ringan sekitar 12–20px.
- Animasi sekali saat pertama kali terlihat.
- Tidak menghilang lagi ketika pengguna scroll balik.
- Stagger delay ringan jika dibutuhkan.

**Card Hover**
- Subtle border color transition.
- Very light shadow elevation.
- Thumbnail zoom sekitar 1.02×.
- Smooth arrow interaction.

**Filter Transitions**
- Saat kategori berubah, card diperbarui dengan transisi halus.
- Hindari layout jumping berlebihan.
- Jangan membuat pengguna menunggu animasi panjang.

**Motion Constraints**
- No autoplay.
- No infinite running animations.
- No bouncing cards.
- No excessive parallax.
- No horizontal scroll hijacking.
- No heavy animation libraries jika CSS/native browser APIs sudah memadai.
- Respect `prefers-reduced-motion`.

Animasi harus membantu pengalaman pengguna, bukan mengganggu pembacaan.

## 7. CMS & ADMIN PANEL COMPATIBILITY

**CRITICAL REQUIREMENT**

Semua data card harus tetap terintegrasi dengan CMS existing.

Admin harus tetap dapat:
- Menambahkan project.
- Mengedit project.
- Menghapus project.
- Mengubah judul.
- Mengubah deskripsi.
- Mengubah kategori.
- Mengubah teknologi.
- Mengupload atau mengganti thumbnail.
- Mengubah urutan project jika fitur ini sudah tersedia atau layak diperluas.
- Menentukan project featured jika dibutuhkan.
- Mengatur apakah project ditampilkan atau disembunyikan.

Jangan membuat card hardcoded.

Jangan memutus integrasi antara halaman homepage, Admin CMS, dan Project Detail Page.

Jika membutuhkan field baru, lakukan evaluasi terhadap schema existing terlebih dahulu.

Gunakan perubahan database seminimal mungkin.

## 8. THUMBNAIL CROP & POSITIONING

Pastikan sistem thumbnail mendukung pengaturan posisi gambar.

Jika CMS sudah memiliki image crop editor, gunakan kembali fitur tersebut.

Jika belum, rencanakan integrasi yang kompatibel dengan media management existing.

Idealnya admin dapat:
- Upload/replace thumbnail.
- Memilih crop area.
- Menggeser focal point.
- Mengatur zoom bila diperlukan.
- Memilih Cover atau Contain.
- Melihat preview thumbnail sesuai rasio card.
- Menyimpan pengaturan crop secara nondestructive.
- Mengedit crop kembali.

Pertahankan gambar original.

Jika media digunakan pada beberapa lokasi, crop thumbnail homepage tidak boleh secara otomatis mengubah crop gambar pada Project Detail Page.

Perhatikan fallback untuk project lama yang belum mempunyai crop metadata.

## 9. PROJECT DISPLAY BEHAVIOR

Tentukan strategi yang nyaman jika jumlah project bertambah.

Rekomendasi awal:
- Tampilkan maksimal 6 project pada homepage.
- Sediakan interaksi "Tampilkan Lebih Banyak" apabila relevan.
- Pertahankan filter kategori.
- Jangan membuat scroll horizontal otomatis.

Namun, evaluasi dahulu apakah batas enam project sesuai dengan struktur dan konten existing.

Apabila ada halaman All Projects yang sudah tersedia, pertimbangkan navigasi ke halaman tersebut.

Jangan membuat route baru yang tidak dibutuhkan.

Pastikan penambahan project melalui CMS tidak merusak grid dan tidak memerlukan perubahan kode.

## 10. MAINTAIN VISUAL CONSISTENCY

Jangan redesign seluruh website.

Pertahankan:
- Existing navbar.
- Typography family.
- Global colors.
- Overall spacing system.
- Border treatment.
- Button language.
- Existing page structure.
- Other homepage sections.
- Project Detail Page design.

Perubahan hanya difokuskan pada Projects Section dan penyesuaian CMS yang dibutuhkan.

Hasilnya harus terlihat seperti bagian natural dari portfolio existing, bukan komponen dari template yang berbeda.

## 11. QUALITY & TESTING

Pastikan:
- Filter bekerja sesuai data kategori.
- Semua card menuju Project Detail Page yang benar.
- Project baru dari CMS otomatis dapat ditampilkan.
- Perubahan project dari admin muncul di halaman publik sesuai mekanisme publishing existing.
- Thumbnail tidak rusak atau terpotong tanpa kendali.
- Layout tidak overflow.
- Card tidak mengalami layout shift besar.
- Tidak ada autoplay horizontal.
- Tidak ada event listener atau timer carousel yang tertinggal.
- UI mobile tetap nyaman.
- Keyboard navigation dan reduced-motion didukung.
- Tidak ada regresi pada Admin CMS, routing, atau section lainnya.

Gunakan image optimization dan lazy loading sesuai arsitektur repository.

## 12. IMPLEMENTATION APPROACH

Kerjakan secara bertahap:

**Phase 1 — Audit**
Periksa komponen existing dan dependensinya.

**Phase 2 — Layout Redesign**
Ganti carousel menjadi responsive project grid.

**Phase 3 — Card Refinement**
Implementasikan compact editorial cards dan premium circular-arrow CTA.

**Phase 4 — Category Filtering**
Hubungkan filter ke kategori CMS existing.

**Phase 5 — Motion Refinement**
Tambahkan scroll reveal, hover, dan filter transitions.

**Phase 6 — CMS & Media Compatibility**
Pastikan admin workflow, upload thumbnail, crop, dan data project tetap bekerja.

**Phase 7 — Testing**
Periksa desktop, tablet, mobile, accessibility, serta seluruh integrasi.

Jika suatu fase membutuhkan migrasi schema atau perubahan besar pada arsitektur, jelaskan dan minta persetujuan terlebih dahulu.

## 13. FINAL EXPECTED RESULT

Homepage Projects Section memiliki:
- Category filters.
- Static responsive grid.
- Compact premium project cards.
- Clear project thumbnails.
- Short and readable descriptions.
- Minimal technology tags.
- Elegant "Lihat Project" CTA with circular arrow.
- Smooth subtle interactions.
- No horizontal autoplay carousel.
- Full CMS compatibility.
- Responsive and accessible layout.

Project Detail Page yang sudah ada tetap berfungsi dan tidak perlu didesain ulang dalam tugas ini.

## FINAL INSTRUCTION

Start by inspecting the existing repository and explaining the planned changes.

Identify which components can be reused and which carousel-specific behaviors should be removed.

Avoid unnecessary dependencies, framework migrations, or large database changes.

**Before executing significant changes, present a concise implementation plan and identify any compatibility risks. Wait for my approval before modifying production code.**

The goal is a clean, premium, easy-to-use homepage Projects Section that prioritizes readability and professional presentation over excessive animation.