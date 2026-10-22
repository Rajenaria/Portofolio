# M09 — Complete Projects Experience & CMS

Status: **DONE — LOCAL VERIFIED**. Owner accepted the visual follow-up and
authorized closure on 2026-10-21. Real backend integration is a separate
**REAL BACKEND INTEGRATION — REVIEW** checkpoint, currently BLOCKED at preflight.
Local implementation authorized by the owner after M09-06. This is not release
approval, production verification, or authorization to begin M10/M11.

## Implementation

| Subtask | Result | Verification boundary |
| --- | --- | --- |
| M09-07 | Independent draft, immutable revision, publication pointer/version, operation ledger, service-only mutations | Handler fixtures + SQL static review; real PostgreSQL NOT VERIFIED |
| M09-08 | Initial 3/2/1 grid, 16:10 images, CMS categories, six + six, paged catalog, separate empty/error/retry; presentation superseded by RF01–RF05 below | Isolated Chrome with synthetic catalogs through 1,001 projects |
| M09-09 | Private originals/derivatives, asset registry, verified delivery, crop per placement, legacy import | Actual handlers with Storage double; actual crop UI in Chrome |
| M09-10 | One scoped case-study renderer for public and authorized admin preview | Fixture-backed public/admin rendering |
| M09-11 | Structured editor, stable IDs, draft save/readback, preview, publish/reconciliation, unsaved guard | Actual editor + actual handler; synthetic database |
| M09-12 | Alternating timeline, technical notes, preset architecture, valid node/edge forms, text alternative | Local Chrome and server validation fixtures |
| M09-13 | Mobile TOC, sticky sidebar/header offset, gallery dialog, focus/Escape, reduced motion, reveal once | Local Chrome; other browsers/devices/screen readers NOT VERIFIED |
| M09-14 | Consolidated contract/media/runtime/browser and relevant historical regression | See verification record below |

Primary references: `HOMEPAGE_PROJECTS_GRID_CMS_BRIEF.md`,
`PROJECT_DETAIL_CASE_STUDY_CMS_PLAN.md`, and `project_case_study (2).html`.
The prototype's composition is adapted to the existing system fonts, blue accent,
native semantics and Structured Vanilla CSS. Tailwind/CDNs, inline handlers,
sample content and achievement claims were not copied into the application.

## Files and module boundaries

- `js/cms/projects.js`, `project-data.js`, `client.js`: versioned public reads,
  complete bounded pagination and homepage grid. Catalog RPC returns compact
  snapshot-derived card DTOs; a slug read returns the full immutable snapshot.
- `js/cms/project-case-study.js`, `css/project-case-study.css`: shared renderer,
  timeline/graph/TOC/lightbox lifecycle and scoped styles. `project-detail.js`
  remains the public entry point for `project.html?slug=...`.
- `admin/js/modules/projects/case-study-editor.js`, `crop-editor.js`,
  `case-study-preview.js`, `admin/js/core/project-client.js`: existing Projects
  route integration, form builders, private media and draft controls.
- Existing project list actions call the same server gateway. Sort order is
  edited in Working Draft and activated by Publish. Trash remains reversible;
  permanent deletion and automated file cleanup are unavailable.
- Existing M01 processor/verification conventions are reused: desktop 2,000px,
  mobile 1,200px, immutable identities, exact object verification and conservative
  recovery. The server adapter is necessary for retained originals and private
  assets; it does not create another CMS or another encoder.
- Historical editor/media modules remain available for M01 regression and prior
  contracts. The active Projects route no longer uses their direct REST Save or
  Publish paths. Removing dormant modules globally is reserved for M10.

## Data and publishing contract

Local migrations, **NOT APPLIED**:

1. `20261021090000_m09_project_snapshots.sql`.
2. `20261021091000_m09_project_assets.sql`.

Four private entities: `project_working_drafts`, `project_revisions`,
`project_assets`, `project_publish_operations`. Existing `public.projects` gains
only `published_revision_id` and `publication_version`, with a composite FK
binding each revision pointer to its own project.

Payload schema 1 contains `general`, independent `cover`/`hero` placements,
ordered typed `sections`, and genuine `legacy` content. Section/item/node/edge/
placement UUIDs survive reorder; duplication assigns fresh item/media IDs.
Sections include challenge, timeline, architecture, features, decisions, gallery
and reflections. Text is rendered using DOM text nodes; layouts, icons, graph
relationships and aspect ratios use bounded presets. Hidden sections/items and
their exclusively hidden assets are removed from the public projection/manifest.

Save accepts structurally valid incomplete content, requires draft/publication
versions, and changes only the private draft. A maximum 512 KiB payload, graph
limits (32 nodes, 128 edges), typed fields and asset references are checked at
the trusted boundary. Publication verifies owner + AAL2, content, registry and
Storage, then one database transaction inserts an immutable revision and switches
the active pointer/status. Storage is prepared outside that transaction.

Publish uses an operation UUID bound to project/action/actor/expected versions/
payload hash. The same operation can be reconciled/retried without creating a
second activation. Failed or uncertain writes do not trigger file deletion.
Successful responses require database readback and post-activation object
confirmation. Active legacy references also receive exact-path object checks
before and after publication, so missing legacy files cannot produce a false
successful publication. An acknowledgement lost after commit can
mean that the new revision is already active; no blind rollback is performed.

Hide/Archive/Trash retain draft, revisions and files. Show validates/restores the
last published snapshot; it never publishes pending draft edits. Never-published
projects must use the editor's Publish action. Owner/AAL2 is checked on each
request; service credentials remain server-only.

The editor retains a coherent payload/revision pair when another session changes
the draft during publication readback. Explicit Reload Draft confirms discarding
local edits. JSONB key ordering does not cause false reconciliation conflicts.
Media controls retain their state across editor tabs and uploads are limited to
two concurrent client jobs. Cancelling a failed selection preserves old references
and any already-uploaded objects.

## Media and crop

Edge Functions, **NOT DEPLOYED**: `manage-project`, `project-asset`, `project-media`.
Their shared runtime pins the existing Supabase SDK version and independently
validates JWT/user plus the database owner/AAL2 helper.

New bucket `portfolio-project-assets` is private. A restrictive Storage policy
denies direct anonymous/authenticated access, including signed-URL creation;
validated Edge handlers perform I/O. Certificate/CV/shared legacy buckets retain
their existing policies. New files use immutable project/asset/component paths.

Source: JPEG/PNG/WebP, at most 15 MiB, 12,000px/side and 50MP. Each generated WebP
is at most 5 MiB; new desktop/mobile dimensions are capped at 2,000/1,200px.
Byte length, extension, MIME, structural headers/chunks, dimensions and SHA-256
are checked server-side. PNG CRC and WebP canvas/frame consistency are checked.
These bounded parsers do not replace a full image codec/fuzzer or prove all
malformed compressed streams harmless. The browser also decodes/re-encodes new
derivatives using the existing processor. Body reads have size/deadline limits;
publish verification is bounded to 64 distinct assets and 128 MiB per request.
Real Edge CPU/memory limits still require isolated deployment validation.

Anonymous delivery accepts UUIDs + desktop/mobile variant, resolves paths only on
the server, checks the active public manifest, then checks access again after
Storage I/O. It returns WebP bytes with `nosniff` and no-store browser/CDN headers,
never a signed URL or redirect. Originals are owner/AAL2-only attachments.
Authenticated previews fetch bytes into Blob URLs and revoke them on close.
Per-identity request budgets are separate from M02/M06: 30 upload requests/minute,
240 project media/read requests/minute. Missing limiter configuration fails closed.
Trusted proxy configuration and real PostgreSQL limiter concurrency remain blockers.

Each placement stores fit, aspect preset, X/Y 0–100, zoom 1–3, optional mobile
override, alt/caption and optional description/category/phase association. Cover
uses shared geometry for drag, numerical and keyboard controls. Contain forces
effective zoom 1 and preserves the complete image. Reset changes the selected
placement/viewport only. Actual mobile source selection can be previewed on a
desktop editor. Public images retain `<picture>` at 650px. Hero uses 21:9 desktop/
4:3 mobile; card now uses 16:9 following owner visual feedback. Card/hero destination ratios are fixed in the editor
and server contract; item/gallery placements expose the other presets. Hero
never inherits live card crop: legacy bootstrap creates its own placement, and
a new project's optional empty hero remains empty. Legacy M04 fit/X/Y map with
zoom 1; the new card frame ratio is an intentional approved design change.

The explicit legacy import copies only server-resolved project references from
the legacy public/staging buckets. It verifies both derivatives, preserves their
old objects and marks `legacy-derivative-only`; it never invents a retained raw
original. A failed import retries the same asset UUID. No cleanup is attempted.

## Compatibility, rollout and recovery

Existing IDs, published slugs, `project.html?slug=...`, and static legacy pages
remain. Legacy title/intro/about/paragraphs/technologies/media are carried into
the adapter without inventing challenge/results/architecture content. The owner
still needs to supply the genuine E-Commerce case study. Old inactive media and
historical database records are not deleted.

Public legacy reads require BOTH a missing snapshot RPC and a confirmed missing
revision column. Missing functions on an already versioned schema, network
errors, invalid DTOs and permission failures show an error rather than stale
legacy data. Catalog pagination fails explicitly at its safety cap instead of
silently truncating categories/results.

Authorized release order (documentation only): verify M02/M04/M06 prerequisites
and disposable backend; test M09 SQL and effective grants/RLS; verify private
bucket; deploy/configure functions; verify owner/AAL2/rate proxy/cache; coordinate
frontend/admin cutover and invalidate stale scripts; then perform release QA.
Old direct project DML is revoked at table and column levels. Stale old admin
scripts must fail rather than report successful Save. A controlled maintenance
window may be needed between permission/function/client cutover.

Rollback must preserve the snapshot-aware reader and restricted writer boundary.
Do not regrant old writes, drop revisions, delete objects, reset Git or blindly
restore an older frontend after new snapshots have been published. Reconcile an
operation before retry; investigate objects/references before any separately
approved cleanup. Restore content through a reviewed draft/publish operation,
retaining all intervening snapshots. There is no automatic revision-rollback UI;
retrieving a historical private revision for recovery requires an authorized
operator procedure, followed by the normal validated draft/publish path.

## Verification record

This section records tests run for M09, not historical milestone closure claims.

| Suite | Actual result | Classification |
| --- | --- | --- |
| `node --experimental-vm-modules scripts/test-m09-contract.js` | 40 PASS, 0 FAIL | Actual handler + synthetic transactions; SQL boundaries STATIC REVIEWED |
| `node --experimental-vm-modules scripts/test-m09-media.js` | 31 PASS, 0 FAIL | Actual handlers/parsers; synthetic Storage/database |
| `node --experimental-vm-modules scripts/test-m09-runtime.js` | 11 PASS, 0 FAIL | Actual authorization runtime + SDK double; TS syntax stripping only |
| `node --experimental-vm-modules scripts/test-m09-browser.js` | 67 PASS, 0 FAIL | Actual public/admin renderer and handler in isolated Chrome |
| `node --experimental-vm-modules scripts/test-m09-upload-browser.js` | 16 PASS, 0 FAIL | Real File, actual M01 image encoder/M09 upload/Edge handler; synthetic backend |

M09 total: **165 PASS, 0 FAIL**, within those explicit local/fixture boundaries.
Coverage includes 0/1/6/7/20/1,001 catalogs, legacy-schema confirmation and partial
rollout rejection, error/retry, graph/notes/lightbox/keyboard/mobile/reduced motion,
draft save/readback/preview, ambiguous acknowledgements, JSONB key ordering,
concurrent draft readback without token/payload mixing, explicit reload,
per-placement crop/drag/zoom/contain/reset, tab persistence, retained originals,
authenticated original download, legacy import, and post-activation verification.

Relevant historical regression re-executed in this implementation:

| Milestone | Actual result |
| --- | --- |
| M01 integrity script | 126/126 PASS |
| M02 | 45/45 module + 47/47 browser PASS |
| M03 | 189/189 browser PASS; existing NOT VERIFIED zoom note retained |
| M04 metadata | 34/34 PASS |
| M05 | 97/97 browser PASS; existing NOT RUN/NOT VERIFIED notes retained |
| M06 | 72/72 module + 42/42 browser PASS |
| M07 performance/lifecycle | 18/18 PASS (`followup`, one desktop + one mobile run) |
| Isolated preview launcher | 44/44 PASS; Project assertions updated for the approved grid |

The obsolete M04 carousel browser assertions were not replayed as acceptance
criteria for the deliberately replaced carousel. Their script remains available;
M04 metadata is rechecked and M09 covers the replacement behavior. Historical
M01 browser 3/3 and other temporary historical runs are not claimed as rerun.

Evidence generated outside the repository under the user's temporary directory:

- `portfolio-m09-contract-5VuSne/contract-results.json`.
- `portfolio-m09-media-6XzOAZ/media-results.json`.
- `portfolio-m09-browser-OychHC/browser-results.json` and admin/crop screenshots.
- `portfolio-m09-upload-browser-YihfNd/upload-browser-results.json`.
- `portfolio-m09-visual-Fg9VKc/`: desktop/mobile grid and case-study images,
  timeline, architecture, features, gallery, and network/cleanup audit.
- Historical browser rerun evidence: M02 `2XBgrT`, M03 `QH3Lvr`, M05 `pHiigO`, M06
  `xb1QOI`; M01/M02/M04 module evidence under `portfolio-m09-regression-wBq7IY`.
  M06 module and M09 runtime summaries were also captured in the actual command
  output; the initial M06 invocation without the required VM flag was corrected.
- Preview evidence: `portfolio-preview-test-JkweYR`.
- M07 performance: `portfolio-m09-m07-daaa468a8c85483e81ca525d9338404c`.

M07's measured local fixture values: desktop FCP 484 ms/LCP 1,268 ms/CLS 0.00978;
mobile FCP 1,532 ms/LCP 1,680 ms/CLS 0.00000321. These scenarios use synthetic CMS
responses and an isolated local HTTP server, not production or a populated real
backend. M09's own navigation/render/parallel-delivery samples are in its JSON
evidence and are not production performance guarantees.

Real PostgreSQL/Auth/RLS/Storage and database concurrency: **NOT VERIFIED**.
Deno runtime/typecheck, real Edge throughput, trusted proxy, historical public
URLs/CDN caching and deployment: **NOT VERIFIED**. Fixture throughput and browser
metrics prove only their explicitly synthetic local scenarios. No comparable
pre-M09 snapshot was measured with this same harness; no before/after speedup
is claimed.

All existing M02 release blockers remain, including shared bucket consumers,
old URL/cache transition, owner/AAL2, reference audits before orphan cleanup.
M04/M06 migrations and CV static URL transition remain pending. M05 favicon
remains DEFER and expanded hero geometry remains OPEN for owner review.
Native zoom 200%, physical devices, other browser engines and screen readers
remain NOT VERIFIED. No remote service, production credentials, deployment,
dependency install or mutating Git operation was used.

## Scope and Git checkpoint

Comparison with the preceding read-only baseline: **14 existing files changed,
24 new files, 0 removed files; 173 other baseline files unchanged**. This includes
the approved preview/test updates; reference briefs, prototype, dependencies,
M02/M04/M06 migration/function sources and unrelated application modules remain
preserved. All pre-existing dirty work is retained.

Git at the initial implementation checkpoint, before this visual follow-up: branch `backup/portfolio-m06`, last commit
`e8eebd1 checkpoint: M01-M06 local development`, **16 tracked modified + 38
untracked entries**. Those totals include earlier milestone changes.
Changed/new JavaScript syntax: **24 files PASS**; four TypeScript sources pass
stripped-JS syntax parsing, **not Deno typechecking**. Read-only
`git -c core.whitespace=cr-at-eol diff --check`: **PASS**.

External review bundle: `portfolio-m09-review-Ag7U3n` contains Git status,
scope comparison, syntax/diff results and `m09-worktree-review.diff`. That diff
is against Git HEAD and therefore also contains preserved earlier changes in
already-dirty shared files; it is not presented as an exact pre-M09-only diff.

## Owner visual review

```powershell
node scripts/preview-portfolio.js
node scripts/preview-portfolio.js --mobile --reduced-motion
node scripts/preview-portfolio.js --projects 20 --devtools
```

Use the new temporary Chrome profile opened by the launcher. Scroll to Portfolio,
filter/load more, then open a DEMO project for the full case study. URLs are
virtual and only work inside that intercepted browser; do not open them in a
normal profile. Unknown network requests remain denied. Close the preview to
clean up its temporary profile. The CV remains a local PDF fixture. Admin/crop
screenshots and handler/browser evidence come from isolated tests; the normal
preview deliberately does not expose the admin shell or production authentication.

Historical initial checkpoint: **M09 REVIEW**, awaiting owner visual approval.
That approval is now recorded in the closure below. Separate release
authorization is still required; M10/M11 have not started.

## Visual review follow-up — RF01–RF06

Owner authorization supersedes the original homepage brief specifically for
mobile horizontal browsing, the 16:9 card frame and the unframed CTA arrow.
The prototype remains the reference for the case-study composition. No prototype
CDNs, sample achievements or production dependencies were introduced.

| Task | Local result |
| --- | --- |
| RF01 | Desktop 3-column / tablet 2-column grid; native horizontal mobile rail at <=650px |
| RF02 | Shared 16:9 card preset for public cards and actual admin crop preview |
| RF03 | Semantic `Lihat Project ↗` link; adjacent arrow without circle, border or fill |
| RF04 | Compact padding/type rhythm, bounded labels/tags, aligned cards and focus targets |
| RF05 | Restrained spacing/type, responsive feature/gallery composition, sticky TOC clearance and empty-section handling |
| RF06 | Consolidated isolated verification completed; owner visual acceptance remains pending |

Mobile uses native overflow, mandatory scroll snap, 88% card width, 16px gap,
next-card peek and an understated Indonesian swipe hint. There is no timer,
autoplay, clone, pointer controller or custom scroll handler. Vertical touch
scrolling remains native. Rail entrance transforms are disabled, including on
viewport changes, and vertical overflow is hidden to prevent a nested scrollbar.
The region and all project links support keyboard focus; focus outlines remain
visible. Reduced motion also disables case-study smooth anchor scrolling.

The existing catalog reader still loads bounded pages of 100 (100-page safety
budget, explicit error if exhausted). Mobile displays every loaded matching
project rather than hiding entries after six. Desktop/tablet retain six + six.
Filters reset the rail to its start and reset the desktop limit to six. Resizing
retains category and the desktop load-more limit, rebuilding only on crossing
650px. A focused project link is restored when still rendered; otherwise focus
moves to the grid region. With no card focus, a rebuilt rail starts at the first
card. Large catalogs remain bounded; the 1,001-project fixture is not a promise
of acceptable production cost at the catalog safety limit.

The semantic `card` preset changes from 16:10 to 16:9 without rewriting stored
metadata. Fit, X/Y, zoom, mobile override, independent hero/item placements and
original files are preserved. Saved `cover` remains intentional cover and can
crop differently in the new frame; admins can explicitly select `contain` for
screenshots. Contain preserves the full image at effective zoom 1 with a quiet
background and no hover zoom. The editor now explains that choice. There is no
second crop algorithm, automatic reset, new encoder or data migration.

Detail styling retains the 280px desktop sidebar, 1,440px layout, alternating
timeline, architecture explorer, bento presets, decisions, gallery/lightbox and
reflections. Section spacing is 56px desktop / 40px mobile. Short feature cards
no longer stretch to the height of a neighbouring image-heavy card. Mobile
feature spans reset and galleries become one column below 480px. Anchor offsets
include the public header and collapsed mobile TOC, measured with a disposable
ResizeObserver. Truly empty optional sections are omitted from both content and
TOC. Public and authorized draft preview continue using one renderer.

### Follow-up verification record

These results are fresh follow-up runs; the earlier 165 results and M01–M08
regressions above remain historical records, not additional fresh passes.

| Command | Result | Evidence under the external temporary directory |
| --- | --- | --- |
| `node scripts/test-m09-refinement.js` | 85 PASS, 0 FAIL | `portfolio-m09-refinement-yr7TAG/refinement-results.json` |
| `node --experimental-vm-modules scripts/test-m09-browser.js` | 67 PASS, 0 FAIL | `portfolio-m09-browser-ebt3hu/browser-results.json` |
| `node --experimental-vm-modules scripts/test-m09-contract.js` | 40 PASS, 0 FAIL | `portfolio-m09-contract-W8ahU9/contract-results.json` |
| `node --experimental-vm-modules scripts/test-m09-media.js` | 31 PASS, 0 FAIL | `portfolio-m09-media-C31AwA/media-results.json` |

Total: **223 PASS, 0 FAIL**. Syntax of four changed ES modules and two test
scripts: PASS. `git -c core.whitespace=cr-at-eol diff --check`: PASS.
No full historical M01–M08 rerun, production test or production performance
claim is made. Failed development harness attempts (async evaluation/comparison,
modal-close timing and synthetic preflight routing) were corrected before the
final passing run; their diagnostic files remain outside the repository.

Coverage includes real CDP touch gestures for horizontal snap and vertical page
scroll; arrow-key navigation, last-link visibility, category resets, resize
without converting a data error into an empty state, successful retry,
0/1/7/20/1,001-project catalogs, long title/category/technology text and aligned
cards; 1920x1080, 1366x768, 1600x1000, square and portrait image dimensions with
contain/cover at desktop/tablet/mobile widths; an existing photograph in cover;
saved crop values, mobile override and unchanged input metadata; 1/12 timeline
phases, 1/7 features, 1/8 gallery items, absent architecture/media, empty optional
sections, long descriptions and shared public/preview composition at 320–1440px.
Existing browser regression covers graph/notes/lightbox focus, private Blob
preview, Save Draft isolation, publish/reconcile and revision concurrency mocks.
Handler tests retain media-access denial and direct-write boundary checks;
real PostgreSQL/Auth/RLS/Storage remain NOT VERIFIED.

The isolated launcher audit records **0 real network connections**, no runtime
errors and temporary-profile cleanup PASS. Navigation samples include the opening
animation and synthetic CMS; they are not LCP/CLS, comparable speedup measurements
or production performance baselines. Images remain lazy/async in the application;
visual captures explicitly await local fixture decoding before capture.

Visual evidence: `portfolio-m09-rf-visual-qCE0hI/` contains homepage/detail desktop
and mobile, timeline, architecture, gallery and reduced-motion screenshots,
`detail-features-final.png`, and network/cleanup audits. Admin crop screenshots
are in the final refinement test folder. Some initial capture attempts preceded
full image rasterization; use this final visual bundle for owner review.

Reproduce visual review with:

```powershell
node scripts/preview-portfolio.js --projects 20 --devtools
node scripts/preview-portfolio.js --mobile --projects 20
node scripts/preview-portfolio.js --mobile --projects 20 --reduced-motion
```

Use only the temporary Chrome opened by the launcher. Open a DEMO project from
the homepage for detail review; F12/device toolbar supports viewport inspection.
Close all preview windows or use Ctrl+C for profile cleanup. The launcher has no
production preview mode, and unknown requests still fail closed. Fixture tests
do not validate production PostgreSQL, Auth, RLS, Storage or Edge Functions.

### Follow-up scope and checkpoint

Relative to the 211-file pre-follow-up hash baseline: **9 existing files changed,
1 test script added, 0 files removed; 202 other existing files unchanged**.
Changed files: `index.html`, `css/style.css`, `css/project-case-study.css`,
`js/cms/projects.js`, `js/cms/project-data.js`, `js/cms/project-case-study.js`,
`admin/js/modules/projects/crop-editor.js`, `scripts/test-m09-browser.js` and
this document. Added: `scripts/test-m09-refinement.js`.

No database, RLS, Storage, Edge handler, dependency, CV, certificate, guestbook,
hero or opening-loader source changed during this follow-up. All previous dirty
and untracked work is retained. Git remains `backup/portfolio-m06`, last commit
`e8eebd1`; status includes **16 tracked modified + 39 untracked entries**, including
previous milestone work. No commit, deployment, migration or production access.
External scope/status evidence is retained in
`portfolio-m09-rf-baseline-N6SyS9/followup-scope.json`, `git-status.txt` and
`git-diff-stat.txt`. The Git diff stat includes earlier milestone changes;
the hash comparison identifies this follow-up's actual file scope.

All release blockers listed above remain active: local M02/M04/M06/M09 migrations
and Edge deployments; real database/storage/owner+AAL2/concurrency; trusted proxy,
rate limits, resource budgets, historical URLs/CDN cache and bucket consumers;
historical static CV transition; reference audits before orphan cleanup. No file
is deleted automatically. Native 200% zoom, other engines, physical devices and
screen readers remain NOT VERIFIED. Owner content/branding decisions stay open.

Historical visual follow-up checkpoint: **M09 — VISUAL FOLLOW-UP COMPLETE /
OWNER REVIEW REQUIRED**. The owner subsequently approved closure as recorded
below. Do not begin M10/M11.

## Owner closure and real backend integration preflight — 2026-10-21

M09: **DONE — LOCAL VERIFIED**, approved by the owner. All implementation,
visual refinement, original 165-test record, subsequent 223-test record and
unresolved release blockers above are preserved. These are previous local /
fixture results; no regression suite was rerun for this documentation closure.
Closure does not establish production readiness or real Supabase validation.

Integration checkpoint: **REAL BACKEND INTEGRATION — REVIEW**.
Execution status: **BLOCKED — required runtime/tooling and backend isolation
cannot currently be demonstrated**. No backend, migration, Auth user, Storage
operation, Edge Function or integration browser session was started.

### Verified preflight facts (static/configuration and local OS inspection)

- `docker` and `supabase` were not resolved by PowerShell `Get-Command`.
  Standard Docker Desktop executable paths, npm global executable directory,
  Chocolatey shims and project-local CLI paths did not supply these tools.
  `node_modules/` is absent, although `package.json` declares the CLI and SDK.
  No dependency or runtime installation was attempted. This establishes current
  tool unavailability, not absence from every possible location on the machine.
- No matching Docker/Podman/Supabase process or Docker service was observed;
  no listeners were returned on the inspected default Supabase/Edge ports.
  Without a container CLI, existing Docker contexts/volumes cannot be audited;
  this does not prove that no stopped database exists.
- WSL2 Ubuntu exists but is **Stopped**; no running distribution was returned.
  It was not started to search for an unverified alternate backend. Availability
  of Docker/CLI inside that stopped distribution is **NOT VERIFIED**.
- Root/nested repository environment files were not found in the inspected
  file tree (excluding `.git` and dependencies). No relevant Supabase/Docker/
  database/rate-limit process environment variable names were present.
  No values, tokens, passwords or credentials were printed or created.
- `supabase/.temp/` and `.supabase/` were absent in this checkout. No remote link,
  login, status API, database connection or project credentials were used.
- `supabase/config.toml` configures API 54321, database 54322 (PostgreSQL 17),
  Studio 54323, local SMTP 54324, analytics 54327 and Edge inspector 8083.
  TOTP enrollment and verification are enabled. Container port bindings,
  internal service URLs and actual running credentials remain NOT VERIFIED.
- The config enables `db.seed` and references `./seed.sql`, but
  `supabase/seed.sql` is absent. This is a configuration gap; no CLI failure from
  it has been reproduced. Do not assume migrations and the configured seed are
  interchangeable.
- The foundation seed creates singleton content/slots, **not an Auth account**.
  Owner admission is a commented operator step; `app_private.admin_users.user_id`
  references `auth.users.id`. Admin UI also has a configured local owner UUID,
  which must be reconciled with the synthetic identity without bypassing RLS.
- `20260818110200_certificates_seed.sql` reproduces existing owner certificate
  content. A disposable synthetic-only run needs an explicitly documented
  synthetic replacement in its temporary copy; do not change the repository's
  historical migration or treat owner content as test fixtures.
- `20260815212736_remote_schema.sql:5` contains `DROP EXTENSION pg_net` without
  `IF EXISTS`. Its success depends on the fresh database baseline. This is a
  **HYPOTHESIS to test**, not a reproduced SQL error or authorization to change
  that migration.
- CMS/admin select local endpoints by hostname, but `js/guestbook.js` still has
  hardcoded remote Supabase submission/read URLs. A localhost frontend alone
  therefore does **not** establish isolation. No ordinary frontend preview was
  opened during preflight.

### Migration dependency order (18 files, not executed)

1. `20260815212736_remote_schema.sql` — guestbook foundation/default grants.
2. `20260815213435_admin_cms_schema.sql` — CMS tables and private owner registry.
3. `20260815213442_admin_cms_rls.sql` — owner/AAL2 helpers and CMS policies.
4. `20260815213447_admin_cms_storage_policies.sql` — M01 staging/public media policies.
5. `20260815213451_admin_cms_seed.sql` — empty singleton/slot foundation.
6. `20260815234351_harden_public_default_privileges.sql` — default privilege hardening.
7. `20260818020000_security_hardening_pre_production.sql` — security constraints/grants.
8. `20260818100000_hero_media_visibility.sql` — hero visibility.
9. `20260818110000_certificates_schema.sql` — certificate schema/policies.
10. `20260818110100_certificates_minimum_published.sql` — historical count latch.
11. `20260818110200_certificates_seed.sql` — historical certificate content.
12. `20260818120000_certificate_documents.sql` — document references/policies.
13. `20261019010000_m02_request_budgets.sql` — shared request budgets.
14. `20261019011000_m02_certificate_privacy.sql` — private document bucket;
    removes historical minimum-published trigger.
15. `20261019020000_m04_project_cover_layout.sql` — legacy cover metadata.
16. `20261019030000_m06_cv_management.sql` — protected CV metadata/storage;
    depends on the earlier owner helpers and request budgets.
17. `20261021090000_m09_project_snapshots.sql` — drafts, revisions, assets,
    operations, public projection and restricted mutations; depends on CMS/Auth.
18. `20261021091000_m09_project_assets.sql` — private asset bucket, registry and
    delivery/budget RPCs; depends on M09 snapshots.

M01 has no separately named migration in this inventory. Its real media checks
depend on the foundational CMS/Storage configuration. No migration order or SQL
success is claimed as runtime verified. No existing database was reset.

### Local-only setup plan (not executed)

1. Make a Docker-compatible local runtime and Supabase CLI available with owner
   approval for any installation. The official [local-development guide](https://supabase.com/docs/guides/local-development)
   documents these prerequisites and loopback-bound container networking.
   Do not use `npx` as an implicit installer while installation is prohibited.
2. Verify CLI version, Docker endpoint/context and daemon locality before any
   start. Audit existing container names/volumes, reserve unused ports and use a
   new disposable project ID/workspace outside the repository. Do not reuse,
   reset or delete an existing local database. Do not copy remote link metadata,
   production environment files, credentials or real media into it.
3. Prepare a reviewed temporary config/migration copy with only synthetic seed
   content and an explicit seed-file decision. Preserve all authorization DDL;
   record differences from the 18 source migrations. Resolve baseline/extension
   assumptions before claiming a successful full-chain migration.
4. Bind frontend, API, database and Studio to loopback and verify actual Docker
   published bindings, internal container URLs, database identity and local key
   provenance. Capture startup metadata privately and redact all credentials.
   A `127.0.0.1` frontend or URL string alone is insufficient evidence.
5. Required server environment names: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_PEPPER`; `TRUSTED_PROXY_IP_HEADER` is
   optional and must stay unset until a trusted overwriting proxy is verified.
   Unset header uses the existing shared-unverified identity/budget; it does not
   validate per-client proxy behavior. CLI-generated local keys only; a new
   local pepper kept outside source/logs. The Studio OpenAI and disabled external
   OAuth/S3 placeholders are not a reason to request production credentials.
6. Provision a synthetic owner and non-owner through **local Auth Admin**, using
   local operator authority only for provisioning. Admit the owner UUID into the
   local private registry, and map that UUID plus the verified local API URL and
   local public/anon key in an isolated preview-only config overlay for both CMS
   and admin. Never send the service-role key to the frontend. Keep production
   source/config unchanged. The user then signs in at
   AAL1 and follows real `mfa.enroll` -> `mfa.challenge` -> `mfa.verify` TOTP,
   already implemented in `admin/js/core/auth.js`. Verify actual Auth session
   AAL2 and the server authorization RPCs; never manufacture a JWT/claim or
   replace an AAL2 check. See [Supabase MFA enrollment](https://supabase.com/docs/reference/javascript/auth-mfa-enroll).
   If actual MFA cannot complete, keep that path BLOCKED. Also test anonymous,
   non-owner and owner AAL1 denials.
7. Run the seven function entrypoints locally: `submit-comment`,
   `certificate-document`, `manage-cv`, `cv-document`, `manage-project`,
   `project-asset`, `project-media`. Verify their runtime environment and package
   resolution before connecting the frontend; imports need an approved local
   package cache/setup. Function `verify_jwt = false` settings retain explicit
   handler authorization and are not permission to bypass authentication.
8. Serve the original frontend/admin on loopback in a new temporary browser
   profile. Intercept before navigation and allow only the verified local
   frontend/API targets; deny all remote services and unknown routes, including
   hardcoded guestbook/CDN requests. Known backend responses must come from the
   real local services, with no M07 fixtures or fabricated successful responses.
   A local config overlay can map the guestbook target to the local function;
   if any required route cannot be mapped and proven local, block that test.
   Only then run the requested real-backend test matrix.

### Actual execution matrix

| Area | Result | Evidence classification |
| --- | --- | --- |
| M09 owner-approved documentation closure | PASS | Documentation only; historical local results retained |
| Windows runtime/tooling availability | BLOCKED | OS/path inspection; Docker/CLI not available to this session |
| Actual service/network isolation | BLOCKED | No stack started; remote guestbook reference found statically |
| Migration/bootstrap | NOT RUN | 18-file static dependency review; no SQL execution/errors measured |
| Actual Auth login, owner/AAL1/AAL2 | BLOCKED / NOT RUN | TOTP source/config present; no local Auth execution |
| Actual RLS/Storage/privacy | BLOCKED / NOT RUN | No local PostgreSQL or Storage service |
| Edge runtime/function execution | BLOCKED / NOT RUN | Source/config inspected only |
| M09 create/upload/crop/draft/reload/preview/publish/status/CAS/recovery | BLOCKED / NOT RUN | Earlier fixture passes do not verify the real backend |
| M01 promotion, M02 certificate privacy, M04 legacy cover, M06 CV | BLOCKED / NOT RUN | No real-backend feature test performed |
| Local-backend homepage/mobile swipe/detail/admin/certificates/CV | BLOCKED / NOT RUN | No integration browser or server started |

There is no real-backend preview URL or login to provide yet. The M07 launcher
above remains a fixture-only visual preview and must not be presented as backend
integration evidence. All prior release blockers remain open, including real
database/Storage/RLS/owner+AAL2, concurrency/recovery, proxy/rate limits, Edge
runtime/resources, migration rollout, shared bucket consumers, historical
URLs/cache, static CV transition and reference audit before any orphan cleanup.

Only this documentation file changed for closure/preflight; application,
migrations, policies, functions, dependencies and existing files remain intact.
Git stays on `backup/portfolio-m06`, commit `e8eebd1`, with existing dirty work
preserved. External inspection evidence: `portfolio-backend-preflight-57RqAP/`.
No dependency installation, browser regression rerun, migration, reset, remote
project access, deployment or mutating Git operation was performed.

Stop at **REAL BACKEND INTEGRATION — REVIEW** (preflight BLOCKED). Await owner
review/setup before resuming; M10/M11 have not started.
