# ADMIN-CMS-DATABASE.md

**Project:** Project Web Portfolio — Admin Dashboard / CMS  
**Status:** Database Planning / Schema Freeze Candidate  
**Database:** Supabase PostgreSQL  
**Scope:** CMS V1  
**Primary Constraint:** Rp0 / free-only stack  
**Public UI Rule:** Existing Portfolio V1 design remains unchanged  
**Security Dependency:** `ADMIN-CMS-SECURITY.md`  
**Implementation Status:** **DO NOT RUN SQL YET**

---

# 1. PURPOSE

This document defines the planned database model for the Portfolio Admin CMS.

The database exists to replace hard-coded content sources while preserving the current Portfolio V1 presentation.

Core rule:

```text
DATABASE
    ↓
STRUCTURED CONTENT
    ↓
EXISTING V1 RENDERERS
    ↓
SAME PUBLIC DESIGN / ANIMATION / RESPONSIVE BEHAVIOR
```

The database must not become a page-builder schema.

It stores content and state, not arbitrary layout/CSS/HTML.

---

# 2. DATABASE DESIGN GOALS

The schema should be:

- simple enough for a personal CMS,
- normalized where relationships matter,
- explicit about public visibility,
- safe for RLS,
- easy to query from vanilla JavaScript,
- compatible with Supabase,
- extensible without over-engineering,
- consistent with current Portfolio V1,
- resistant to orphaned records,
- safe for Draft/Published/Archived/Trash workflows.

---

# 3. DATABASE NON-GOALS

Do not build in V1:

- generic page builder,
- arbitrary component table,
- arbitrary HTML blocks,
- custom CSS records,
- custom JavaScript records,
- theme database,
- font manager,
- multi-admin role system,
- analytics warehouse,
- version history,
- activity log,
- autosave snapshots,
- Guestbook moderation schema redesign,
- Certificates CMS,
- Education CMS,
- Contact CMS.

---

# 4. SCHEMA ORGANIZATION

Recommended logical separation:

```text
public
├── profile_content
├── hero_media
├── about_interests
├── about_organization
├── about_organization_skills
├── about_gallery
├── experiences
├── experience_tags
├── projects
├── project_paragraphs
├── project_media
├── technologies
└── project_technologies

app_private
└── admin_users
```

Existing Guestbook tables/functions remain outside this CMS design and are audited separately.

## Why `app_private`

The authorization configuration should not be mixed with publicly exposed content tables.

`app_private` is intended for server/database authorization support, not public portfolio content.

---

# 5. PRIMARY KEY STRATEGY

Use PostgreSQL UUIDs for content records that need stable identity.

Recommended:

```text
id uuid primary key default gen_random_uuid()
```

Reasons:

- stable across reordering,
- safe for Storage folder naming,
- suitable for client-side references,
- avoids predictable sequential object identifiers,
- works well with Supabase.

Exceptions:

- Hero uses fixed slot numbers 1–3 as logical identity.
- Singleton tables use UUID plus singleton constraint, or a fixed singleton key.

UUID is not itself authorization.

RLS still decides access.

---

# 6. TIMESTAMP STANDARD

Content tables should normally include:

```text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Workflow tables may additionally include:

```text
published_at timestamptz
archived_at timestamptz
deleted_at timestamptz
```

Use `timestamptz`, not timestamp without timezone.

A shared database trigger should update `updated_at` automatically.

Planning function:

```text
set_updated_at()
```

Final SQL is written later.

---

# 7. STATUS STANDARD

Do not use PostgreSQL ENUM initially.

Prefer:

```text
status text not null
```

with CHECK constraint.

Allowed CMS content workflow:

```text
draft
published
archived
```

Reason for CHECK instead of ENUM:

- easier future migrations,
- clear Supabase/Postgres behavior,
- sufficient for this small state set.

Project Trash is represented separately:

```text
deleted_at is not null
```

rather than adding `trash` to status.

---

# 8. SORT ORDER STANDARD

Ordered content uses:

```text
sort_order integer not null default 0
```

Ordering query:

```text
ORDER BY sort_order ASC, created_at ASC
```

Do not make `sort_order` globally unique.

Reason:

During Move Up / Move Down operations, temporary duplicate values are easier to manage.

The application can normalize ordering after mutations.

---

# 9. STORAGE REFERENCE STANDARD

Do not store full Supabase public URLs as the primary media identity.

Prefer:

```text
bucket_name
desktop_path
mobile_path
```

Example:

```text
bucket_name = portfolio-media

desktop_path =
projects/PROJECT_UUID/cover/DESKTOP_UUID.webp

mobile_path =
projects/PROJECT_UUID/cover/MOBILE_UUID.webp
```

Benefits:

- easier bucket migration,
- easier signed/public URL generation,
- easier safe replace,
- no hard dependency on hostname/project URL,
- better Storage cleanup.

---

# 10. STORAGE BUCKET VALUES

Planning values:

```text
portfolio-staging
portfolio-media
```

Expected meaning:

```text
portfolio-staging
→ private Draft / Preview / pending replacement media

portfolio-media
→ intentionally public published media
```

For Hero/About current-state content, final saved references normally point to `portfolio-media`.

For Project Drafts, references may point to `portfolio-staging`.

Final promotion/move behavior is frozen during Storage implementation design.

---

# 11. PRIVATE ADMIN TABLE

## `app_private.admin_users`

Purpose:

- identify the single authorized Admin account,
- avoid repeating a hard-coded UUID throughout every RLS policy,
- make account replacement manageable,
- guarantee maximum one Admin record.

Proposed fields:

```text
admin_users
├── user_id uuid PK
├── singleton_key smallint NOT NULL DEFAULT 1
├── created_at timestamptz NOT NULL DEFAULT now()
└── updated_at timestamptz NOT NULL DEFAULT now()
```

Constraints:

```text
user_id
→ references auth.users(id) ON DELETE CASCADE

singleton_key
→ CHECK (singleton_key = 1)

singleton_key
→ UNIQUE
```

Effect:

```text
maximum one admin row
```

This keeps the CMS single-owner by database design.

The row is created manually during secure setup.

---

# 12. AUTHORIZATION HELPER FUNCTIONS — PLANNING

Final SQL may provide private helper functions conceptually like:

```text
app_private.is_owner_admin()
app_private.is_owner_admin_aal2()
```

Expected logic:

```text
auth.uid()
exists in app_private.admin_users
```

and for privileged writes:

```text
auth.jwt().aal = 'aal2'
```

RLS policies can then use one consistent authorization rule.

These functions are security infrastructure, not CMS content.

Final implementation requires careful SECURITY DEFINER/search_path review.

---

# 13. SINGLETON CONTENT TABLES

Some sections represent one current public state, not multiple records.

Examples:

- profile/hero text,
- About organization text.

These tables should enforce one row.

Recommended pattern:

```text
singleton_key smallint NOT NULL DEFAULT 1
CHECK (singleton_key = 1)
UNIQUE (singleton_key)
```

This prevents accidental creation of several current profile rows.

---

# 14. `profile_content`

Purpose:

Current identity + Hero + About Me text content.

One logical row only.

Proposed fields:

```text
profile_content
├── id uuid PK
├── singleton_key smallint NOT NULL DEFAULT 1
│
├── name varchar(100) NOT NULL
├── professional_title varchar(160) NOT NULL
├── hero_description varchar(600) NOT NULL
│
├── about_heading_main varchar(160) NOT NULL
├── about_heading_highlight varchar(160)
├── about_lead varchar(600) NOT NULL
├── about_description text NOT NULL
│
├── about_photo_bucket varchar(80)
├── about_photo_desktop_path text
├── about_photo_mobile_path text
├── about_photo_alt varchar(250)
│
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Constraints:

```text
singleton_key = 1
singleton_key UNIQUE
```

## Why About photo is here

About Me has exactly one current profile/About image.

Keeping its current image references with its singleton content avoids creating a separate one-row media table.

Safe image replacement still follows Storage-first workflow.

---

# 15. `hero_media`

Purpose:

Exactly 3 current Hero photo-stack slots.

Proposed fields:

```text
hero_media
├── slot_number smallint PK
├── bucket_name varchar(80)
├── desktop_path text
├── mobile_path text
├── alt_text varchar(250)
├── is_visible boolean NOT NULL DEFAULT true
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Constraints:

```text
slot_number BETWEEN 1 AND 3
hero_media_slot_one_always_visible:
    slot_number <> 1 OR is_visible = true
```

Expected seeded rows:

```text
1
2
3
```

Admin does not Add/Delete slots.

Admin only replaces content in the three fixed positions.

This matches the existing Hero stack design.

## Visibility

Added by `20260818100000_hero_media_visibility.sql`.

Slots 2 and 3 can be taken off the public site without losing what is
stored in them. Slot 1 is the primary photo and cannot be hidden — the
public renderer uses it as the key that decides whether the CMS owns the
Hero at all, so hiding it would silently drop the section back to the
static V1 fallback rather than produce a Hero with no photo. The CHECK
constraint above is the authority; the Admin control is rendered disabled
as a convenience.

Hiding is a metadata change only. `bucket_name`, `desktop_path` and
`mobile_path` are never written by a visibility toggle and no Storage
object is removed, so a hidden slot can be made visible again without
re-uploading.

Public SELECT requires `is_visible = true` on top of the existing
configured test, so a hidden slot is never returned by the API — it is not
sent and then hidden with CSS. The owner + `aal2` SELECT policy is a
separate PERMISSIVE policy, so the Admin still reads every row, including
hidden and unconfigured ones. Both policies must stay PERMISSIVE: making
either RESTRICTIVE would AND them together and lock the owner out of their
own hidden media.

---

# 16. `about_interests`

Purpose:

Editable Area of Interest list inside About Me.

Proposed fields:

```text
about_interests
├── id uuid PK
├── label varchar(120) NOT NULL
├── sort_order integer NOT NULL DEFAULT 0
├── is_active boolean NOT NULL DEFAULT true
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Example:

```text
Embedded Systems
Artificial Intelligence
Computer Vision
Web Development
UI/UX Design
```

Admin may:

- add,
- edit,
- reorder,
- disable/remove according to final UI.

Public renderer:

```text
WHERE is_active = true
ORDER BY sort_order
```

---

# 17. `about_organization`

Purpose:

Current text content for the existing Organization & Activities slide.

One row only.

Proposed fields:

```text
about_organization
├── id uuid PK
├── singleton_key smallint NOT NULL DEFAULT 1
├── heading_main varchar(160) NOT NULL
├── heading_highlight varchar(160)
├── paragraph_1 text NOT NULL
├── paragraph_2 text
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Constraints:

```text
singleton_key = 1
singleton_key UNIQUE
```

No arbitrary HTML.

---

# 18. `about_organization_skills`

Purpose:

Editable skill/capability items currently represented by content such as:

```text
Leadership
Communication
Teamwork
```

Proposed fields:

```text
about_organization_skills
├── id uuid PK
├── title varchar(120) NOT NULL
├── description varchar(500) NOT NULL
├── sort_order integer NOT NULL DEFAULT 0
├── is_active boolean NOT NULL DEFAULT true
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Public renderer:

```text
active only
ordered by sort_order
```

---

# 19. `about_gallery`

Purpose:

Organization/Activities photo carousel.

Proposed fields:

```text
about_gallery
├── id uuid PK
├── bucket_name varchar(80) NOT NULL
├── desktop_path text NOT NULL
├── mobile_path text NOT NULL
├── alt_text varchar(250) NOT NULL
├── caption varchar(300)
├── sort_order integer NOT NULL DEFAULT 0
├── is_active boolean NOT NULL DEFAULT true
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Admin can:

- add,
- replace,
- reorder,
- edit alt,
- edit optional caption,
- disable,
- remove.

The public carousel behavior remains unchanged.

---

# 20. `experiences`

Purpose:

Data source for the existing sticky stacked Experience cards.

Proposed fields:

```text
experiences
├── id uuid PK
├── type varchar(80) NOT NULL
├── title varchar(160) NOT NULL
├── role varchar(180)
├── location varchar(180)
├── description text NOT NULL
├── status varchar(20) NOT NULL DEFAULT 'draft'
├── sort_order integer NOT NULL DEFAULT 0
├── deleted_at timestamptz
├── published_at timestamptz
├── archived_at timestamptz
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Status constraint:

```text
status IN ('draft', 'published', 'archived')
```

## Public Experience Number

Do not store:

```text
01
02
03
```

as content.

Renderer derives display number from sorted published position.

This prevents numbering errors after reorder.

---

# 21. EXPERIENCE DELETE MODEL

Experience does not need full Trash UI in CMS V1.

`deleted_at` is still retained as an optional defensive soft-delete mechanism.

Normal Admin behavior:

```text
Archive preferred
```

If Delete is implemented:

```text
deleted_at set
```

before any later permanent cleanup.

Public query always requires:

```text
deleted_at IS NULL
```

---

# 22. `experience_tags`

Purpose:

Ordered chips inside Experience cards.

These are independent labels, not necessarily Technologies.

Proposed fields:

```text
experience_tags
├── id uuid PK
├── experience_id uuid NOT NULL FK
├── label varchar(100) NOT NULL
├── sort_order integer NOT NULL DEFAULT 0
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Foreign key:

```text
experience_id
→ experiences(id)
ON DELETE CASCADE
```

Recommended unique expression index:

```text
experience_id + lower(label)
```

to prevent duplicate tags such as:

```text
Robotics
robotics
```

within the same Experience.

---

# 23. `projects`

Purpose:

Primary Project record supporting:

- Portfolio card,
- generic Project Detail page,
- workflow,
- ordering,
- cover,
- metadata.

Proposed fields:

```text
projects
├── id uuid PK
│
├── slug varchar(140) NOT NULL UNIQUE
│
├── title varchar(180) NOT NULL
├── card_category varchar(100) NOT NULL
├── short_description varchar(400) NOT NULL
│
├── detail_title_main varchar(180) NOT NULL
├── detail_title_highlight varchar(180)
├── detail_intro text NOT NULL
│
├── role varchar(180) NOT NULL
├── project_date date
├── project_type varchar(140) NOT NULL
│
├── about_heading varchar(220) NOT NULL
│
├── cover_bucket varchar(80)
├── cover_desktop_path text
├── cover_mobile_path text
├── cover_alt varchar(250)
│
├── github_url text
├── demo_url text
│
├── featured boolean NOT NULL DEFAULT false
├── sort_order integer NOT NULL DEFAULT 0
├── status varchar(20) NOT NULL DEFAULT 'draft'
│
├── published_at timestamptz
├── archived_at timestamptz
├── deleted_at timestamptz
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Status:

```text
draft
published
archived
```

Trash:

```text
deleted_at IS NOT NULL
```

---

# 24. PROJECT DATE

Use:

```text
project_date date
```

instead of duplicating:

```text
project_year
project_month
```

Admin may present a Month/Year control.

If only the year is required for the existing detail page, renderer derives:

```text
EXTRACT(YEAR FROM project_date)
```

Migration may normalize a year-only legacy value to a deliberate date convention.

If legacy data genuinely lacks month information, migration rules must document the chosen normalization rather than inventing silently.

---

# 25. PROJECT SLUG

Constraints:

```text
UNIQUE
lowercase
letters
numbers
hyphens
```

Planning validation pattern:

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

Example:

```text
football-club-mobile-app
```

After first Publish:

```text
title changes
≠
automatic slug changes
```

This protects stable public links.

Manual slug editing is an explicit Admin action.

---

# 26. PROJECT PUBLISH COMPLETENESS

Database may allow incomplete Draft records.

Therefore some fields may need to remain nullable at SQL level until Draft is complete.

However the public Published state must never contain invalid required content.

Final implementation should enforce Publish completeness through either:

- a controlled database function/RPC,
- database constraint strategy compatible with Draft,
- or strict application workflow + RLS-tested server validation.

Do NOT simply make every Project field `NOT NULL` if that prevents legitimate Draft creation.

## Schema Freeze Note

For this planning document, conceptual required-for-publish fields are marked by workflow, not necessarily by initial SQL `NOT NULL`.

Publish requires at least:

- title,
- category,
- short description,
- cover desktop/mobile,
- cover alt,
- detail intro,
- role,
- project date/year,
- project type,
- about heading,
- at least one paragraph.

The final SQL must reconcile Draft flexibility with Published integrity.

---

# 27. RECOMMENDED PROJECT NULLABILITY REFINEMENT

To support Drafts cleanly, final SQL should likely use:

```text
slug NOT NULL
title NOT NULL

card_category NULL during Draft
short_description NULL during Draft

detail_title_main NULL during Draft
detail_intro NULL during Draft

role NULL during Draft
project_date NULL during Draft
project_type NULL during Draft
about_heading NULL during Draft

cover paths NULL during Draft
cover_alt NULL during Draft
```

Then Publish validation guarantees completeness.

This is preferred over forcing fake placeholder values into Draft rows.

---

# 28. `project_paragraphs`

Purpose:

Ordered About The Project paragraphs.

Proposed fields:

```text
project_paragraphs
├── id uuid PK
├── project_id uuid NOT NULL FK
├── content text NOT NULL
├── sort_order integer NOT NULL DEFAULT 0
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Foreign key:

```text
project_id
→ projects(id)
ON DELETE CASCADE
```

Admin can:

- add,
- edit,
- reorder,
- remove.

No HTML formatting column.

No font/color/layout column.

---

# 29. `project_media`

Purpose:

Multiple ordered documentation images inside generic Project Detail.

Proposed fields:

```text
project_media
├── id uuid PK
├── project_id uuid NOT NULL FK
├── bucket_name varchar(80) NOT NULL
├── desktop_path text NOT NULL
├── mobile_path text NOT NULL
├── alt_text varchar(250) NOT NULL
├── sort_order integer NOT NULL DEFAULT 0
├── is_active boolean NOT NULL DEFAULT true
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Foreign key:

```text
project_id
→ projects(id)
ON DELETE CASCADE
```

Number of rows is dynamic.

No:

```text
image_1
image_2
image_3
```

columns.

---

# 30. PROJECT MEDIA LAYOUT

Do not store arbitrary layout properties such as:

```text
width
column
margin
CSS class
position
```

The public Project Detail renderer remains responsible for the V1 gallery layout.

If V1 requires a deterministic large-image pattern, implement it as renderer logic.

Do not make Admin a layout editor.

---

# 31. `technologies`

Purpose:

Central source for:

- About Tech Stack,
- Project technologies/tags.

Proposed fields:

```text
technologies
├── id uuid PK
├── name varchar(100) NOT NULL
├── slug varchar(120) NOT NULL UNIQUE
├── icon_key varchar(120)
├── public_group varchar(40)
├── show_in_public_stack boolean NOT NULL DEFAULT false
├── is_active boolean NOT NULL DEFAULT true
├── sort_order integer NOT NULL DEFAULT 0
├── created_at timestamptz NOT NULL
└── updated_at timestamptz NOT NULL
```

Public group allowed values:

```text
languages
development_systems
tools_platforms
```

Constraint concept:

```text
show_in_public_stack = false
OR
public_group IS NOT NULL
```

If shown in public Tech Stack, it must belong to one of the 3 existing V1 visual groups.

---

# 32. TECHNOLOGY NAME UNIQUENESS

Recommend case-insensitive uniqueness.

Conceptual unique index:

```text
lower(name)
```

Examples prevented:

```text
Python
python
PYTHON
```

Slug also remains unique.

---

# 33. TECHNOLOGY DELETE MODEL

Admin V1 does not permanently delete Technologies.

Use:

```text
is_active = false
```

Existing published Project relationships may continue rendering the Technology.

New Project selectors query:

```text
is_active = true
```

Public About Tech Stack queries:

```text
is_active = true
AND show_in_public_stack = true
```

---

# 34. `project_technologies`

Purpose:

Many-to-many Project ↔ Technology relationship.

Proposed fields:

```text
project_technologies
├── project_id uuid NOT NULL FK
├── technology_id uuid NOT NULL FK
├── sort_order integer NOT NULL DEFAULT 0
└── created_at timestamptz NOT NULL
```

Composite primary key:

```text
(project_id, technology_id)
```

Foreign keys:

```text
project_id
→ projects(id)
ON DELETE CASCADE

technology_id
→ technologies(id)
ON DELETE RESTRICT
```

Why `RESTRICT` on Technology:

Technology should be Disabled rather than deleted while relationships exist.

---

# 35. PROJECT TECHNOLOGY ORDER

Project chips may need a stable display order.

Therefore `project_technologies.sort_order` is included.

Example:

```text
Figma
UI/UX
User Flow
```

The Project relationship order is separate from the global Tech Stack order.

---

# 36. ENTITY RELATIONSHIP OVERVIEW

```text
profile_content
      │
      ├── about_interests
      │
      └── about photo refs

hero_media
(3 fixed slots)

about_organization
      │
      ├── about_organization_skills
      │
      └── about_gallery


experiences
      │ 1
      │
      └──────< experience_tags


projects
      │
      ├──────< project_paragraphs
      │
      ├──────< project_media
      │
      └──────< project_technologies >────── technologies
```

---

# 37. PUBLIC QUERY MODEL

## Hero/Profile

```text
profile_content
→ singleton row
```

## Hero Photos

```text
hero_media
ORDER BY slot_number
```

## About Interests

```text
about_interests
WHERE is_active = true
ORDER BY sort_order
```

## Organization

```text
about_organization
→ singleton row
```

## Organization Skills

```text
about_organization_skills
WHERE is_active = true
ORDER BY sort_order
```

## About Gallery

```text
about_gallery
WHERE is_active = true
ORDER BY sort_order
```

## Experience

```text
experiences
WHERE status = 'published'
AND deleted_at IS NULL
ORDER BY sort_order, created_at
```

Load corresponding Experience Tags.

## Projects

```text
projects
WHERE status = 'published'
AND deleted_at IS NULL
ORDER BY sort_order, created_at
```

## Project Detail

```text
projects
WHERE slug = :slug
AND status = 'published'
AND deleted_at IS NULL
```

Then load:

```text
project_paragraphs
project_media
project_technologies → technologies
```

## Tech Stack

```text
technologies
WHERE is_active = true
AND show_in_public_stack = true
ORDER BY public_group, sort_order
```

---

# 38. ADMIN QUERY MODEL

Admin requires owner + MFA/AAL2 through RLS.

Admin list queries may fetch:

```text
all Projects including Draft/Archived/Trash
all Experiences including Draft/Archived
all Technologies including Disabled
all active/disabled gallery items
```

Admin UI must not need a service-role key.

---

# 39. INDEX PLAN

Indexes should follow actual query patterns.

Recommended planning indexes:

## Experiences

```text
(status, deleted_at, sort_order)
updated_at DESC
```

## Projects

```text
slug UNIQUE
(status, deleted_at, sort_order)
updated_at DESC
```

## Project Paragraphs

```text
(project_id, sort_order)
```

## Project Media

```text
(project_id, is_active, sort_order)
```

## Experience Tags

```text
(experience_id, sort_order)
```

## Technologies

```text
slug UNIQUE
lower(name) UNIQUE
(is_active, show_in_public_stack, public_group, sort_order)
```

## Project Technologies

```text
(project_id, sort_order)
technology_id
```

## About

```text
about_interests(is_active, sort_order)
about_organization_skills(is_active, sort_order)
about_gallery(is_active, sort_order)
```

Avoid adding indexes without a query reason.

---

# 40. SEARCH STRATEGY

V1 Admin data volume is small.

Do not introduce full-text search infrastructure prematurely.

Experience Search:

```text
title
role
location
type
```

Project Search:

```text
title
slug
card_category
```

Technology Search:

```text
name
slug
```

Simple case-insensitive search is sufficient for V1.

---

# 41. CATEGORY MODEL — PROJECTS

V1 Admin requires a Project category displayed on the existing Project card.

Do not create a full Project Category Manager in V1.

Use:

```text
card_category varchar(...)
```

Admin may initially present a controlled list.

Planning baseline:

```text
Web Development
AI / Computer Vision
IoT
Embedded Systems
Data
UI / UX
Software
Other
```

This list is UI configuration, not a database entity.

If category management becomes genuinely necessary later, migrate to a table in V2.

---

# 42. EXPERIENCE TYPE MODEL

Experience type remains text.

Reason:

Current/future values may include:

```text
Laboratory
Organization
Internship
Work
Freelance
Volunteer
Other
```

No separate type table is required for a small personal portfolio.

Admin UI can offer suggestions while allowing approved text.

---

# 43. URL STORAGE

Store URLs as text:

```text
github_url
demo_url
```

Application validation requires safe URL schemes.

Do not store rendered anchors or HTML.

Empty optional link:

```text
NULL
```

not:

```text
''
```

where possible.

---

# 44. TEXT STORAGE

Use:

```text
varchar(n)
```

for short bounded labels.

Use:

```text
text
```

for paragraph-style content.

Do not store Markdown/HTML unless a future feature explicitly introduces it.

V1 renderers treat long CMS text as plain structured text.

---

# 45. ALT TEXT

Alt fields:

```text
hero_media.alt_text
profile_content.about_photo_alt
about_gallery.alt_text
projects.cover_alt
project_media.alt_text
```

Project media/cover alt should be required for Publish.

Draft may temporarily have missing alt until Publish validation.

Alt text is content metadata, not image filename.

---

# 46. IMAGE DIMENSION METADATA — OPTIONAL

Database does not strictly need to store image dimensions because the files are already processed.

Optional future fields could include:

```text
desktop_width
desktop_height
desktop_bytes
mobile_width
mobile_height
mobile_bytes
```

V1 recommendation:

Do NOT add these unless needed for:

- Admin media reporting,
- debugging,
- responsive layout calculation.

The Image Processor can display optimization statistics before upload without persisting them.

Keep schema lean.

---

# 47. PUBLISH WORKFLOW — PROJECT

Conceptual transaction:

```text
Draft Project
    ↓
validate required fields
    ↓
validate at least one paragraph
    ↓
validate required cover media
    ↓
promote/copy Draft media to public storage
    ↓
update media paths/bucket refs
    ↓
status = published
    ↓
published_at set
```

Do not expose the Project publicly before required media is ready.

The final implementation may use a controlled database function plus Storage operations.

Exact transaction boundary is finalized during implementation because PostgreSQL cannot make external Storage object movement part of the same native database transaction.

Safe failure handling is mandatory.

---

# 48. PUBLISH WORKFLOW — EXPERIENCE

```text
Draft Experience
    ↓
validate required content
    ↓
status = published
    ↓
published_at set
```

Experience currently has no required media in CMS V1.

---

# 49. PROFILE / ABOUT SAVE MODEL

Profile/About is current-state content.

No Draft status table is required.

Flow:

```text
Edit
→ Preview local/current form
→ Save Changes
```

For image replacement:

```text
upload new image safely
→ update row path
→ remove old image after success
```

---

# 50. ARCHIVE MODEL

For Project/Experience:

```text
status = archived
archived_at = now()
```

Archive hides the record from public queries.

Restore to Draft:

```text
status = draft
archived_at = null
```

Publishing again sets:

```text
status = published
```

---

# 51. UNPUBLISH MODEL

Published → Draft:

```text
status = draft
```

Project media privacy transition is handled by Storage workflow.

The database state alone must still block public row access through RLS.

---

# 52. PROJECT TRASH MODEL

Move to Trash:

```text
deleted_at = now()
```

Keep current status for historical/internal context or normalize to Draft during implementation.

Recommended:

```text
preserve previous status
```

but public query always checks:

```text
deleted_at IS NULL
```

Restore:

```text
deleted_at = null
```

If restoring a previously Published Project, security-first recommendation:

```text
restore to Draft
```

rather than automatically returning public.

Final behavior should be:

```text
Restore → Draft
```

to avoid accidental republication.

---

# 53. PERMANENT PROJECT DELETE

Permanent delete must remove database child records via foreign-key behavior.

Database cascade:

```text
projects
├── project_paragraphs       ON DELETE CASCADE
├── project_media            ON DELETE CASCADE
└── project_technologies     ON DELETE CASCADE
```

Storage files are not database rows in these relations.

Therefore permanent deletion workflow must separately delete Storage objects.

Recommended sequence:

```text
collect referenced Storage paths
→ delete/verify Storage objects
→ delete Project row
```

or another carefully designed recoverable workflow.

Final implementation must avoid orphaned public media.

---

# 54. ABOUT / HERO MEDIA DELETE

Current-state Hero/About assets are not soft-deleted content.

Safe replacement:

```text
new upload
→ DB update
→ old object cleanup
```

Gallery items may be Disabled before removal.

---

# 55. FOREIGN KEY DELETE RULE SUMMARY

```text
admin_users.user_id
→ auth.users(id)
ON DELETE CASCADE

experience_tags.experience_id
→ experiences(id)
ON DELETE CASCADE

project_paragraphs.project_id
→ projects(id)
ON DELETE CASCADE

project_media.project_id
→ projects(id)
ON DELETE CASCADE

project_technologies.project_id
→ projects(id)
ON DELETE CASCADE

project_technologies.technology_id
→ technologies(id)
ON DELETE RESTRICT
```

This matches the CMS lifecycle.

---

# 56. RLS RELATIONSHIP REQUIREMENT

Child tables must not leak Draft parent data.

Public access to:

```text
experience_tags
project_paragraphs
project_media
project_technologies
```

must depend on visibility of the parent record.

Example:

```text
project_media public SELECT
→ only when parent Project is published and not deleted
```

Do not create child policies based only on:

```text
is_active = true
```

---

# 57. TECHNOLOGY PUBLIC VISIBILITY

Two separate concepts:

## Public About Tech Stack

Requires:

```text
is_active = true
AND show_in_public_stack = true
```

## Published Project chip

A Technology may still render if:

```text
referenced by a published Project
```

even when:

```text
is_active = false
```

because disabling a Technology must not break existing public Projects.

RLS/query design must respect this distinction.

---

# 58. SINGLETON SEED DATA

During database initialization:

```text
profile_content
→ one row

about_organization
→ one row

hero_media
→ slots 1, 2, 3
```

Migration later fills these rows with current V1 content.

Do not require Admin to create foundational singleton rows manually.

---

# 59. INITIAL CONTENT MIGRATION

Migration order:

```text
1. Technologies
2. Profile content
3. Hero media
4. About interests
5. About organization content
6. About organization skills
7. About gallery
8. Experiences + tags
9. Projects
10. Project paragraphs
11. Project media
12. Project technologies
```

This ensures relationships exist before dependent rows are inserted.

---

# 60. TECHNOLOGY MIGRATION

Current V1 Tech Stack items are inserted into `technologies`.

Map existing public visual groups exactly:

```text
Languages
→ languages

Development & Systems
→ development_systems

Tools & Platforms
→ tools_platforms
```

Set:

```text
show_in_public_stack = true
is_active = true
```

Existing Project-only tags not intended for About Tech Stack can be inserted with:

```text
show_in_public_stack = false
```

---

# 61. EXPERIENCE MIGRATION

Each existing V1 Experience card becomes one `experiences` row.

Preserve:

- Type,
- Title,
- Role,
- Location,
- Description,
- current order.

Set:

```text
status = published
deleted_at = null
```

Existing chips become `experience_tags` rows.

The public visual card remains unchanged.

---

# 62. PROJECT MIGRATION

Existing real populated Project cards become `projects`.

Set:

```text
status = published
deleted_at = null
```

Preserve:

- title,
- current category,
- short description,
- current order,
- cover,
- technologies/tags,
- Project Detail content.

Current `COMING SOON` placeholder cards are not required as Project records.

---

# 63. DUPLICATED STATIC PROJECT PAGES

Current V1 detail pages are static and may contain duplicated structures/content.

Migration target:

```text
ONE generic project.html
+
projects database record
+
related paragraphs/media/technologies
```

Do not continue creating:

```text
project-a.html
project-b.html
project-c.html
```

for new Projects.

---

# 64. NEXT PROJECT QUERY

Use published order.

Concept:

```text
current published sort_order
→ next greater published sort_order
```

If no next record:

```text
wrap to first published Project
```

Only include:

```text
status = published
deleted_at IS NULL
```

Draft/Archived/Trash must never appear in public Next Project navigation.

---

# 65. RECENT CONTENT QUERY

Dashboard Recent Content can combine:

```text
projects.updated_at
experiences.updated_at
```

No new `recent_content` table is needed.

The Admin can fetch recent rows from both sources and merge client-side.

Do not duplicate data solely for Dashboard display.

---

# 66. DASHBOARD KPI QUERY

No analytics table needed.

Calculate:

```text
Projects total
Projects published
Projects draft
Projects archived

Experiences total
Experiences published

Technologies total
Technologies active
```

with database queries.

Because CMS volume is small, these counts are inexpensive.

---

# 67. NO `MEDIA` MASTER TABLE IN V1

A generalized polymorphic media system was considered but rejected for V1.

Reason:

- Hero has fixed slots,
- About has simple current/gallery media,
- Projects have cover + documentation,
- a polymorphic media table would increase complexity without enough benefit.

Use explicit media fields/tables.

This keeps RLS and vanilla JS simpler.

---

# 68. NO GENERIC CONTENT BLOCKS

Do not create:

```text
content_blocks
page_sections
block_type
block_json
```

for V1.

The website structure is already known.

Explicit tables give:

- clearer validation,
- clearer RLS,
- easier Admin forms,
- safer rendering,
- less accidental redesign capability.

---

# 69. NO JSONB FOR PRIMARY CMS CONTENT

Avoid using one large JSONB column such as:

```text
projects.content_json
```

for all Project detail content.

Use relational fields/tables for:

- paragraphs,
- media,
- technologies.

JSONB may be considered later for genuinely flexible metadata.

V1 favors explicit structure.

---

# 70. DATABASE CONSTRAINT SUMMARY

Planning constraints:

## `admin_users`

```text
one row maximum
valid auth.users FK
```

## `profile_content`

```text
one row maximum
```

## `hero_media`

```text
slot 1–3 only
slot 1 can never be hidden
```

## `about_organization`

```text
one row maximum
```

## `experiences`

```text
valid status
```

## `projects`

```text
unique valid slug
valid status
```

## `technologies`

```text
unique slug
case-insensitive unique name
valid public_group
public group required when shown publicly
```

## Relationship tables

```text
valid FK
cascade/restrict rules
```

---

# 71. PROJECT PUBLISH VALIDATION — DATABASE FUNCTION OPTION

Recommended for later evaluation:

A controlled RPC such as conceptually:

```text
publish_project(project_id)
```

could validate:

- ownership through RLS/Auth,
- AAL2,
- required text fields,
- cover references,
- at least one paragraph,
- status transition.

Advantages:

- one authoritative publish rule,
- avoids relying entirely on UI validation.

But Storage promotion still requires orchestration.

Final decision belongs to implementation design.

Do not create the RPC before schema freeze.

---

# 72. EXPERIENCE PUBLISH FUNCTION OPTION

Likewise, a small controlled:

```text
publish_experience(experience_id)
```

may be useful.

However Experience workflow is simple enough that direct secure UPDATE may also be acceptable.

Avoid unnecessary RPC proliferation.

---

# 73. DATA LENGTH BASELINE

Planning limits:

```text
Profile name                  100
Professional title            160
Hero description              600

Headings                      160–220
Interest label                120
Skill title                   120
Skill description             500

Experience type               80
Experience title              160
Experience role               180
Experience location           180
Experience tag                100

Project title                 180
Project category              100
Short description             400
Slug                          140
Role                          180
Project type                  140
Cover alt                     250
Media alt                     250

Technology name               100
Technology slug               120
Icon key                      120
```

Long paragraph text uses `text`.

Limits should be checked against current V1 content before final SQL.

---

# 74. DATABASE NAMING CONVENTION

Use:

```text
snake_case
lowercase
plural table names for collections
```

Examples:

```text
project_media
project_technologies
about_gallery
```

Avoid inconsistent names such as:

```text
ProjectMedia
projectTech
tbl_projects
```

---

# 75. BOOLEAN NAMING

Use explicit boolean names:

```text
is_active
featured
show_in_public_stack
```

Avoid ambiguous:

```text
active_flag
state
enabled_value
```

---

# 76. FILE PATH NAMING

Use:

```text
*_path
```

for Storage object paths.

Use:

```text
*_url
```

only for real external links such as GitHub/Demo.

Example:

```text
cover_desktop_path
github_url
```

This distinction prevents confusion.

---

# 77. MIGRATION FALLBACK RULE

Do not delete existing static content immediately.

For each section:

```text
seed dynamic data
→ build dynamic renderer
→ compare against V1
→ test
→ switch source
→ retain rollback path temporarily
```

Database migration must not force an immediate public redesign.

---

# 78. DATABASE TEST DATA

Before migrating real content, use a small safe test dataset.

Examples:

```text
Draft Project
Published Project
Archived Project
Trashed Project

Published Experience
Draft Experience

Active Public Technology
Active Project-only Technology
Disabled Technology
```

This allows RLS and renderer testing across all states.

---

# 79. DATABASE TEST MATRIX

Before production migration test:

## Projects

```text
create Draft
edit Draft
publish
query public
unpublish
archive
restore Draft
trash
restore
permanent delete
```

## Experience

```text
create
draft
publish
reorder
archive
restore
```

## Technologies

```text
add
use in Project
disable
verify existing Project relationship
enable again
```

## Media

```text
Draft staging paths
publish transition
replace
failed replace
cleanup
```

---

# 80. DATA INTEGRITY TESTS

Verify:

```text
cannot create Hero slot 4
cannot create second profile singleton
cannot create second organization singleton
cannot duplicate Project slug
cannot use invalid status
cannot duplicate Technology name by case
cannot delete used Technology if FK restricts
deleting Project removes child DB rows
deleting Experience removes Experience tags
```

---

# 81. RLS TEST DEPENDENCY

Schema is not production-ready until `ADMIN-CMS-SECURITY.md` access matrix passes.

Minimum identities:

```text
anon
authenticated non-owner
owner aal1
owner aal2
```

Database correctness without RLS correctness is insufficient.

---

# 82. EXISTING GUESTBOOK

Do not modify existing Guestbook schema during CMS database creation unless a security audit discovers a necessary fix.

Guestbook remains a separate bounded feature.

Future moderation V2 may add new fields/indexes only after its own specification.

---

# 83. BACKUP / EXPORT CONSIDERATION

Because portfolio content is important and backend remains zero-cost, plan a simple export strategy later.

Potential future operational export:

```text
projects
project_paragraphs
project_media metadata
experiences
technologies
profile/about
```

No automated backup infrastructure is required to complete CMS V1.

Original full-quality images remain stored by the owner locally as already planned.

---

# 84. FINAL TABLE INVENTORY

CMS V1 planned content tables:

```text
PUBLIC CONTENT
1. profile_content
2. hero_media
3. about_interests
4. about_organization
5. about_organization_skills
6. about_gallery
7. experiences
8. experience_tags
9. projects
10. project_paragraphs
11. project_media
12. technologies
13. project_technologies

PRIVATE SECURITY
14. app_private.admin_users
```

Existing Guestbook infrastructure remains separate.

---

# 85. FINAL RELATIONSHIP INVENTORY

```text
experiences
1 ────< experience_tags

projects
1 ────< project_paragraphs

projects
1 ────< project_media

projects
>────< technologies
through project_technologies

auth.users
1 ──── 0/1 app_private.admin_users
```

Hero/About fixed current state does not need unnecessary parent relationship tables.

---

# 86. CURRENT OPEN DATABASE DECISIONS

These should be resolved before SQL generation:

1. Final exact text limits after checking all current V1 content.

2. Whether Profile/About image paths remain inside `profile_content` or become a tiny dedicated table.
   - Current recommendation: keep inside `profile_content`.

3. Exact Project Draft → Published media promotion workflow.

4. Exact Project Unpublish/Archive media privacy workflow.

5. Exact Project Publish validation mechanism:
   - controlled RPC vs secure direct updates + validation.

6. Final behavior of `published_at`:
   - first publish timestamp vs latest publish timestamp.
   - Current recommendation: keep first publish timestamp; `updated_at` tracks later changes.

7. Whether Experience Delete is exposed in UI or Archive only.
   - Schema supports `deleted_at` defensively.

8. Exact existing Supabase Guestbook schema names to avoid naming collisions.

These are implementation details, not reasons to redesign CMS.

---

# 87. RECOMMENDED DECISIONS FOR OPEN ITEMS

Current recommendation:

## `published_at`

```text
set only on first successful Publish
do not overwrite on every edit
```

## Restore Project from Trash

```text
restore as Draft
```

## Technology Delete

```text
not exposed
Disable only
```

## Experience numbering

```text
derived from ordered result
```

## Project Next navigation

```text
derived from published sort_order
with wraparound
```

## Project Gallery

```text
dynamic rows
renderer-controlled layout
```

## Admin identity

```text
private single-row admin_users table
```

These recommendations align with the current design/security specifications.

---

# 88. IMPLEMENTATION ORDER AFTER SCHEMA FREEZE

When implementation begins:

```text
1. Create private authorization schema/table
2. Create core singleton tables
3. Create About tables
4. Create Experience tables
5. Create Technology table
6. Create Project tables
7. Create indexes/constraints
8. Create updated_at trigger
9. Enable RLS
10. Create/test policies
11. Configure Storage buckets/policies
12. Seed test data
13. Execute RLS/security matrix
14. Build Admin CRUD phase-by-phase
15. Migrate V1 real content
```

Do not build public dynamic renderers before visibility policies are tested.

---

# 89. DATABASE CHANGE CONTROL

Any future proposed schema change must answer:

```text
Which CMS feature requires this?
Which V1 renderer consumes it?
Does it affect RLS?
Does it affect Storage?
Does it affect migration?
Does it introduce arbitrary layout/content?
```

Do not add fields because they might be useful someday.

---

# 90. FINAL DATABASE PRINCIPLE

The schema is deliberately explicit:

```text
KNOWN PUBLIC V1 STRUCTURE
+
STRUCTURED CMS CONTENT
+
SAFE RELATIONSHIPS
+
CLEAR WORKFLOW STATE
+
RLS-READY DATA MODEL
=
MAINTAINABLE PORTFOLIO CMS
```

It should remain easy to understand from VS Code and Supabase Dashboard.

No hidden framework magic is required.

---

# 91. HANDOFF TO FINAL SQL PHASE

After this document is reviewed and the existing Supabase project is audited, the next database artifact should be:

```text
docs/database/ADMIN-CMS-SCHEMA.sql
```

That SQL will contain:

- schemas,
- tables,
- constraints,
- indexes,
- triggers,
- seed singleton records,
- RLS enablement.

RLS policy SQL may either live in the same migration or a separate security migration.

Recommended separation:

```text
001_admin_cms_schema.sql
002_admin_cms_rls.sql
003_admin_cms_seed.sql
```

Do not generate/run these migrations until:

```text
database design approved
+
current Supabase state audited
```

---

**END — ADMIN CMS DATABASE BASELINE**
