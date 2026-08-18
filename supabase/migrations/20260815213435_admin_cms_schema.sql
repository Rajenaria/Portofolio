-- ADMIN CMS V1 — SCHEMA TEMPLATE
-- DO NOT RUN ON PRODUCTION UNTIL THE REMOTE BASELINE HAS BEEN PULLED AND REVIEWED.

begin;

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists app_private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  singleton_key smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_singleton_key_check check (singleton_key = 1),
  constraint admin_users_singleton_key_unique unique (singleton_key)
);

create table if not exists public.profile_content (
  id uuid primary key default gen_random_uuid(),
  singleton_key smallint not null default 1,
  name varchar(100),
  professional_title varchar(160),
  hero_description varchar(600),
  about_heading_main varchar(160),
  about_heading_highlight varchar(160),
  about_lead varchar(600),
  about_description text,
  about_photo_bucket varchar(80),
  about_photo_desktop_path text,
  about_photo_mobile_path text,
  about_photo_alt varchar(250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_content_singleton_key_check check (singleton_key = 1),
  constraint profile_content_singleton_key_unique unique (singleton_key)
);

create table if not exists public.hero_media (
  slot_number smallint primary key,
  bucket_name varchar(80),
  desktop_path text,
  mobile_path text,
  alt_text varchar(250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_media_slot_number_check check (slot_number between 1 and 3)
);

create table if not exists public.about_interests (
  id uuid primary key default gen_random_uuid(),
  label varchar(120) not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.about_organization (
  id uuid primary key default gen_random_uuid(),
  singleton_key smallint not null default 1,
  heading_main varchar(160),
  heading_highlight varchar(160),
  paragraph_1 text,
  paragraph_2 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint about_organization_singleton_key_check check (singleton_key = 1),
  constraint about_organization_singleton_key_unique unique (singleton_key)
);

create table if not exists public.about_organization_skills (
  id uuid primary key default gen_random_uuid(),
  title varchar(120) not null,
  description varchar(500) not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.about_gallery (
  id uuid primary key default gen_random_uuid(),
  bucket_name varchar(80) not null,
  desktop_path text not null,
  mobile_path text not null,
  alt_text varchar(250) not null,
  caption varchar(300),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  type varchar(80),
  title varchar(160) not null,
  role varchar(180),
  location varchar(180),
  description text,
  status varchar(20) not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiences_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.experience_tags (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  label varchar(100) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug varchar(140) not null unique,
  title varchar(180) not null,
  card_category varchar(100),
  short_description varchar(400),
  detail_title_main varchar(180),
  detail_title_highlight varchar(180),
  detail_intro text,
  role varchar(180),
  project_date date,
  project_type varchar(140),
  about_heading varchar(220),
  cover_bucket varchar(80),
  cover_desktop_path text,
  cover_mobile_path text,
  cover_alt varchar(250),
  github_url text,
  demo_url text,
  featured boolean not null default false,
  sort_order integer not null default 0,
  status varchar(20) not null default 'draft',
  published_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint projects_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.project_paragraphs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  content text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  bucket_name varchar(80) not null,
  desktop_path text not null,
  mobile_path text not null,
  alt_text varchar(250),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.technologies (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  slug varchar(120) not null unique,
  icon_key varchar(120),
  public_group varchar(40),
  show_in_public_stack boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technologies_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint technologies_public_group_check check (
    public_group is null or public_group in ('languages', 'development_systems', 'tools_platforms')
  ),
  constraint technologies_public_group_required_check check (
    show_in_public_stack = false or public_group is not null
  )
);

create table if not exists public.project_technologies (
  project_id uuid not null references public.projects(id) on delete cascade,
  technology_id uuid not null references public.technologies(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (project_id, technology_id)
);

create unique index if not exists technologies_name_lower_unique
  on public.technologies (lower(name));

create unique index if not exists experience_tags_experience_label_lower_unique
  on public.experience_tags (experience_id, lower(label));

create index if not exists experiences_public_order_idx
  on public.experiences (status, deleted_at, sort_order, created_at);

create index if not exists experiences_updated_at_idx
  on public.experiences (updated_at desc);

create index if not exists experience_tags_order_idx
  on public.experience_tags (experience_id, sort_order);

create index if not exists projects_public_order_idx
  on public.projects (status, deleted_at, sort_order, created_at);

create index if not exists projects_updated_at_idx
  on public.projects (updated_at desc);

create index if not exists project_paragraphs_order_idx
  on public.project_paragraphs (project_id, sort_order);

create index if not exists project_media_order_idx
  on public.project_media (project_id, is_active, sort_order);

create index if not exists technologies_public_stack_idx
  on public.technologies (is_active, show_in_public_stack, public_group, sort_order);

create index if not exists project_technologies_order_idx
  on public.project_technologies (project_id, sort_order);

create index if not exists project_technologies_technology_idx
  on public.project_technologies (technology_id);

create index if not exists about_interests_order_idx
  on public.about_interests (is_active, sort_order);

create index if not exists about_organization_skills_order_idx
  on public.about_organization_skills (is_active, sort_order);

create index if not exists about_gallery_order_idx
  on public.about_gallery (is_active, sort_order);

drop trigger if exists admin_users_set_updated_at on app_private.admin_users;
create trigger admin_users_set_updated_at
before update on app_private.admin_users
for each row execute function app_private.set_updated_at();

drop trigger if exists profile_content_set_updated_at on public.profile_content;
create trigger profile_content_set_updated_at
before update on public.profile_content
for each row execute function app_private.set_updated_at();

drop trigger if exists hero_media_set_updated_at on public.hero_media;
create trigger hero_media_set_updated_at
before update on public.hero_media
for each row execute function app_private.set_updated_at();

drop trigger if exists about_interests_set_updated_at on public.about_interests;
create trigger about_interests_set_updated_at
before update on public.about_interests
for each row execute function app_private.set_updated_at();

drop trigger if exists about_organization_set_updated_at on public.about_organization;
create trigger about_organization_set_updated_at
before update on public.about_organization
for each row execute function app_private.set_updated_at();

drop trigger if exists about_organization_skills_set_updated_at on public.about_organization_skills;
create trigger about_organization_skills_set_updated_at
before update on public.about_organization_skills
for each row execute function app_private.set_updated_at();

drop trigger if exists about_gallery_set_updated_at on public.about_gallery;
create trigger about_gallery_set_updated_at
before update on public.about_gallery
for each row execute function app_private.set_updated_at();

drop trigger if exists experiences_set_updated_at on public.experiences;
create trigger experiences_set_updated_at
before update on public.experiences
for each row execute function app_private.set_updated_at();

drop trigger if exists experience_tags_set_updated_at on public.experience_tags;
create trigger experience_tags_set_updated_at
before update on public.experience_tags
for each row execute function app_private.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function app_private.set_updated_at();

drop trigger if exists project_paragraphs_set_updated_at on public.project_paragraphs;
create trigger project_paragraphs_set_updated_at
before update on public.project_paragraphs
for each row execute function app_private.set_updated_at();

drop trigger if exists project_media_set_updated_at on public.project_media;
create trigger project_media_set_updated_at
before update on public.project_media
for each row execute function app_private.set_updated_at();

drop trigger if exists technologies_set_updated_at on public.technologies;
create trigger technologies_set_updated_at
before update on public.technologies
for each row execute function app_private.set_updated_at();

commit;