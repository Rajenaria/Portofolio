# Portfolio — Rajendra Aria Nismara

Personal portfolio website. Static HTML/CSS/JS, no build step, with a
Supabase-backed public CMS, Admin CMS and guestbook. See `PROJECT.md` for a fuller description of
goals, sections, and architecture, and `AGENTS.md` for contribution rules.

## Project Overview

Single-page portfolio (`index.html`), CMS case-study route
(`project.html?slug=...`), Admin CMS (`admin/`) and two retained legacy detail
pages (`projects/`). Sections: hero, about (with an org/activity photo
carousel and tech stack grid), experience, education, portfolio, and a
contact section with a live guestbook.

## Tech Stack

- HTML, CSS, Vanilla JavaScript — no framework, no bundler.
- Google Fonts, Devicon, and Iconify loaded from CDN.
- Supabase PostgreSQL/Auth/Storage and Edge Functions for CMS, private drafts,
  media delivery, versioned CV and guestbook. Real-backend integration remains
  deferred to M11; fixture results do not prove deployment readiness.
- Node + Sharp and Python + Pillow as **development-only** utilities for
  generating mobile-optimized images — neither runs in the browser.

## Project Structure

```
index.html                 Main site
project.html               CMS Project Detail entry
css/style.css               Homepage styles, tokens and ordered overrides
css/project-detail.css      Generic Project Detail base
css/project-case-study.css  Scoped shared public/admin case-study renderer
css/project-legacy.css      Shared original styles for legacy projects/*.html
js/script.js                 Nav, sliders, scroll reveal, general JS
js/guestbook.js              Guestbook form + Supabase
js/cms/                     Public CMS adapters/controllers/shared renderer
admin/                      Admin entry, styles, core utilities and CMS modules
projects/                    Retained legacy project detail URLs
supabase/                   Local migrations and Edge Functions
assets/images/                Photos/logos/icons, grouped by where they're used:
  profile/  education/  experience/  projects/  branding/  backgrounds/
assets/documents/              CV (PDF)
scripts/                       Dev-only optimization, fixtures, preview and regression
```

Every image with a `-mobile.webp` sibling in the same folder is the mobile
variant, served via `<picture><source media="(max-width: 650px)">` — keep
both files together when adding or moving images.

## How to Run Locally

For isolated visual review without production requests, use the existing
Chrome/CDP fixture launcher (Chrome installed locally; no new dependencies):

```
node scripts/preview-portfolio.js
node scripts/preview-portfolio.js --mobile --reduced-motion
```

It creates a temporary profile and intercepts requests before navigation.
Synthetic data/local files fulfill known requests; others are denied. The
displayed loopback URL works only in that browser. This is not a backend test.
See [preview documentation](docs/Features/M07-SAFE-LOCAL-PREVIEW.md).

ES Modules require HTTP rather than `file://`. For an explicitly authorized
backend environment, an existing static server such as
`python -m http.server 8000 --bind 127.0.0.1` can serve the files. That server
alone does not isolate hardcoded remote URLs: configure and verify local
targets before loading the application. The fixture launcher does not set up
a backend.

The source checkout now starts with an inactive deployment configuration.
Unknown hosts never fall back to production. The fixture launcher supplies its
own synthetic config and matching CSP; ordinary local/staging integration needs
an explicitly reviewed artifact. `scripts/prepare-environment.js` prepares a
new directory outside this repository, without installing/building/deploying.
See [M11 environment configuration](docs/Features/M11-STAGING-CONFIGURATION.md)
for the public contract, fail-closed rules and staging approval gates.

`package.json` is only used for the Node image-optimization dependency
(`sharp`) — running `npm install` is only needed if you plan to run
`scripts/optimize-mobile-images.js`, not to view the site.

## External Services

**Supabase** — used by public/admin CMS and guestbook:
- Comments are read from and written to a Supabase `comments` table via
  the REST API.
- New comment submissions go through a Supabase Edge Function
  (`submit-comment`).
- Public CMS uses `js/cms/client.js`; admin uses `admin/js/core/supabase.js`
  and its vendored SDK. Server authorization, private media and revision
  activation are defined under `supabase/`.
- The client-side key in `js/guestbook.js` is a Supabase **publishable**
  key (`sb_publishable_...`) — Supabase's public/anon-style key, intended
  to be exposed in frontend code and constrained by Row Level Security on
  the Supabase side. This is expected, not a leaked secret. If you need to
  rotate it or review the RLS policy, do that in the Supabase dashboard
  for this project.

## Image Optimization Scripts

Two independent dev-only scripts generate the mobile WebP images used by
`<picture>` tags across the site. Neither is required to view or deploy
the site — they're only for adding/refreshing images. **Both are kept
intentionally**, they solve the same problem differently:

- **`scripts/optimize-mobile-images.js`** (Node + Sharp)
  - Driven by an explicit manifest of source → output files in the script.
  - Use when you want tight control over exactly which files are
    processed and their size budget/category.
  - Run: `npm install` once, then `node scripts/optimize-mobile-images.js`.

- **`scripts/optimize-mobile-images.py`** (Python + Pillow)
  - Automatically scans every `assets/images/<category>/` subfolder for
    large images (skipping small icons/logos by size/dimension) and
    generates any missing/stale mobile WebP files.
  - Can also **audit or auto-wrap** `<img>` tags in `index.html` and
    `projects/*.html` with the `<picture><source>` mobile pattern —
    useful after adding a brand-new image, since it removes the manual
    HTML edit.
  - Run (from the project root, with the venv active):
    ```
    python -m venv .venv
    ./.venv/Scripts/python.exe -m pip install -r requirements.txt
    python scripts/optimize-mobile-images.py            # dry-run report
    python scripts/optimize-mobile-images.py --apply-html
    ```

Neither script ever modifies or deletes an original/source image — they
only create or refresh the paired `-mobile.webp` file next to it.

## Deployment Notes

- Fully static — deploy `index.html` and the folders above to any static
  host (GitHub Pages, Netlify, Vercel static, etc.) with no build command.
- `index.html` must stay at the project root; deployment does not depend
  on `package.json`/`requirements.txt`, which exist only for the local
  dev-utility scripts.
- All internal links/asset paths are lowercase-folder, relative paths
  (`assets/images/...`, `js/...`, `projects/...`). Keep new files
  lowercase-folder to stay safe on case-sensitive Linux hosting, even
  though local Windows development won't catch a case mismatch.
