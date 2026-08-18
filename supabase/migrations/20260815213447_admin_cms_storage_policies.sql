-- ADMIN CMS V1 — STORAGE RLS TEMPLATE
-- Create buckets first through Supabase Dashboard / supported Storage API/config:
-- portfolio-staging = PRIVATE
-- portfolio-media   = PUBLIC
-- Recommended restrictions: image/webp only, 5 MB generated object max.

begin;

create policy "Owner AAL2 can read CMS storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('portfolio-staging', 'portfolio-media')
  and app_private.is_owner_admin_aal2()
);

create policy "Owner AAL2 can upload CMS WebP objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('portfolio-staging', 'portfolio-media')
  and app_private.is_owner_admin_aal2()
  and lower(storage.extension(name)) = 'webp'
);

create policy "Owner AAL2 can update CMS storage objects"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('portfolio-staging', 'portfolio-media')
  and app_private.is_owner_admin_aal2()
)
with check (
  bucket_id in ('portfolio-staging', 'portfolio-media')
  and app_private.is_owner_admin_aal2()
  and lower(storage.extension(name)) = 'webp'
);

create policy "Owner AAL2 can delete CMS storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('portfolio-staging', 'portfolio-media')
  and app_private.is_owner_admin_aal2()
);

commit;