# ADMIN-DASHBOARD-DESIGN.md

**Project:** Project Web Portfolio — Admin Dashboard / CMS  
**Status:** Planning / Design Baseline  
**Language:** English  
**Theme:** Light  
**Admin:** Single owner only  
**Public Website:** Existing Portfolio V1 design is locked  
**Implementation Status:** **DO NOT IMPLEMENT UNTIL DATABASE + SECURITY SPEC ARE APPROVED**

---

# 1. PURPOSE

This document defines the UI/UX design rules for the Portfolio Admin Dashboard.

The Admin Dashboard exists to manage content for the existing public Portfolio V1. It does **not** redesign the public website.

```text
ADMIN CMS
    ↓
manage structured content
    ↓
existing Portfolio V1 renderers
    ↓
same public layout, animation, responsive behavior, and visual identity
```

The public Portfolio remains the presentation layer. The Admin Dashboard is a separate productivity interface.

---

# 2. DESIGN PRINCIPLES

The Admin interface should feel:

- clean,
- calm,
- precise,
- modern,
- lightweight,
- professional,
- easy to scan,
- easy to maintain,
- focused on content management.

Avoid:

- decorative gradients,
- glassmorphism,
- excessive shadows,
- floating decorative objects,
- public-portfolio animations,
- parallax,
- particle effects,
- oversized dashboard cards,
- unnecessary charts,
- excessive color usage,
- animation for decoration,
- complex enterprise navigation.

The Admin should look like a focused content tool, not another public-facing portfolio page.

---

# 3. PUBLIC V1 DESIGN LOCK

The Admin implementation must not use CMS migration as permission to redesign the public site.

The following public V1 elements are locked:

- section order,
- floating navbar,
- Hero composition,
- Hero photo-stack behavior,
- About slide structure,
- About carousel,
- Tech Stack visual,
- Experience sticky stacked cards,
- Education section,
- Certificates section,
- Portfolio horizontal carousel,
- Project card appearance,
- Project detail page structure,
- Contact section,
- Guestbook visual,
- Guestbook slider,
- plane animation,
- particles/interactions,
- footer,
- responsive behavior,
- current animation concepts.

When data becomes dynamic:

```text
STATIC DATA SOURCE
→
SUPABASE DATA SOURCE
```

not:

```text
EXISTING UI
→
NEW UI
```

---

# 4. ADMIN INFORMATION ARCHITECTURE

Main navigation:

```text
PORTFOLIO
Admin CMS

OVERVIEW
Dashboard

CONTENT
Profile & About
Experience
Projects
Technologies

ACCOUNT
Logout
```

No separate sidebar items for Hero, About Me, Organization, About Gallery, or Hero Photos. Those are secondary sections inside `Profile & About`.

No Guestbook moderation module in CMS V1. Guestbook moderation belongs to V2.

---

# 5. ADMIN SHELL

Desktop structure:

```text
┌───────────────────────────────────────────────────────────────┐
│ Sidebar                │ Main Content                         │
│                        │                                      │
│ PORTFOLIO              │ Page Header                          │
│ Admin CMS              │                                      │
│                        │ Page Actions                         │
│ OVERVIEW               │                                      │
│ Dashboard              │ Page Content                         │
│                        │                                      │
│ CONTENT                │                                      │
│ Profile & About        │                                      │
│ Experience             │                                      │
│ Projects               │                                      │
│ Technologies           │                                      │
│                        │                                      │
│ ACCOUNT                │                                      │
│ Logout                 │                                      │
└───────────────────────────────────────────────────────────────┘
```

Admin uses one consistent shell. Do not create visually unrelated layouts for each module.

---

# 6. SIDEBAR

## 6.1 Desktop

Use the approved **Grouped Sidebar**.

```text
PORTFOLIO
Admin CMS

OVERVIEW
▣ Dashboard

CONTENT
◉ Profile & About
▤ Experience
▦ Projects
◇ Technologies

ACCOUNT
↪ Logout
```

Rules:

- fixed left navigation on desktop,
- white surface,
- subtle right border,
- no black full-height sidebar,
- no large blue navigation buttons,
- no avatar,
- no notification bell,
- no global search,
- no fake account dropdown.

Active item:

- very light neutral background,
- slightly stronger text weight,
- strong icon/text contrast,
- optional thin primary indicator,
- medium border radius.

Do not use large saturated backgrounds.

## 6.2 Tablet / Mobile

Sidebar becomes a drawer.

Header:

```text
☰   Projects
```

Drawer:

```text
PORTFOLIO                 ×
Admin CMS

OVERVIEW
Dashboard

CONTENT
Profile & About
Experience
Projects
Technologies

ACCOUNT
Logout
```

Rules:

- background overlay behind drawer,
- clicking overlay closes drawer,
- Escape closes drawer on supported keyboards,
- focus stays within open drawer,
- selecting a page closes drawer on mobile.

---

# 7. PAGE HEADER

Do not create a feature-heavy global topbar.

Each page uses a local page header.

Example:

```text
Projects

Manage the projects displayed on your portfolio.

                                      [ + New Project ]
```

Page header may contain:

- page title,
- concise description,
- primary action,
- breadcrumb/back action where necessary.

Do not include notifications, calendar, weather, decorative profile avatar, or fake analytics.

---

# 8. ADMIN VISUAL SYSTEM

## 8.1 Color Tokens

Initial baseline:

```css
--admin-bg: #F5F5F7;
--admin-surface: #FFFFFF;
--admin-surface-subtle: #FAFAFA;

--admin-text-primary: #1D1D1F;
--admin-text-secondary: #6E6E73;
--admin-text-muted: #86868B;

--admin-border: #D2D2D7;
--admin-border-soft: #E8E8ED;

--admin-primary: #0071E3;
--admin-primary-hover: #0066CC;

--admin-success: #248A3D;
--admin-warning: #B26A00;
--admin-danger: #D70015;
--admin-focus: #0071E3;
```

These are semantic Admin tokens. Do not copy every public Portfolio color into the Admin.

## 8.2 Typography

Use a system-first stack:

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Helvetica,
  Arial,
  sans-serif;
```

Suggested hierarchy:

```text
Page Title       28–32px / 600
Section Title    18–20px / 600
Card Title       15–17px / 600
Body             14–16px / 400
Label            13–14px / 500
Helper Text      12–13px / 400
Navigation       14px / 500
Status Badge     12px / 500–600
```

Avoid extremely large type.

## 8.3 Spacing

Use a 4px-based scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

Default:

- card padding: 20–24px,
- page section gap: 24–32px,
- field vertical gap: 16–20px,
- label → input gap: 6–8px.

## 8.4 Radius

```text
Small control: 8px
Input/button: 10px
Card: 12–14px
Modal: 16px
```

Do not make every control pill-shaped.

## 8.5 Shadows

Prefer white surface + subtle border. Use shadow only when elevation is functionally useful, such as modal, dropdown, drawer, and sticky action bar.

---

# 9. BUTTON SYSTEM

## Primary

Use for:

- Publish,
- Add Project,
- Add Experience,
- Add Technology,
- final confirm action.

## Secondary

Use for:

- Save Draft,
- Save Changes,
- Replace,
- Restore.

## Tertiary / Ghost

Use for:

- Preview,
- Cancel,
- back actions,
- low-priority utilities.

## Danger

Use only for destructive actions:

- Move to Trash,
- Delete Permanently,
- destructive remove.

During async operation:

```text
[ Saving... ]
[ Publishing... ]
[ Uploading... ]
```

Disable the action while the request is active. Do not allow duplicate submits.

---

# 10. FORM SYSTEM

Fields should use consistent label, input, helper text, and validation message.

Example:

```text
Project Title *
[ Football Club Mobile App ]

Used on the Portfolio card and Project Detail page.
```

Error:

```text
Project Title *
[                                       ]

Project title is required.
```

Rules:

- labels never depend only on placeholders,
- required fields clearly marked,
- helper text concise,
- errors appear near the field,
- do not clear user data after a request error.

---

# 11. STATUS SYSTEM

Use consistent semantic status badges:

```text
Published
Draft
Archived
Disabled
Trash
Active
```

Semantics:

```text
Published → green
Active    → green
Draft     → neutral gray
Disabled  → neutral gray
Archived  → amber
Trash     → red
```

Badges are small indicators, not decorative banners.

---

# 12. TABLE / LIST SYSTEM

Desktop uses structured tables for content-heavy lists. Mobile converts rows into stacked cards.

Do not force wide desktop tables into horizontal scrolling unless absolutely necessary.

Standard row actions use `⋯` rather than showing many buttons.

Typical menu:

```text
Edit
Preview
────────────
Move Up
Move Down
────────────
Unpublish / Publish
Archive
Move to Trash
```

Only show actions valid for the current status.

---

# 13. DASHBOARD

```text
Dashboard

Manage and publish your portfolio content.

[ + New Project ]   [ + New Experience ]

┌─────────────────┐
│ PROJECTS        │
│ 6 total         │
│ 4 published     │
│ 1 draft         │
└─────────────────┘

┌─────────────────┐
│ EXPERIENCE      │
│ 5 total         │
│ 5 published     │
└─────────────────┘

┌─────────────────┐
│ TECHNOLOGIES    │
│ 24 total        │
│ 21 active       │
└─────────────────┘

Recent Content
──────────────────────────────────────────────
Football Club       Project      Published
RnEST Laboratory    Experience   Published
E-Commerce          Project      Draft
```

Rules:

- 3 KPI cards,
- status summary inside KPI cards,
- up to approximately 5 Recent Content items,
- New Project shortcut,
- New Experience shortcut,
- no charts,
- no traffic analytics,
- no storage graph,
- no fake statistics.

---

# 14. PROFILE & ABOUT

Main page:

```text
Profile & About

Manage the content displayed in your Hero and About sections.

[ Hero ]   [ About Me ]   [ Organization ]
```

Use secondary tab navigation inside the page.

---

# 15. HERO TAB

Editable Hero content:

- Name,
- Professional Title,
- Hero Description.

Hero Photos are exactly three slots:

```text
Hero Photo 01
Hero Photo 02
Hero Photo 03
```

Each provides:

- image preview,
- Replace Image,
- alt text where required.

Do not provide:

- Add Hero Photo,
- Delete slot,
- changing slot count,
- animation settings.

Public Hero remains exactly three interactive stack positions.

Actions:

```text
[ Preview ]   [ Save Changes ]
```

---

# 16. ABOUT ME TAB

Editable:

- About photo,
- heading,
- highlighted text,
- lead paragraph,
- main description,
- Area of Interest.

```text
About Photo
[ preview ]
[ Replace Image ]

Content

Heading
[ ... ]

Highlighted Text
[ ... ]

Lead Paragraph
[ ... ]

Description
[ ... ]

Area of Interest

01 Embedded Systems             ↑ ↓  Edit  Remove
02 Artificial Intelligence      ↑ ↓  Edit  Remove
03 Computer Vision              ↑ ↓  Edit  Remove

[ + Add Interest ]
```

Area of Interest is dynamic. Public visual remains existing V1.

---

# 17. ORGANIZATION TAB

Editable:

- heading,
- highlighted text,
- paragraph 1,
- paragraph 2,
- activity/skill items,
- gallery.

Skills:

```text
01 Leadership
   Description...
   ↑ ↓  Edit  Remove

02 Communication
   Description...
   ↑ ↓  Edit  Remove

03 Teamwork
   Description...
   ↑ ↓  Edit  Remove

[ + Add Skill ]
```

Gallery:

```text
01 [ image ]  ↑ ↓  Edit  Disable
02 [ image ]  ↑ ↓  Edit  Disable
03 [ image ]  ↑ ↓  Edit  Disable

[ + Add Photo ]
```

Gallery count can grow. Do not redesign the public About carousel.

---

# 18. PROFILE / ABOUT SAVE BEHAVIOR

Profile/About uses:

```text
Edit
→ Preview
→ Save Changes
```

No Draft/Publish workflow is required for these single-current-state sections.

If unsaved changes exist:

```text
You have unsaved changes.

Your changes will be lost if you leave this page.

[ Stay ]
[ Leave Without Saving ]
```

Success:

```text
Changes saved successfully.
```

Failure:

```text
Could not save your changes.
Please try again.
```

Never show success for partial failure.

---

# 19. EXPERIENCE — LIST PAGE

```text
Experience

Manage the experiences displayed on your portfolio.

                                      [ + New Experience ]

[ Search experience... ]     [ Status: All ]

#   Experience               Type           Status        ⋯
01  RnEST Laboratory         Laboratory     Published     ⋯
02  HMTK                     Organization   Published     ⋯
03  IT Support Intern        Internship     Published     ⋯
04  New Experience           Internship     Draft         ⋯
```

Status filters:

- All,
- Published,
- Draft,
- Archived.

No advanced filter system in V1.

---

# 20. EXPERIENCE — EDITOR

Use a full page, not a modal.

```text
← Back to Experience

New Experience                               Draft

[ Save Draft ] [ Preview ] [ Publish ]
```

Fields:

```text
Type
Title
Role
Location
Description
Tags
```

Experience tags are independent simple labels. They do not need to come from the central Technologies table because labels such as Documentation, Team Coordination, or Teaching are not necessarily technologies.

---

# 21. EXPERIENCE — PUBLIC OUTPUT CONTRACT

Public Experience continues using the existing **sticky stacked card** behavior.

```text
Published Experience data
    ↓
existing experience card renderer
    ↓
existing sticky stack initialization
```

Adding Experience 05 must simply extend the stack without a new animation system or slider library.

Experience numbering derives from `sort_order`.

---

# 22. EXPERIENCE — ACTIONS

Draft:

```text
Edit
Preview
Publish
Move Up
Move Down
Archive
Delete
```

Published:

```text
Edit
Preview
Move Up
Move Down
Unpublish
Archive
Delete
```

Archived:

```text
Edit
Preview
Restore to Draft
Delete
```

Archive is preferred over Delete. Experience does not require a full Trash system in V1.

---

# 23. PROJECTS — LIST PAGE

```text
Projects

Manage the projects displayed on your portfolio.

                                        [ + New Project ]

[ Search projects... ]       [ Status: All ]

Project                     Category     Status       Updated       ⋯
[img] Football Club         UI / UX      Published    Today         ⋯
      football-club

[img] E-Commerce            Web          Draft        Aug 15        ⋯
      ecommerce
```

Status filter:

- All,
- Published,
- Draft,
- Archived,
- Trash.

Rows include small cover thumbnail, title, slug, category, status, updated time, and actions.

---

# 24. PROJECTS — NEW / EDIT PAGE

Project editor is a full page.

```text
← Back to Projects

New Project                                      Draft

[ Save Draft ] [ Preview ] [ Publish ]
```

Published project:

```text
← Back to Projects

Football Club                                    Published

[ Save Changes ] [ Preview ] [ View Live ]
```

Use clearly separated sections.

---

# 25. PROJECT EDITOR — CARD INFORMATION

Fields:

- Project Title,
- Category,
- Short Description,
- Slug.

```text
Project Title *
[ Football Club Mobile App ]

Category *
[ UI / UX ]

Short Description *
[ ... ]

Slug
[ football-club-mobile-app ]

Auto-generated from title.
```

Slug rule:

- auto-generate for new project,
- after first Publish, title changes do not automatically change slug,
- manual slug changes require explicit warning.

---

# 26. PROJECT EDITOR — COVER

```text
PROJECT COVER

┌─────────────────────────────────────────────┐
│              Drop image here                │
│                                             │
│      JPG, PNG, WebP · Maximum 15 MB         │
│                                             │
│              [ Browse Image ]               │
└─────────────────────────────────────────────┘
```

After local processing:

```text
Original
6000 × 4000
7.8 MB

Desktop
1600 × 1067
342 KB
WebP

Mobile
750 × 500
91 KB
WebP

94.5% smaller

[ Compare ]   [ Use Optimized Images ]
```

After accepted:

```text
[ image preview ]

Alt Text *
[ Football club application interface ]

[ Replace Cover ]
```

Do not upload raw original automatically.

---

# 27. PROJECT EDITOR — DETAIL HEADER

Fields follow the existing V1 Project Detail structure:

- Main Title,
- Highlighted Title,
- Introduction,
- Role,
- Year,
- Project Type.

Admin only edits data. Position and typography remain controlled by the existing public template.

---

# 28. PROJECT EDITOR — ABOUT THE PROJECT

Fields:

- About Heading,
- ordered paragraphs.

```text
About Heading *
[ Designing an intuitive football experience ]

Paragraphs

01
[ ... ]
↑ ↓ Remove

02
[ ... ]
↑ ↓ Remove

[ + Add Paragraph ]
```

Do not provide rich text toolbar, custom font, custom color, custom alignment, arbitrary HTML, or custom CSS.

---

# 29. PROJECT EDITOR — TECHNOLOGIES

Searchable central selector:

```text
[ Search technologies... ]

Languages
☐ HTML
☐ CSS
☐ JavaScript
☐ Python

Development & Systems
☐ React
☐ Node.js
☐ OpenCV

Tools & Platforms
☑ Figma
☐ GitHub
☐ Docker

Project-only Tags
☑ UI/UX
☑ User Flow

Selected
[ Figma × ] [ UI/UX × ] [ User Flow × ]
```

If missing:

```text
Technology not found.

[ + Add New Technology ]
```

Use the same Add Technology component as Technologies Manager.

---

# 30. PROJECT EDITOR — DOCUMENTATION

Project detail supports multiple documentation images.

```text
DOCUMENTATION

01
[ image preview ]

Alt Text
[ Home screen design ]

↑ ↓  Replace  Remove

02
[ image preview ]

Alt Text
[ Match detail screen ]

↑ ↓  Replace  Remove

[ + Add Documentation Image ]
```

Number of images is dynamic.

Admin cannot control grid columns, width, margins, custom CSS, or free-form image position. Public layout remains template-controlled.

---

# 31. PROJECT EDITOR — LINKS

Optional:

```text
GitHub URL
[ https://github.com/... ]

Live Demo URL
[ https://... ]
```

If empty, the corresponding public link is not rendered. URL must be validated.

---

# 32. PROJECT EDITOR — SETTINGS

```text
Featured Project
[ OFF ]

Status
Draft

Created
16 August 2026

Last Updated
16 August 2026
```

`featured` is metadata only in V1. It must not create special public card size, color, or layout.

Status changes through workflow actions, not an unrestricted dropdown.

---

# 33. PROJECT PREVIEW

Preview provides:

```text
[ Card Preview ] [ Detail Preview ]
```

Card Preview must use the existing public Project card template/class contract.

Detail Preview must use the existing V1 Project Detail structure.

Preview must not publish Draft content. Draft Preview remains Admin-only.

Goal:

```text
Admin Preview
≈
actual public renderer
```

---

# 34. PROJECT PUBLISH VALIDATION

Save Draft may allow incomplete data.

Publish must enforce baseline required fields:

- Project Title,
- Category,
- Short Description,
- Cover,
- Cover Alt Text,
- Detail Introduction,
- Role,
- Year,
- Project Type,
- About Heading,
- at least one About paragraph.

Example:

```text
Cannot publish project.

Please complete:

• Project title
• Cover image
• Project detail introduction
• About heading
```

Do not silently publish incomplete content.

---

# 35. PROJECT STATUS WORKFLOW

```text
Draft
→ Preview
→ Publish

Published
→ Unpublish
→ Draft

Published / Draft
→ Archive

Project
→ Move to Trash
→ Restore or Delete Permanently
```

Archive keeps content/media but hides it from public.

Trash is soft delete and restorable.

---

# 36. PERMANENT DELETE

Require strong confirmation:

```text
Delete project permanently?

Football Club

This will permanently remove:

• Project content
• Project paragraphs
• Technology relationships
• Project documentation
• Project cover images

This action cannot be undone.

Type DELETE to continue.

[           ]

[ Cancel ]   [ Delete Permanently ]
```

Do not provide one-click permanent deletion.

---

# 37. PROJECT ORDERING

Use `sort_order`.

```text
Football Club       ↑ ↓
E-Commerce          ↑ ↓
IoT Monitoring      ↑ ↓
```

Order controls:

- public Portfolio carousel,
- Project sequence,
- Next Project navigation.

No drag-and-drop in V1.

---

# 38. NEXT PROJECT BEHAVIOR

Generate from published `sort_order` and use wraparound.

```text
01 Football Club
02 E-Commerce
03 IoT Monitoring
```

```text
Football Club → E-Commerce
E-Commerce → IoT Monitoring
IoT Monitoring → Football Club
```

---

# 39. EXISTING PROJECT MIGRATION

Existing real populated Project cards:

```text
→ migrate as Published
```

Current Coming Soon placeholders:

```text
→ not required as permanent CMS records
```

After migration, Published projects render automatically. Publishing a new project creates another existing-style card without manual HTML creation.

---

# 40. TECHNOLOGIES — LIST PAGE

```text
Technologies

Manage technologies and project tags used across your portfolio.

                                      [ + Add Technology ]

[ Search... ]   [ Public Group: All ]   [ Status: All ]

Icon   Technology    Public Group           Public   Status    ⋯
JS     JavaScript    Languages              Yes      Active    ⋯
PY     Python        Languages              Yes      Active    ⋯
◇      Figma         Tools & Platforms      Yes      Active    ⋯
—      User Flow     —                      No       Active    ⋯
```

Show usage count where useful, calculated from relationships rather than stored manually.

---

# 41. TECHNOLOGIES — PUBLIC GROUP CONTRACT

Existing public visual groups remain exactly:

```text
01 LANGUAGES
02 DEVELOPMENT & SYSTEMS
03 TOOLS & PLATFORMS
```

Each Technology may have:

```text
Active
Show in Public Tech Stack
Public Group
```

Project-only concept:

```text
User Flow
Active = Yes
Show in Public Tech Stack = No
Public Group = —
```

This allows flexible Project tags while About Tech Stack remains consistent.

---

# 42. TECHNOLOGIES — ADD / EDIT

Use a small modal or compact panel.

```text
Add Technology

Name *
[ Docker ]

Slug
[ docker ]

Icon
[ docker ]

Show in Public Tech Stack
[ ON ]

Public Group
[ Tools & Platforms ]

Active
[ ON ]

[ Cancel ]   [ Add Technology ]
```

No arbitrary SVG/HTML input. Prefer safe `icon_key` or icon metadata mapped by the application.

---

# 43. TECHNOLOGIES — DISABLE

Prefer Disable over Delete.

```text
Disable JavaScript?

This technology will no longer be available
for new project selections.

Existing projects using JavaScript will keep
their current relationship.

[ Cancel ] [ Disable ]
```

Disabled technologies:

- unavailable for new selections,
- existing Project relationships remain renderable,
- can be Enabled again.

No permanent Technology delete button in V1 Admin.

---

# 44. TECHNOLOGY ORDERING

For technologies shown in public Tech Stack:

```text
Python       ↑ ↓
C            ↑ ↓
C++          ↑ ↓
JavaScript   ↑ ↓
```

Use `sort_order`. No drag-and-drop V1.

---

# 45. SHARED IMAGE PROCESSOR

Image Processor is not a sidebar module.

It is a shared component used by:

- Hero Photos,
- About Photo,
- About Gallery,
- Project Cover,
- Project Documentation.

---

# 46. IMAGE PROCESSOR — SELECT

```text
Upload Image

┌─────────────────────────────────────────────┐
│                                             │
│              Drop image here                │
│                                             │
│      or choose an image from your device    │
│                                             │
│              [ Browse Image ]               │
│                                             │
│ JPG, PNG or WebP · Maximum 15 MB            │
└─────────────────────────────────────────────┘
```

Accepted:

- JPG,
- JPEG,
- PNG,
- WebP.

Rejected:

- SVG,
- GIF,
- video,
- HTML,
- JavaScript,
- executable content.

---

# 47. IMAGE PROCESSOR — PROCESS

```text
Optimizing image...

Original
6000 × 4000
7.8 MB

Processing Desktop...
Processing Mobile...
```

Do not show fake progress percentages if progress cannot be measured accurately.

---

# 48. IMAGE PROCESSOR — RESULT

```text
Image Optimization

Original
6000 × 4000
7.8 MB

Desktop
1600 × 1067
342 KB
WebP

Mobile
750 × 500
91 KB
WebP

Size reduction
94.5%

[ Original ] [ Optimized ]

[ Cancel ] [ Use Optimized Image ]
```

Processing happens locally before Storage upload. Do not upload immediately after Browse.

---

# 49. IMAGE PROCESSOR RULES

Hard rules:

- preserve aspect ratio,
- never upscale,
- no automatic crop,
- WebP optimized output,
- desktop/mobile variants where public V1 uses them,
- original remains on owner's device,
- optimized output only is uploaded.

Baseline input limit:

```text
15 MB
```

Final dimensions/quality per preset must be visually tested against V1 before implementation freeze.

---

# 50. SAFE IMAGE REPLACE UX

Workflow:

```text
select/process new image
→
upload new optimized image
→
database update succeeds
→
verify new reference
→
delete old storage file
```

Failure:

```text
Could not upload image.

Your previous image has not been changed.

[ Try Again ]
```

Never delete the current image before the new record is safely stored.

---

# 51. MODAL DESIGN

Modals are reserved for:

- confirmation,
- small Technology Add/Edit,
- destructive actions,
- compact auxiliary flows.

Do not edit full Projects or Experience inside modals.

Modal structure:

```text
Title
Description

Content / confirmation

[ Cancel ] [ Primary Action ]
```

Rules:

- centered desktop,
- near-full-width mobile,
- Escape closes non-destructive modal,
- destructive confirmation explicit,
- focus trapping required.

---

# 52. CONFIRMATION PATTERNS

Archive:

```text
Archive "Football Club"?

This project will be hidden from your public
portfolio but its content and media will be kept.

[ Cancel ] [ Archive Project ]
```

Move to Trash:

```text
Move "Football Club" to Trash?

The project will be removed from your public
portfolio. You can restore it later.

[ Cancel ] [ Move to Trash ]
```

Permanent Delete requires typed `DELETE` confirmation.

---

# 53. TOAST / FEEDBACK

Success examples:

```text
✓ Changes saved successfully.
✓ Draft saved successfully.
✓ Experience published.
✓ Project published.
```

Failure examples:

```text
Could not save your changes.
Could not publish this project.
Image upload failed.
Your session has expired.
```

Rules:

- short,
- clear,
- no raw stack trace,
- no raw Supabase/Postgres error shown directly,
- retain technical details in console only during development.

---

# 54. EMPTY STATES

Experience:

```text
No experiences yet.

Add your first experience to start building
your professional history.

[ + New Experience ]
```

Projects:

```text
No projects yet.

Create your first project and publish it
to your portfolio.

[ + New Project ]
```

Search empty:

```text
No matching projects.

Try another search term or status.
```

---

# 55. LOADING STATES

Use skeletons or simple loading placeholders where content is initially fetched.

Examples:

```text
Loading projects...
Loading experiences...
Loading technologies...
```

Use full-page guarded loading only during initial authentication/session check and MFA/session gate.

---

# 56. UNSAVED CHANGES

Forms with pending changes must warn before sidebar navigation, browser back, tab change where data would be lost, or refresh/close where supported.

```text
You have unsaved changes.

Your changes will be lost if you leave this page.

[ Stay ]
[ Leave Without Saving ]
```

Do not use autosave in V1.

---

# 57. RESPONSIVE ADMIN

## Desktop

- fixed grouped sidebar,
- spacious main content,
- tables for lists,
- multi-column field groups only where useful,
- sticky editor action bar allowed.

## Tablet

- sidebar may switch to drawer,
- forms mostly one column,
- compact table/card hybrid if necessary.

## Mobile

- sidebar drawer,
- one-column forms,
- list rows become cards,
- documentation images stack vertically,
- action bar may be sticky at bottom,
- primary actions remain reachable,
- no forced desktop-width tables.

---

# 58. ACCESSIBILITY

Admin must support:

- visible keyboard focus,
- semantic buttons,
- labels associated with fields,
- color-independent status meaning,
- alt text fields,
- sufficient contrast,
- accessible modal focus behavior,
- Escape close where appropriate,
- keyboard-accessible menus,
- reduced-motion preference where Admin motion is introduced.

Never use color alone to communicate status or error.

---

# 59. MOTION

Admin motion should be minimal.

Allowed:

- menu fade/slide,
- modal transition,
- drawer transition,
- toast entrance/exit,
- subtle button/hover transitions.

Do not copy public Portfolio animation language into Admin.

No particles, parallax, card stacking animation, decorative page transitions, or looping motion in Admin.

Public Experience/Hero/Portfolio animations remain in the public site only.

---

# 60. ADMIN SECURITY UX BOUNDARY

The Admin UI is not the security boundary.

UI may hide unavailable actions, but database/storage must still enforce authorization.

The Admin should provide clear session states:

```text
Checking session...
Login required
MFA required
Session expired
Unauthorized
```

Detailed Auth, MFA, RLS, Storage Policies, SQL-injection protections, XSS protections, and session requirements belong in `ADMIN-CMS-SECURITY.md`.

---

# 61. OUT OF SCOPE — ADMIN DESIGN V1

Do not design/implement now:

- Admin dark mode,
- public color editor,
- public font editor,
- page builder,
- custom CSS,
- custom JS,
- rich WYSIWYG editor,
- dashboard analytics,
- Guestbook moderation,
- Certificates Manager,
- Education Manager,
- Contact Manager,
- multi-admin,
- drag-and-drop reorder,
- version history,
- autosave,
- activity log,
- storage usage dashboard,
- AI content generation.

---

# 62. DESIGN CHANGE CONTROL

Any future proposal that changes sidebar hierarchy, Admin color system, Editor sections, public V1 template, public animation, public card layout, or responsive behavior must be discussed before implementation.

The coding assistant must not silently redesign.

---

# 63. SCREEN INVENTORY

```text
Authentication
├── Login
└── MFA

Admin
├── Dashboard
│
├── Profile & About
│   ├── Hero
│   ├── About Me
│   └── Organization
│
├── Experience
│   ├── List
│   ├── New
│   ├── Edit
│   └── Preview
│
├── Projects
│   ├── List
│   ├── New
│   ├── Edit
│   ├── Card Preview
│   ├── Detail Preview
│   └── Trash state
│
├── Technologies
│   ├── List
│   └── Add/Edit modal
│
└── Logout
```

---

# 64. IMPLEMENTATION HANDOFF RULE

Before implementing each Admin screen, coding assistant must first state:

1. files to create/change,
2. data required,
3. existing V1 contracts being preserved,
4. responsive behavior,
5. loading/error states,
6. security implications,
7. test criteria.

Then implement only the approved scope.

---

# 65. CURRENT DESIGN DECISIONS — LOCKED BASELINE

Confirmed:

- Light Admin theme.
- English Admin interface.
- No Admin profile photo/avatar.
- Grouped Sidebar.
- Desktop sidebar + mobile drawer.
- No complex global topbar.
- Dashboard uses 3 KPI cards.
- No dashboard charts.
- Recent Content remains.
- Profile & About uses Hero / About Me / Organization tabs.
- Hero uses exactly 3 photo slots.
- All relevant About content is editable.
- Experience keeps the existing public sticky stack.
- Experience can grow dynamically.
- Experience tags are independent labels.
- Project editor is a full page.
- Project card public design is unchanged.
- Project detail public design is unchanged.
- Project documentation supports multiple images.
- Technologies are central data.
- Public Tech Stack keeps exactly 3 visual groups.
- Project-only technology/tag records are allowed.
- Image processing is local/client-side.
- No automatic crop.
- No upscaling.
- Draft → Preview → Publish for Projects/Experience.
- Profile/About uses Preview → Save Changes.
- Projects use Archive + Trash.
- `sort_order` controls ordering.
- Drag-and-drop is not V1.
- Guestbook moderation is V2.
- Public font/color editing is not V1.
- Public V1 animation/layout/UI remains locked.

---

# 66. FINAL DESIGN RULE

The Admin Dashboard must make portfolio content easier to manage while remaining visually subordinate to the existing public Portfolio.

```text
PUBLIC V1
= presentation and interaction source of truth

ADMIN CMS
= secure structured content-control interface
```

The CMS should make adding content easy without requiring the owner to redesign the website for each new Project, Experience, photo, or text update.

---

**END — ADMIN DASHBOARD DESIGN BASELINE**
