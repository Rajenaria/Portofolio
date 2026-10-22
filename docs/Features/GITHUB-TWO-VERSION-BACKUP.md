# GitHub two-version backup

SUPERSEDED: owner memilih repository terpisah `portofolio-v2` setelah dokumen
ini dibuat. Jangan jalankan perintah push strategi lama di bawah. Gunakan
`GITHUB-NEW-REPO-CUTOVER.md`; repository GitHub lama tetap tidak diubah.

Status: LOCAL PREPARED; PUSH APPROVAL REQUIRED. Tidak ada push atau deployment
yang diotorisasi dalam checkpoint ini.

## Identitas versi

Repository: https://github.com/Rajenaria/Portofolio.git

| Versi | Referensi lokal | Commit sumber |
| --- | --- | --- |
| Original sebelum M01 | `backup/original`, annotated tag `original-before-redesign` | `ddb93cf681538f2cc502eb293af0704bb6180152` |
| Redesign M01-M11 | `release/redesign-v2` | Commit checkpoint M11 pada branch ini; baca dengan `git rev-parse release/redesign-v2` |
| Checkpoint M01-M10 sebelumnya | `backup/portfolio-m06` | `5e1691de7f750365543030486cf399e59c44d0f7` |

Original ditentukan dari riwayat: `ddb93cf` adalah parent langsung checkpoint
M01-M06 `e8eebd1`, sebelum dua checkpoint milestone, dan sama dengan remote
`main` saat inspeksi. Commit 9 Oktober 2026 itu hanya memperbarui CV dibanding
parent-nya. Tree sudah memuat website/CMS existing; ini snapshot sebelum M01,
bukan klaim versi paling awal website atau bukti deployment production.

Tree original: `f14e7ce0d083d08da5c7d76d996aecabcb1c88e7`, 140 file.
Branch dan tag original menunjuk commit tersebut tanpa menambahkan dokumentasi,
mengubah konten, atau menulis ulang riwayat. Dokumentasi ini hanya di redesign.

## Cakupan checkpoint redesign

Mempertahankan seluruh parent M01-M10 dan memasukkan 31 modified serta sembilan
untracked file M11 yang direview, ditambah dokumen ini. Tidak ada perubahan
source aplikasi baru untuk pekerjaan versioning. Meliputi isolasi environment,
penyesuaian fixture/regression, empat pin SDK Edge, koreksi SQL migration18,
manifest migration, matriks staging, dan laporan completion.

Source checkout tetap unconfigured/fail-closed. Artifact deployment memerlukan
konfigurasi eksplisit melalui prosedur M11-02; branch ini bukan artifact
production siap deploy. Dependency/tooling eksternal dan evidence operator
tetap di luar repository. Hasil staging tidak dijalankan ulang untuk Git backup.

Pemeriksaan pola mencakup file working tree, snapshot original, dan 404 blob
teks reachable pada HEAD sebelum checkpoint. Tidak ditemukan pola private key,
PAT, server secret, credential URL nyata, atau non-anon JWT. String negatif
`SYNTHETIC` pada test adalah fixture, bukan credential. Pemeriksaan pola bukan
jaminan tidak ada secret yang tidak dikenali. Public publishable key dan
project/owner ID bukan kredensial server. Tidak ada `.env`, dump, log, private
key, tooling package, atau evidence sementara dalam manifest staging Git.

## GitHub dan batas Vercel

`git ls-remote --symref origin HEAD` mengonfirmasi default GitHub `main`,
HEAD `ddb93cf681538f2cc502eb293af0704bb6180152`. Nama backup, release, dan tag
yang diusulkan belum ditemukan di remote pada inspeksi. REST metadata GitHub
tanpa autentikasi tidak tersedia; verifikasi default memakai protokol Git.

Vercel Production Branch, Git integration, Preview rules, environment scopes,
deployment protection, dan deployment hooks belum terverifikasi. Tidak ada
local `.vercel` project link atau GitHub workflow; `vercel.json` mengatur headers,
bukan bukti branch production atau auto-deploy dinonaktifkan. GitHub default
branch tidak membuktikan Production Branch Vercel.

Dokumentasi resmi menjelaskan push dapat memicu deployment otomatis:
https://vercel.com/docs/git/vercel-for-github

PUSH BLOCKED sampai owner memverifikasi konfigurasi Dashboard dan memastikan
push kedua branch tidak memicu deployment yang tidak diotorisasi. Terutama
original masih memiliki referensi backend historis; jangan biarkan backup
branch menjadi Preview yang terhubung ke production. Deployment Protection
sendiri bukan isolasi backend. Jangan mengubah tree original untuk mengatasi ini.

## Perintah push yang DIUSULKAN, belum dijalankan

Setelah izin push terpisah dan semua gate Vercel lolos, periksa ulang remote
dan collision refs. Hentikan jika target ref telah dibuat/berubah; jangan force.

```powershell
git ls-remote --symref origin HEAD refs/heads/main refs/heads/backup/original refs/heads/release/redesign-v2 refs/tags/original-before-redesign
git push --atomic origin refs/heads/backup/original:refs/heads/backup/original refs/heads/release/redesign-v2:refs/heads/release/redesign-v2 refs/tags/original-before-redesign:refs/tags/original-before-redesign
```

Refspec eksplisit tidak menargetkan `main`. Tidak ada merge, force, tag rewrite,
atau perubahan default branch. Atomic push menghindari sebagian ref terpublikasi
jika satu ref ditolak; setelah push tetap perlu readback refs.

## Recovery dan rollback

Untuk inspeksi offline tanpa mengganti working tree aktif, ekspor snapshot:

```powershell
git show --no-patch original-before-redesign
git rev-parse 'original-before-redesign^{commit}'
git rev-parse 'backup/original^{tree}'
git archive --format=zip --output=../portfolio-original-preserved.zip original-before-redesign
```

Pilih path output baru agar tidak menimpa arsip existing. Jangan membuka versi
original dengan jaringan aktif tanpa isolasi backend historis. Snapshot Git
menyimpan source/assets tracked, bukan database, Auth, object Storage remote,
secrets, pengaturan Dashboard atau backup production.

Rollback production memerlukan izin terpisah, verifikasi kompatibilitas backend
dan artifact/konfigurasi sebelumnya, serta backup database/Storage dan rencana
restore yang sudah diuji. Jangan reset/force-push `main` atau mengembalikan bucket
private ke public. URL delivery, snapshot dan metadata baru bisa tidak kompatibel
dengan frontend lama; pertahankan data/media dan lakukan rekonsiliasi.

## Release blockers yang tetap aktif

- Target/origin production resmi dan Vercel branch/integration/Preview/CSP
  belum diverifikasi; domain terdahulu tetap kandidat, production nonaktif.
- Audit baseline production: schema/history/extensions/grants/RLS/owner+AAL2,
  Storage dan semua konsumen bucket; staging fresh bootstrap bukan bukti upgrade.
- Review varian pg_net/seed historis; jangan menerapkan seed DEMO atau replay
  18 migration ke production. Migration18 telah diperbaiki; compatibility perlu
  dinilai terhadap history production yang sebenarnya.
- Rencana deployment backend/frontend, konfigurasi/secret production, backup
  database/Storage, restore dan rollback terkoordinasi belum dieksekusi.
- URL sertifikat lama/CDN, CV statis historis dan shared-bucket transition
  memerlukan keputusan serta validasi production.
- Provenance trusted proxy/rate limiter production belum terbukti.
- Orphan/ambiguous media harus direkonsiliasi sebelum cleanup; tidak dihapus otomatis.
- Outage/process-crash/commit-boundary failure injection belum lengkap.
- Hosted frontend QA, perangkat fisik, browser lain, screen reader, zoom native
  200%, serta field performance/INP tetap memerlukan validasi.
- Favicon menunggu logo; hero expanded menunggu visual review; materi asli
  E-Commerce masih memerlukan owner. Bukan alasan mengarang konten/branding.

Evidence Git lokal tersanitasi berada di
`D:\CodexTooling\github-versioning-review-20261023` dan tidak dimasukkan ke commit.
