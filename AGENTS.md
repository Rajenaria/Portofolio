# AGENTS.md

Rules for any developer or AI working in this repository. Read
`PROJECT.md` first for project context, then verify relevant code and
configuration; some architecture descriptions predate the CMS.

## General

- Read `PROJECT.md` before making any significant change.
- Inspect existing code before creating new files — check whether
  something similar already exists in `js/`, `css/`, `assets/`, `admin/`,
  `supabase/`, or `scripts/`.
- Follow the existing structure. Don't invent new top-level folders
  (`services/`, `controllers/`, `frontend/`, etc.) for a static site this
  size.
- Keep the architecture simple. This is a static HTML/CSS/JS site with
  one external service (Supabase) — it does not need more layers than
  that implies.
- Follow existing technology choices (see "Project-Specific" below).
- Do not modify unrelated files. A change to the guestbook should not
  touch the education section, and vice versa.
- Do not introduce unnecessary abstractions. Preserve the existing public
  styles/scripts, `js/cms/`, and `admin/js/` module boundaries unless a
  scoped restructuring has been approved.

## Project-Specific

- This project uses **HTML, CSS, and Vanilla JavaScript**. No framework,
  no bundler, no build step for the production site.
- Do not introduce a frontend framework (React, Vue, Next.js, etc.) or a
  build tool (Vite, Webpack, etc.) without explicit approval — this would
  change the static deployment workflow. Use a local HTTP server for
  module-based public CMS and admin verification.
- Preserve the existing visual design (layout, spacing, color, typography,
  animation, responsive behavior) unless a redesign is explicitly
  requested. The current design is final, not a work in progress.
- Preserve the mobile/desktop responsive-image pattern: every image that
  has a `-mobile.webp` counterpart is wrapped in
  `<picture><source media="(max-width: 650px)">`. Don't remove the mobile
  variant or change how it's selected.
- Preserve Supabase guestbook behavior: request format, table, Edge
  Function, and filtering in `js/guestbook.js` must not change without
  approval. If a local path needs to change because of a refactor, that's
  fine — the request/response contract with Supabase is not.
- Reuse existing assets and utilities. Add new images to the matching
  `assets/images/<category>/` subfolder (profile / education / experience
  / projects / branding / backgrounds) rather than inventing a new one for
  a single file, and reuse `scripts/optimize-mobile-images.{js,py}` for
  generating mobile WebP variants instead of writing new tooling.
- Do not create architectural layers (e.g. a `services/` or `api/` folder)
  unless a real, current requirement needs them.
- Significant CSS/JS modularization (splitting `css/style.css` or
  `js/script.js` into multiple files) must be proposed before it's
  implemented — see "AI Improvement Behavior" below.

## Instruction Scope and References

- This file applies repository-wide. Inspect any applicable nested
  `AGENTS.md` / `AGENTS.override.md` before editing an area.
- `PROJECT.md` and `README.md` describe project context; verify current
  behavior against source/configuration and report discrepancies.
- `docs/PORTFOLIO_MASTER_PROMPT.md` and `docs/AGENTS_PORTFOLIO_DRAFT.md`
  remain references, not automatic implementation authorization or
  overrides of this file. Tailwind CSS and framework migration evaluation
  remains PROPOSED; migration requires explicit approval.
- Check availability and status of referenced workflow documents before
  using them; report missing references without inferring their contents.
- For CMS work, consult relevant docs under `docs/Features/`,
  `docs/Database/`, `docs/Security/`, and `docs/Design/`. Respect their
  stated planning/historical scope; report conflicts with current code
  and confirmed decisions instead of assuming deployment or approval.

## Safety and Verification

- Preserve existing CMS data contracts, owner/MFA checks, database and
  Storage authorization, public/private visibility, and guestbook behavior.
  Propose changes to these boundaries before implementation.
- Do not expose secrets or session tokens. Client publishable keys are
  distinct from server secrets; do not rotate credentials during an audit.
- Keep local and production targets distinct. Do not access production,
  deploy, apply migrations, change secrets/dependencies, delete existing
  files/data, or mutate Git without explicit authorization for that scope.
- Verify according to impact: responsive behavior, keyboard/focus,
  reduced motion, and security boundaries where relevant. Report actual
  commands/results and distinguish PASS, FAIL, NOT RUN, NOT VERIFIED.
- No working automated test suite, lint, typecheck, or build command is
  defined in `package.json`; `npm test` is a failing placeholder.
  Do not report unavailable checks or historical audit results as passed.
- User-facing reports use Bahasa Indonesia and distinguish verified
  facts, proposals, approved decisions, and unresolved items.

## AI Improvement Behavior

- During read-only audits, do not edit even small issues. Present the
  proposed diff and wait for approval before integration.
- Approval covers the agreed subtask only. Do not expand scope or advance
  to another milestone without authorization; do not re-request approval
  for work already explicitly authorized within that scope.

You may notice improvements while working. How you act on them depends on
their size:

**Small / local improvement** (e.g. fixing a typo, tightening a comment,
correcting an obviously wrong relative path):
```
may be done directly within an authorized implementation scope
↓
explain what you did afterward
```

**Significant / project-wide improvement** (e.g. splitting a big file,
changing the image folder layout, replacing a script, changing the
Supabase integration):
```
identify problem
↓
explain reason
↓
propose change
↓
explain impact
↓
request approval
↓
implement only after approval
```

If an existing rule in this file no longer fits the project, don't
silently break it — propose an update to `AGENTS.md` instead.

## Portfolio Maintenance Rules

- **Surgical editing:** change only the code and files genuinely required
  by the user's request.
- Preserve the working design, structure, features, animations, Admin
  system, and database integrations.
- Do not refactor, migrate, apply mass formatting, or add dependencies
  unless explicitly requested.
- **Default ANALYZE ONLY:** audit and investigation requests produce a
  report only. Do not fix findings until the user clearly requests
  implementation or gives approval (ACC).
- If a change requires expanding scope, explain the required work and wait
  for approval before proceeding with that expansion.
- Do not run tests, lint, builds, servers, or deployments unless the user
  requests them.
- Do not change the production database or user data without explicit
  permission.
- After implementation, briefly report the changes and affected files.
- Do not automatically fix unrelated bugs discovered during other work.
- Do not read or display secrets or credentials unless there is a
  legitimate need to do so.
