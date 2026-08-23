-- =========================================================
-- PUBLIC CONTENT TRANSLATIONS (Indonesian)
--
-- Adds one additive `translations jsonb` column to every table that holds
-- genuinely owner-authored, language-dependent free text rendered on the
-- PUBLIC site. English stays the canonical language in the existing
-- columns, exactly as authored today; nothing here is renamed, dropped or
-- rewritten.
--
-- SHAPE
--   translations = { "id": { "<column>": "<Indonesian text>", ... } }
--
-- Only the "id" key is used today (the public site is EN/ID), but the
-- shape leaves room for another language key later without another
-- migration. A column absent from translations.id, or present but blank,
-- means "not translated yet" and the public site falls back to the
-- English column for that field only — see js/cms/localize.js. This is a
-- resolver-level rule, not a database rule: the database does not enforce
-- fallback, it only stores whatever translations the Admin saved.
--
-- WHAT IS DELIBERATELY NOT HERE
--   - public.technologies: names are product/language names, not prose,
--     and are never translated (see project i18n spec Part C).
--   - public.experience_tags: short skill/tech-style tags, same reasoning
--     as technologies.
--   - Every technical/structural column on every table (id, slug, status,
--     sort_order, published_at/archived_at/deleted_at/created_at/
--     updated_at, storage bucket/path columns, category, icon_key,
--     external_url, github_url, demo_url, project_date) — none of those
--     are language-dependent.
--   - public.profile_content.name — a proper noun.
--   - public.experiences.location / .type, public.certificates.publisher
--     — place name / enum-like / organisation name, not owner prose.
--
-- SECURITY
-- translations is ordinary CMS content. It inherits the exact same RLS
-- policies as the rest of each row (public SELECT of published rows,
-- authenticated + AAL2 owner for INSERT/UPDATE/DELETE) — a new column
-- does not need new policies or new grants; PostgreSQL privileges and RLS
-- are row/table-scoped, not column-scoped, and the existing GRANT SELECT /
-- GRANT INSERT, UPDATE, DELETE statements for these tables already cover
-- it.
--
-- Additive only. No historical migration is edited. Existing rows get
-- translations = '{}'::jsonb — English shows unchanged, Indonesian falls
-- back to English until the owner fills something in through the Admin.
-- =========================================================

begin;


-- ---------------------------------------------------------
-- PROFILE / HERO / ABOUT
-- ---------------------------------------------------------

alter table public.profile_content
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.profile_content
  add constraint profile_content_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.hero_media
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.hero_media
  add constraint hero_media_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.about_interests
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.about_interests
  add constraint about_interests_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.about_organization
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.about_organization
  add constraint about_organization_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.about_organization_skills
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.about_organization_skills
  add constraint about_organization_skills_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.about_gallery
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.about_gallery
  add constraint about_gallery_translations_is_object
  check (jsonb_typeof(translations) = 'object');


-- ---------------------------------------------------------
-- EXPERIENCE
-- ---------------------------------------------------------

alter table public.experiences
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.experiences
  add constraint experiences_translations_is_object
  check (jsonb_typeof(translations) = 'object');


-- ---------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------

alter table public.projects
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.projects
  add constraint projects_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.project_paragraphs
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.project_paragraphs
  add constraint project_paragraphs_translations_is_object
  check (jsonb_typeof(translations) = 'object');

alter table public.project_media
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.project_media
  add constraint project_media_translations_is_object
  check (jsonb_typeof(translations) = 'object');


-- ---------------------------------------------------------
-- CERTIFICATES
-- ---------------------------------------------------------

alter table public.certificates
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.certificates
  add constraint certificates_translations_is_object
  check (jsonb_typeof(translations) = 'object');


commit;
