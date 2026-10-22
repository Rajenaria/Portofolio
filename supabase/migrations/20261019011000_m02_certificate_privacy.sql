-- Deployment requires inventory of ALL consumers of portfolio-documents,
-- legacy public/signed URL cache review, and coordinated frontend/function rollout.
begin;

update storage.buckets set public = false where id = 'portfolio-documents';

-- Restrictive policy also blocks accidental permissive grants on this bucket.
create policy "Anonymous cannot read raw certificate documents"
on storage.objects as restrictive for select to anon
using (bucket_id <> 'portfolio-documents');

create policy "Certificate raw documents require owner AAL2"
on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'portfolio-documents' or app_private.is_owner_admin_aal2());

-- Privacy takes precedence over the historical carousel count latch.
-- Preserve historical state/table; no documents or records are deleted.
drop trigger if exists certificates_minimum_published on public.certificates;

commit;
