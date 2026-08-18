-- ADMIN CMS V1 — FOUNDATION SEED TEMPLATE
-- No real Portfolio content yet. No Auth user is created here.

begin;

insert into public.profile_content (singleton_key)
values (1)
on conflict (singleton_key) do nothing;

insert into public.about_organization (singleton_key)
values (1)
on conflict (singleton_key) do nothing;

insert into public.hero_media (slot_number)
values (1), (2), (3)
on conflict (slot_number) do nothing;

commit;

-- AFTER the real Supabase Auth owner account exists and MFA is enrolled,
-- add the owner UUID manually:
--
-- insert into app_private.admin_users (user_id)
-- values ('YOUR_AUTH_USER_UUID')
-- on conflict (singleton_key) do update
-- set user_id = excluded.user_id,
--     updated_at = now();
--
-- Never store passwords, TOTP codes, access/refresh tokens,
-- database passwords, or secret/service-role keys in this migration.
