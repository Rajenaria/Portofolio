-- =========================================================
-- HERO MEDIA — PER-SLOT PUBLIC VISIBILITY
--
-- The public Hero is a three-position photo stack. Until now every
-- configured slot was public: the only way to take a photo off the
-- site was to stop configuring it, which meant losing the stored
-- image. This migration adds an explicit visibility flag so the
-- owner can retire slot 2 or slot 3 from the public page while the
-- uploaded media stays exactly where it is.
--
-- Additive only. No historical migration is edited, no column is
-- dropped or renamed, and no Storage object is touched.
-- =========================================================

begin;


-- ---------------------------------------------------------
-- 1. COLUMN
--
-- NOT NULL DEFAULT true: every row that exists today keeps
-- behaving exactly as it does now. Visibility is something the
-- owner opts OUT of, never something a slot has to opt in to, so
-- an unconsidered future insert is public-safe by default rather
-- than silently invisible.
-- ---------------------------------------------------------

alter table public.hero_media
  add column if not exists is_visible boolean not null default true;


-- ---------------------------------------------------------
-- 2. SLOT 1 IS THE PRIMARY PHOTO AND CANNOT BE HIDDEN
--
-- The Hero must always show a photo. Slot 1 is the one the public
-- renderer treats as the activation key: if it is absent, the CMS
-- does not take over at all and the static V1 Hero stays. Allowing
-- it to be hidden would therefore not produce "a Hero with no
-- photo" — it would silently drop the whole section back to the
-- hardcoded fallback, which is a confusing thing to be one
-- checkbox away from.
--
-- This is a plain row-level CHECK, not a trigger: slot_number is
-- the primary key and the table only ever holds slots 1-3, so the
-- rule needs no cross-row visibility and cannot be evaded by a
-- tampered client. The Admin UI disables the control as well, but
-- the database is the authority.
-- ---------------------------------------------------------

alter table public.hero_media
  add constraint hero_media_slot_one_always_visible
  check (slot_number <> 1 or is_visible = true);


-- ---------------------------------------------------------
-- 3. PUBLIC READ POLICY
--
-- Hidden means "not sent to the browser", not "sent and then
-- hidden with CSS". A hidden slot must not appear in the REST
-- response at all, otherwise its Storage path is still published
-- to anyone reading the API.
--
-- The previous policy is replaced rather than amended so there is
-- exactly one public SELECT rule to reason about. The configured
-- test (desktop_path + mobile_path both present) is carried over
-- unchanged — it is the same responsive contract the public
-- renderer requires.
--
-- IMPORTANT — this does NOT restrict the Admin.
-- PostgreSQL combines multiple PERMISSIVE policies for the same
-- command with OR. "Owner AAL2 can read all hero media" is a
-- separate permissive SELECT policy and keeps returning every row,
-- including hidden and unconfigured ones, so the Admin can still
-- load, preview and edit a hidden photo. Both policies are left
-- PERMISSIVE deliberately; making either RESTRICTIVE would AND
-- them together and lock the owner out of their own hidden media.
-- ---------------------------------------------------------

drop policy if exists "Public can read configured hero media" on public.hero_media;

create policy "Public can read visible configured hero media"
on public.hero_media for select to anon, authenticated
using (
  is_visible = true
  and desktop_path is not null
  and mobile_path is not null
);


commit;

-- ---------------------------------------------------------
-- NOT CHANGED, ON PURPOSE
--
--   * Grants. SELECT and UPDATE were granted on the whole table,
--     with no column list, so is_visible is already covered for
--     anon (read) and authenticated (read/write). Re-granting
--     would only add noise.
--   * "Owner AAL2 can read all hero media" and "Owner AAL2 can
--     update hero media". Both still apply verbatim; the update
--     policy's `slot_number between 1 and 3` check continues to
--     stop a fourth slot being invented.
--   * INSERT/DELETE are still not granted to anyone. The three
--     rows are seeded once and only ever updated.
--   * Storage. Hiding a photo is a metadata change; the objects in
--     portfolio-media are deliberately left in place so the owner
--     can make the slot visible again without re-uploading.
-- ---------------------------------------------------------
