-- =========================================================
-- CERTIFICATE DOCUMENTS — COLUMNS + STORAGE POLICIES
--
-- Adds the scanned certificate itself to a certificate record, plus an
-- optional external verification URL (Credly, Udemy and similar issue one,
-- and linking it is cheaper and more trustworthy than re-hosting a copy).
--
-- The file lives in a NEW bucket, portfolio-documents. portfolio-media stays
-- webp-only: that restriction is what stops an SVG or HTML file being served
-- from the storage origin, and widening it to accept PDF would give that up
-- for every image in the project.
--
-- Additive only. The public certificate section is still static in this phase.
-- =========================================================

begin;

alter table public.certificates
  add column if not exists document_bucket varchar(80),
  add column if not exists document_path text,
  add column if not exists document_type varchar(10),
  add column if not exists external_url text;

-- Only the two shapes the pipeline can produce. A PDF is stored as uploaded;
-- anything image-shaped is re-encoded to WebP by the existing image processor,
-- which also strips metadata and guarantees the bytes really are an image.
alter table public.certificates
  add constraint certificates_document_type_check
  check (document_type is null or document_type in ('pdf', 'webp'));

-- The three document columns describe one object, so they are present or
-- absent together. A half-written reference would render a broken link.
alter table public.certificates
  add constraint certificates_document_complete_check
  check (
    (document_bucket is null and document_path is null and document_type is null)
    or
    (document_bucket is not null and document_path is not null and document_type is not null)
  );

-- Matches projects_github_url_check: NULL, empty, or an absolute http(s) URL.
-- javascript:, data:, vbscript:, file: and protocol-relative //host cannot
-- match an anchored ^https?:// prefix.
alter table public.certificates
  add constraint certificates_external_url_check
  check (
    external_url is null
    or external_url = ''
    or external_url ~* '^https?://[^[:space:]]+$'
  );


-- ---------------------------------------------------------
-- STORAGE POLICIES — portfolio-documents
--
-- Create the bucket first (supabase/config.toml locally, Dashboard on the
-- hosted project): public = true, 10 MB limit,
-- allowed_mime_types = application/pdf, image/webp.
--
-- The bucket is public, so anonymous READ needs no policy — the public
-- endpoint serves it, exactly as portfolio-media already works. Everything
-- that writes is owner + aal2 only, and the extension allow-list is enforced
-- here as well as by the bucket's MIME list.
-- ---------------------------------------------------------

create policy "Owner AAL2 can read certificate documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'portfolio-documents'
  and app_private.is_owner_admin_aal2()
);

create policy "Owner AAL2 can upload certificate documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'portfolio-documents'
  and app_private.is_owner_admin_aal2()
  and lower(storage.extension(name)) in ('pdf', 'webp')
);

create policy "Owner AAL2 can update certificate documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'portfolio-documents'
  and app_private.is_owner_admin_aal2()
)
with check (
  bucket_id = 'portfolio-documents'
  and app_private.is_owner_admin_aal2()
  and lower(storage.extension(name)) in ('pdf', 'webp')
);

create policy "Owner AAL2 can delete certificate documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'portfolio-documents'
  and app_private.is_owner_admin_aal2()
);

commit;
