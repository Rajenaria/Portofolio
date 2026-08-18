-- =========================================================
-- CERTIFICATES — SEED FROM THE CURRENT PUBLIC CARDS
--
-- Reproduces, exactly, the five cards the public site renders today
-- from the CERTIFICATES array in js/certificates.js, so the Admin does
-- not open onto an empty list while the live section shows five.
--
-- Nothing is invented. Every `description` and every `link` in the
-- current array is an empty string with a TODO next to it, so those
-- stay NULL here rather than being filled with plausible-looking text.
-- The `link` values have no column yet at all — certificate documents
-- are Phase D, and no information is lost because there are none.
--
-- The icon each card shows is NOT copied. It is derived from the
-- category by the frozen map in application code:
--
--   tabler:award       -> the Udemy course      -> course
--   tabler:award       -> the CEFR B2 result    -> language
--   tabler:school      -> the degree            -> education
--   tabler:certificate -> both Hak Cipta rows   -> copyright
--
-- The first two shared one icon despite being different kinds of
-- achievement, which is precisely what the category system fixes.
--
-- This seed does NOT change the public website. Phase C leaves
-- js/certificates.js reading its static array; the public renderer is
-- wired to the database in a later phase.
--
-- IDs are fixed literals so repeated local resets produce identical
-- rows, and the insert is ON CONFLICT DO NOTHING so re-running is
-- harmless.
--
-- sort_order preserves the current on-screen order, including the
-- degree sitting third — the existing array comments note that its
-- middle position is deliberate, because START_INDEX opens the
-- carousel on it.
-- =========================================================

begin;

insert into public.certificates (
  id,
  title,
  publisher,
  period,
  category,
  issuer_line,
  badge_text,
  description,
  status,
  sort_order,
  published_at
)
values
  (
    'ce000000-0000-4000-8000-000000000001',
    'Machine Learning A-Z: AI, Python',
    'Udemy',
    '2025',
    'course',
    'Udemy · Online',
    null,
    null,
    'published',
    1,
    now()
  ),
  (
    'ce000000-0000-4000-8000-000000000002',
    'CEFR B2',
    'LAC Telkom University',
    '2025',
    'language',
    'LAC Telkom University · Bandung',
    null,
    null,
    'published',
    2,
    now()
  ),
  (
    'ce000000-0000-4000-8000-000000000003',
    'Computer Engineering',
    'Universitas Telkom',
    '2021 — 2025',
    'education',
    'Universitas Telkom · Bandung',
    'GPA 3.51/4.00',
    null,
    'published',
    3,
    now()
  ),
  (
    'ce000000-0000-4000-8000-000000000004',
    'Hak Cipta: Cuacane Application',
    'DJKI Kemenkumham RI',
    '2025',
    'copyright',
    'DJKI Kemenkumham RI · Indonesia',
    null,
    null,
    'published',
    4,
    now()
  ),
  (
    'ce000000-0000-4000-8000-000000000005',
    'Hak Cipta: Vaisala Converter',
    'DJKI Kemenkumham RI',
    '2025',
    'copyright',
    'DJKI Kemenkumham RI · Indonesia',
    null,
    null,
    'published',
    5,
    now()
  )
on conflict (id) do nothing;

commit;

-- ---------------------------------------------------------
-- SIDE EFFECT, ON PURPOSE
--
-- Committing five published certificates trips the minimum-published
-- latch in 20260818110100: from here on the set may not fall below
-- three. That is the intended behaviour — the public section already
-- shows five cards, so the CMS is not in a bootstrap state.
-- ---------------------------------------------------------
