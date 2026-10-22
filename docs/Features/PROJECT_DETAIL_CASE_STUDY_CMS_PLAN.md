# CODEX — PROJECT DETAIL CASE STUDY & CMS INTEGRATION PLAN

## ROLE

Act as a Senior Full-Stack Engineer, Software Architect, UI/UX Engineer, and CMS Systems Designer.

You are working on my existing personal portfolio repository.

Your task is to **analyze the existing codebase and prepare a complete technical implementation plan** for upgrading the Project Detail Page into a dynamic, interactive, CMS-managed Engineering Case Study.

**CRITICAL: PLANNING MODE ONLY.**

Do not modify files, generate migrations, install dependencies, refactor code, or implement features yet.

Inspect the repository first, identify the actual architecture, and provide a practical plan for review and approval.

---

## 1. PROJECT BACKGROUND

My portfolio currently contains:

- A homepage with a Projects showcase section.
- Individual Project Detail Pages accessible through project cards.
- An existing Admin CMS for managing portfolio content.
- An existing backend, database, and media management workflow.

The homepage Projects section and the individual Project Detail Pages are different.

The requested redesign mainly concerns the **individual Project Detail Page**, not the entire homepage.

Preserve the existing homepage design and other portfolio sections unless a small compatibility adjustment is necessary and explicitly approved.

I have an HTML design prototype representing the desired visual direction:

`project_case_study (2).html`

Use this prototype as a visual and interaction reference, not as production-ready code.

Do not blindly copy its sample data, placeholder content, technology assumptions, or implementation structure.

The intended design direction is:

**Story-First Interactive Engineering Case Study**

Characteristics:
- Clean and minimal.
- Premium editorial presentation.
- White/off-white background.
- Restrained blue or indigo accents.
- Strong visual hierarchy.
- Connected development timeline.
- Interactive system architecture.
- Modular feature cards.
- Contextual project documentation.
- Technical explanations.
- Smooth and purposeful animations.

The implementation should follow the existing portfolio design system and technology stack wherever possible.

---

## 2. FIRST TASK — AUDIT THE EXISTING CODEBASE

Before proposing implementation details, inspect and document:

### Frontend

Identify:
- Current framework and rendering architecture.
- Project listing components.
- Project Detail Page components and routes.
- Existing styling conventions.
- Existing animation and interaction libraries.
- Image rendering and optimization behavior.
- Responsive breakpoints.
- Existing reusable components.

### Admin CMS

Identify:
- Existing project management forms.
- Current project creation and editing workflows.
- Supported project fields.
- Existing rich text or structured content editors.
- Existing media upload and image management.
- Current authentication and authorization.
- Existing validation behavior.

### Backend and Database

Identify:
- Existing database technology and schema.
- Project-related models and relationships.
- Existing API endpoints or server actions.
- Current image storage strategy.
- Existing migration conventions.
- Whether project detail content is stored as structured fields, JSON, relational records, or another format.
- How older project records are currently rendered.

Do not assume the project uses React, Next.js, Laravel, PHP, Prisma, PostgreSQL, or any other specific technology until verified.

Report the relevant file paths and existing architectural dependencies.

---

## 3. PROJECT DETAIL PAGE REDESIGN

Plan an upgraded Project Detail Page containing the following optional and CMS-managed sections.

### A. Project Hero

Editable fields:
- Project title.
- Short summary.
- Category.
- Role.
- Project period.
- Status.
- Cover image.
- External links.
- Optional project highlights.

### B. Challenge & Solution

Editable:
- Problem title and description.
- Solution title and description.
- Optional supporting media.
- Optional outcome highlights.

### C. Development Journey

This is the main storytelling feature.

Support:
- Unlimited or reasonably configurable development phases.
- Phase title.
- Phase description.
- Phase number/order.
- Optional technology tags.
- Optional image or video.
- Optional technical notes.
- Optional supporting links.
- Drag-and-drop phase reordering.
- Add, edit, duplicate, and delete phase actions.

The frontend should render a connected timeline inspired by the reference prototype.

On desktop, support an elegant alternating composition.

On mobile, show a readable single-column process.

Do not require every phase to have an image or exactly the same content structure.

Avoid large empty placeholders when optional content is missing.

### D. Interactive System Architecture

Support CMS-managed architecture nodes.

Each node may have:
- Node title.
- Module type/category.
- Description.
- Technology references.
- Optional image.
- Optional detailed explanation.
- Optional relationship to other nodes.

Provide a manageable way for admins to define system connections and data flow.

Do not require administrators to manually write SVG paths or modify JavaScript.

Evaluate the feasibility of a structured node-and-connection editor versus simpler predefined architecture layouts.

Recommend an approach that balances flexibility, editing simplicity, responsiveness, and maintenance.

### E. Features & Capabilities

Allow administrators to:
- Add feature cards.
- Edit titles and descriptions.
- Select optional icons.
- Upload feature images.
- Choose from safe predefined card layouts.
- Reorder cards.
- Remove or hide cards.

The frontend should support an asymmetric, responsive card arrangement.

Avoid exposing arbitrary CSS configuration to administrators.

### F. Technology Stack & Engineering Decisions

Support:
- Technology name.
- Category.
- Purpose.
- Optional explanation of why it was selected.
- Optional logo/icon.
- Display order.

Reuse the existing technology taxonomy or database relationships when appropriate.

Avoid duplicate technology records unless required by the existing schema.

### G. Project Documentation

Support:
- Multiple project images.
- Captions.
- Descriptions.
- Categories.
- Display order.
- Optional association with development phases.
- Image lightbox.

Avoid storing duplicate image files when the same media asset is used in different sections.

### H. Challenges, Results & Reflection

Support:
- Technical challenges.
- Decisions or solutions.
- Results.
- Lessons learned.
- Future improvements.
- Optional supporting media.

Do not require unverified numerical performance metrics.

### I. Section Visibility & Reordering

Evaluate support for:
- Enable/disable optional sections.
- Reordering compatible sections.
- Preserving a coherent storytelling hierarchy.
- Hiding empty sections.
- Maintaining navigation accuracy.

Recommend reasonable restrictions to prevent confusing page structures.

---

## 4. CMS COMPATIBILITY — CRITICAL REQUIREMENT

All new content must be manageable from the existing Admin CMS.

Administrators should NOT need to edit code to update project details.

The plan must cover complete create, read, update, and delete workflows.

Required capabilities:
- Edit text content.
- Replace images.
- Manage timeline phases.
- Manage system architecture nodes.
- Manage feature cards.
- Update technology explanations.
- Reorder content.
- Toggle optional sections.
- Manage documentation galleries.
- Preview changes before publishing.

Use the existing Admin UI patterns and design system.

Do not create a completely separate administration system.

Consider a user-friendly Project Editor with organized tabs or sections such as:

- General.
- Story & Process.
- System Architecture.
- Features.
- Technologies.
- Media.
- Results.
- Preview.

Recommend the best structure based on the existing Admin Panel rather than assuming this exact tab arrangement is mandatory.

---

## 5. ADVANCED IMAGE CROP & POSITIONING

This is a major requirement.

When an administrator uploads or selects an image, they must be able to control how the image appears in the public Project Detail Page.

Required editing experience:

1. Upload or choose an existing image.
2. Display an image crop/position editor.
3. Allow drag-to-reposition.
4. Allow zoom in and out.
5. Select a crop area.
6. Support appropriate predefined aspect ratios.
7. Provide a reset action.
8. Preview the image inside its actual destination card or section.
9. Save the image presentation configuration.
10. Edit the crop again later.

Evaluate support for contexts such as:
- Hero cover.
- Timeline media.
- Feature card.
- Gallery thumbnail.
- Architecture detail image.

IMPORTANT:

The admin must be able to prevent important content from being unintentionally cut off.

Distinguish between:
- Original uploaded image.
- Crop coordinates.
- Focal point.
- Aspect ratio.
- Object-fit mode.
- Display position.
- Generated thumbnail or optimized derivative.

Recommend whether to use nondestructive crop metadata, physical cropped derivatives, or a hybrid approach.

Preserve the original image.

Consider separate image display presets for desktop and mobile when needed.

Support an optional "contain" mode for diagrams, dashboards, schematics, and other images that should not be cropped.

The same original image may require different crops in different placements.

Avoid changing the crop globally across every location where the asset is reused.

Investigate whether a crop library already exists in the repository.

Only recommend additional dependencies when justified.

Evaluate:
- Crop accuracy.
- File size.
- Browser performance.
- Mobile editing usability.
- Accessibility.
- Security.
- Storage impact.

---

## 6. CONTENT MODEL & DATA MIGRATION

Design a maintainable data architecture.

Evaluate whether to extend existing project tables, introduce related content tables, use structured JSON fields, or adopt a hybrid model.

Do not automatically introduce a new page-builder system.

Prefer the smallest coherent solution that supports the required flexibility.

Explain:
- Proposed entities and fields.
- Relationships.
- Ordering strategy.
- Section visibility.
- Media references.
- Per-placement crop metadata.
- Validation.
- Data serialization.
- Backward compatibility.

Preserve existing project data.

Plan safe, reversible migrations when applicable.

Existing published projects must continue rendering correctly after the upgrade.

Identify default values and fallback rendering behavior for older records that do not contain the new case-study fields.

---

## 7. DRAFT, PREVIEW & PUBLISHING

Audit whether the existing CMS already supports draft and publish states.

If it does, plan integration with the existing workflow.

If not, evaluate the scope and necessity of introducing them.

The plan should consider:
- Draft editing.
- Saving changes safely.
- Previewing a project before publishing.
- Keeping unpublished content inaccessible to public visitors.
- Avoiding accidental overwrites.
- Handling failed saves.
- Displaying useful validation feedback.

Do not build an entirely new version-control system unless genuinely necessary.

---

## 8. FRONTEND ANIMATION & INTERACTION

Plan a restrained, performance-conscious motion system.

Include:
- Hero entrance.
- Section reveal.
- Timeline line progress.
- Active timeline phase.
- Interactive architecture node transitions.
- Expandable technical notes.
- Card hover states.
- Smooth navigation.
- Image lightbox transitions.

Animation must improve comprehension.

Avoid excessive motion, layout shifts, and complex effects without clear purpose.

Respect reduced-motion preferences.

Evaluate whether existing libraries can support these interactions.

Prefer native CSS and browser APIs when adequate.

Use animation libraries only when their benefits justify the complexity.

---

## 9. PERFORMANCE, ACCESSIBILITY & SECURITY

Include a plan for:

Performance:
- Lazy-loaded project media.
- Responsive image sizes.
- Efficient animation updates.
- Avoiding layout shift.
- Appropriate image optimization.
- Limited unnecessary JavaScript.

Accessibility:
- Keyboard-accessible navigation.
- Correct heading hierarchy.
- Accessible architecture controls.
- Expandable panel semantics.
- Modal focus management.
- Reduced-motion support.
- Readable contrast.
- Mobile usability.

Security:
- Existing CMS authorization.
- File type validation.
- Upload size restrictions.
- Safe media processing.
- Output sanitization.
- Safe rendering of rich content.
- Protection of draft preview access.
- Existing project ownership and permission rules.

---

## 10. IMPLEMENTATION STRATEGY

Propose a phased implementation.

Suggested sequence:

Phase 1 — Repository Audit & Architecture Decisions

Phase 2 — Data Model & Backward Compatibility

Phase 3 — CMS Editing Experience

Phase 4 — Media Upload, Crop & Positioning

Phase 5 — Dynamic Project Detail Frontend

Phase 6 — Animation & Interaction Refinement

Phase 7 — Testing, Migration & Release Preparation

You may recommend a better order after examining dependencies.

For each phase, explain:
- Objective.
- Files or modules likely affected.
- Main engineering tasks.
- Dependencies.
- Potential risks.
- Acceptance criteria.
- Recommended testing.

Keep each phase small enough to implement and review independently.

---

## 11. ACCEPTANCE CRITERIA

The implementation will be considered successful when:

1. Existing projects continue working.
2. New project detail content is editable through the CMS.
3. Timeline phases can be created, edited, reordered, and deleted.
4. Architecture nodes and explanations can be managed without editing code.
5. Feature cards and technology descriptions are dynamically rendered.
6. Project images can be uploaded, replaced, cropped, positioned, and previewed.
7. Original images remain preserved.
8. Per-placement image crops do not unintentionally affect other image uses.
9. The new frontend resembles the approved visual prototype.
10. Animations are smooth and non-distracting.
11. Desktop and mobile layouts work correctly.
12. Empty or missing optional content does not break the layout.
13. Existing administrative workflows and permissions remain functional.
14. The upgraded project pages meet reasonable performance and accessibility expectations.
15. The homepage Projects showcase continues working.

---

## 12. REQUIRED OUTPUT FORMAT

Produce a technical planning document containing:

1. **Existing Repository Findings**
   - Verified architecture.
   - Relevant file paths.
   - Existing CMS and media capabilities.

2. **Gap Analysis**
   - What already exists.
   - What needs extension.
   - What should be reused.
   - What should not be changed.

3. **Proposed Frontend Architecture**
   - Components.
   - Rendering strategy.
   - Responsive behavior.
   - Animation approach.

4. **Proposed CMS Editor Architecture**
   - Admin screens.
   - Editing workflows.
   - Dynamic content management.

5. **Proposed Database/Data Model**
   - Fields and relationships.
   - Compatibility strategy.
   - Migration approach.

6. **Image Management & Crop Design**
   - Editing UX.
   - Storage strategy.
   - Crop metadata.
   - Responsive image handling.

7. **Phased Implementation Roadmap**
   - Task breakdown.
   - Dependencies.
   - Risks.
   - Verification steps.

8. **Trade-offs & Alternatives**
   - Explain major technical decisions.
   - Compare solutions when necessary.
   - Recommend a maintainable approach.

9. **Open Questions**
   - Only questions that genuinely require my decision.
   - Do not ask questions already answered by the repository.

10. **Final Implementation Checklist**
    - A practical checklist for future Codex implementation sessions.

---

## FINAL INSTRUCTION

**DO NOT IMPLEMENT ANYTHING YET.**

Do not edit project files.

Do not run migrations.

Do not install dependencies.

Do not rewrite existing components.

Do not change database structures.

Do not begin implementation until I explicitly review and approve the plan.

First inspect the repository thoroughly and give me a realistic, maintainable implementation proposal that respects the existing portfolio, CMS, admin panel, and data.