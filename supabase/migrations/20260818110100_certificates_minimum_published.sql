-- =========================================================
-- CERTIFICATES — MINIMUM PUBLISHED INVARIANT
--
-- The public Sertifikat section is a 3D carousel that needs at least
-- three cards to read as a carousel at all. Fewer than three and the
-- geometry degenerates: with two, the cards sit 180 degrees apart and
-- the back one is seen mirrored.
--
-- The rule cannot simply be "1 or 2 published is illegal", because
-- that makes the very first certificate impossible to create. What is
-- actually wanted is a one-way latch:
--
--     BEFORE the CMS has ever reached three published certificates,
--     any count is fine — this is bootstrap.
--
--     ONCE it has reached three, the public set may never fall below
--     three again.
--
-- So the rule needs memory. A count alone cannot tell "climbing to 3
-- for the first time" apart from "falling back from 3", which is why
-- this migration adds a small piece of state rather than a bare CHECK.
-- =========================================================

begin;


-- ---------------------------------------------------------
-- 1. ACTIVATION STATE
--
-- One row, in app_private, so it is unreachable from the browser: the
-- schema is not exposed through PostgREST and no privileges are
-- granted on this table to anon or authenticated. Only the SECURITY
-- DEFINER function below touches it.
--
-- is_activated is a latch. It is set once, by the trigger, and this
-- migration never provides a path back to false — recovering from an
-- intentional teardown is a deliberate manual act by the owner, not
-- something a mis-click in the Admin can trigger.
-- ---------------------------------------------------------

create table if not exists app_private.certificate_cms_state (
  singleton_key smallint primary key default 1,
  is_activated boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificate_cms_state_singleton_key_check check (singleton_key = 1)
);

insert into app_private.certificate_cms_state (singleton_key)
values (1)
on conflict (singleton_key) do nothing;

alter table app_private.certificate_cms_state enable row level security;
revoke all on table app_private.certificate_cms_state from anon, authenticated;

drop trigger if exists certificate_cms_state_set_updated_at
  on app_private.certificate_cms_state;
create trigger certificate_cms_state_set_updated_at
before update on app_private.certificate_cms_state
for each row execute function app_private.set_updated_at();


-- ---------------------------------------------------------
-- 2. THE INVARIANT
--
-- SECURITY DEFINER because the calling role (authenticated) has no
-- privileges on app_private.certificate_cms_state, and it must not be
-- given any. search_path is pinned to '' and every object is schema
-- qualified, matching app_private.is_owner_admin_aal2().
--
-- The FOR UPDATE lock on the singleton is what makes the rule correct
-- under concurrency. Without it two transactions could each unpublish
-- one certificate, each see a final count of 3, and both commit —
-- leaving 2. Serialising certificate-mutating transactions on one row
-- costs nothing here (a single owner, a handful of rows) and removes
-- the whole class of problem.
-- ---------------------------------------------------------

create or replace function app_private.enforce_certificate_minimum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  published_count integer;
  activated boolean;
begin
  -- Serialise concurrent certificate mutations, and read the latch.
  select s.is_activated
    into activated
    from app_private.certificate_cms_state s
   where s.singleton_key = 1
     for update;

  select count(*)
    into published_count
    from public.certificates c
   where c.status = 'published'
     and c.deleted_at is null;

  if published_count >= 3 then

    -- Reaching three for the first time arms the latch permanently.
    if not activated then
      update app_private.certificate_cms_state
         set is_activated = true,
             activated_at = now()
       where singleton_key = 1;
    end if;

    return null;
  end if;

  -- Below three: only acceptable while still bootstrapping.
  if activated then
    raise exception
      'At least 3 certificates must stay published; this change would leave %.',
      published_count
      using errcode = 'check_violation',
            hint = 'Publish another certificate first, or make the change in a single transaction that ends with at least 3 published.';
  end if;

  return null;
end;
$$;

revoke all on function app_private.enforce_certificate_minimum() from public;


-- ---------------------------------------------------------
-- 3. CONSTRAINT TRIGGER
--
-- DEFERRABLE INITIALLY DEFERRED is the part that makes a swap work.
-- The check runs once at COMMIT against the final state, so a
-- transaction that unpublishes one certificate and publishes another
-- is judged on where it ends up (still 3), not on the instant in the
-- middle where it dipped to 2.
--
-- Constraint triggers must be FOR EACH ROW. The body is a count and is
-- idempotent, so firing it once per affected row is harmless at this
-- table's size.
-- ---------------------------------------------------------

drop trigger if exists certificates_minimum_published on public.certificates;

create constraint trigger certificates_minimum_published
after insert or update or delete on public.certificates
deferrable initially deferred
for each row execute function app_private.enforce_certificate_minimum();


commit;

-- ---------------------------------------------------------
-- READING THE STATE FROM THE ADMIN
--
-- No RPC is needed, and none is added, because activation is derivable
-- from the published count the Admin can already select:
--
--     published_count >= 3  ->  the latch is armed (the trigger arms it
--                               on any commit at or above three)
--     published_count <  3  ->  the latch is not armed (if it were,
--                               this state could not have committed)
--
-- Both directions follow from the invariant itself, so the Admin can
-- render the correct banner and disable the correct actions using one
-- count query, with no extra function and no extra surface exposed
-- through PostgREST.
-- ---------------------------------------------------------
