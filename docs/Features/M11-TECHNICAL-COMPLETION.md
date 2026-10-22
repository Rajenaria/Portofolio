# M11 â€” Staging Integration & Production Release Review

Status: **M11 â€” STAGING VERIFIED / PRODUCTION RELEASE REVIEW**.
Tanggal: **2026-10-23 WIB**. Status ini hanya untuk scope staging dan kasus yang
benar-benar diperiksa. Production tetap NONAKTIF; tidak ada otorisasi rilis.

Target eksklusif: `portfolio-staging` / `maeypddmikxcvyakvkbk`, Mumbai.
Readback platform **01:30:04 WIB**: ACTIVE_HEALTHY, tujuh fungsi ACTIVE v1.
Readback Auth/CMS/Storage **01:33:02 WIB**: owner server-verified AAL2, lima bucket,
project DEMO published v7, draft v6, serta tiga objek CV tetap tersimpan.
18 migration berasal dari bootstrap yang sudah diverifikasi sebelumnya; **tidak
ada replay migration, DDL, perubahan grants/RLS/ownership atau reset pada resume ini**.

## Hasil eksekutif

| Area | Status | Hasil aktual |
| --- | --- | --- |
| Edge deployment | STAGING VERIFIED | 7/7 ACTIVE, CLI 2.114.0 `--use-api`, manifest15file dan executable dipin. |
| Secret | STAGING VERIFIED | Satu secret custom RATE_LIMIT_PEPPER; trusted proxy header tetap unset. SUPABASE_* disediakan platform, bukan ditulis operator. |
| Auth/MFA | STAGING VERIFIED | Owner yang terdaftar dan nonowner sintetis login password, enroll/challenge/verify TOTP nyata, server getUser dan AAL2. |
| CMS, security, concurrency | STAGING VERIFIED | **119 PASS, 0 FAIL** server/runtime; rincian di bawah. |
| Browser frontend asli + backend nyata | LOCAL + STAGING VERIFIED | **44 PASS, 0 FAIL**, Chrome/Edge, UI admin dan public, tanpa deployment frontend. |
| Regresi fixture final | LOCAL VERIFIED | **1053 assertion PASS, 0 FAIL**, 19 invocation relevan exit0. |
| Release plan | STATIC REVIEWED | Baseline/backup/rollout/recovery disiapkan; eksekusi production belum diizinkan. |

Matriks lengkap dan evidence: [M11-STAGING-TEST-MATRIX.json](M11-STAGING-TEST-MATRIX.json).
Hasil lama 54/28 tetap historis, tidak ditambahkan lagi sebagai kasus unik pada
119/44. Regresi1053 benar-benar dijalankan ulang sekali pada fase final ini.

## Blocker PAT diselesaikan

Owner mengonfirmasi token sebelumnya hanya Read untuk Edge Functions/Secrets,
dengan role akun Owner. Token pengganti project-scoped Read-write kemudian
berhasil menulis secret dan deploy tujuh fungsi. Tidak ada pergantian ke classic
account-wide token, perubahan role/grant, atau bypass dengan service-role SQL.
Credential diterima lewat PowerShell SecureString, dikirim via stdin, dan hanya
berada dalam RAM proses. CLI menerima PAT melalui child environment, tanpa
password/token di argv atau `supabase login`/link tersimpan.

Fungsi terpasang: `submit-comment`, `certificate-document`, `manage-cv`,
`cv-document`, `manage-project`, `project-asset`, `project-media`.
Semuanya `verify_jwt=false` sesuai kontrak reviewed: delivery publik memeriksa
status/referensi setiap permintaan, sedangkan handler admin memverifikasi user dan
RPC owner+AAL2. Gateway flag tersebut tidak menggantikan otorisasi server.

## Matriks server nyata

| Kelompok | PASS | Bukti |
| --- | ---: | --- |
| Auth password/TOTP/AAL2 | 19 | Owner registered AAL2 diizinkan; nonowner AAL2 ditolak. |
| Projects upload/draft/publish/CAS | 23 | Original/desktop/mobile, private preview, tujuh section, snapshot separation, idempotency. |
| CV | 14 | Upload/aktivasi/retry, dua concurrent replacement, inactive404, no-store/attachment, PDF invalid, direct-write denial. |
| Sertifikat | 16 | Draft/publish/hide/archive, delivery, replacement gagal/recovery, file lama dipertahankan. |
| Guestbook | 7 | Approved/blocked, lima concurrent request pada satu slot tersisa, 1 accepted/4 rate-limited, public filtering. |
| Status/publish recovery | 19 | Hide/Archive/Show, media incomplete, previous snapshot utuh, recovery save, publish CAS. |
| Security denial tambahan | 11 | Nonowner admin endpoints, service-only RPC, RLS no-side-effect, private CV/sertifikat. |
| Public-URL-style private Storage | 3 | File diketahui ada; jalur `/object/public/` mengembalikan400 untuk cert/CV/original. |
| Runtime tujuh fungsi | 7 | Method/validation/anonymous denial sesuai kontrak. |
| **Total** | **119** | **0 FAIL pada kasus final ini.** |

Dua save bersamaan dan dua publish bersamaan masing-masing menghasilkan satu
200 dan satu409; dua replacement CV juga satu pemenang. Ini concurrency nyata
melalui Edge/PostgreSQL, bukan CAS double. Tidak membuktikan seluruh jadwal
interleaving atau kegagalan server/process crash.

Retry publish dengan operation UUID yang sama tidak menambah publication version.
Query operation mengonfirmasi commit. Publish media yang belum ready ditolak,
snapshot published tetap identik dan original tetap tersedia untuk owner;
recovery memakai draft valid tanpa menghapus file.

CV aktif diunduh dengan hash yang benar, attachment, nosniff dan no-store. Versi
lama ditolak endpoint namun tetap private untuk recovery. Lima percobaan upload
per window ditegakkan; malformed PDF ditolak dan metadata aktif tetap utuh.
Update CV lewat profile umum serta upload raw oleh owner ditolak. Hero/footer
menggunakan satu URL versi aktif yang sama dan download browser cocok byte-for-byte.

Sertifikat draft/Hide/archive ditolak pada permintaan baru. Replacement yang
menghadapi constraint error tidak mengganti referensi lama; retry update valid
berhasil. Dokumen lama tidak dihapus. Kebijakan ini tidak menarik kembali file
yang sudah diunduh atau respons yang sedang berlangsung.

Guestbook menyimpan tiga pesan sintetis: dua approved, satu blocked. Lima request
bersamaan dengan satu slot tersisa menghasilkan satu201 dan empat429. Header
forwarded palsu tidak melewati limiter. Moderasi otomatis diuji; tidak dibuat
fitur dashboard moderasi baru.

## Browser asli dan QA

Chrome/Edge memakai temporary profile baru, interception sebelum aplikasi dimuat,
deny proxy/DNS, dan relay Node HTTPS yang hanya menerima origin staging. Nol
koneksi browser langsung lolos; **ada koneksi staging nyata melalui relay**, bukan
klaim nol network keseluruhan. Tidak ada request production. CORS backend asli
dipertahankan, kecuali respons error sintetis untuk satu pengujian ack-loss.

44 pemeriksaan final mencakup:

- Card/category CMS nyata, tujuh section case-study, architecture keyboard, alt text.
- Desktop1440/tablet768/mobile390, tidak ada overflow, reduced motion dan temporary-profile cleanup.
- Kedua legacy detail routes tetap dapat dibuka.
- Login UI admin password -> live AAL1 denial -> TOTP -> genuine AAL2.
- Editor asli, preview draft, upload replacement original + desktop/mobile, crop contain/X, Save Draft dan snapshot published tetap utuh.
- Publish UI dan rekonsiliasi setelah **respons sengaja dihilangkan relay setelah commit200 nyata**. UI menandai UNCONFIRMED dan memblokir retry buta; Rekonsiliasi menemukan commit tanpa publish ulang.
- CV aktif benar-benar diunduh browser, sesuai hash PDF fixture.

Final capture: tidak ada Runtime exception, console API error/warning, atau
backend HTTP error pada alur browser normal yang direkam. Error503 ack-loss
merupakan injeksi relay yang disengaja; denial/409/429 pada API suite merupakan
hasil yang diharapkan. CDN eksternal diblokir, bukan diuji sebagai deployment nyata.

Lab navigasi awal dengan backend staging: Chrome LCP872ms/CLS0.01959;
Edge LCP912ms/CLS0.01479. Resize tablet/mobile berasal dari navigasi sama, bukan
CWV mobile independen. Enam pengukuran fixture terpisah: desktop LCP
1568/1844/1800ms, mobile emulated CPU4 LCP2456/1896/2304ms (mobile CLS0).
Mode performance baseline tidak menghasilkan assertion; tidak dihitung sebagai
PASS tambahan. Ini bukan metrik lapangan, production, Lighthouse score atau INP.

NOT VERIFIED: perangkat fisik, screen reader, zoom native200%, hosted frontend,
CSP/header Vercel nyata, third-party CDN fidelity dan field performance.

## Hasil harness yang tidak disembunyikan

Evidence tiga percobaan browser awal dipertahankan: allowlist legacy tidak
lengkap, readiness form login yang terlalu dini, serta satu CMS abort saat suite
browser berat lain berjalan. Perebutan resource adalah hipotesis untuk kasus
terakhir; tidak dinyatakan sebagai root cause production. Setelah perbaikan
harness dan eksekusi terpisah, final44PASS tanpa perubahan aplikasi.

Dua helper readback gagal karena menganggap catalog asset menyertakan component
metadata, padahal kontraknya hanya id/state/provenance. Helper diperbaiki;
readback17 selesai. Kegagalan ini bukan kegagalan fungsi atau database.

Regresi final1053 mencakup M01, M02, M03, metadataM04, M05, M06, M09, adminM10,
environmentM11 dan preview. `test-m04-projects` historis NOT RUN karena carousel
sudah diganti grid M09; `test-m10-structure` NOT RUN karena memerlukan baseline
pre-M10. Coverage M04 metadata/M09 grid dan preservation audit diperiksa terpisah;
kedua harness tersebut tidak ditandai PASS. Pixel equivalence13pasang M10 tidak
dijalankan ulang. `npm test` placeholder dan lint/build yang tidak tersedia tidak
diklaim lulus.

## Resource dan perubahan

Tidak ada source aplikasi, function, migration, dependency atau UI yang diubah
pada resume integration ini. Deploy memakai source/manifest reviewed yang sama.
Lima perubahan source M11 terdahulu (SQL18 dan pin SDK empat fungsi) dipertahankan.
SHA migration18 tetap:
`35aef7579c1851b288ee6895a11864e5a36e561d0fdfb4b5f507c7877029c851`.

Mutasi staging yang diotorisasi:

- Tujuh deployment fungsi v1 dan satu custom secret RATE_LIMIT_PEPPER.
- Recovery hanya owner sintetis yang disetujui: password fixture diganti, satu faktor lama dihapus, faktor TOTP baru dienroll dan verified. Satu nonowner sintetis baru dan faktornya dibuat; user lama lainnya tidak dihapus.
- Satu project DEMO, snapshots/draft, tiga registry asset: dua ready dan satu uploading yang sengaja dipertahankan setelah negative test.
- Tiga versi CV private; satu aktif dan dua retained. Dua dokumen sertifikat private dan satu record sertifikat DEMO.
- Tiga komentar sintetis untuk moderation/rate-limit.

Owner: `0c7a0d2a-26ae-44f5-9066-5d0fe5604bc5`.
Nonowner baru: `67810510-bb26-4cc6-a276-c37b1ae9112f`.
Project: `3b8940d2-521a-4ca5-97ff-7068233947e4` (publication7/draft6).
Judul fixture akhir mengandung "PRIVATE DRAFT" karena dipakai negative test,
kemudian **secara eksplisit dipublikasikan melalui tombol Publish Draft**;
bukan publikasi akibat Save Draft.

Tidak ada deletion database/Storage, cleanup orphan atau pengubahan owner registry
lagi. File CV/cert lama, incomplete original dan object DEMO42byte sesi awal
semuanya dipertahankan. Password/TOTP/session/server key tidak disimpan di repo,
laporan atau artifact frontend. Sesi credential ditutup setelah final review.

## Security findings dan release gates

| ID | Severity | Status / tindakan |
| --- | --- | --- |
| M11-SEC-01 | HIGH release gate | Trusted proxy belum terbukti pada hosting production. Staging header unset memakai shared fail-safe budget; verifikasi overwrite/provenance header sebelum per-client rate limiting. Jangan mempercayai forwarded header client. |
| M11-SEC-02 | HIGH release gate | Audit URL sertifikat publik lama, CDN cache dan konsumen bucket bersama sebelum cutover. Staging public-URL-style denial lulus, historical production cache NOT VERIFIED. |
| M11-SEC-03 | HIGH release gate | Baseline/schema/history/owner/Storage production belum diperiksa atau dimigrasikan. Jangan memakai hasil fresh staging bootstrap sebagai bukti upgrade production aman. |
| M11-SEC-04 | MEDIUM recovery requirement | Incomplete/orphan/ambiguous objects harus direkonsiliasi dengan seluruh snapshot/draft/referensi sebelum cleanup; tidak ada deletion otomatis. |
| M11-SEC-05 | MEDIUM verification gap | DB/Storage outage, process-crash dan commit-boundary fault injection tidak dilakukan. Ack-loss relay dan constraint/incomplete-media failure diuji, bukan jaminan semua failure mode. |

Tidak ada defect aplikasi/security kritis yang terdeteksi pada kasus staging yang
dijalankan. Ini bukan jaminan keamanan menyeluruh atau persetujuan production.

## Production migration, environment dan deployment plan

1. Owner mengonfirmasi target production, exact origin publik/admin, hak akses, hosting, biaya/kuota dan window rilis. Domain `portofolio-rajenaria.vercel.app` tetap CANDIDATE ONLY; tidak ada wildcard vercel.app. Konfigurasi production checkout tetap null/fail-closed.
2. Dengan izin production terpisah, baca baseline history/schema/grants/RLS/extensions/owner/Storage dan seluruh konsumen bucket. Susun upgrade berdasarkan versi yang benar-benar belum applied; jangan replay18versi atau repair/reset otomatis.
3. Gunakan [manifest18file](../Database/M11-MIGRATION-MANIFEST.json). Migration1 IF EXISTS dan migration11 lima sertifikat DEMO adalah varian **staging-only**. Jangan menerapkan DEMO seed ke production. Original pg_net DROP harus diperiksa dependencies/keberadaannya, bukan dianggap aman karena staging variant lulus.
4. Source migration18 sudah sesuai varian approved/applied staging. Jika versi itu ternyata sudah ada dengan body berbeda di production, hentikan dan review forward migration terpisah; jangan mengubah history atau memaksa replay.
5. Siapkan backup database yang terenkripsi, manifest/grants/RLS, Auth recovery yang aman serta **isi objek Storage + metadata**. Backup DB tidak menggantikan backup file Storage. Verifikasi kelengkapan/hash dan latihan restore di lingkungan terpisah yang diotorisasi; belum dijalankan pada tahap ini.
6. Siapkan secret server khusus production, RATE_LIMIT_PEPPER terpisah, trusted proxy yang terverifikasi, exact origin/CORS/CSP serta owner UUID production. Publishable key hanya di konfigurasi client; service-role/PAT/password hanya di server/operator aman. Jangan menyalin credential staging.
7. Lakukan rollout schema/bucket/Edge dalam window terkoordinasi, sesuai baseline dan dependency approved. Private certificate bucket tidak boleh dibuka kembali sebagai jalan pintas. Endpoint delivery harus sehat sebelum link frontend diaktifkan; rencanakan maintenance/transition untuk konsumen lama.
8. Verifikasi seluruh endpoint, permissions, owner+AAL1 denial/AAL2 success, RLS, Storage dan no-store di target production yang diizinkan. Baru aktifkan artifact frontend dengan konfigurasi exact target. Tidak ada domain/hosting publik baru dibuat di M11 ini.
9. Smoke test dan monitor dengan izin terpisah: errors, rate-limit, login, CAS, CV aktif, certificate revocation dan private originals. Putuskan transisi CV statis historis dan cache/CDN sebelum menyatakan privacy/revocation production aktif.

## Rollback dan recovery

- Jika hasil write ambigu: hentikan jalur terkait, baca operation/history/schema/reference/objek, lalu rekonsiliasi. Jangan mengulang chain, melakukan migration repair/reset, atau menghapus file untuk membersihkan error.
- Rollback frontend/Edge hanya ke artifact yang kompatibel dengan schema baru dan kontrak private delivery. Jangan mengembalikan bucket menjadi public atau melemahkan RLS/Auth demi kompatibilitas.
- Pertahankan snapshot published dan versi CV lama. Aktivasi ulang/recovery data harus melalui jalur server tervalidasi dan CAS dengan izin yang sesuai; jangan menulis metadata CV lewat profile umum.
- Restore database/Storage hanya dengan persetujuan eksplisit, scope dan manifest yang jelas. Tidak ada down migration, restore atau cleanup otomatis dalam paket ini.
- Tindak lanjut produk tetap: favicon DEFER, expanded hero geometry OPEN, E-Commerce membutuhkan materi asli owner; tidak diubah untuk QA.

## Evidence dan checkpoint

Workspace integration:
`D:\CodexTooling\portfolio-staging-m11-03a-20261022\m11-integration-1792692380316`.

- Platform: `evidence/result-001.json` (secret), `result-002.json` (deploy7), `result-003.json` (runtime7), `result-004.json` (readback).
- Auth/CMS: `auth-session/evidence/result-003/004/005/006/007/011/012/015.json`.
- Browser final: `auth-session/evidence/result-013.json` dan `D:\CodexTooling\portfolio-staging-m11-03a-20261022\m11-integration-1792692380316\auth-session\artifacts\browser-staging-1792693659043/browser-staging-results.json`.
- Final Auth/CMS/Storage: `auth-session/evidence/result-017.json`.
- Final fixture: `evidence/local-regression-final.json`, seluruh stdout/stderr tetap tersedia.
- Preservation, diff, secret-pattern scan, Git dan session closure: `evidence/final-review.json`.

Git tidak distage/commit/push. M11 berhenti pada **STAGING VERIFIED / PRODUCTION
RELEASE REVIEW**; production release dan aktivitas cloud berikutnya tetap
memerlukan scope/otorisasi yang sesuai. Tidak memulai milestone lain otomatis.

Pemeriksaan akhir **PASS**: preservation223file, 18 checksum migration source,
seluruh function source sesuai deployment manifest, dan `git diff --check`.
Scan pola secret terhadap923file menemukan hanya invalid-key fixture yang
sengaja dipakai test penolakan; tidak ada credential nyata terdeteksi oleh scan
tersebut. Ini bukan jaminan exhaustive secret scanning.

Kedua sesi credential ditutup dan `credentialsDiscarded=true` terkonfirmasi pada
**01:38:45 WIB**. Fixture login/TOTP sesi ini tidak disimpan untuk penggunaan
berikutnya; recovery berikutnya harus diotorisasi, bukan mengambil secret dari DB.

Git akhir: **31 modified, 9 untracked, 0 staged**. Branch `backup/portfolio-m06`,
HEAD `5e1691de7f750365543030486cf399e59c44d0f7`. Pada resume ini hanya laporan M11,
tracking historis M11-02, matriks pengujian baru, dan dua paragraf konteks
`PROJECT.md` diperbarui; perubahan source existing lainnya dipertahankan.
