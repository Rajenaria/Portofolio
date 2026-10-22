# Repository v2 dan cutover Vercel existing

Status: NEW REPO READY / PUSH & RELEASE APPROVAL.
Persiapan lokal saja. Tidak ada repository cloud baru, push, koneksi Vercel,
deployment, atau akses/migrasi production yang dilakukan.

## Source dan identitas

- Repo lama: `https://github.com/Rajenaria/Portofolio.git`; tidak diubah.
- Repo baru kandidat: `https://github.com/Rajenaria/portofolio-v2.git`.
  Owner/URL, keberadaan repository cloud dan visibility perlu dikonfirmasi.
- Workspace baru: `C:\Users\USEP REZA USAMAH\portofolio-v2`, branch `main`.
- Basis M11: `2ab1cbb94b4c6d773ae95b7a862903aa0ee91722`.
- Original sebelum M01: `ddb93cf681538f2cc502eb293af0704bb6180152`.

Clone lokal mandiri memakai `--no-local --single-branch` dari release/redesign-v2.
Seluruh ancestor M01-M11 tetap tersedia; object database tidak berbagi hardlink
atau alternates dengan repo lama. Referensi remote workspace baru hanya kandidat
repo baru. `push.default=nothing` memerlukan refspec eksplisit. Tidak menyalin
credential, konfigurasi global, workspace tooling atau evidence sementara.

31 modified dan 9 untracked yang disebut dalam permintaan sudah tercakup dalam
commit basis M11 (ditambah dokumen versioning terdahulu); bukan perubahan baru
yang perlu di-commit ulang. Perubahan checkpoint ini hanya dokumentasi strategi.

## Gate push

Owner membuat/mengonfirmasi repository GitHub kosong bernama `portofolio-v2`
di akun yang dimaksud, menentukan visibility, tanpa README/license/gitignore
otomatis dan tanpa integrasi auto-deploy. Ini tindakan cloud terpisah.
Konfirmasi GitHub App tidak otomatis mengimpor repo baru ke hosting.

Setelah izin push eksplisit, periksa URL dan kondisi remote dahulu:

```powershell
Set-Location 'C:\Users\USEP REZA USAMAH\portofolio-v2'
git remote -v
git status --short --branch
git ls-remote --symref origin HEAD refs/heads/main
git push --set-upstream origin refs/heads/main:refs/heads/main
```

Perintah belum dijalankan. Jangan push jika repo bukan target yang dikonfirmasi,
berisi history berbeda, atau ada jalur deployment yang belum disetujui. Jangan
force, mirror, push --all/--tags, atau push ke repository lama. Ancestor original
ikut tersimpan melalui history main baru tanpa perlu mempublikasikan semua refs.
Sesudah push, baca ulang SHA main remote dan cocokkan dengan SHA lokal.

## Vercel existing: fakta dan langkah cutover

Source tidak memiliki link `.vercel/project.json`, project/team ID atau bukti
Production Branch saat ini. `portofolio-rajenaria.vercel.app` hanya CANDIDATE,
bukan domain terverifikasi. Jangan menyimpulkan identitas project dari nama repo.

Setelah approval cutover terpisah:

1. Owner membuka project Vercel yang saat ini melayani URL resmi. Catat project/
   team ID, Connected Git Repository, Production Branch, deployment ID/commit
   aktif, Domains/aliases, Root Directory, build/output settings, environment
   scopes, branch overrides, Deployment Protection dan deploy hooks. Jangan
   mengekspor nilai secret ke dokumen/repository.
2. Selesaikan backend production readiness terlebih dahulu: baseline/history,
   approved migration upgrade, bucket consumers, Auth owner/AAL2, tujuh fungsi,
   secret server dan backup/restore. Jangan replay bootstrap staging atau DEMO seed.
3. Siapkan artifact frontend dengan explicit production configuration dan CSP
   yang sudah direview. Source checkout masih fail-closed; environment variables
   Dashboard saja tidak otomatis menghasilkan environment-config.js pada static
   site ini. Persetujuan exact origin dan prosedur artifact tetap diperlukan.
4. Sebelum menghubungkan repo baru, verifikasi mekanisme pencegahan deployment/
   promotion otomatis; jika connection akan langsung deploy tanpa kontrol yang
   terverifikasi, STOP sampai maintenance/release disetujui. Hentikan/cancel queued
   deployments lama dengan izin owner; Deployment Protection bukan penahan build
   atau isolasi koneksi backend.
5. Pada project YANG SAMA, Settings > Git: Disconnect repository lama, lalu
   Connect `Rajenaria/portofolio-v2`. Jangan import sebagai New Project, rename
   project, memindahkan/menghapus domain, atau mengubah DNS untuk langkah ini.
6. Tetapkan Production Branch baru secara eksplisit ke `main`. Review ulang
   scopes environment, branch overrides, build/artifact dan Preview. Preview
   hanya boleh memakai staging yang diizinkan; jangan menyalin production backend.
7. Baca ulang Connected Git Repository dan branch melalui Dashboard. Audit hooks,
   external CI dan GitHub App paths: koneksi langsung lama harus terputus dan tidak
   ada job/hook tersisa yang masih dapat deploy repo lama ke project ini. Verifikasi
   dengan konfigurasi/audit event, tanpa membuat commit percobaan ke repo arsip.
8. Jalankan deployment/promotion hanya setelah approval release. Verifikasi commit
   baru, domain/alias existing tetap pada project yang sama, CSP, CMS, Auth/AAL2,
   media/dokumen, guestbook serta network targets. Koneksi repo saja bukan bukti URL
   production sudah menampilkan versi baru dengan aman.

Sumber resmi prosedur pergantian Git repository:
https://vercel.com/docs/git/vercel-for-github

## Rollback terpisah

Frontend: simpan deployment ID/artifact/konfigurasi production sebelum cutover.
Dengan approval, pilih deployment sebelumnya yang kompatibel dan lakukan rollback/
promotion pada project Vercel yang sama. Pastikan alias resmi menunjuk deployment
yang benar dan hentikan auto-promotion sampai masalah ditangani. Reconnect repo
lama hanya jika perlu memulihkan workflow Git, bukan prasyarat rollback deployment.
Source original tersedia dari commit/tag historis; jangan reset/force push.

Database/Storage: rollback frontend tidak membalikkan migration, data, Auth atau
objek media. Gunakan backup database/schema, inventaris policies/grants, serta
backup objek Storage yang konsisten dan restore teruji. Tentukan RPO/RTO dan
snapshot yang benar sebelum tindakan restore. Prefer perbaikan forward yang
direview bila memungkinkan; jangan drop/reset/repair otomatis, membuka bucket
private, atau menghapus orphan untuk membuat frontend lama bekerja.

## Blocker production

Identitas project/domain/branch Vercel; approval GitHub target/visibility/push;
production origins dan artifact preparation; baseline database dan upgrade plan;
Auth/owner/AAL2 serta secrets/functions production; backup/restore dan rollback
kompatibilitas; shared bucket dan URL sertifikat/CDN/CV lama; trusted proxy;
rekonsiliasi orphan; hosted/manual accessibility/device/performance QA yang belum
terverifikasi. Bukti staging tetap berlaku dalam scope laporan M11, bukan
otorisasi production. Regresi M01-M11 tidak diulang untuk persiapan repository.
