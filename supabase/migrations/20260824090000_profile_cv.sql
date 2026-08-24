-- =========================================================
-- PROFILE CV — DOCUMENT REFERENCE COLUMNS
--
-- Backs the public "Download CV" button with a CMS-managed file so the owner
-- can publish a newer CV without committing to the repository.
--
-- The file itself lives in the EXISTING portfolio-documents bucket, under a
-- new cv/ directory. That bucket is already public, already limited to
-- application/pdf + image/webp, and its Storage policies in
-- 20260818120000_certificate_documents.sql are scoped by bucket_id and file
-- extension rather than by path prefix:
--
--     bucket_id = 'portfolio-documents'
--     and app_private.is_owner_admin_aal2()
--     and lower(storage.extension(name)) in ('pdf', 'webp')
--
-- so cv/ is covered with NO new policy. Do not add one — widening those
-- policies would weaken every certificate document too.
--
-- Additive only. Existing rows get NULL CV columns and the public site keeps
-- serving the static repository PDF until the owner uploads one.
-- =========================================================

begin;

alter table public.profile_content
  add column if not exists cv_bucket varchar(80),
  add column if not exists cv_path text,
  add column if not exists cv_updated_at timestamptz;

-- The reference is one object: bucket and path are present together or absent
-- together. A half-written reference would render a dead download link.
-- Mirrors certificates_document_complete_check.
alter table public.profile_content
  add constraint profile_content_cv_complete_check
  check (
    (cv_bucket is null and cv_path is null)
    or
    (cv_bucket is not null and cv_path is not null)
  );

commit;

-- ---------------------------------------------------------
-- NOTES
--
--   * No cv_type column: the CV is always a PDF. The Admin field accepts
--     nothing else and the Storage extension allow-list is the backstop.
--
--   * No filename column: the download name is generated at render time from
--     profile_content.name, so it stays clean regardless of what was uploaded.
--
--   * RLS is unchanged. "Public can read profile content" is already
--     using (true), so the new columns are publicly readable — correct for a
--     public download — and writes remain owner + AAL2.
-- ---------------------------------------------------------
