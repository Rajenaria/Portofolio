# Portfolio

## Context and current architecture

Personal portfolio for Rajendra Aria Nismara (Computer Engineering, Telkom
University). Production frontend remains static HTML, Structured Vanilla CSS
and JavaScript/ES Modules: no framework, bundler or production build step.
M08 Option A remains approved; Tailwind and framework migration are DEFER.

M01–M10 are DONE — LOCAL VERIFIED; M10 closure is owner-approved.
M11 staging integration is verified; production release remains pending.
See docs/Features/M11-TECHNICAL-COMPLETION.md for measured scope and release gates.
Source and fixture tests alone do not establish deployed behavior.
Do not infer production readiness from earlier descriptions saying "deployed".
Milestone history remains under `docs/Features/` and `docs/Security/`.

## Public features and entry points

- `index.html`: hero/opening animation, About/organization/technologies,
  experience, education, CMS certificates, Projects, contact/guestbook/footer.
- Projects: category filter, initial six and load-more on desktop/tablet;
  native horizontal swipe at <=650px on mobile. Actual published CMS data
  controls cards, category labels, cover positioning and detail links.
- `project.html?slug=...`: shared structured case-study renderer, sticky TOC,
  timeline, architecture explorer, feature cards, decisions, gallery/lightbox
  and reflections. Legacy CMS records have a compatibility adapter.
- `projects/project-football-club.html` and `project-ecommerce.html`: retained
  static historical routes. Their duplicate Football Club content is an open
  owner-content issue; do not fabricate E-Commerce content.
- Hero/footer CV use one active metadata version and delivery endpoint, with
  legacy fallback only after confirmed old schema or unconfigured CV.
- Guestbook reads comments and submits via `submit-comment`; its request
  contract and moderation/filtering remain protected.
- `admin/index.html`: owner/MFA-gated CMS, working drafts, preview, publishing,
  crop/media management and unsaved-change guard.

## Module and stylesheet ownership

| Entry / module | Responsibility |
| --- | --- |
| `js/initial-loader.js` | Early readiness gate; loaded in head before main scripts. |
| `js/script.js` | Homepage navigation, section interactions and shared lifecycle. |
| `js/hero-photo-stack.js`, `experience-stack.js`, `certificates.js` | Dedicated interactive components; preserve existing timing and disposal. |
| `js/cms/client.js` | Public Supabase reads and URL helpers. |
| `js/cms/profile-about.js`, `technologies.js`, `certificates.js`, `cv.js` | Public CMS section adapters. |
| `js/cms/projects.js` | Homepage filters, pagination, native mobile rail and reveal observer. |
| `js/cms/project-data.js`, `project-cover.js` | Shared catalog/legacy DTO and image/crop helpers. |
| `js/cms/project-detail.js`, `project-case-study.js` | Detail entry and shared public/admin renderer, with cleanup. |
| `admin/admin.js`, `admin/js/core/` | Admin router, session/MFA, modal/form/dirty guard, upload and server gateways. |
| `admin/js/modules/` | Per-feature CMS controllers; project draft state/editor/crop/preview remain together. |

Stylesheet ownership/load order:

- Homepage: `css/style.css`, with critical loader style in `index.html`.
  It owns global theme/tokens, section styles and ordered responsive overrides.
  Preserve its cascade; do not split/merge rules based only on similar selectors.
- CMS detail: `css/project-detail.css` then `css/project-case-study.css`.
- Admin: `admin/admin.css` then shared `css/project-case-study.css`.
- Legacy details: `css/project-legacy.css`, containing the exact shared original
  inline declarations at their former load position. No relative asset URLs.
- `.project-case-study` scopes shared renderer styles/tokens. Keep public/admin
  presentation boundaries, `[hidden]`, focus-visible, reduced motion and 650px
  image selection. Keep CSS selectors and animation names used by controllers.

## Supabase boundaries

There is server-side backend logic in Supabase Edge Functions and PostgreSQL,
although Vercel serves the frontend statically. Source lives in `supabase/`:

- Historical migrations define CMS tables, private schemas, RLS/grants, storage
  access, request budgets and snapshot activation. Do not rewrite migration
  history during cleanup.
- `submit-comment` manages guestbook submission/rate limits.
- `certificate-document` verifies current publication and document reference
  for private certificate delivery; Hide/Archive retain documents.
- `manage-cv` / `cv-document` validate owner+AAL2 uploads and active-version
  downloads in private `portfolio-cv`; inactive versions remain private.
- `manage-project`, `project-asset`, `project-media` and shared helpers manage
  private drafts/originals, registry/derivatives, public publication checks,
  revision/CAS/idempotency and recovery. No automatic orphan cleanup.
- Browser publishable keys are not server secrets. Service-role keys belong
  exclusively in server runtime. Client checks never replace server/RLS checks.

Frontend/SQL/Edge contracts and real staging PostgreSQL, Auth/MFA, Storage/RLS,
concurrency and Edge deployment evidence are documented in M11. Production and
hosted frontend verification remain release gates.

## Directory and asset contracts

```
index.html / project.html    Current public entries
projects/                   Retained static detail routes
css/ / js/                  Public styles, components and CMS modules
admin/                      Admin entry, vendor SDK, styles and modules
assets/images/              profile / education / experience / projects /
                            branding / backgrounds
assets/documents/           Historical static CV (transition decision pending)
supabase/                   Migrations, functions and local configuration
scripts/                    Developer utilities, isolated fixtures and tests
docs/                       Decisions, design, security and milestone history
```

Every image with a `-mobile.webp` counterpart retains
`<picture><source media="(max-width: 650px)">`. Keep both variants and historical
asset URLs. Both existing Node+Sharp and Python+Pillow image optimizers remain:
one uses an explicit manifest, the other scans sizes and can audit HTML.
Do not remove assets merely because static HTML does not reference them.

## Verification and deployment

Use `node scripts/preview-portfolio.js` for isolated synthetic visual review.
No HTTP server or backend runs in that launcher; Chrome gets a temporary
profile, guarded network and known local responses. Direct static serving is
not itself safe isolation for the source's remote service configuration.
See README and `docs/Features/M07-SAFE-LOCAL-PREVIEW.md`.

`package.json` holds development image tooling; `npm test` is a failing
placeholder. Run the relevant explicit `scripts/test-*.js` commands instead.
ES Modules need HTTP; no dependency installation/build is needed for the
native Chrome/CDP fixture scripts. Fixture passes are not real backend proofs.

Vercel configuration/CSP and `.vercelignore` retain static deployment and
exclude docs, scripts, Supabase definitions and local config. New production
files stay within existing public folders; do not rename routes or add layers.

M11 must verify migration/bootstrap compatibility (M02/M04/M06/M09), local and
staging function runtime, owner/AAL2, grants/RLS, storage consumers, trusted
proxy/rate limits, concurrency/recovery, historical URLs/CDN cache and static
CV transition. Audit references before any orphan cleanup. Favicon remains
DEFER pending personal logo; expanded hero geometry remains OPEN for visual
review. M10 does not resolve or weaken these blockers.
