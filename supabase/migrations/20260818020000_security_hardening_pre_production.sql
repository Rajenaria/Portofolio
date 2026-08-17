-- =========================================================
-- FINAL SECURITY HARDENING — PRE-PRODUCTION
--
-- Closes the findings left open after the Admin CMS and public
-- CMS integrations were completed. Nothing here changes product
-- behaviour: every public read the site actually performs still
-- resolves, and every Admin write still runs through the same
-- owner + aal2 helpers.
--
-- 1. technologies public SELECT was broader than the product
--    contract and exposed rows the site never renders.
-- 2. projects.github_url / demo_url had no database-level
--    protocol validation, leaving JS as the only guard.
-- 3. comments / guestbook_rate_limits kept baseline write
--    privileges — including TRUNCATE, which RLS cannot restrain.
-- =========================================================


-- ---------------------------------------------------------
-- 1. TECHNOLOGIES — PUBLIC SELECT
--
-- Previous policy:
--
--   is_active = true
--   OR referenced by a published project
--
-- The first branch let any active technology be read
-- anonymously even when it was deliberately kept out of the
-- public Tech Stack (show_in_public_stack = false, or no
-- public_group). The renderer filtered those rows out, so
-- nothing leaked visually, but the REST API returned them.
--
-- The replacement keeps both legitimate reads and nothing else:
--
--   A. the global Tech Stack — a row the owner intentionally
--      published, which is exactly the three-column contract the
--      public renderer queries; and
--
--   B. a technology attached to a published project, which the
--      project card and project detail pages must still show.
--      This branch deliberately ignores is_active and
--      show_in_public_stack: project relationships are
--      independent of Tech Stack visibility, so a retired or
--      stack-hidden technology still names itself correctly on
--      the projects that used it.
-- ---------------------------------------------------------

drop policy if exists "Public can read available technologies" on public.technologies;

create policy "Public can read stack and published project technologies"
on public.technologies for select to anon, authenticated
using (
  (
    is_active = true
    and show_in_public_stack = true
    and public_group is not null
  )
  or exists (
    select 1
    from public.project_technologies pt
    join public.projects p on p.id = pt.project_id
    where pt.technology_id = technologies.id
      and p.status = 'published'
      and p.deleted_at is null
  )
);


-- ---------------------------------------------------------
-- 2. PROJECT EXTERNAL URLS
--
-- github_url and demo_url are rendered as links on the public
-- detail page. The renderer already rejects anything that is not
-- http(s), but validation belonged in the database too so a bad
-- value cannot be stored in the first place.
--
-- Accepted: NULL, the empty string (how the Admin form records
-- "no link"), or an absolute http/https URL.
--
-- Rejected: javascript:, data:, vbscript:, file:, and
-- protocol-relative //host values, none of which can match an
-- anchored ^https?:// prefix.
--
-- These are added as validating constraints on purpose. If any
-- existing row violates them the migration fails and the data is
-- reviewed by a human, rather than being silently rewritten.
-- ---------------------------------------------------------

alter table public.projects
  add constraint projects_github_url_check
  check (
    github_url is null
    or github_url = ''
    or github_url ~* '^https?://[^[:space:]]+$'
  );

alter table public.projects
  add constraint projects_demo_url_check
  check (
    demo_url is null
    or demo_url = ''
    or demo_url ~* '^https?://[^[:space:]]+$'
  );


-- ---------------------------------------------------------
-- 3. GUESTBOOK TABLE PRIVILEGES
--
-- Both tables still carried the original baseline grants, which
-- gave anon and authenticated INSERT, UPDATE, DELETE, TRUNCATE,
-- REFERENCES and TRIGGER.
--
-- Row level security does not apply to TRUNCATE: a role holding
-- that privilege can empty the table regardless of any policy.
-- guestbook_rate_limits was the clearer case — it has RLS
-- enabled and no policies at all, so it was already unreadable,
-- yet the TRUNCATE grant meant the rate limiter could still be
-- wiped.
--
-- What the browser actually needs is one thing: reading approved
-- comments. Submission goes through the submit-comment Edge
-- Function, which authenticates as service_role and is untouched
-- by this migration, as is the rate limiter it maintains.
-- ---------------------------------------------------------

revoke all on table public.comments from anon, authenticated;
grant select on table public.comments to anon, authenticated;

revoke all on table public.guestbook_rate_limits from anon, authenticated;

-- The sequence behind guestbook_rate_limits.id was writable by
-- both browser roles. Nothing in the browser inserts those rows.
revoke all on sequence public.guestbook_rate_limits_id_seq from anon, authenticated;
