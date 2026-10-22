# Portfolio

## Overview

Personal portfolio website for Rajendra Aria Nismara (Computer Engineering,
Telkom University). Single-page site (`index.html`) covering hero,
about/organization/tech-stack slider, experience, education, portfolio
projects, and a contact section with a live guestbook. Two standalone
project detail pages live under `projects/`.

The site is finished, deployed, and its visual design is final. This
document describes the project as it exists today — it is not a design
spec and does not propose visual changes.

## Goals

- Present Rajendra's background, experience, and project work to visitors
  (recruiters, collaborators, university contacts).
- Let visitors leave a public message (guestbook) that others can see.
- Provide a downloadable CV and direct contact links (Instagram, WhatsApp,
  email, LinkedIn).

## Main Sections / Features

- **Hero** — name, headline, CTA buttons (View Projects, Download CV).
- **About** — horizontal 3-slide section: personal intro, organization/lab
  activity documentation (inner photo carousel), and tech stack grid.
- **Experience** — card grid of 4 professional/organizational experiences.
- **Education** — SMA Pasundan 1 Bandung and Telkom University.
- **Portfolio** — horizontally scrollable project card grid, 3 real
  projects + 3 "coming soon" placeholders. Two projects link to standalone
  detail pages in `projects/`.
- **Contact + Guestbook** — social/contact links on the left; a guestbook
  form + live comment list (backed by Supabase) on the right.
- **Footer** — profile summary, contact info, quick links.

## Tech Stack

- **HTML** — `index.html`, `projects/*.html` (no templating/build step).
- **CSS** — single stylesheet, `css/style.css`.
- **JavaScript** — vanilla JS, no framework or bundler:
  - `js/script.js` — navigation, sliders/carousels, scroll reveal, general
    page interactivity.
  - `js/guestbook.js` — guestbook form validation, Supabase submission,
    comment list rendering/slider, drag-to-scroll.
- **Fonts/icons** — Google Fonts (Poppins), Devicon, Iconify — all loaded
  from CDN in `index.html`'s `<head>`, not bundled locally.

## External Services

- **Supabase** — used exclusively by the guestbook (`js/guestbook.js`):
  - Reads/writes the `comments` table via the Supabase REST endpoint.
  - Submits new comments through a Supabase Edge Function
    (`/functions/v1/submit-comment`).
  - The client uses a Supabase **publishable** key (`sb_publishable_...`),
    which is Supabase's newer public/anon-style key meant for client-side
    use under Row Level Security — this is expected to be visible in
    frontend source. See `README.md` for the exact location if you need to
    rotate it.

## System Architecture

```
Browser
│
├── HTML  (index.html, projects/*.html)
├── CSS   (css/style.css)
└── Vanilla JavaScript (js/script.js, js/guestbook.js)
       │
       └── Guestbook (js/guestbook.js)
             ↓
          Supabase (REST + Edge Function)
```

No backend, no build step, no server-rendered logic. `scripts/` contains
developer-only utilities (image optimization) that never run in the
browser and are not part of the deployed site.

## Project Structure

```
index.html                     Main single-page site
css/style.css                  Site stylesheet (single file)
js/script.js                   General site JS (nav, sliders, reveal)
js/guestbook.js                Guestbook form + Supabase integration
projects/                      Standalone project detail pages
  project-football-club.html
  project-ecommerce.html
assets/
  images/
    profile/                   Hero + about-me photos
    education/                 School/university logos
    experience/                Organization/lab documentation photos
    projects/                  Portfolio card + project-page images
    branding/                  Small standalone icons (site/tech icons,
                                unused social-icon PNGs — see README)
    backgrounds/                Section background images
  documents/
    CV-Rajendra Aria Nismara.pdf
scripts/                       Dev-only utilities (not shipped to browser)
  optimize-mobile-images.js    Node + Sharp mobile image generator
  optimize-mobile-images.py    Python + Pillow mobile image generator +
                                HTML <picture> auto-wrap audit
package.json / package-lock.json   Node deps for the JS optimizer (sharp)
requirements.txt               Python deps for the Python optimizer (Pillow)
```

Every image with a `-mobile.webp` counterpart is served responsively via
`<picture><source media="(max-width: 650px)">`. Both the original
(desktop) and mobile files are kept side by side in the same category
subfolder under `assets/images/`. This mechanism was not changed by the
2026-08-13 structure cleanup — only the folder each file lives in.

## Development Status

Feature-complete and deployed. Current work is limited to structure/
documentation cleanup, not new features or redesign. See
`## Important Notes` below for one open content issue.

## Important Notes

- **Duplicate project content (needs content review):** `projects/
  project-football-club.html` and `projects/project-ecommerce.html` are
  byte-identical — both currently show Football Club / Real Madrid
  content. `index.html`'s "E-Commerce Application" portfolio card links to
  `project-ecommerce.html`, so that card is showing the wrong project
  content today. The files were renamed (2026-08-13) to match which
  portfolio card currently links to them, but the content itself was
  **not** rewritten — writing real E-Commerce project content requires
  input from the project owner and was out of scope for a structure-only
  refactor.
- **Two image optimizers, same job:** `scripts/optimize-mobile-images.js`
  (Node + Sharp) and `scripts/optimize-mobile-images.py` (Python +
  Pillow) both generate mobile WebP images, using different mechanisms
  (explicit manifest vs. automatic size-based scan + optional HTML
  auto-wrap). Both are kept — see `README.md` for when to use which.
- Do not reintroduce a flat `Image/`, `JS/`, or `Project/` folder — the
  site now expects `assets/images/<category>/`, `js/`, and `projects/`.
