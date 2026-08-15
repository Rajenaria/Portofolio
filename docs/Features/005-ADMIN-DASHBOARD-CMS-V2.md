# Portfolio Admin CMS — Blueprint & Design Preservation Specification V2

**Project:** Project Web Portfolio — Admin Dashboard / CMS  
**Repository:** Existing Portfolio V1 repository  
**Status:** Planning / Specification Freeze — **DO NOT IMPLEMENT YET**  
**Public Portfolio:** Existing HTML + CSS + Vanilla JavaScript website  
**Backend Platform:** Supabase Free  
**Public Hosting:** GitHub Pages  
**Admin Access:** Single owner/admin only  
**Primary Constraint:** **Rp0 / free-only stack**  
**Source of Truth:** This document supersedes the previous `005-ADMIN-DASHBOARD-CMS.md` planning draft after audit of the current Portfolio V1 source code.

---

# 0. MASTER RULE — PUBLIC V1 DESIGN IS LOCKED

The existing Portfolio V1 website is the visual and interaction source of truth.

The CMS exists to change **content**, not to redesign the public website.

## HARD DESIGN LOCK

The implementation MUST preserve the existing public V1:

- page structure,
- section order,
- spacing,
- typography,
- colors,
- card shape,
- card sizing,
- card hierarchy,
- responsive layout,
- desktop behavior,
- tablet behavior,
- mobile behavior,
- floating navbar,
- navbar expansion/collapse behavior,
- mobile hamburger behavior,
- Hero layout,
- Hero interactive photo-stack animation,
- About 3-slide structure,
- About slide transitions,
- About organization photo carousel,
- Tech Stack visual,
- Experience sticky stacking behavior,
- Education visual,
- Certificates visual and carousel/ring behavior,
- Portfolio horizontal carousel,
- project-card design,
- project detail page design,
- Contact layout,
- Guestbook visual,
- Guestbook slider,
- particles/interactions,
- plane send animation,
- Footer,
- existing hover states,
- existing easing/timing where already defined,
- existing responsive image behavior.

## CMS RULE

```text
CMS DATA
    ↓
EXISTING V1 TEMPLATE / UI
    ↓
SAME PUBLIC DESIGN
```

NOT:

```text
CMS
    ↓
NEW PUBLIC DESIGN
```

No coding assistant may redesign the public site merely because the content becomes dynamic.

---

# 1. PROJECT IDENTITY

## Name

**Project Web Portfolio — Admin Dashboard / CMS**

## Project Type

Personal Portfolio CMS / Admin Dashboard added on top of the existing Portfolio V1.

## Existing Public Technology

- HTML
- CSS
- Vanilla JavaScript
- Supabase
- GitHub Pages

## CMS Principle

Keep the architecture as simple as possible.

A framework, bundler, VPS, custom backend server, paid CDN, paid Auth provider, or paid image service must NOT be added without an explicit technical requirement and owner approval.

---

# 2. PROJECT IDEA

The owner needs a private Admin Dashboard to manage portfolio content without editing HTML manually.

The Admin should make it possible to:

- edit Hero text,
- replace the 3 Hero photos,
- edit About content,
- manage About organization/gallery photos,
- edit organization/activities text and skill content,
- manage Experience cards,
- manage Project cards,
- create Project detail content,
- upload multiple Project documentation images,
- manage Technologies / tags,
- publish or hide content,
- reorder content,
- optimize uploaded images automatically,
- keep all public output consistent with the existing V1 template.

The system must reduce repetitive source-code editing.

---

# 3. PROBLEM TO SOLVE

Current portfolio content is largely hard-coded.

Without CMS, adding/updating content can require:

- opening HTML/JS,
- editing individual cards,
- manually managing image paths,
- manually generating desktop/mobile image variants,
- duplicating project-detail HTML files,
- manually maintaining ordering,
- committing source-code changes for simple content updates.

The CMS must turn those operations into structured content management.

---

# 4. PRODUCT GOAL

The Admin Dashboard must provide:

- convenience,
- consistency,
- safe content management,
- predictable output,
- no unnecessary source-code edits,
- no public-site redesign,
- secure owner-only access,
- zero-spend operation.

Success means the owner can publish new professional content while the public site keeps the same visual identity and behavior.

---

# 5. USERS & PERMISSIONS

## 5.1 Public Viewer

No login.

May:

- read public Profile/Hero content,
- view active Hero images,
- read About content,
- view active About Gallery images,
- view active Tech Stack,
- view published Experience records,
- view published Projects,
- open published Project detail pages,
- view Project documentation images,
- use the existing Guestbook.

May NOT:

- access protected Admin data,
- create CMS content,
- update CMS content,
- delete CMS content,
- upload CMS media,
- publish/unpublish content,
- alter order,
- call privileged Storage operations.

---

## 5.2 Admin

Exactly **one owner account**.

May:

- login,
- pass MFA,
- manage CMS content,
- upload media,
- edit,
- save draft,
- preview,
- publish,
- unpublish,
- archive,
- reorder,
- soft-delete supported content,
- restore Project records,
- permanently delete where explicitly allowed,
- logout.

There is no public account creation.

---

# 6. SECURITY REQUIREMENTS — HARD REQUIREMENT

Security is not implemented by merely hiding `/admin/`.

Someone may discover the Admin URL. That must NOT grant any privileged access.

```text
Visitor finds /admin/
        ↓
Login only
        ↓
No valid owner session
        ↓
NO ADMIN OPERATION
```

## 6.1 Single Admin

- One Supabase Auth account only.
- Account is created manually.
- Public signup is disabled.
- No Register page.
- No Google Login in V1.
- No multi-admin in V1.

## 6.2 Owner-Specific Authorization

Admin authorization must NOT mean:

```text
user is authenticated
```

It must mean:

```text
user is authenticated
AND
auth.uid() matches the configured owner/admin identity
AND
required MFA assurance is satisfied
```

If another authenticated Supabase user somehow exists, that user must still have no CMS administration permission.

## 6.3 MFA

MFA/TOTP is required for Admin access.

Admin-sensitive operations must only be reachable after the owner completes the required authentication assurance level.

## 6.4 RLS

All CMS tables exposed through Supabase must have Row Level Security.

Public policies:

- only public/published/active rows may be read,
- drafts are not public,
- archived rows are not public,
- trashed rows are not public.

Admin policies:

- create/update/delete only for the authorized owner/admin,
- authorization must be enforced in the database, not only in JavaScript.

## 6.5 Storage Security

Storage policies must enforce the same owner-only write rule.

Unauthenticated or unauthorized users must not be able to:

- upload,
- replace,
- rename,
- move,
- delete CMS images.

Public read access may only be allowed for media that is intentionally public.

## 6.6 No Secret Keys in Frontend

Allowed:

- Supabase publishable/anon-style client key, protected by correct RLS.

Forbidden in:

- HTML,
- client JavaScript,
- public repository,
- GitHub Pages deployment:

```text
service_role
Supabase secret key
database password
private backend secret
```

## 6.7 SQL Injection Protection

CMS code must not build SQL strings using user input.

Rules:

- prefer Supabase client/query APIs,
- no raw SQL concatenation from form values,
- RPC/SQL functions, if introduced later, must use parameters,
- validate data type/length,
- use database constraints where appropriate.

## 6.8 XSS Protection

CMS-managed text is content, not arbitrary HTML.

Rules:

- no arbitrary HTML editor,
- no arbitrary script input,
- public renderers should use safe text rendering such as `textContent`,
- do not render CMS text with unsafe `innerHTML`,
- validate/sanitize URLs,
- only allow supported URL protocols,
- external new-tab links must use safe `rel` attributes.

## 6.9 Upload Protection

Accepted input:

- JPG,
- JPEG,
- PNG,
- WebP.

Rejected in V1:

- SVG upload,
- GIF,
- executable files,
- HTML,
- JavaScript,
- video.

Upload validation includes:

- file size,
- extension,
- MIME type,
- successful browser image decode,
- image dimensions,
- re-encoding to generated WebP outputs.

Original filenames must not be trusted as storage identity.

Use generated UUID/path names.

## 6.10 Session Guard

Admin flow:

```text
/admin/
   ↓
check Supabase session
   ↓
no session → Login
valid owner session but MFA incomplete → MFA step
valid owner + MFA → Admin Shell
```

On refresh:

```text
check again
```

Expired/invalid session:

```text
stop privileged requests
clear Admin state
redirect to Login
```

## 6.11 Brute-Force / Auth Abuse

Keep Supabase Auth rate limiting.

CAPTCHA may be added to the login flow if abuse/bot traffic appears, but it is not required to be permanently visible from day one.

## 6.12 Security Testing Requirement

Before release, explicitly test:

```text
unauthenticated INSERT            → denied
unauthenticated UPDATE            → denied
unauthenticated DELETE            → denied
unauthorized authenticated user   → denied
direct REST request               → denied
direct Storage upload             → denied
direct Storage delete             → denied
draft Project public read         → denied
archived content public read      → denied
trashed Project public read       → denied
script-like text                  → displayed safely, not executed
SQL-like payload                  → treated as data / rejected safely
invalid file upload               → rejected
expired session write             → denied
```

Frontend button visibility is NOT accepted as proof of security.

---

# 7. ZERO-SPEND REQUIREMENT

Target cost: **Rp0**.

| Component | Technology | Target |
|---|---|---:|
| Public hosting | GitHub Pages | Rp0 |
| Admin hosting | Static / GitHub Pages-compatible | Rp0 |
| Database | Supabase Free | Rp0 |
| Authentication | Supabase Auth Free | Rp0 |
| MFA | Supabase-supported free capability | Rp0 |
| Storage | Supabase Storage Free | Rp0 |
| Optional backend logic | Supabase Edge Functions Free | Rp0 |
| Image processing | Browser/client-side | Rp0 |
| Repository | GitHub Free | Rp0 |

No paid dependency is allowed as a hidden requirement.

---

# 8. EXISTING V1 PUBLIC STRUCTURE — DO NOT REDESIGN

Current audited structure:

```text
PUBLIC PORTFOLIO
│
├── Floating Navbar
│
├── Hero
│   ├── Name
│   ├── Professional Title
│   ├── Description
│   ├── CTA
│   ├── CV Download
│   └── Interactive 3-Photo Stack
│
├── About — 3 Slides
│   ├── Slide 01 — About Me
│   ├── Slide 02 — Organization & Activities
│   └── Slide 03 — Tech Stack
│
├── Experience
│   └── Sticky Stacked Cards
│
├── Education
│
├── Certificates
│
├── Portfolio
│   └── Horizontal Project Carousel
│
├── Contact + Guestbook
│
└── Footer
```

The CMS migration must keep this order and behavior.

---

# 9. ADMIN V1 INFORMATION ARCHITECTURE

```text
PORTFOLIO ADMIN
│
├── Login
├── MFA
├── Dashboard
│
├── Profile / About
│   ├── Hero Content
│   ├── Hero Photos
│   ├── About Me
│   ├── Organization & Activities
│   ├── About Gallery
│   └── Tech Stack source
│
├── Experience
│   ├── List
│   ├── Add
│   ├── Edit
│   ├── Preview
│   ├── Publish / Unpublish
│   ├── Archive
│   └── Reorder
│
├── Projects
│   ├── List
│   ├── Add
│   ├── Edit
│   ├── Cover
│   ├── Project Detail Content
│   ├── Documentation Gallery
│   ├── Technologies / Tags
│   ├── Preview
│   ├── Publish / Unpublish
│   ├── Archive
│   ├── Trash / Restore
│   └── Reorder
│
├── Technologies
│   ├── List
│   ├── Add
│   ├── Edit
│   └── Enable / Disable
│
└── Logout
```

## V2 Admin Module Backlog

Guestbook moderation remains **V2**, not V1.

Future module:

```text
Comments / Guestbook
├── list
├── hide/show
├── delete
├── pin/unpin
└── moderation tools
```

Do not implement it during CMS V1.

---

# 10. DASHBOARD

Dashboard is a lightweight content-control overview.

Required:

- Project total,
- Published Project count,
- Draft Project count,
- Archived Project count,
- Experience total,
- Published Experience count,
- Technology total,
- Active Technology count,
- recent content,
- shortcut `+ New Project`,
- shortcut `+ New Experience`,
- access to main modules,
- Logout.

No complex analytics/charts in V1.

---

# 11. HERO MANAGER

The current Hero visual structure must remain unchanged.

## 11.1 Editable Hero Text

Admin may edit:

- name,
- professional title,
- Hero description.

Existing CTA layout and CV button design remain in code.

Changing CTA design is not part of CMS V1.

## 11.2 Hero Photos

Current Hero uses a fixed interactive **3-position photo stack**.

CMS V1 therefore supports exactly:

```text
Hero Photo 01
Hero Photo 02
Hero Photo 03
```

Admin can replace each slot.

No unlimited Hero gallery.

No changing the number of visual slots.

No new animation.

No changing:

- `heroPhotoStage`,
- stack interaction concept,
- pointer behavior,
- hover spread,
- card selection animation,
- collapse behavior,
- mobile/touch behavior,
- existing timing/easing unless required for a bug fix.

Data source may change; interaction logic is preserved.

## 11.3 Hero Image Responsive Contract

The current public pattern must remain:

```html
<picture>
    <source media="(max-width: 650px)" ...>
    <img ...>
</picture>
```

CMS-generated media must provide equivalent desktop/mobile URLs.

---

# 12. ABOUT MANAGER

The current About section remains a **3-slide public component**.

The CMS edits the data inside those slides.

No fourth slide is added in V1.

No slide layout redesign.

---

## 12.1 About Slide 01 — About Me

Editable:

- profile/About photo,
- section heading,
- highlighted heading text where the template uses it,
- lead paragraph,
- main description,
- Area of Interest items.

Example data concept:

```text
heading_main
heading_highlight
lead
description
interests[]
photo_desktop
photo_mobile
photo_alt
```

The visual placement of these items remains the same as V1.

---

## 12.2 About Slide 02 — Organization & Activities

Editable:

- section heading,
- highlighted heading text,
- first description paragraph,
- second description paragraph,
- organization/activity skill items,
- skill label,
- skill sub-description,
- organization/activity photos,
- photo alt text,
- photo order,
- active/disabled state.

Current examples such as:

- Leadership,
- Communication,
- Teamwork,

are content and therefore may be changed from Admin.

Their visual card/list structure remains unchanged.

---

## 12.3 About Organization Gallery

Admin can:

- add photo,
- replace photo,
- disable photo,
- enable photo,
- remove photo,
- edit alt text,
- optional caption metadata,
- reorder.

The current public inner carousel must remain.

Do not replace the existing carousel with another slider library.

Do not redesign:

- previous button,
- next button,
- dots,
- image frame,
- transition,
- spacing,
- responsive behavior.

The number of gallery images may grow dynamically.

---

## 12.4 About Slide 03 — Tech Stack

The current visual layout is preserved.

Current public presentation groups are:

```text
01 LANGUAGES
02 DEVELOPMENT & SYSTEMS
03 TOOLS & PLATFORMS
```

These three public visual groups are the V1 design contract.

Do not render 8–10 new public category sections merely because the database contains more metadata.

---

# 13. TECHNOLOGY / SKILL MANAGER

Use a central data source so Project and Tech Stack naming stays consistent.

## Fields

```text
technologies
├── id
├── name
├── slug
├── icon_metadata
├── public_category
├── show_in_public_stack
├── is_active
├── sort_order
├── created_at
└── updated_at
```

`public_category` must map to the existing 3 visual groups when `show_in_public_stack = true`.

Possible values:

```text
languages
development_systems
tools_platforms
```

## Project-Only Tags

Some Project tags are useful on Project cards/details but should not automatically appear in the public Tech Stack.

Examples from current V1 include concepts such as:

- User Flow,
- Wireframe,
- Prototype,
- Design System.

Therefore:

```text
is_active = true
show_in_public_stack = false
```

is valid.

This preserves the current Tech Stack layout while still allowing richer Project tagging.

## Technology Manager Functions

Admin can:

- add,
- edit,
- assign icon metadata,
- set public category,
- set show/hide in public Tech Stack,
- enable,
- disable,
- reorder.

Prefer Disable over Delete when already referenced by Project records.

---

# 14. EXPERIENCE MANAGER

## 14.1 Existing V1 Behavior Is Locked

Experience is NOT converted into a slider.

The existing public behavior is:

```text
Experience Intro
        +
Sticky Card Stack
```

The existing `experience-stack.js` architecture is already data-count agnostic.

The current pipeline concept is preserved:

```text
load data
    ↓
renderExperienceCards()
    ↓
initExperienceStack()
```

When Supabase is introduced, only the data source should fundamentally change.

The public card renderer and sticky-stack behavior should remain equivalent.

## 14.2 Adding More Experience Cards

YES — new records must work.

Example:

```text
4 current records
    ↓
Admin adds Experience 05
    ↓
Publish
    ↓
Supabase returns 5 published records
    ↓
existing card renderer creates 5 cards
    ↓
existing sticky stack handles all 5
```

Same principle for 6, 8, or more records.

Do not hard-code a maximum count unless a real performance/design issue is demonstrated.

## 14.3 Experience Fields

Fields should mirror the existing card design:

```text
experiences
├── id
├── type
├── title
├── role
├── location
├── description
├── status
├── sort_order
├── deleted_at optional
├── created_at
├── updated_at
└── published_at
```

Experience tags use a relationship/list that renders the existing chips.

The displayed card number (`01`, `02`, `03`...) should be derived from the published sort order whenever practical, rather than forcing the admin to manually maintain numbering.

## 14.4 Experience Tags

Tags may include:

- technologies,
- disciplines,
- responsibilities,
- capability labels.

They render using the current `.experience-tags` visual.

No new tag visual style.

## 14.5 Experience Status

- Draft
- Published
- Archived

Optional soft delete may be retained if useful, but Project Trash remains higher priority.

## 14.6 Reorder

Use `sort_order`.

V1 Admin control:

- Move Up
- Move Down

Do not introduce drag-and-drop before V1 is stable.

The sticky stack follows this same order.

---

# 15. PROJECT MANAGER — PRIMARY CMS MODULE

Projects are dynamic content but their public card design is locked.

## 15.1 Existing Real Project Cards

Existing Project cards that already contain real owner-approved project content must be migrated as `published`.

They must continue to appear after migration.

Current Coming Soon placeholders are not treated as real Project data.

New published projects appear automatically in the same carousel using the same card template.

## 15.2 Add Project Workflow

```text
+ New Project
    ↓
Create Draft
    ↓
Fill Card Content
    ↓
Fill Detail Content
    ↓
Select Technologies / Tags
    ↓
Upload Cover
    ↓
Upload Documentation Images
    ↓
Browser optimizes images
    ↓
Preview
    ↓
Publish
    ↓
Project card appears in existing Portfolio carousel
    ↓
Lihat Project opens the generic detail template
```

---

# 16. PROJECT CARD DATA

The existing public Project card contains:

- Cover image,
- Category,
- Title,
- Short Description,
- Technology/Tag chips,
- `Lihat Project →`.

Required fields:

```text
projects
├── id
├── slug
├── title
├── card_category
├── short_description
├── cover_desktop
├── cover_mobile
├── cover_alt
├── featured
├── sort_order
├── status
├── deleted_at
├── created_at
├── updated_at
└── published_at
```

The existing card markup/class/design is preserved.

CMS must not introduce a new card visual.

---

# 17. PROJECT DETAIL — GENERIC TEMPLATE

Do not create one HTML file per project.

Replace duplicated static detail pages with one generic renderer.

Target:

```text
project.html?slug=football-club
project.html?slug=ecommerce
project.html?slug=another-project
```

All use the same existing V1 detail-page visual template.

## 17.1 Existing Detail Structure To Preserve

```text
Top Navigation
    ↓
Project Hero
    ├── Number / Category
    ├── Large Title
    ├── Highlighted Title Segment
    ├── Intro
    └── Meta
        ├── Role
        ├── Year
        └── Project Type

Main Cover
    ↓
About The Project
    ├── Label
    ├── Heading
    └── Paragraphs

Tech Stack Card
    ↓
Documentation
    └── Multiple Images

Bottom Navigation
    ├── Back — All Projects
    └── Next Project

Footer
```

No redesign of this structure.

---

# 18. PROJECT DETAIL FIELDS

Recommended structured fields:

```text
projects
├── detail_title_main
├── detail_title_highlight
├── detail_intro
├── role
├── project_year
├── project_type
├── about_heading
├── github_url optional
├── demo_url optional
└── ...
```

Long content should be structured instead of arbitrary HTML.

## About Paragraphs

Use a related ordered structure:

```text
project_paragraphs
├── id
├── project_id
├── content
├── sort_order
└── created_at
```

Admin can:

- add paragraph,
- edit paragraph,
- remove paragraph,
- reorder paragraph.

Renderer uses the existing paragraph styling.

No WYSIWYG page builder.

---

# 19. PROJECT DOCUMENTATION GALLERY — NOW V1 MUST HAVE

Project Gallery is no longer V2.

Reason:

The existing V1 Project Detail already contains multiple documentation images and the owner requires future projects to support the same workflow.

## Admin Functions

- add documentation image,
- replace image,
- edit alt text,
- remove image,
- reorder image,
- enable/disable image,
- preview optimized image.

## Recommended Structure

```text
project_media
├── id
├── project_id
├── desktop_url
├── mobile_url
├── alt_text
├── sort_order
├── is_active
├── created_at
└── updated_at
```

No columns such as:

```text
image_1
image_2
image_3
image_4
```

because the number of Project documentation images must be extensible.

## Gallery Layout Preservation

Admin does NOT receive free-form layout controls.

The public renderer must preserve the existing Project Documentation grid.

No user-defined:

- columns,
- CSS classes,
- image widths,
- arbitrary positions,
- custom spacing,
- custom colors.

Any `is-large`/full-width behavior required by the existing template must be applied by renderer rules, not by a page builder.

The exact layout algorithm must be finalized during renderer planning while keeping the existing CSS visual contract.

---

# 20. PROJECT TECHNOLOGIES RELATIONSHIP

Do not store:

```text
"Figma, UI/UX, User Flow"
```

as one comma-separated string.

Use many-to-many:

```text
project_technologies
├── project_id
└── technology_id
```

Project editor uses:

- search,
- grouped/list selector,
- checkboxes,
- selected chips.

Public card/detail renderer uses the same records.

---

# 21. PROJECT STATUS

## Draft

Saved but not public.

## Published

Visible in public Portfolio.

## Unpublish

Published → Draft.

Media/data remain.

## Archived

Stored but hidden from public.

Can later be republished.

## Trash

Project soft delete via `deleted_at`.

Trash actions:

- Restore,
- Delete Permanently.

Only published and not-deleted Projects are public.

---

# 22. PROJECT SORTING

Use explicit `sort_order`, following the previous blueprint decision.

Admin:

- Move Up,
- Move Down.

Public Portfolio carousel renders published projects in this order.

New Project does NOT redesign the carousel.

It simply adds another existing-style `.project-card`.

---

# 23. FEATURED PROJECT

`featured` may be stored as metadata.

V1 rule:

- do not change card design,
- do not create a new special Featured card layout,
- do not redesign Portfolio because `featured = true`.

Any future Featured-specific visual treatment is a separate approved scope.

---

# 24. NEXT PROJECT NAVIGATION

The existing detail page includes:

```text
BACK → All Projects
NEXT PROJECT → ...
```

The generic Project renderer should generate `NEXT PROJECT` from the published project `sort_order`.

No manual hard-coded HTML per project.

Expected behavior:

```text
current project
    ↓
next published project in sort_order
```

Final wraparound behavior is decided during detailed renderer planning.

---

# 25. LOCAL IMAGE PROCESSOR

Reusable for:

1. Hero photos,
2. About photo,
3. About organization gallery,
4. Project cover,
5. Project documentation images,
6. future CMS media that uses the same image contract.

All resize/compression occurs locally in the Admin browser before upload.

## Input

- JPG
- JPEG
- PNG
- WebP

Recommended maximum original input:

**15 MB**

## Pipeline

```text
Choose Image
    ↓
Validate
    ↓
Decode
    ↓
Check Dimensions
    ↓
Resize Locally
    ↓
Convert WebP
    ↓
Compress
    ↓
Preview
    ↓
Show original/result dimensions + size
    ↓
Accept
    ↓
Upload optimized outputs only
```

## Rules

- Never upscale.
- Preserve aspect ratio.
- No automatic crop in V1.
- Original is not uploaded.
- Original remains on owner's computer.
- Generate desktop + mobile output where the public template uses responsive variants.

---

# 26. RESPONSIVE IMAGE CONTRACT

Current V1 uses desktop image + `-mobile.webp` counterpart with:

```text
max-width: 650px
```

The CMS dynamic renderer must preserve equivalent behavior.

Conceptually:

```html
<picture>
    <source
        media="(max-width: 650px)"
        srcset="{mobile_url}"
        type="image/webp"
    >
    <img src="{desktop_url}" ...>
</picture>
```

Do not remove mobile variants to simplify CMS implementation.

Image optimization is part of the CMS requirement, not optional manual work.

---

# 27. SAFE IMAGE REPLACEMENT

Required order:

```text
1. Validate/process new image
2. Upload new optimized file(s)
3. Update database successfully
4. Verify new reference
5. Only then delete old storage file(s)
```

If step 1–4 fails:

```text
old image remains valid
```

Never delete the currently referenced media first.

---

# 28. STORAGE STRUCTURE

Example:

```text
portfolio-media/

hero/
    slot-01/{uuid}/desktop.webp
    slot-01/{uuid}/mobile.webp

about/
    profile/{uuid}/desktop.webp
    profile/{uuid}/mobile.webp

about-gallery/
    {image_uuid}/desktop.webp
    {image_uuid}/mobile.webp

projects/
    {project_uuid}/
        cover/
            desktop.webp
            mobile.webp
        documentation/
            {media_uuid}/
                desktop.webp
                mobile.webp
```

Exact naming may be adjusted during database/storage design, but the following must stay true:

- UUID/generated paths,
- no untrusted original filename dependence,
- clear project/media ownership,
- safe replace workflow.

---

# 29. PUBLIC DYNAMIC RENDERERS

## Hero

```text
CMS profile/hero data
    ↓
existing Hero markup/style
```

## Hero Photos

```text
3 configured image slots
    ↓
existing hero photo-stack
```

## About Slide 01

```text
CMS content
    ↓
existing About Me layout
```

## About Slide 02

```text
CMS text + gallery
    ↓
existing Organization & Activities layout/carousel
```

## Tech Stack

```text
active + show_in_public_stack technologies
    ↓
existing 3-category Tech Stack visual
```

## Experience

```text
published experiences
    ↓
existing experience-card renderer
    ↓
existing sticky stack
```

## Projects

```text
published projects
    ↓
existing project-card renderer
    ↓
existing horizontal carousel
```

## Project Detail

```text
slug
    ↓
published Project query
    ↓
generic renderer
    ↓
existing V1 Project Detail design
```

---

# 30. EXISTING PORTFOLIO CAROUSEL — DO NOT REBUILD

The current Portfolio section already has:

- horizontal scroll,
- drag/pointer behavior,
- touch/swipe behavior,
- indicator behavior,
- looping/cloning logic where currently used,
- existing card dimensions,
- existing responsive behavior.

Migration rule:

```text
static cards
    ↓
dynamic cards from Supabase
```

but:

```text
carousel interaction design
```

must remain.

Dynamic loading may require initialization to happen after data rendering. That is an implementation detail and must not be used as justification to replace the carousel.

---

# 31. EXISTING EXPERIENCE STACK — DO NOT REBUILD

The current implementation uses:

- generated experience cards,
- native `position: sticky`,
- breakpoint-aware `top` offsets,
- z-index ordering,
- IntersectionObserver settle state,
- reduced-motion handling,
- no scroll hijacking.

Preserve this interaction model.

Do not replace it with:

- Swiper,
- horizontal slider,
- full-page scrolling,
- wheel hijacking,
- new animation library.

Only the data source needs to become dynamic.

---

# 32. GUESTBOOK

Existing Guestbook remains intact in CMS V1.

Preserve:

- Supabase comments flow,
- current request/response contract,
- existing approved/pending/blocked behavior,
- current filtering,
- spam/rate-limit infrastructure,
- comment rendering,
- slider,
- plane animation,
- particles/interactions,
- responsive behavior.

Admin moderation is **V2**.

Before release of CMS, perform a separate Supabase security audit covering the existing Guestbook policies/functions without redesigning its public UI.

---

# 33. SECTIONS THAT REMAIN STATIC IN CMS V1

Keep in source code unless a later explicit requirement changes scope:

- Education,
- Certificates,
- Contact links,
- Navbar structure,
- Footer structure,
- general visual design,
- public animation system,
- public responsive layout,
- CV file/button workflow unless explicitly added later.

Certificates remain visible and functional as they are today.

Certificate CMS management is future scope.

---

# 34. DATABASE BLUEPRINT — PLANNING LEVEL

Not final SQL.

## profiles

```text
profiles
├── id
├── user_id
├── name
├── professional_title
├── hero_description
├── about_heading_main
├── about_heading_highlight
├── about_lead
├── about_description
├── created_at
└── updated_at
```

Area of Interest may use a related ordered table rather than fixed columns.

## hero_media

Exactly three logical slots.

```text
hero_media
├── id
├── slot_number
├── desktop_url
├── mobile_url
├── alt_text
├── updated_at
```

Constraint:

```text
slot_number ∈ {1,2,3}
```

## about_interests

```text
about_interests
├── id
├── label
├── sort_order
├── is_active
└── updated_at
```

## about_organization

Single content record or profile-linked fields containing:

- heading,
- highlighted heading,
- paragraph 1,
- paragraph 2.

## about_organization_skills

```text
about_organization_skills
├── id
├── title
├── description
├── sort_order
├── is_active
└── updated_at
```

## about_gallery

```text
about_gallery
├── id
├── desktop_url
├── mobile_url
├── alt_text
├── caption
├── sort_order
├── is_active
├── created_at
└── updated_at
```

## experiences

```text
experiences
├── id
├── type
├── title
├── role
├── location
├── description
├── sort_order
├── status
├── deleted_at
├── created_at
├── updated_at
└── published_at
```

## experience_tags

Planning option:

```text
experience_tags
├── id
├── experience_id
├── label
└── sort_order
```

This avoids forcing every Experience chip to be a Technology record.

## projects

```text
projects
├── id
├── slug
├── title
├── card_category
├── short_description
├── detail_title_main
├── detail_title_highlight
├── detail_intro
├── role
├── project_year
├── project_type
├── about_heading
├── cover_desktop
├── cover_mobile
├── cover_alt
├── github_url
├── demo_url
├── featured
├── sort_order
├── status
├── deleted_at
├── created_at
├── updated_at
└── published_at
```

## project_paragraphs

```text
project_paragraphs
├── id
├── project_id
├── content
├── sort_order
├── created_at
└── updated_at
```

## project_media

```text
project_media
├── id
├── project_id
├── desktop_url
├── mobile_url
├── alt_text
├── sort_order
├── is_active
├── created_at
└── updated_at
```

## technologies

```text
technologies
├── id
├── name
├── slug
├── icon_metadata
├── public_category
├── show_in_public_stack
├── is_active
├── sort_order
├── created_at
└── updated_at
```

## project_technologies

```text
project_technologies
├── project_id
└── technology_id
```

The final schema must be reviewed before SQL is written.

---

# 35. PUBLIC RLS INTENT

Public may read:

```text
profiles              → intended public profile row
hero_media            → active configured Hero slots
about_interests       → active only
about_organization    → public content
about_org_skills      → active only
about_gallery         → active only
experiences           → published + not deleted
experience_tags       → only for public experiences
projects              → published + not deleted
project_paragraphs    → only for public projects
project_media         → active media for public projects
technologies          → active data needed by public renderers
project_technologies  → only relationships for public projects
```

Admin write:

```text
owner UUID + required authenticated/MFA state only
```

Exact SQL policy design belongs to the Security/Database phase.

---

# 36. ADMIN UX SAFETY

Admin must provide:

- clear loading states,
- disabled submit while request is running,
- explicit failure messages,
- no false success,
- confirmation for destructive actions,
- unsaved-changes warning,
- upload progress/state,
- image optimization preview,
- preview before Publish,
- session-expired handling.

Examples:

```text
Saving...
Compressing...
Uploading...
Publishing...
Deleting...
```

If a multi-step operation partially fails, do not display success.

---

# 37. PUBLISH WORKFLOW

Required:

```text
Add/Edit
    ↓
Save Draft
    ↓
Preview
    ↓
Publish
```

Public site only consumes `published`.

Saving an edit must not accidentally publish an existing draft.

Unpublish:

```text
Published
    ↓
Draft
```

without deleting its data/media.

---

# 38. PREVIEW

Preview is mandatory before intentional Publish workflow.

Important design rule:

Whenever technically practical:

```text
Admin Preview
        and
Public Renderer
```

must share the same rendering/template logic or equivalent markup contract.

Do not create a second unrelated preview design.

Goal:

```text
What owner previews
≈
What visitor receives
```

---

# 39. EXISTING PROJECT MIGRATION

Migration must be incremental.

## Real Existing Project Cards

Migrate existing real/filled Project cards first.

Set them to `published`.

Their:

- title,
- category,
- description,
- cover,
- tags,
- order,

must match current public content unless owner requests a content correction.

## Coming Soon Cards

Current `COMING SOON` placeholders are not considered real Project records for the CMS migration.

Public Portfolio after dynamic migration should render owner-approved `published` Projects.

When owner creates and publishes a new Project:

```text
new real card appears automatically
```

No manual creation of another HTML card.

---

# 40. MIGRATION RULES

Never perform a big-bang replacement.

For each public section:

```text
Existing Static Version
    ↓
Build/Test Dynamic Renderer
    ↓
Compare visually + behaviorally
    ↓
Verify responsive behavior
    ↓
Verify data/security
    ↓
Only then retire static data source
```

The template and interactions survive; only the data source changes.

---

# 41. IMPLEMENTATION ORDER

## Phase 0 — Specification Freeze

- finalize this document,
- finalize remaining Admin visual design,
- audit Supabase current configuration,
- resolve open questions.

NO coding yet.

## Phase 1 — Database Design

- final schema,
- constraints,
- relationships,
- indexes,
- timestamps,
- public visibility rules.

## Phase 2 — Security

- admin account,
- signup disabled,
- MFA,
- RLS,
- Storage policies,
- auth/session guard,
- security tests.

## Phase 3 — Admin Shell

- Login,
- MFA view,
- Dashboard,
- navigation,
- responsive Admin shell.

## Phase 4 — Technologies

Needed by Project.

## Phase 5 — Reusable Image Processor

Build/test independently.

## Phase 6 — Profile + Hero + About

- Hero text,
- 3 Hero photos,
- About Me,
- Area of Interest,
- Organization & Activities,
- About Gallery.

## Phase 7 — Experience

- CRUD,
- statuses,
- reorder,
- Supabase data source,
- preserve existing sticky stack.

## Phase 8 — Projects

- CRUD,
- card data,
- detail data,
- paragraphs,
- technologies,
- covers,
- documentation gallery,
- preview,
- statuses,
- Trash.

## Phase 9 — Generic Project Detail

- slug query,
- existing detail template,
- documentation renderer,
- next-project navigation.

## Phase 10 — Incremental Public Migration

Convert static data sources one section at a time.

## Phase 11 — Final Audit

- security,
- RLS,
- Storage,
- XSS,
- uploads,
- session behavior,
- responsive behavior,
- performance,
- visual regression,
- console errors.

---

# 42. V1 MUST HAVE

## Auth & Security

- single owner Admin,
- no public signup,
- email/password,
- MFA/TOTP,
- session persistence,
- logout,
- owner-specific authorization,
- RLS,
- Storage policies,
- no frontend secrets,
- secure uploads,
- SQL injection-safe data access,
- XSS-safe text rendering.

## Hero

- edit name,
- edit professional title,
- edit Hero description,
- replace exactly 3 Hero photo slots,
- desktop/mobile optimization,
- preserve Hero stack animation.

## About

- edit About photo,
- edit About heading,
- edit highlighted heading,
- edit lead,
- edit description,
- manage Area of Interest,
- edit Organization & Activities text,
- edit Organization skill labels/descriptions,
- About Gallery CRUD,
- reorder gallery,
- preserve About sliders/carousels.

## Experience

- list,
- add,
- edit,
- Draft,
- Preview,
- Publish,
- Unpublish,
- Archive,
- reorder,
- tags,
- dynamic new-card support,
- preserve sticky stack exactly in visual/interaction concept.

## Projects

- list,
- add,
- edit,
- Draft,
- Preview,
- Publish,
- Unpublish,
- Archive,
- Trash,
- Restore,
- Permanent Delete,
- reorder,
- Project card data,
- cover,
- alt text,
- technologies/tags,
- generic detail page,
- structured detail content,
- multiple documentation images,
- Project paragraph management,
- automatic next-project navigation,
- dynamic card appearance after Publish,
- preserve existing Portfolio carousel and card design.

## Technologies

- central database,
- add/edit,
- enable/disable,
- icon metadata,
- public Tech Stack visibility flag,
- 3 existing public visual groups,
- Project many-to-many relationship.

## Images

- JPG/JPEG/PNG/WebP input,
- validation,
- decode,
- local resize,
- local WebP,
- never upscale,
- preserve ratio,
- desktop/mobile outputs,
- optimization preview,
- upload optimized files only,
- safe replace.

---

# 43. V2 BACKLOG

Do not implement before CMS V1 is stable.

- Guestbook Admin moderation module,
  - hide/show,
  - delete,
  - pin/unpin,
  - moderation tools.
- Certificates Manager,
- Education Manager,
- Contact Manager,
- drag-and-drop reorder,
- analytics,
- activity log,
- version history,
- autosave,
- image crop/focal-point editor,
- multi-admin,
- public signup,
- richer permissions,
- custom theme manager,
- font manager,
- color manager,
- public Project search/filter,
- special Featured layout.

---

# 44. EXPLICIT NON-GOALS V1

Do NOT implement:

- redesign of public Portfolio,
- changing public color palette,
- changing public font system,
- changing public card design,
- changing public section layout,
- replacing existing animation concepts,
- replacing Experience stack with slider,
- replacing Portfolio carousel,
- replacing About carousel,
- page builder,
- arbitrary HTML editor,
- WordPress-like layout editor,
- custom CSS input,
- custom JS input,
- multi-admin,
- public Register,
- paid AI,
- paid image API,
- paid CDN,
- VPS,
- video uploads,
- arbitrary SVG upload,
- complex analytics.

---

# 45. DESIGN CHANGE CONTROL

Any proposed change affecting public:

- HTML structure,
- CSS layout,
- animation,
- responsive breakpoint behavior,
- class contract,
- component shape,
- section order,
- typography,
- color,
- spacing,

must follow:

```text
identify issue
    ↓
explain why current V1 cannot satisfy requirement
    ↓
propose minimal change
    ↓
explain visual/behavior impact
    ↓
request owner approval
    ↓
only implement after approval
```

CMS implementation is NOT automatic permission to refactor/redesign public UI.

---

# 46. CODING ASSISTANT RULES

Before coding a phase, the assistant must state:

1. files to be changed,
2. new files to be created,
3. database changes,
4. data flow,
5. security implications,
6. which existing V1 UI/animation contracts are preserved,
7. test criteria.

Then implement ONLY the approved phase.

Do not:

- implement several phases at once,
- silently redesign,
- replace vanilla JS with a framework,
- delete static fallback before verification,
- expose secrets,
- weaken RLS,
- use frontend checks as authorization,
- change Guestbook contracts without separate approval.

---

# 47. SUCCESS SCENARIOS

## A — Career Update

```text
Login + MFA
→ Hero/Profile
→ change Professional Title
→ Save
→ public Hero shows new title
→ layout/animation unchanged
```

## B — Replace Hero Photo

```text
Hero Photos
→ slot 02
→ select image
→ optimize desktop/mobile
→ preview
→ save
→ same Hero stack now uses new photo
→ stack animation unchanged
```

## C — About Update

```text
About
→ edit lead/description/interests
→ Save
→ existing About slide renders new content
→ slide design unchanged
```

## D — New Experience

```text
Experience
→ Add
→ fill type/title/role/location/description/tags
→ Save Draft
→ Preview
→ Publish
→ new card is rendered
→ card joins existing sticky stack
→ no HTML card created manually
→ stack behavior unchanged
```

## E — New Project

```text
Projects
→ Add
→ fill card data
→ fill detail data
→ select technologies
→ upload cover
→ upload multiple documentation images
→ optimization
→ Preview
→ Publish
→ new existing-style card appears in Portfolio carousel
→ Lihat Project opens generic project detail
→ existing detail layout is used
```

## F — Add Project Documentation

```text
Edit Project
→ Documentation
→ Add Image
→ optimize
→ reorder
→ Save
→ Project Detail displays image in existing documentation grid
```

## G — Security

```text
attacker finds /admin/
→ cannot enter Admin without owner auth + MFA

attacker calls API directly
→ denied by RLS

attacker uploads directly
→ denied by Storage policy

attacker modifies browser JS
→ database authorization still denies operation
```

---

# 48. ANTI-SCOPE-CREEP RULE

For every new idea ask:

> Is this required for secure management of Hero, About, Experience, Projects, Technologies, media, or Publish workflow while preserving the existing V1 design?

If YES:

```text
update specification first
```

If NO:

```text
V2 backlog
```

Never code an unapproved feature because it seems convenient.

---

# 49. CURRENT SPECIFICATION DECISIONS — CONFIRMED

Confirmed owner decisions:

- single Admin only,
- security must remain enforced even if `/admin/` is discovered,
- manual Admin account,
- owner-specific authorization,
- MFA,
- RLS,
- secure Storage,
- session persistence,
- upload security,
- Draft → Preview → Publish,
- Project Trash,
- Guestbook moderation is V2,
- Hero images are CMS-editable,
- Hero remains exactly 3 photo slots,
- About lead is editable,
- Area of Interest is editable,
- Organization & Activities content is fully editable,
- Project detail supports multiple images,
- current Project card design is preserved,
- real existing populated Project cards remain visible after migration,
- new published Projects appear automatically,
- content order follows explicit `sort_order`,
- public font/color editing is not CMS V1,
- Experience keeps the existing sticky stacking behavior,
- new Experience cards must work without changing the stack UI.

---

# 50. FINAL RULE

This CMS is a **content-management layer for the existing Portfolio V1**.

The final architecture principle is:

```text
EXISTING V1 PRESENTATION
+
SECURE DYNAMIC DATA
+
OWNER-ONLY ADMIN CMS
=
PORTFOLIO V2
```

Not:

```text
CMS PROJECT
=
PUBLIC REDESIGN
```

The V1 public interface is treated as an existing product that must be preserved.

---

**END — PORTFOLIO ADMIN CMS V2 BLUEPRINT**
