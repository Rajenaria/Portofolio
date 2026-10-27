/*
  Admin environment resolution.

  This file used to hardcode the local stack, which meant a deployed
  Admin tried to reach http://127.0.0.1:54321 on the visitor's own
  machine — blocked outright as mixed content on an HTTPS site — and
  compared the signed-in user against the local owner UUID, so the
  real owner failed isOwner() and was signed straight back out.

  The resolution below is deliberately the same shape as the public
  client in js/cms/client.js, so both halves of the site decide
  "local or production" from the hostname in exactly one way.

  Nothing secret lives here. The publishable key is the anon key,
  which is designed to sit in a browser and is guarded by RLS, and
  OWNER_USER_ID is a UX check only: the real authority is
  app_private.is_owner_admin_aal2() inside every policy, so editing
  this value grants nobody anything.
*/

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "0.0.0.0", "[::1]", ""];
// TASK33.2: the main local Admin inspects the verified Production backend.
// file:// and the unspecified bind hostname retain the isolated local setup.
const PRODUCTION_PREVIEW_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

const LOCAL = {
  url: "http://127.0.0.1:54321",
  key: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
  owner: "c51d8cac-2ba5-4cda-bcdd-026bcc30da7f"
};

const PRODUCTION = {
  url: "https://hldacuppejztqzqaejsi.supabase.co",
  key: "sb_publishable_B_Fq0qQhLmbz_MtxI8rFqA_S8MY1OuO",
  owner: "f463c380-b936-456c-b383-e617955df13b"
};

/*
  `file://` reports an empty hostname. That is still a local
  preview and must never be pointed at production.
*/

const ENVIRONMENT =
  PRODUCTION_PREVIEW_HOSTS.includes(window.location.hostname)
    ? PRODUCTION
    : LOCAL_HOSTS.includes(window.location.hostname) ? LOCAL : PRODUCTION;

export const SUPABASE_URL = ENVIRONMENT.url;

export const SUPABASE_PUBLISHABLE_KEY = ENVIRONMENT.key;

export const OWNER_USER_ID = ENVIRONMENT.owner;

export const IS_LOCAL_ADMIN = ENVIRONMENT === LOCAL;
