-- ADMIN CMS V1 — RLS TEMPLATE
-- Requires schema migration first.

begin;

create or replace function app_private.is_owner_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.admin_users au
    where au.user_id = (select auth.uid())
  );
$$;

create or replace function app_private.is_owner_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_owner_admin()
     and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

revoke all on function app_private.is_owner_admin() from public;
revoke all on function app_private.is_owner_admin_aal2() from public;

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_owner_admin() to authenticated;
grant execute on function app_private.is_owner_admin_aal2() to authenticated;

revoke all on table app_private.admin_users from anon, authenticated;
alter table app_private.admin_users enable row level security;

alter table public.profile_content enable row level security;
alter table public.hero_media enable row level security;
alter table public.about_interests enable row level security;
alter table public.about_organization enable row level security;
alter table public.about_organization_skills enable row level security;
alter table public.about_gallery enable row level security;
alter table public.experiences enable row level security;
alter table public.experience_tags enable row level security;
alter table public.projects enable row level security;
alter table public.project_paragraphs enable row level security;
alter table public.project_media enable row level security;
alter table public.technologies enable row level security;
alter table public.project_technologies enable row level security;

revoke all on table
  public.profile_content,
  public.hero_media,
  public.about_interests,
  public.about_organization,
  public.about_organization_skills,
  public.about_gallery,
  public.experiences,
  public.experience_tags,
  public.projects,
  public.project_paragraphs,
  public.project_media,
  public.technologies,
  public.project_technologies
from anon, authenticated;

grant select on table
  public.profile_content,
  public.hero_media,
  public.about_interests,
  public.about_organization,
  public.about_organization_skills,
  public.about_gallery,
  public.experiences,
  public.experience_tags,
  public.projects,
  public.project_paragraphs,
  public.project_media,
  public.technologies,
  public.project_technologies
to anon, authenticated;

grant update on table
  public.profile_content,
  public.hero_media,
  public.about_organization
to authenticated;

grant insert, update, delete on table
  public.about_interests,
  public.about_organization_skills,
  public.about_gallery,
  public.experiences,
  public.experience_tags,
  public.projects,
  public.project_paragraphs,
  public.project_media,
  public.project_technologies
to authenticated;

grant insert, update on table public.technologies to authenticated;

-- Public read policies.
create policy "Public can read profile content"
on public.profile_content for select to anon, authenticated
using (true);

create policy "Public can read configured hero media"
on public.hero_media for select to anon, authenticated
using (desktop_path is not null and mobile_path is not null);

create policy "Public can read active about interests"
on public.about_interests for select to anon, authenticated
using (is_active = true);

create policy "Public can read organization content"
on public.about_organization for select to anon, authenticated
using (true);

create policy "Public can read active organization skills"
on public.about_organization_skills for select to anon, authenticated
using (is_active = true);

create policy "Public can read active about gallery"
on public.about_gallery for select to anon, authenticated
using (is_active = true);

create policy "Public can read published experiences"
on public.experiences for select to anon, authenticated
using (status = 'published' and deleted_at is null);

create policy "Public can read tags for published experiences"
on public.experience_tags for select to anon, authenticated
using (
  exists (
    select 1 from public.experiences e
    where e.id = experience_tags.experience_id
      and e.status = 'published'
      and e.deleted_at is null
  )
);

create policy "Public can read published projects"
on public.projects for select to anon, authenticated
using (status = 'published' and deleted_at is null);

create policy "Public can read paragraphs for published projects"
on public.project_paragraphs for select to anon, authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_paragraphs.project_id
      and p.status = 'published'
      and p.deleted_at is null
  )
);

create policy "Public can read media for published projects"
on public.project_media for select to anon, authenticated
using (
  is_active = true
  and exists (
    select 1 from public.projects p
    where p.id = project_media.project_id
      and p.status = 'published'
      and p.deleted_at is null
  )
);

create policy "Public can read project technology relationships"
on public.project_technologies for select to anon, authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_technologies.project_id
      and p.status = 'published'
      and p.deleted_at is null
  )
);

create policy "Public can read available technologies"
on public.technologies for select to anon, authenticated
using (
  is_active = true
  or exists (
    select 1
    from public.project_technologies pt
    join public.projects p on p.id = pt.project_id
    where pt.technology_id = technologies.id
      and p.status = 'published'
      and p.deleted_at is null
  )
);

-- Owner AAL2 policies.
create policy "Owner AAL2 can read profile content"
on public.profile_content for select to authenticated
using (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can update profile content"
on public.profile_content for update to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can read all hero media"
on public.hero_media for select to authenticated
using (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can update hero media"
on public.hero_media for update to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2() and slot_number between 1 and 3);

create policy "Owner AAL2 can read organization content"
on public.about_organization for select to authenticated
using (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can update organization content"
on public.about_organization for update to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages about interests"
on public.about_interests for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages organization skills"
on public.about_organization_skills for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages about gallery"
on public.about_gallery for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages experiences"
on public.experiences for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages experience tags"
on public.experience_tags for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages projects"
on public.projects for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages project paragraphs"
on public.project_paragraphs for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages project media"
on public.project_media for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 manages project technologies"
on public.project_technologies for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can read all technologies"
on public.technologies for select to authenticated
using (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can add technologies"
on public.technologies for insert to authenticated
with check (app_private.is_owner_admin_aal2());

create policy "Owner AAL2 can update technologies"
on public.technologies for update to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());

commit;