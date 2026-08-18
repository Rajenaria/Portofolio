-- =========================================================
-- CERTIFICATES — TABLE, INDEXES, GRANTS, RLS
--
-- Backs the public Sertifikat section, which until now has been a
-- hardcoded array in js/certificates.js. This migration only creates
-- the storage and the access rules; the public site keeps rendering
-- its static array and is not touched by this phase.
--
-- Shape follows the existing top-level content tables (experiences,
-- projects): status + sort_order + published_at/archived_at/deleted_at,
-- so the Admin lifecycle the owner already knows — Draft, Published,
-- Archived, Trash — applies here unchanged.
--
-- Additive only. No historical migration is edited.
-- =========================================================

begin;


-- ---------------------------------------------------------
-- 1. TABLE
--
-- Column lengths are taken from what the card actually renders, not
-- invented. The longest real values today are "Hak Cipta: Cuacane
-- Application" (30), "LAC Telkom University" (21), "2021 — 2025" (11),
-- "Universitas Telkom · Bandung" (28) and "GPA 3.51/4.00" (13), so the
-- caps below are generous without being meaningless.
--
-- FRONT of the card  : title, publisher, period, category (-> icon)
-- BACK of the card   : title (shared), issuer_line, badge_text,
--                      description
--
-- `title` is deliberately ONE column. The card renders it on both
-- faces; storing it twice would let the two sides drift apart.
--
-- There is no icon column on purpose — see the category CHECK below.
--
-- There are no document columns yet. Certificate upload is Phase D,
-- and adding nullable columns later is a trivial additive migration
-- (exactly like hero_media.is_visible), so nothing is gained by
-- reserving them now.
-- ---------------------------------------------------------

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),

  -- front
  title varchar(180) not null,
  publisher varchar(140),
  period varchar(60),
  category varchar(40) not null,

  -- back
  issuer_line varchar(180),
  badge_text varchar(60),
  description varchar(400),

  -- lifecycle
  status varchar(20) not null default 'draft',
  sort_order integer not null default 0,

  published_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint certificates_title_not_blank
    check (length(btrim(title)) > 0),

  constraint certificates_status_check
    check (status in ('draft', 'published', 'archived')),

  /*
    THE ICON IS NOT STORED.

    The small glyph on each card is derived from this key by a frozen
    map in application code, so no SVG, markup, URL or free-form icon
    id can ever reach the renderer through the database. The allow-list
    is the database's half of that guarantee; an unknown value cannot
    be stored in the first place, and the renderer additionally falls
    back to 'other' if it ever meets one.
  */
  constraint certificates_category_check
    check (category in (
      'education',
      'course',
      'professional',
      'language',
      'copyright',
      'competition',
      'award',
      'research',
      'organization',
      'internship',
      'cybersecurity',
      'networking',
      'programming',
      'other'
    ))
);


-- ---------------------------------------------------------
-- 2. INDEXES
--
-- Mirrors projects_public_order_idx / projects_updated_at_idx: the
-- first serves the public ordered read and the min-3 count, the second
-- serves the Admin list.
-- ---------------------------------------------------------

create index if not exists certificates_public_order_idx
  on public.certificates (status, deleted_at, sort_order, created_at);

create index if not exists certificates_updated_at_idx
  on public.certificates (updated_at desc);


-- ---------------------------------------------------------
-- 3. updated_at
-- ---------------------------------------------------------

drop trigger if exists certificates_set_updated_at on public.certificates;
create trigger certificates_set_updated_at
before update on public.certificates
for each row execute function app_private.set_updated_at();


-- ---------------------------------------------------------
-- 4. PRIVILEGES
--
-- 20260815234351_harden_public_default_privileges.sql removed the
-- automatic grants for new tables, so a table born here reaches anon
-- and authenticated with NO privileges at all. Everything it needs is
-- therefore granted explicitly, and the revoke stays as belt and
-- braces in case that hardening is ever relaxed.
--
-- anon          : read only
-- authenticated : read plus full management, gated by the policies
--                 below to owner + aal2. INSERT and DELETE are granted
--                 because the Admin genuinely adds and permanently
--                 deletes certificates, unlike hero_media's fixed
--                 three slots.
-- ---------------------------------------------------------

alter table public.certificates enable row level security;

revoke all on table public.certificates from anon, authenticated;

grant select on table public.certificates to anon, authenticated;
grant insert, update, delete on table public.certificates to authenticated;


-- ---------------------------------------------------------
-- 5. POLICIES
--
-- Both are PERMISSIVE and therefore OR-ed: the owner keeps full read
-- access to drafts, archived rows and Trash regardless of what the
-- public rule says. Making either RESTRICTIVE would AND them together
-- and hide the owner's own unpublished work from them.
-- ---------------------------------------------------------

create policy "Public can read published certificates"
on public.certificates for select to anon, authenticated
using (status = 'published' and deleted_at is null);

create policy "Owner AAL2 manages certificates"
on public.certificates for all to authenticated
using (app_private.is_owner_admin_aal2())
with check (app_private.is_owner_admin_aal2());


commit;

-- ---------------------------------------------------------
-- NOTES
--
--   * description is stored as plain text and is rendered with
--     textContent on both the Admin preview and (in a later phase) the
--     public card, which is how every other CMS string in this project
--     is handled. No CHECK tries to detect markup: a legitimate
--     description may contain "<" or "&", and a filter that guesses at
--     HTML would reject real content while adding nothing on top of
--     safe rendering.
--
--   * The minimum-published invariant lives in its own migration
--     (20260818110100) so the rule and its state are reviewable
--     separately from the storage.
-- ---------------------------------------------------------
