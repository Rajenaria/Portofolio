-- ADMIN CMS — HARDEN DEFAULT PRIVILEGES IN SCHEMA public
--
-- Remediates security audit finding H-1.
--
-- BACKGROUND
-- The captured remote baseline (20260815212736_remote_schema.sql) executed:
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT SELECT, USAGE ON SEQUENCES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON ROUTINES TO anon;
--   -- (and the same for authenticated)
--
-- Verified effect on a fresh local database: any table created in schema public
-- by role `postgres` was born with
--   anon = arwdDxtm  (INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN)
-- and with row level security DISABLED.
--
-- That means a future migration that forgets `enable row level security` plus the
-- explicit `revoke` produces a table that unauthenticated visitors can read, write,
-- delete and TRUNCATE through the public Data API. TRUNCATE is especially dangerous
-- because PostgreSQL row level security does NOT govern TRUNCATE.
--
-- WHY THIS TARGETS ROLE `postgres`
-- Supabase CLI migrations (`db reset`, `db push`) execute as role `postgres`, so the
-- `pg_default_acl` entry owned by `postgres` is the one that applies to every table
-- this project creates. Confirmed via pg_default_acl inspection.
--
-- WHAT IS DELIBERATELY NOT TOUCHED
--   * The `supabase_admin` default ACLs for schema public. Those are Supabase
--     platform defaults covering platform/extension-owned objects. This project does
--     not create objects as `supabase_admin`, and `postgres` is not guaranteed to be
--     permitted to alter another role's defaults on hosted Supabase — attempting it
--     could fail the migration on deploy.
--   * Schemas other than `public` (storage, graphql, auth, ...). Out of scope for
--     this finding; storage.objects is already protected by explicit RLS policies.
--   * The built-in PostgreSQL default that grants EXECUTE on new functions to PUBLIC.
--     Revoking that can break extension functions. Future functions must therefore
--     still be secured explicitly (see the note at the bottom of this file).
--
-- SAFETY
-- ALTER DEFAULT PRIVILEGES affects ONLY objects created AFTER it runs. It does not
-- modify a single existing table, sequence or function. The existing Guestbook
-- (public.comments, public.guestbook_rate_limits) and all 13 existing CMS tables keep
-- exactly the privileges they already have, so no existing behaviour can regress.

begin;

-- 1. FUTURE TABLES: remove all automatically granted privileges.
--    New tables must be granted access explicitly, exactly as
--    20260815213442_admin_cms_rls.sql already does for the CMS tables.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;

-- 2. FUTURE SEQUENCES: remove automatic SELECT/UPDATE/USAGE.
--    Existing sequences are unaffected. The CMS uses uuid primary keys, and the
--    Guestbook identity sequence is owned by its column (implicit permission),
--    so nothing in the current system depends on these defaults.
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;

-- 3. FUTURE FUNCTIONS/ROUTINES: remove the automatic EXECUTE grant to the API roles.
--    Note: PostgreSQL additionally grants EXECUTE on new functions to PUBLIC by
--    default, which is NOT removed here (see rationale above). Any future function
--    that must not be callable through PostgREST /rpc/ therefore still requires an
--    explicit `revoke execute on function ... from public;`.
alter default privileges for role postgres in schema public
  revoke all on routines from anon;

alter default privileges for role postgres in schema public
  revoke all on routines from authenticated;

-- 4. service_role is intentionally left untouched. It is a trusted server-side role,
--    it already bypasses RLS by design, and the Guestbook Edge Function
--    (submit-comment) depends on it. Removing its defaults would break that
--    protected subsystem.

commit;

-- POST-CONDITION (verified locally after `supabase db reset`):
--   A newly created table in schema public grants NOTHING to anon or authenticated.
--   RLS remains a separate, independent requirement and is still disabled by default
--   on new tables — every new table must still explicitly run
--     alter table <t> enable row level security;
--   together with the policies it needs.
