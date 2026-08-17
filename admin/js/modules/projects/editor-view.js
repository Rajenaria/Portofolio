/*
  Project editor (Phase 8A).

  Full-page editor inside the Admin shell. It writes only columns that exist in
  public.projects, plus the staged paragraph list and technology relationships.

  NOT IN THIS PHASE: cover_bucket / cover_desktop_path / cover_mobile_path /
  cover_alt and the whole project_media table. Those columns exist but are left
  untouched here; the Settings section says so explicitly. There is no Storage
  call anywhere in this module.

  STATUS
  ------
  Saving never changes status: a published Project stays published when edited.
  Status only moves through the explicit Publish / Unpublish / Archive / Restore
  actions in the list.

  SLUG
  ----
  Auto-generated from the title for a new Project until the owner edits it by
  hand. Once the Project has been published at least once (published_at is set)
  the slug is locked, because the future public URL project.html?slug=<slug>
  must stay stable (Features doc section 25).
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, statusBadge, updatedAt } from "../../core/dom.js";
import { toast } from "../../core/toast.js";

import {
  textField,
  textareaField,
  checkboxField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import { createParagraphsEditor } from "./paragraphs-editor.js";
import { createTechnologySelector } from "./technology-selector.js";
import { openProjectPreview } from "./preview.js";

export const LIMITS = {
  title: 180,
  slug: 140,
  cardCategory: 100,
  shortDescription: 400,
  detailTitleMain: 180,
  detailTitleHighlight: 180,
  role: 180,
  projectType: 140,
  aboutHeading: 220
};

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "");
}

/*
  Only http: and https: are accepted. Parsing with new URL() rather than a
  string prefix test means javascript:, data: and vbscript: cannot slip through
  via whitespace or case tricks (ADMIN-CMS-SECURITY.md section 44).
*/
export function validateUrl(value, label) {
  const text = trimmed(value);

  if (text === "") {
    return "";
  }

  let parsed;

  try {
    parsed = new URL(text);
  } catch (error) {
    return `${label} must be a full URL starting with https://`;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return `${label} must use http:// or https://`;
  }

  return "";
}

export function createProjectEditor({
  record,
  paragraphs: initialParagraphs = [],
  technologies = [],
  selectedTechnologyIds = [],
  onDirtyChange,
  onSaved,
  onBack
}) {
  const isNew = !record;

  const state = {
    id: record ? record.id : null,
    status: record ? record.status : "draft",
    publishedAt: record ? record.published_at : null,
    createdAt: record ? record.created_at : null,
    updatedAtValue: record ? record.updated_at : null,
    sortOrder: record ? record.sort_order : null
  };

  const root = el("div", "experience-editor project-editor");

  /* ---------------- header ---------------- */

  const back = el("button", "link-button", "← Back to Projects");
  back.type = "button";
  back.addEventListener("click", () => onBack());

  const header = el("div", "editor-header");
  const headingBlock = el("div", "editor-heading");

  const heading = el(
    "h2",
    "editor-title",
    isNew ? "New Project" : record.title || "Untitled project"
  );

  append(headingBlock, heading);

  const statusSlot = el("span", "editor-status");
  append(statusSlot, statusBadge(state.status));
  append(headingBlock, statusSlot);

  const actions = el("div", "editor-actions");

  const previewButton = el("button", "admin-button admin-button-secondary", "Preview");
  previewButton.type = "button";

  const saveButton = el(
    "button",
    "admin-button admin-button-secondary",
    isNew ? "Save Draft" : "Save Changes"
  );
  saveButton.type = "button";

  const publishButton = el("button", "admin-button admin-button-primary", "Publish");
  publishButton.type = "button";

  append(actions, previewButton, saveButton, publishButton);
  append(header, headingBlock, actions);
  append(root, back, header);

  /* ---------------- card info ---------------- */

  const fields = {
    title: textField({
      id: "project-title",
      label: "Project Title",
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : ""
    }),
    slug: textField({
      id: "project-slug",
      label: "Slug",
      required: true,
      maxLength: LIMITS.slug,
      value: record ? record.slug : "",
      help: "Lowercase letters, numbers and single hyphens. Used by the future public link project.html?slug=…"
    }),
    cardCategory: textField({
      id: "project-card-category",
      label: "Category",
      maxLength: LIMITS.cardCategory,
      value: record ? record.card_category : "",
      help: "Shown on the Portfolio card, for example: UI / UX, Web Development."
    }),
    shortDescription: textareaField({
      id: "project-short-description",
      label: "Short Description",
      maxLength: LIMITS.shortDescription,
      value: record ? record.short_description : "",
      rows: 3,
      help: "Plain text shown on the Portfolio card."
    }),
    detailTitleMain: textField({
      id: "project-detail-title-main",
      label: "Detail Title",
      maxLength: LIMITS.detailTitleMain,
      value: record ? record.detail_title_main : ""
    }),
    detailTitleHighlight: textField({
      id: "project-detail-title-highlight",
      label: "Highlighted Title",
      maxLength: LIMITS.detailTitleHighlight,
      value: record ? record.detail_title_highlight : ""
    }),
    detailIntro: textareaField({
      id: "project-detail-intro",
      label: "Introduction",
      value: record ? record.detail_intro : "",
      rows: 4,
      help: "Plain text only. No HTML or formatting markup."
    }),
    role: textField({
      id: "project-role",
      label: "Role",
      maxLength: LIMITS.role,
      value: record ? record.role : ""
    }),
    projectType: textField({
      id: "project-type",
      label: "Project Type",
      maxLength: LIMITS.projectType,
      value: record ? record.project_type : ""
    }),
    aboutHeading: textField({
      id: "project-about-heading",
      label: "About Heading",
      maxLength: LIMITS.aboutHeading,
      value: record ? record.about_heading : ""
    }),
    githubUrl: textField({
      id: "project-github-url",
      label: "Repository URL",
      value: record ? record.github_url : "",
      help: "Optional. Must start with https:// or http://"
    }),
    demoUrl: textField({
      id: "project-demo-url",
      label: "Live Demo URL",
      value: record ? record.demo_url : "",
      help: "Optional. Must start with https:// or http://"
    })
  };

  // project_date is a real `date` column, so a native date input maps to it 1:1.
  const dateField = el("div", "form-field");
  const dateLabel = el("label", "form-label", "Project Date");
  const dateInput = el("input", "admin-input");
  dateInput.type = "date";
  dateInput.id = "project-date";
  dateLabel.htmlFor = dateInput.id;
  dateInput.value = record && record.project_date ? record.project_date : "";
  const dateHelp = el("p", "form-help", "Stored as a date; the public page derives the year from it.");
  dateHelp.id = "project-date-help";
  dateInput.setAttribute("aria-describedby", dateHelp.id);
  append(dateField, dateLabel, dateInput, dateHelp);

  const featured = checkboxField({
    id: "project-featured",
    label: "Featured Project",
    checked: record ? record.featured === true : false,
    help: "Metadata only. It does not change the public card size, colour or layout in V1."
  });

  const cardSection = el("section", "admin-subsection");
  append(cardSection, el("h3", "subsection-title", "Card Info"));
  const cardGrid = el("div", "form-grid");
  append(cardGrid, fields.title.node, fields.slug.node, fields.cardCategory.node);
  append(cardSection, cardGrid, fields.shortDescription.node);

  const detailSection = el("section", "admin-subsection");
  append(detailSection, el("h3", "subsection-title", "Detail Header"));
  const detailGrid = el("div", "form-grid");
  append(
    detailGrid,
    fields.detailTitleMain.node,
    fields.detailTitleHighlight.node,
    fields.role.node,
    dateField,
    fields.projectType.node,
    fields.aboutHeading.node
  );
  append(detailSection, detailGrid, fields.detailIntro.node);

  const paragraphsEditor = createParagraphsEditor({
    initialParagraphs,
    onChange: markDirty
  });

  const technologySelector = createTechnologySelector({
    technologies,
    initialSelectedIds: selectedTechnologyIds,
    onChange: markDirty
  });

  const linksSection = el("section", "admin-subsection");
  append(linksSection, el("h3", "subsection-title", "Links"));
  const linksGrid = el("div", "form-grid");
  append(linksGrid, fields.githubUrl.node, fields.demoUrl.node);
  append(linksSection, linksGrid);

  const settingsSection = el("section", "admin-subsection");
  append(settingsSection, el("h3", "subsection-title", "Settings"));
  append(settingsSection, featured.node);

  const mediaNotice = el("div", "deferred-panel");
  append(
    mediaNotice,
    el("p", "deferred-title", "Project media"),
    el(
      "p",
      "form-help",
      "Project media will be configured in the next implementation phase. Cover and documentation images are not editable yet."
    )
  );
  append(settingsSection, mediaNotice);

  const settingsList = el("dl", "settings-list");
  append(settingsSection, settingsList);

  append(
    root,
    cardSection,
    detailSection,
    paragraphsEditor.element,
    technologySelector.element,
    linksSection,
    settingsSection
  );

  renderSettings();
  syncSlugLock();
  syncPublishButton();

  function renderSettings() {
    clear(settingsList);

    function row(term, valueNode) {
      const wrap = el("div", "settings-row");
      append(wrap, el("dt", "settings-term", term));
      const dd = el("dd", "settings-value");
      append(dd, valueNode);
      append(wrap, dd);
      append(settingsList, wrap);
    }

    row("Status", statusBadge(state.status));
    row(
      "Order",
      el(
        "span",
        null,
        state.sortOrder === null || state.sortOrder === undefined
          ? "Assigned on first save"
          : String(state.sortOrder)
      )
    );
    row("Created", state.createdAt ? updatedAt(state.createdAt) : el("span", null, "—"));
    row(
      "Last updated",
      state.updatedAtValue ? updatedAt(state.updatedAtValue) : el("span", null, "—")
    );
    row(
      "Published",
      state.publishedAt ? updatedAt(state.publishedAt) : el("span", null, "Not published yet")
    );
  }

  /* ---------------- slug behaviour ---------------- */

  let slugTouched = !isNew;

  fields.title.control.addEventListener("input", () => {
    if (isNew && !slugTouched) {
      fields.slug.value = slugify(fields.title.value);
    }
  });

  fields.slug.control.addEventListener("input", () => {
    slugTouched = true;
  });

  function slugLocked() {
    return Boolean(state.publishedAt);
  }

  function syncSlugLock() {
    if (!slugLocked()) {
      return;
    }

    fields.slug.control.readOnly = true;
    fields.slug.control.setAttribute("aria-readonly", "true");
    fields.slug.node.classList.add("is-locked");

    const existingNote = fields.slug.node.querySelector(".slug-lock-note");

    if (!existingNote) {
      const note = el(
        "p",
        "form-help slug-lock-note",
        "Locked: this project has been published, so its public link must stay stable."
      );
      append(fields.slug.node, note);
    }
  }

  /* ---------------- dirty tracking ---------------- */

  function formSnapshot() {
    return JSON.stringify({
      title: trimmed(fields.title.value),
      slug: trimmed(fields.slug.value),
      cardCategory: trimmed(fields.cardCategory.value),
      shortDescription: trimmed(fields.shortDescription.value),
      detailTitleMain: trimmed(fields.detailTitleMain.value),
      detailTitleHighlight: trimmed(fields.detailTitleHighlight.value),
      detailIntro: trimmed(fields.detailIntro.value),
      role: trimmed(fields.role.value),
      projectDate: dateInput.value,
      projectType: trimmed(fields.projectType.value),
      aboutHeading: trimmed(fields.aboutHeading.value),
      githubUrl: trimmed(fields.githubUrl.value),
      demoUrl: trimmed(fields.demoUrl.value),
      featured: featured.value
    });
  }

  let baselineForm = formSnapshot();
  let baselineParagraphs = paragraphsEditor.snapshot();
  let baselineTechnologies = technologySelector.snapshot();
  let dirty = false;
  let busy = false;

  function computeDirty() {
    return (
      formSnapshot() !== baselineForm ||
      paragraphsEditor.snapshot() !== baselineParagraphs ||
      technologySelector.snapshot() !== baselineTechnologies
    );
  }

  function markDirty() {
    const next = computeDirty();

    if (next !== dirty) {
      dirty = next;
      onDirtyChange(dirty);
    }
  }

  Object.values(fields).forEach(field =>
    field.control.addEventListener("input", markDirty)
  );
  dateInput.addEventListener("input", markDirty);
  featured.control.addEventListener("change", markDirty);

  function resetBaseline() {
    baselineForm = formSnapshot();
    baselineParagraphs = paragraphsEditor.snapshot();
    baselineTechnologies = technologySelector.snapshot();
    dirty = false;
    onDirtyChange(false);
  }

  /* ---------------- validation ---------------- */

  function validate({ forPublish }) {
    const rules = {
      title: { label: "Project Title", required: true, maxLength: LIMITS.title },
      slug: { label: "Slug", required: true, maxLength: LIMITS.slug },
      cardCategory: { label: "Category", maxLength: LIMITS.cardCategory },
      shortDescription: {
        label: "Short Description",
        maxLength: LIMITS.shortDescription
      },
      detailTitleMain: {
        label: "Detail Title",
        maxLength: LIMITS.detailTitleMain
      },
      detailTitleHighlight: {
        label: "Highlighted Title",
        maxLength: LIMITS.detailTitleHighlight
      },
      role: { label: "Role", maxLength: LIMITS.role },
      projectType: { label: "Project Type", maxLength: LIMITS.projectType },
      aboutHeading: { label: "About Heading", maxLength: LIMITS.aboutHeading }
    };

    if (forPublish) {
      /*
        Publish requirements come from the design baseline's Project publish
        checklist (ADMIN-DASHBOARD-DESIGN.md section 34), minus the cover image
        and cover alt text, which belong to Phase 8B and are enforced there.
      */
      rules.cardCategory.required = true;
      rules.shortDescription.required = true;
      rules.detailIntro = { label: "Introduction", required: true };
      rules.role.required = true;
      rules.projectType.required = true;
      rules.aboutHeading.required = true;
    }

    let ok = applyValidation(fields, rules);

    // Slug pattern mirrors projects_slug_check.
    if (ok) {
      const slug = trimmed(fields.slug.value).toLowerCase();

      if (!SLUG_PATTERN.test(slug)) {
        fields.slug.setError(
          "Use lowercase letters, numbers and single hyphens, for example: football-club."
        );
        fields.slug.focus();
        ok = false;
      }
    }

    if (ok) {
      const githubError = validateUrl(fields.githubUrl.value, "Repository URL");
      const demoError = validateUrl(fields.demoUrl.value, "Live Demo URL");

      fields.githubUrl.setError(githubError);
      fields.demoUrl.setError(demoError);

      if (githubError) {
        fields.githubUrl.focus();
        ok = false;
      } else if (demoError) {
        fields.demoUrl.focus();
        ok = false;
      }
    }

    if (ok && forPublish && !dateInput.value) {
      toast("Add a project date before publishing.", "error");
      dateInput.focus();
      ok = false;
    }

    if (ok && forPublish && paragraphsEditor.count() === 0) {
      toast("Add at least one About paragraph before publishing.", "error");
      ok = false;
    }

    if (!ok) {
      toast("Please correct the highlighted fields.", "error");
    }

    return ok;
  }

  /* ---------------- persistence ---------------- */

  function currentValues() {
    return {
      title: trimmedOrNull(fields.title.value),
      slug: trimmed(fields.slug.value).toLowerCase(),
      card_category: trimmedOrNull(fields.cardCategory.value),
      short_description: trimmedOrNull(fields.shortDescription.value),
      detail_title_main: trimmedOrNull(fields.detailTitleMain.value),
      detail_title_highlight: trimmedOrNull(fields.detailTitleHighlight.value),
      detail_intro: trimmedOrNull(fields.detailIntro.value),
      role: trimmedOrNull(fields.role.value),
      project_date: dateInput.value || null,
      project_type: trimmedOrNull(fields.projectType.value),
      about_heading: trimmedOrNull(fields.aboutHeading.value),
      github_url: trimmedOrNull(fields.githubUrl.value),
      demo_url: trimmedOrNull(fields.demoUrl.value),
      featured: featured.value
    };
  }

  function setBusy(next, label) {
    busy = next;
    saveButton.disabled = next;
    previewButton.disabled = next;
    back.disabled = next;
    publishButton.disabled = next || state.status === "published";

    saveButton.textContent = label || (state.id ? "Save Changes" : "Save Draft");
  }

  function syncPublishButton() {
    if (state.status === "published") {
      publishButton.textContent = "Published";
      publishButton.disabled = true;
      publishButton.title = "This project is already published.";
      return;
    }

    publishButton.textContent = "Publish";
    publishButton.disabled = false;
    publishButton.removeAttribute("title");
  }

  async function nextSortOrder() {
    const { data, error } = await supabaseClient
      .from("projects")
      .select("sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      return 0;
    }

    // max(sort_order) + 1: correct even when the sequence has gaps.
    return (Number(data[0].sort_order) || 0) + 1;
  }

  let loadedParagraphs = initialParagraphs.map(row => ({
    id: row.id,
    content: row.content,
    sort_order: Number(row.sort_order) || 0
  }));

  let loadedTechnologyIds = selectedTechnologyIds.slice();
  let loadedTechnologyOrder = new Map(
    selectedTechnologyIds.map((id, index) => [id, index])
  );

  async function persistParagraphs(projectId) {
    const current = paragraphsEditor.getParagraphs();
    const currentIds = new Set(current.filter(row => row.id).map(row => row.id));

    const toDelete = loadedParagraphs
      .filter(row => !currentIds.has(row.id))
      .map(row => row.id);

    const toInsert = current
      .filter(row => !row.id)
      .map(row => ({
        project_id: projectId,
        content: row.content,
        sort_order: row.sort_order
      }));

    const toUpdate = current.filter(row => {
      if (!row.id) {
        return false;
      }

      const previous = loadedParagraphs.find(entry => entry.id === row.id);

      return (
        previous &&
        (previous.content !== row.content || previous.sort_order !== row.sort_order)
      );
    });

    if (toDelete.length > 0) {
      const { error } = await supabaseClient
        .from("project_paragraphs")
        .delete()
        .in("id", toDelete);

      if (error) {
        throw error;
      }
    }

    for (const row of toUpdate) {
      const { data, error } = await supabaseClient
        .from("project_paragraphs")
        .update({ content: row.content, sort_order: row.sort_order })
        .eq("id", row.id)
        .select("id");

      if (error || !data || data.length === 0) {
        throw error || new Error("project_paragraphs update did not apply");
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabaseClient
        .from("project_paragraphs")
        .insert(toInsert);

      if (error) {
        throw error;
      }
    }

    const { data, error } = await supabaseClient
      .from("project_paragraphs")
      .select("id, content, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    loadedParagraphs = (data || []).map(row => ({
      id: row.id,
      content: row.content,
      sort_order: Number(row.sort_order) || 0
    }));

    paragraphsEditor.setSavedParagraphs(loadedParagraphs);
  }

  /*
    Relationship diff: only the rows that actually changed are touched. A blind
    delete-all + reinsert would churn created_at and briefly leave the project
    with no technologies at all.
  */
  async function persistTechnologies(projectId) {
    const current = technologySelector.getSelectedIds();
    const currentSet = new Set(current);
    const loadedSet = new Set(loadedTechnologyIds);

    const toRemove = loadedTechnologyIds.filter(id => !currentSet.has(id));
    const toAdd = current.filter(id => !loadedSet.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabaseClient
        .from("project_technologies")
        .delete()
        .eq("project_id", projectId)
        .in("technology_id", toRemove);

      if (error) {
        throw error;
      }
    }

    if (toAdd.length > 0) {
      const { error } = await supabaseClient.from("project_technologies").insert(
        toAdd.map(id => ({
          project_id: projectId,
          technology_id: id,
          sort_order: current.indexOf(id)
        }))
      );

      if (error) {
        throw error;
      }
    }

    /*
      Rows that stayed keep their old sort_order, which can collide with the
      positions just assigned to new rows. project_technologies.sort_order is
      not unique, so realign the survivors to their current position — chip
      order on the public card has to be deterministic
      (ADMIN-CMS-DATABASE.md section 35).
    */
    const survivors = current.filter(id => loadedSet.has(id));

    for (const id of survivors) {
      const position = current.indexOf(id);
      const previous = loadedTechnologyOrder.get(id);

      if (previous === position) {
        continue;
      }

      const { error } = await supabaseClient
        .from("project_technologies")
        .update({ sort_order: position })
        .eq("project_id", projectId)
        .eq("technology_id", id);

      if (error) {
        throw error;
      }
    }

    const { data, error } = await supabaseClient
      .from("project_technologies")
      .select("technology_id, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw error;
    }

    loadedTechnologyIds = (data || []).map(row => row.technology_id);
    loadedTechnologyOrder = new Map(
      (data || []).map((row, index) => [
        row.technology_id,
        Number(row.sort_order) || index
      ])
    );

    technologySelector.setSavedIds(loadedTechnologyIds);
  }

  async function save({ forPublish = false } = {}) {
    if (busy) {
      return false;
    }

    if (!validate({ forPublish })) {
      return false;
    }

    setBusy(true, forPublish ? "Publishing..." : "Saving...");

    const payload = currentValues();

    // A locked slug is never resubmitted, so a published public link cannot
    // change through this form even if the input were tampered with.
    if (slugLocked()) {
      delete payload.slug;
    }

    try {
      if (!state.id) {
        payload.status = "draft";
        payload.sort_order = await nextSortOrder();

        const { data, error } = await supabaseClient
          .from("projects")
          .insert(payload)
          .select(
            "id, status, sort_order, created_at, updated_at, published_at, slug"
          );

        if (error || !data || data.length === 0) {
          throw error || new Error("projects insert did not apply");
        }

        applyServerState(data[0]);
      } else {
        // status, sort_order, created_at and published_at are absent on purpose.
        const { data, error } = await supabaseClient
          .from("projects")
          .update(payload)
          .eq("id", state.id)
          .select(
            "id, status, sort_order, created_at, updated_at, published_at, slug"
          );

        if (error || !data || data.length === 0) {
          throw error || new Error("projects update did not apply");
        }

        applyServerState(data[0]);
      }
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast(friendlyError(error), "error");
      return false;
    }

    /*
      Child writes happen after the parent row exists. If one of them fails the
      project row is already saved, so the message says exactly that instead of
      pretending the whole save failed or silently leaving a mismatch.
    */
    try {
      await persistParagraphs(state.id);
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast(
        "Project saved, but its paragraphs could not be updated. Please retry.",
        "error"
      );
      resetBaselineFormOnly();
      return false;
    }

    try {
      await persistTechnologies(state.id);
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast(
        "Project saved, but its technologies could not be updated. Please retry.",
        "error"
      );
      resetBaselineFormOnly();
      return false;
    }

    setBusy(false);
    heading.textContent = trimmed(fields.title.value) || "Untitled project";
    refreshStatusUi();
    resetBaseline();

    if (!forPublish) {
      toast(firstSaveMessage());
    }

    if (typeof onSaved === "function") {
      onSaved({ id: state.id, status: state.status });
    }

    return true;
  }

  function applyServerState(row) {
    state.id = row.id;
    state.status = row.status;
    state.sortOrder = row.sort_order;
    state.createdAt = row.created_at;
    state.updatedAtValue = row.updated_at;
    state.publishedAt = row.published_at;

    if (row.slug) {
      fields.slug.value = row.slug;
    }
  }

  function resetBaselineFormOnly() {
    baselineForm = formSnapshot();
    refreshStatusUi();
  }

  let firstSaveDone = !isNew;

  function firstSaveMessage() {
    if (!firstSaveDone) {
      firstSaveDone = true;
      return "Draft saved.";
    }

    return "Changes saved successfully.";
  }

  async function publish() {
    if (busy || state.status === "published") {
      return;
    }

    const saved = await save({ forPublish: true });

    if (!saved) {
      return;
    }

    setBusy(true, "Publishing...");

    const patch = { status: "published" };

    // published_at records the FIRST publish and is never overwritten later
    // (ADMIN-CMS-DATABASE.md section 87).
    if (!state.publishedAt) {
      patch.published_at = new Date().toISOString();
    }

    const { data, error } = await supabaseClient
      .from("projects")
      .update(patch)
      .eq("id", state.id)
      .select("status, published_at, updated_at");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast("Could not publish this project. It is still saved as a draft.", "error");
      return;
    }

    state.status = data[0].status;
    state.publishedAt = data[0].published_at;
    state.updatedAtValue = data[0].updated_at;

    refreshStatusUi();
    syncSlugLock();
    toast("Project published.");

    if (typeof onSaved === "function") {
      onSaved({ id: state.id, status: state.status });
    }
  }

  function refreshStatusUi() {
    clear(statusSlot);
    append(statusSlot, statusBadge(state.status));
    syncPublishButton();
    renderSettings();
    saveButton.textContent = state.id ? "Save Changes" : "Save Draft";
  }

  function friendlyError(error) {
    const haystack = `${error && error.code} ${error && error.message} ${error &&
      error.details}`.toLowerCase();

    if (haystack.includes("projects_slug_key") || haystack.includes("duplicate key")) {
      return "Another project already uses this slug. Choose a different one.";
    }

    if (haystack.includes("projects_slug_check")) {
      return "Slug format is not valid. Use lowercase letters, numbers and hyphens.";
    }

    if (haystack.includes("projects_status_check")) {
      return "That status is not allowed.";
    }

    if (haystack.includes("row-level security") || haystack.includes("42501")) {
      return "Your session is not authorized for this change. Sign in again and retry.";
    }

    return "Could not save this project. Your changes are still here.";
  }

  saveButton.addEventListener("click", () => save());
  publishButton.addEventListener("click", publish);

  previewButton.addEventListener("click", () => {
    // Preview never mutates or clears dirty state.
    openProjectPreview({
      title: trimmed(fields.title.value),
      slug: trimmed(fields.slug.value),
      cardCategory: trimmed(fields.cardCategory.value),
      shortDescription: trimmed(fields.shortDescription.value),
      detailTitleMain: trimmed(fields.detailTitleMain.value),
      detailTitleHighlight: trimmed(fields.detailTitleHighlight.value),
      detailIntro: trimmed(fields.detailIntro.value),
      role: trimmed(fields.role.value),
      projectDate: dateInput.value,
      projectType: trimmed(fields.projectType.value),
      aboutHeading: trimmed(fields.aboutHeading.value),
      githubUrl: trimmed(fields.githubUrl.value),
      demoUrl: trimmed(fields.demoUrl.value),
      featured: featured.value,
      status: state.status,
      paragraphs: paragraphsEditor.getParagraphs(),
      technologies: technologySelector.getSelectedNames()
    });
  });

  return {
    element: root,
    isDirty: computeDirty,
    getId: () => state.id,
    destroy() {
      clear(root);
    }
  };
}
