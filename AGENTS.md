# AGENTS.md

Rules for any developer or AI working in this repository. Read
`PROJECT.md` first for what this project is and how it's structured.

## General

- Read `PROJECT.md` before making any significant change.
- Inspect existing code before creating new files — check whether
  something similar already exists in `js/`, `css/`, `assets/`, or
  `scripts/`.
- Follow the existing structure. Don't invent new top-level folders
  (`services/`, `controllers/`, `frontend/`, etc.) for a static site this
  size.
- Keep the architecture simple. This is a static HTML/CSS/JS site with
  one external service (Supabase) — it does not need more layers than
  that implies.
- Follow existing technology choices (see "Project-Specific" below).
- Do not modify unrelated files. A change to the guestbook should not
  touch the education section, and vice versa.
- Do not introduce unnecessary abstractions. A single-file `css/style.css`
  and two-file `js/` split is intentional, not an oversight.

## Project-Specific

- This project uses **HTML, CSS, and Vanilla JavaScript**. No framework,
  no bundler, no build step for the production site.
- Do not introduce a frontend framework (React, Vue, Next.js, etc.) or a
  build tool (Vite, Webpack, etc.) without explicit approval — this would
  break the current "open `index.html`, deploy as static files" workflow.
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

## AI Improvement Behavior

You may notice improvements while working. How you act on them depends on
their size:

**Small / local improvement** (e.g. fixing a typo, tightening a comment,
correcting an obviously wrong relative path):
```
may be done directly
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
