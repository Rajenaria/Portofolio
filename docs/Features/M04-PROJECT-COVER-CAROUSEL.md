# M04 - Project Cover and Carousel

Status: DONE — LOCAL VERIFIED. Closure approved by the Project Owner.

## Approved data contract

`public.projects` gains only three columns:

- `cover_fit`: text, NOT NULL, default `cover`, CHECK in (`cover`, `contain`).
- `cover_position_x`, `cover_position_y`: smallint, NOT NULL, default 50,
  CHECK between 0 and 100 inclusive.

Prepared migration: `supabase/migrations/20261019020000_m04_project_cover_layout.sql`.
It has not been applied to any database. No policies, buckets, authorization,
certificate contracts, or media object paths are changed by this migration.

## Rendering and editor behavior

The shared `js/cms/project-cover.js` validates metadata and assigns only bounded
`object-fit` and percentage `object-position` values. Old or invalid public
records render as cover/50/50. No arbitrary CSS is accepted. Both desktop and
mobile sources retain the existing 650px picture breakpoint and share settings.

The editor offers Cover/Contain and integer X/Y controls with a live 3:2 preview.
Position can be saved in Contain, but has a visible effect only when available
space or image overflow allows positioning. These controls affect homepage
cards and card previews; the detail-page cover layout is unchanged.
Settings participate in dirty tracking, Save, reopen and Publish. Storage
upload/replacement and M01 compensation remain separate and unchanged.

Admin list and editor queries request metadata. A missing-cover-column error
allows a legacy read for inspection. Saving an editor known to use the old
schema is blocked; other failed writes retain dirty state and never report
success. New-record writes also include metadata and surface schema errors.
Public reads retry the legacy projection only for a recognized missing cover
column; unrelated failures keep the existing card fallback.

The existing carousel controller and refresh hook remain in place. Autoplay
pauses for hover, focus within, active pointer, hidden document, explicit user
pause and temporary navigation. A timeout releases only the temporary pause.
Previous/next, keyboard Arrow/Home/End and a pause/resume control are available.
Reduced motion disables autoplay and image/card transforms. Switching to reduced
motion also stops an in-flight smooth scroll. Clones remain out of tab order.
An empty CMS list clears the controller; a subsequent populated refresh restores
the section without adding another controller.

## Legacy detail compatibility

`projects/project-football-club.html` retains its existing content.
`projects/project-ecommerce.html` retains its URL and styling, but its duplicated
Football Club content is replaced by a neutral unavailable-details message and
a return link. No undocumented CMS slug mapping or project content is invented.
The owner still needs to supply/review the actual E-Commerce case study.

## Local verification commands

- `node scripts/test-m04-cover.js`
- `node scripts/test-m04-projects.js <external-output-directory>`
- `node scripts/test-publish-upload-integrity.js`
- `node --experimental-vm-modules scripts/test-m02-security.js`
- `node scripts/test-m02-browser.js <external-output-directory>`
- `node scripts/test-m03-carousel.js <external-output-directory>`

Browser checks use native Chrome/CDP with all requests intercepted, in-memory
API/storage responses, a deny proxy and DNS denial. No production credentials
are consumed. Synthetic SVG images represent landscape/portrait fixtures;
this verifies layout and source selection, not production media contents.
CDN fonts/icons are blocked, so screenshots are not proof of deployed typography.
SQL constraints are inspected statically, not executed on PostgreSQL.

## Release prerequisites and rollback

Apply the additive migration only in a separately authorized environment; verify
schema availability, constraints, existing record defaults, owner/AAL2, real
save/reload/publish and public rendering there before release. Coordinate any
public/admin cache updates during that separately authorized rollout.

If rollback is needed, restore the M04 application baseline while retaining the
additive columns and their values. Do not drop columns or clean up media as an
automatic rollback. M02 release blockers remain unchanged, including historical
URLs/CDN cache, real Storage/RLS/concurrency, trusted proxy/rate limiter, shared
bucket consumers, and reference audit before orphan cleanup. Never automatically
delete files with ambiguous database outcomes.

## Verification result (2026-10-19)

- M04-01: focused static audit complete; three-column contract explicitly approved.
- M04-02: metadata migration, editor/list queries, controls and previews complete.
- M04-03: targeted carousel interaction and motion changes complete.
- M04-04: neutral E-Commerce legacy fallback complete; Football content preserved.
- M04-05: isolated integrated testing and review complete.
- M04 metadata contract: 34 PASS, 0 FAIL (includes static SQL inspection).
- M04 Chrome browser integration: 94 PASS, 0 FAIL; no runtime exceptions.
- Browser layout matrix: widths 1280/768/390, short/long/empty descriptions,
  counts 1/2/3/8/20, plus empty-list and repopulation checks.
- Browser coverage includes cover/contain, landscape/portrait fixtures, responsive
  source selection, old/invalid metadata, editor save/reopen/publish, failed
  writes, absent schema, real list/editor routes and their previews, native hover
  and touch swipe, ghost-click suppression, rapid navigation, focus/hover pause,
  manual pause/resume, dynamic reduced motion, loop wrap, and detail fallback.
- M01 module regression: 126/126 PASS; isolated browser regression: 3/3 PASS.
- M02 module regression: 45/45 PASS; browser regression: 47/47 PASS.
- M03 full browser regression: 189 PASS, 0 FAIL; final targeted interaction
  regression after carousel review: 45 PASS, 0 FAIL.
- Native browser zoom 200%, other browsers, physical devices and screen readers:
  NOT VERIFIED. Real database/Storage/RLS/owner-AAL2 and concurrency: NOT RUN.
- No production performance metrics were measured. Historic cache and deployment
  compatibility remain NOT VERIFIED; M02 release blockers are retained.

Browser evidence and M04-only diff are stored outside the repository under the
session's `portfolio-m04-1mhk21q9` temporary directory. The reusable regression
scripts remain in `scripts/`. No installation, commit, push, migration execution
or deployment was performed. M05 has not started.

## Approved milestone closure

M04 is closed at the implementation and isolated local verification level.
The verification results above are retained from the completed test runs;
no tests were rerun for closure. All M01-M04 implementation is preserved.
Only this tracking document was updated during closure.

Migration `20261019020000_m04_project_cover_layout.sql` is prepared locally
and remains unapplied. Its rollout and compatibility with the old schema
remain release prerequisites, alongside every existing M02 release blocker.
Real PostgreSQL, Storage/RLS, physical devices, other browsers, screen readers,
native 200% zoom and deployment remain NOT VERIFIED; real backend execution
was NOT RUN during the isolated verification.

The E-Commerce detail page still requires original material from the Project
Owner. No automatic orphan cleanup is authorized. No source changes, refactor,
commit, push, deployment, migration execution or production access occurred
for closure. M05 has not started; work stops at the next-instruction checkpoint.
