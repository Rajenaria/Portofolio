/*
  Project editor (Phase 8A core, Phase 8B media).

  The form is grouped the way the owner thinks about a project:

      BASIC INFORMATION   title, slug, category, short description, featured
      PROJECT DETAILS     detail headings, role, type, date, intro, links
      ABOUT PARAGRAPHS    the ordered body text of the detail page
      MEDIA               cover image and alt text
      DOCUMENTATION       the ordered gallery
      TECHNOLOGIES        the chip selector
      VISIBILITY          status and the record's own timeline

  The paragraph, gallery and technology editors stay their own components, so
  they follow their group rather than nesting inside it — one frame each, never
  a panel inside a panel.

  Full-page editor inside the Admin shell. It writes only columns that exist in
  public.projects, plus the staged paragraph list, technology relationships,
  the cover columns and the project_media rows.

  MEDIA (Phase 8B)
  ----------------
  Every image change is staged in memory and only touches Storage on Save or
  Publish. A Draft writes into the private portfolio-staging bucket; publishing
  promotes those objects into the public portfolio-media bucket and then clears
  the staged copies. See persistMedia() and promoteStagedMedia() below.

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
import { t } from "../../core/i18n.js";

import {
  textField,
  textareaField,
  checkboxField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import {
  MEDIA_BUCKET,
  STAGING_BUCKET,
  uploadVariantPair,
  removeObjects,
  promoteVariantPair,
  resolveMediaUrl,
  newMediaId
} from "../../core/media-storage.js";

import { createParagraphsEditor } from "./paragraphs-editor.js";
import { createTechnologySelector } from "./technology-selector.js";
import { createProjectMediaField } from "./media-field.js";
import { createDocumentationManager } from "./media-manager.js";
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
  aboutHeading: 220,
  coverAlt: 250
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
    return t("projEditor.errUrlHttps", { label });
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return t("projEditor.errUrlScheme", { label });
  }

  return "";
}

export function createProjectEditor({
  record,
  paragraphs: initialParagraphs = [],
  media: initialMedia = [],
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

  const back = el("button", "link-button", t("projEditor.back"));
  back.type = "button";
  back.addEventListener("click", () => onBack());

  const header = el("div", "editor-header");
  const headingBlock = el("div", "editor-heading");

  const heading = el(
    "h2",
    "editor-title",
    isNew ? t("projEditor.newTitle") : record.title || t("proj.untitled")
  );

  append(headingBlock, heading);

  const statusSlot = el("span", "editor-status");
  append(statusSlot, statusBadge(state.status));
  append(headingBlock, statusSlot);

  const actions = el("div", "editor-actions");

  const previewButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("common.preview")
  );
  previewButton.type = "button";

  const saveButton = el(
    "button",
    "admin-button admin-button-secondary",
    t(isNew ? "common.saveDraft" : "common.saveChanges")
  );
  saveButton.type = "button";

  const publishButton = el(
    "button",
    "admin-button admin-button-primary",
    t("common.publish")
  );
  publishButton.type = "button";

  append(actions, previewButton, saveButton, publishButton);
  append(header, headingBlock, actions);
  append(root, back, header);

  /* ---------------- card info ---------------- */

  const fields = {
    title: textField({
      id: "project-title",
      label: t("projEditor.fieldTitle"),
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : ""
    }),
    slug: textField({
      id: "project-slug",
      label: t("projEditor.fieldSlug"),
      required: true,
      maxLength: LIMITS.slug,
      value: record ? record.slug : "",
      help: t("projEditor.fieldSlugHelp")
    }),
    cardCategory: textField({
      id: "project-card-category",
      label: t("projEditor.fieldCategory"),
      maxLength: LIMITS.cardCategory,
      value: record ? record.card_category : "",
      help: t("projEditor.fieldCategoryHelp")
    }),
    shortDescription: textareaField({
      id: "project-short-description",
      label: t("projEditor.fieldShort"),
      maxLength: LIMITS.shortDescription,
      value: record ? record.short_description : "",
      rows: 3,
      help: t("projEditor.fieldShortHelp")
    }),
    detailTitleMain: textField({
      id: "project-detail-title-main",
      label: t("projEditor.fieldDetailTitle"),
      maxLength: LIMITS.detailTitleMain,
      value: record ? record.detail_title_main : ""
    }),
    detailTitleHighlight: textField({
      id: "project-detail-title-highlight",
      label: t("projEditor.fieldDetailHighlight"),
      maxLength: LIMITS.detailTitleHighlight,
      value: record ? record.detail_title_highlight : ""
    }),
    detailIntro: textareaField({
      id: "project-detail-intro",
      label: t("projEditor.fieldIntro"),
      value: record ? record.detail_intro : "",
      rows: 4,
      help: t("projEditor.fieldIntroHelp")
    }),
    role: textField({
      id: "project-role",
      label: t("common.role"),
      maxLength: LIMITS.role,
      value: record ? record.role : "",
      help: t("projEditor.fieldRoleHelp")
    }),
    projectType: textField({
      id: "project-type",
      label: t("projEditor.fieldType"),
      maxLength: LIMITS.projectType,
      value: record ? record.project_type : "",
      help: t("projEditor.fieldRoleHelp")
    }),
    aboutHeading: textField({
      id: "project-about-heading",
      label: t("projEditor.fieldAbout"),
      maxLength: LIMITS.aboutHeading,
      value: record ? record.about_heading : "",
      help: t("projEditor.fieldRoleHelp")
    }),
    githubUrl: textField({
      id: "project-github-url",
      label: t("projEditor.fieldRepo"),
      value: record ? record.github_url : "",
      help: t("projEditor.fieldUrlHelp")
    }),
    demoUrl: textField({
      id: "project-demo-url",
      label: t("projEditor.fieldDemo"),
      value: record ? record.demo_url : "",
      help: t("projEditor.fieldUrlHelp")
    }),
    coverAlt: textField({
      id: "project-cover-alt",
      label: t("projEditor.fieldCoverAlt"),
      maxLength: LIMITS.coverAlt,
      value: record ? record.cover_alt : "",
      help: t("projEditor.fieldCoverAltHelp")
    })
  };

  /* ---------------- cover ---------------- */

  const coverField = createProjectMediaField({
    title: t("projEditor.cover"),
    emptyText: t("projEditor.coverEmpty"),
    current:
      record && record.cover_desktop_path
        ? {
            bucket: record.cover_bucket || MEDIA_BUCKET,
            desktopPath: record.cover_desktop_path,
            mobilePath: record.cover_mobile_path
          }
        : null,
    onChange: markDirty
  });

  /* One shape for every group, matching the Certificates and Experience
     editors so all three forms read as the same product. */
  function group(titleKey, helpKey) {
    const node = el("section", "admin-subsection");

    append(node, el("h3", "subsection-title", t(titleKey)));

    if (helpKey) {
      append(node, el("p", "form-help", t(helpKey)));
    }

    return node;
  }

  const coverSection = group("projEditor.media", "projEditor.mediaHelp");
  append(
    coverSection,
    el("p", "form-help", t("projEditor.coverHelp")),
    coverField.element,
    fields.coverAlt.node
  );

  /* ---------------- documentation ---------------- */

  const documentationManager = createDocumentationManager({
    initialMedia,
    onChange: markDirty
  });

  // project_date is a real `date` column, so a native date input maps to it 1:1.
  const dateField = el("div", "form-field");
  const dateLabel = el("label", "form-label", t("projEditor.fieldDate"));
  const dateInput = el("input", "admin-input");
  dateInput.type = "date";
  dateInput.id = "project-date";
  dateLabel.htmlFor = dateInput.id;
  dateInput.value = record && record.project_date ? record.project_date : "";
  const dateHelp = el("p", "form-help", t("projEditor.fieldDateHelp"));
  dateHelp.id = "project-date-help";
  dateInput.setAttribute("aria-describedby", dateHelp.id);
  append(dateField, dateLabel, dateInput, dateHelp);

  const featured = checkboxField({
    id: "project-featured",
    label: t("projEditor.featured"),
    checked: record ? record.featured === true : false,
    help: t("projEditor.featuredHelp")
  });

  const cardSection = group("projEditor.basic", "projEditor.basicHelp");
  const cardGrid = el("div", "form-grid");
  append(cardGrid, fields.title.node, fields.slug.node, fields.cardCategory.node);
  append(cardSection, cardGrid, fields.shortDescription.node, featured.node);

  const detailSection = group("projEditor.details", "projEditor.detailsHelp");
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

  /* Repository and demo links belong to the detail page, so they close the
     PROJECT DETAILS group rather than forming a section of their own. */
  const linksGrid = el("div", "form-grid");
  append(linksGrid, fields.githubUrl.node, fields.demoUrl.node);
  append(detailSection, el("h4", "form-subheading", t("projEditor.links")), linksGrid);

  const settingsSection = group("projEditor.visibility", "projEditor.visibilityHelp");

  const settingsList = el("dl", "settings-list");
  append(settingsSection, settingsList);

  /*
    Basic -> details -> the body text that belongs to them -> media -> the
    gallery that belongs to it -> technologies -> visibility. Each component
    follows the group it extends.
  */
  append(
    root,
    cardSection,
    detailSection,
    paragraphsEditor.element,
    coverSection,
    documentationManager.element,
    technologySelector.element,
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

    row(t("common.status"), statusBadge(state.status));
    row(
      t("common.order"),
      el(
        "span",
        null,
        state.sortOrder === null || state.sortOrder === undefined
          ? t("common.assignedOnFirstSave")
          : String(state.sortOrder)
      )
    );
    row(
      t("common.created"),
      state.createdAt ? updatedAt(state.createdAt) : el("span", null, t("common.none"))
    );
    row(
      t("common.lastUpdated"),
      state.updatedAtValue
        ? updatedAt(state.updatedAtValue)
        : el("span", null, t("common.none"))
    );
    row(
      t("common.publishedOn"),
      state.publishedAt
        ? updatedAt(state.publishedAt)
        : el("span", null, t("common.notPublishedYet"))
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
        t("projEditor.fieldSlugLocked")
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
      coverAlt: trimmed(fields.coverAlt.value),
      featured: featured.value
    });
  }

  let baselineForm = formSnapshot();
  let baselineParagraphs = paragraphsEditor.snapshot();
  let baselineTechnologies = technologySelector.snapshot();
  let baselineMedia = documentationManager.snapshot();
  let dirty = false;
  let busy = false;

  /*
    Dirty state covers every staged change: text, paragraphs, technologies,
    a pending cover replacement, and any documentation add / replace / alt edit
    / enable-disable / reorder / removal.
  */
  function computeDirty() {
    return (
      formSnapshot() !== baselineForm ||
      paragraphsEditor.snapshot() !== baselineParagraphs ||
      technologySelector.snapshot() !== baselineTechnologies ||
      documentationManager.snapshot() !== baselineMedia ||
      coverField.hasPending()
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
    baselineMedia = documentationManager.snapshot();
    dirty = false;
    onDirtyChange(false);
  }

  /* ---------------- validation ---------------- */

  function validate({ forPublish }) {
    const rules = {
      title: {
        label: t("projEditor.fieldTitle"),
        required: true,
        maxLength: LIMITS.title
      },
      slug: { label: t("projEditor.fieldSlug"), required: true, maxLength: LIMITS.slug },
      cardCategory: {
        label: t("projEditor.fieldCategory"),
        maxLength: LIMITS.cardCategory
      },
      shortDescription: {
        label: t("projEditor.fieldShort"),
        maxLength: LIMITS.shortDescription
      },
      detailTitleMain: {
        label: t("projEditor.fieldDetailTitle"),
        maxLength: LIMITS.detailTitleMain
      },
      detailTitleHighlight: {
        label: t("projEditor.fieldDetailHighlight"),
        maxLength: LIMITS.detailTitleHighlight
      },
      role: { label: t("common.role"), maxLength: LIMITS.role },
      projectType: { label: t("projEditor.fieldType"), maxLength: LIMITS.projectType },
      aboutHeading: {
        label: t("projEditor.fieldAbout"),
        maxLength: LIMITS.aboutHeading
      },
      coverAlt: { label: t("projEditor.fieldCoverAlt"), maxLength: LIMITS.coverAlt }
    };

    if (forPublish) {
      /*
        Publish requirements come from the design baseline's Project publish
        checklist (ADMIN-DASHBOARD-DESIGN.md section 34), minus the cover image
        and cover alt text, which belong to Phase 8B and are enforced there.
      */
      rules.cardCategory.required = true;
      rules.shortDescription.required = true;
      rules.detailIntro = { label: t("projEditor.fieldIntro"), required: true };
      rules.role.required = true;
      rules.projectType.required = true;
      rules.aboutHeading.required = true;
    }

    let ok = applyValidation(fields, rules);

    // Slug pattern mirrors projects_slug_check.
    if (ok) {
      const slug = trimmed(fields.slug.value).toLowerCase();

      if (!SLUG_PATTERN.test(slug)) {
        fields.slug.setError(t("projEditor.fieldSlugFormat"));
        fields.slug.focus();
        ok = false;
      }
    }

    if (ok) {
      const githubError = validateUrl(
        fields.githubUrl.value,
        t("projEditor.fieldRepo")
      );
      const demoError = validateUrl(fields.demoUrl.value, t("projEditor.fieldDemo"));

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
      toast(t("projEditor.errNeedDate"), "error");
      dateInput.focus();
      ok = false;
    }

    if (ok && forPublish && paragraphsEditor.count() === 0) {
      toast(t("projEditor.errNeedParagraph"), "error");
      ok = false;
    }

    /*
      The design baseline requires a cover before publish, because the public
      Portfolio card is built around it. Cover ALT text stays optional: the
      column is nullable and a decorative cover legitimately has empty alt.
    */
    if (ok && forPublish && !coverField.hasPending() && !coverField.getStored()) {
      toast(t("projEditor.errNeedCover"), "error");
      ok = false;
    }

    if (!ok) {
      toast(t("projEditor.errFields"), "error");
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
      cover_alt: trimmedOrNull(fields.coverAlt.value),
      featured: featured.value
    };
  }

  /*
    Draft media lives in the private portfolio-staging bucket; media for an
    already published Project is written straight to the public bucket so a
    saved change is live immediately and no broken-image window exists
    (ADMIN-CMS-SECURITY.md sections 51-53, brief sections 12-13 and 17).
  */
  function targetBucket() {
    return state.status === "published" ? MEDIA_BUCKET : STAGING_BUCKET;
  }

  function setBusy(next, label) {
    busy = next;
    saveButton.disabled = next;
    previewButton.disabled = next;
    back.disabled = next;
    publishButton.disabled = next || state.status === "published";

    saveButton.textContent =
      label || t(state.id ? "common.saveChanges" : "common.saveDraft");
  }

  function syncPublishButton() {
    if (state.status === "published") {
      publishButton.textContent = t("status.published");
      publishButton.disabled = true;
      publishButton.title = t("projEditor.alreadyPublished");
      return;
    }

    publishButton.textContent = t("common.publish");
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

  /* ---------------- media persistence ---------------- */

  let loadedMedia = initialMedia.slice();

  async function reloadMedia(projectId) {
    const { data, error } = await supabaseClient
      .from("project_media")
      .select("id, bucket_name, desktop_path, mobile_path, alt_text, sort_order, is_active")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    loadedMedia = data || [];
    documentationManager.setSavedMedia(loadedMedia);
  }

  /*
    Applies every staged media change. Ordering per operation is always:
    upload new -> verify -> write database -> only then delete the old object.
    A failure before the database write removes whatever was just uploaded, so
    the previously referenced media always stays valid.
  */
  async function persistMedia(projectId) {
    const bucket = targetBucket();
    const warnings = [];

    // ---- cover ----
    const coverFiles = coverField.getPendingFiles();

    if (coverFiles) {
      const previous = coverField.getStored();
      let uploaded = null;

      try {
        uploaded = await uploadVariantPair({
          bucket,
          directory: `projects/${projectId}/cover`,
          desktopFile: coverFiles.desktopFile,
          mobileFile: coverFiles.mobileFile
        });
      } catch (error) {
        throw error;
      }

      const { data, error } = await supabaseClient
        .from("projects")
        .update({
          cover_bucket: uploaded.bucket,
          cover_desktop_path: uploaded.desktopPath,
          cover_mobile_path: uploaded.mobilePath
        })
        .eq("id", projectId)
        .select("id");

      if (error || !data || data.length === 0) {
        await removeObjects(uploaded.bucket, [
          uploaded.desktopPath,
          uploaded.mobilePath
        ]);

        throw error || new Error("cover update did not apply");
      }

      coverField.commit({
        bucket: uploaded.bucket,
        desktopPath: uploaded.desktopPath,
        mobilePath: uploaded.mobilePath
      });

      if (previous && previous.desktopPath) {
        const cleanup = await removeObjects(previous.bucket, [
          previous.desktopPath,
          previous.mobilePath
        ]);

        if (cleanup.failed.length > 0) {
          warnings.push("previous cover files could not be removed");
        }
      }
    }

    // ---- documentation removals (database first, then objects) ----
    for (const entry of documentationManager.getRemoved()) {
      const { data, error } = await supabaseClient
        .from("project_media")
        .delete()
        .eq("id", entry.id)
        .select("id");

      if (error || !data || data.length === 0) {
        throw error || new Error("project_media delete did not apply");
      }

      const cleanup = await removeObjects(entry.bucket, [
        entry.desktopPath,
        entry.mobilePath
      ]);

      if (cleanup.failed.length > 0) {
        warnings.push(`orphan files left for a removed image (${entry.desktopPath})`);
      }
    }

    // ---- documentation adds / replacements / metadata ----
    for (const item of documentationManager.getItems()) {
      const files = item.pendingFiles;

      if (!item.id) {
        const uploaded = await uploadVariantPair({
          bucket,
          directory: `projects/${projectId}/documentation/${newMediaId()}`,
          desktopFile: files.desktopFile,
          mobileFile: files.mobileFile
        });

        const { data, error } = await supabaseClient
          .from("project_media")
          .insert({
            project_id: projectId,
            bucket_name: uploaded.bucket,
            desktop_path: uploaded.desktopPath,
            mobile_path: uploaded.mobilePath,
            alt_text: item.altText === "" ? null : item.altText,
            sort_order: item.sortOrder,
            is_active: item.isActive
          })
          .select("id");

        if (error || !data || data.length === 0) {
          await removeObjects(uploaded.bucket, [
            uploaded.desktopPath,
            uploaded.mobilePath
          ]);

          throw error || new Error("project_media insert did not apply");
        }

        continue;
      }

      const previous = loadedMedia.find(row => row.id === item.id);
      const patch = {
        alt_text: item.altText === "" ? null : item.altText,
        sort_order: item.sortOrder,
        is_active: item.isActive
      };

      if (files) {
        const uploaded = await uploadVariantPair({
          bucket,
          directory: `projects/${projectId}/documentation/${newMediaId()}`,
          desktopFile: files.desktopFile,
          mobileFile: files.mobileFile
        });

        patch.bucket_name = uploaded.bucket;
        patch.desktop_path = uploaded.desktopPath;
        patch.mobile_path = uploaded.mobilePath;

        const { data, error } = await supabaseClient
          .from("project_media")
          .update(patch)
          .eq("id", item.id)
          .select("id");

        if (error || !data || data.length === 0) {
          await removeObjects(uploaded.bucket, [
            uploaded.desktopPath,
            uploaded.mobilePath
          ]);

          throw error || new Error("project_media update did not apply");
        }

        // Row identity, sort_order and created_at are untouched; only the
        // object references changed, so the old files can go now.
        if (previous && previous.desktop_path) {
          const cleanup = await removeObjects(previous.bucket_name, [
            previous.desktop_path,
            previous.mobile_path
          ]);

          if (cleanup.failed.length > 0) {
            warnings.push(`orphan files left after replacing ${previous.desktop_path}`);
          }
        }

        continue;
      }

      const unchanged =
        previous &&
        (previous.alt_text || "") === item.altText &&
        Number(previous.sort_order) === item.sortOrder &&
        previous.is_active !== false === item.isActive;

      if (unchanged) {
        continue;
      }

      const { data, error } = await supabaseClient
        .from("project_media")
        .update(patch)
        .eq("id", item.id)
        .select("id");

      if (error || !data || data.length === 0) {
        throw error || new Error("project_media update did not apply");
      }
    }

    await reloadMedia(projectId);

    return warnings;
  }

  /*
    Promotes every staged object of this Project into the public bucket before
    the status flips. Compensation rules (brief section 16):

      copy/verify fails   -> remove the public objects created so far, stay Draft
      database write fails-> remove the public objects, keep existing references
      staging cleanup fails-> new public state stands, report an orphan warning
  */
  async function promoteStagedMedia(projectId) {
    const created = [];
    const warnings = [];

    const cover = coverField.getStored();
    const mediaRows = loadedMedia.filter(row => row.bucket_name === STAGING_BUCKET);
    const coverNeedsPromotion = Boolean(
      cover && cover.desktopPath && cover.bucket === STAGING_BUCKET
    );

    if (!coverNeedsPromotion && mediaRows.length === 0) {
      return warnings;
    }

    let promotedCover = null;
    const promotedMedia = [];

    try {
      if (coverNeedsPromotion) {
        promotedCover = await promoteVariantPair({ from: cover });
        created.push({
          bucket: promotedCover.bucket,
          paths: [promotedCover.desktopPath, promotedCover.mobilePath]
        });
      }

      for (const row of mediaRows) {
        const promoted = await promoteVariantPair({
          from: {
            bucket: row.bucket_name,
            desktopPath: row.desktop_path,
            mobilePath: row.mobile_path
          }
        });

        promotedMedia.push({ id: row.id, promoted, previous: row });
        created.push({
          bucket: promoted.bucket,
          paths: [promoted.desktopPath, promoted.mobilePath]
        });
      }

      if (promotedCover) {
        const { data, error } = await supabaseClient
          .from("projects")
          .update({
            cover_bucket: promotedCover.bucket,
            cover_desktop_path: promotedCover.desktopPath,
            cover_mobile_path: promotedCover.mobilePath
          })
          .eq("id", projectId)
          .select("id");

        if (error || !data || data.length === 0) {
          throw error || new Error("cover promotion update did not apply");
        }
      }

      for (const entry of promotedMedia) {
        const { data, error } = await supabaseClient
          .from("project_media")
          .update({
            bucket_name: entry.promoted.bucket,
            desktop_path: entry.promoted.desktopPath,
            mobile_path: entry.promoted.mobilePath
          })
          .eq("id", entry.id)
          .select("id");

        if (error || !data || data.length === 0) {
          throw error || new Error("project_media promotion update did not apply");
        }
      }
    } catch (error) {
      // Nothing public may survive a failed promotion.
      for (const entry of created) {
        await removeObjects(entry.bucket, entry.paths);
      }

      throw error;
    }

    // Database now points at the public objects; staging copies are redundant.
    if (promotedCover) {
      const cleanup = await removeObjects(STAGING_BUCKET, [
        cover.desktopPath,
        cover.mobilePath
      ]);

      if (cleanup.failed.length > 0) {
        warnings.push("staged cover files could not be removed");
      }

      coverField.commit({
        bucket: promotedCover.bucket,
        desktopPath: promotedCover.desktopPath,
        mobilePath: promotedCover.mobilePath
      });
    }

    for (const entry of promotedMedia) {
      const cleanup = await removeObjects(STAGING_BUCKET, [
        entry.previous.desktop_path,
        entry.previous.mobile_path
      ]);

      if (cleanup.failed.length > 0) {
        warnings.push(`staged files could not be removed (${entry.previous.desktop_path})`);
      }
    }

    await reloadMedia(projectId);

    return warnings;
  }

  async function save({ forPublish = false } = {}) {
    if (busy) {
      return false;
    }

    if (!validate({ forPublish })) {
      return false;
    }

    setBusy(true, t(forPublish ? "common.publishing" : "common.saving"));

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
        t("projEditor.errParagraphs"),
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
        t("projEditor.errTechnologies"),
        "error"
      );
      resetBaselineFormOnly();
      return false;
    }

    let mediaWarnings = [];

    try {
      setBusy(true, t("common.uploading"));
      mediaWarnings = await persistMedia(state.id);
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast(
        error && error.name === "MediaStorageError"
          ? error.message
          : t("projEditor.errMedia"),
        "error"
      );
      resetBaselineFormOnly();
      return false;
    }

    setBusy(false);
    heading.textContent = trimmed(fields.title.value) || t("proj.untitled");
    refreshStatusUi();
    resetBaseline();

    if (mediaWarnings.length > 0) {
      // The database is correct; only leftover files remain.
      toast(
        t("projEditor.savedWarn", { warnings: mediaWarnings.join("; ") }),
        "error"
      );
    } else if (!forPublish) {
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
      return t("projEditor.draftSaved");
    }

    return t("projEditor.saved");
  }

  async function publish() {
    if (busy || state.status === "published") {
      return;
    }

    const saved = await save({ forPublish: true });

    if (!saved) {
      return;
    }

    setBusy(true, t("common.publishing"));

    /*
      Media first: the Project must never become public while any of its images
      still live only in the private staging bucket. A failure here leaves the
      Project as a Draft with its staged media intact.
    */
    let promotionWarnings = [];

    try {
      promotionWarnings = await promoteStagedMedia(state.id);
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast(
        error && error.name === "MediaStorageError"
          ? error.message
          : t("projEditor.errPublishMedia"),
        "error"
      );
      return;
    }

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

      toast(t("projEditor.errPublish"), "error");
      return;
    }

    state.status = data[0].status;
    state.publishedAt = data[0].published_at;
    state.updatedAtValue = data[0].updated_at;

    refreshStatusUi();
    syncSlugLock();

    toast(
      promotionWarnings.length > 0
        ? t("projEditor.publishedWarn", { warnings: promotionWarnings.join("; ") })
        : t("projEditor.published"),
      promotionWarnings.length > 0 ? "error" : "success"
    );

    if (typeof onSaved === "function") {
      onSaved({ id: state.id, status: state.status });
    }
  }

  function refreshStatusUi() {
    clear(statusSlot);
    append(statusSlot, statusBadge(state.status));
    syncPublishButton();
    renderSettings();
    saveButton.textContent = t(
      state.id ? "common.saveChanges" : "common.saveDraft"
    );
  }

  function friendlyError(error) {
    const haystack = `${error && error.code} ${error && error.message} ${error &&
      error.details}`.toLowerCase();

    if (haystack.includes("projects_slug_key") || haystack.includes("duplicate key")) {
      return t("projEditor.errSlugTaken");
    }

    if (haystack.includes("projects_slug_check")) {
      return t("projEditor.errSlugFormat");
    }

    if (haystack.includes("projects_status_check")) {
      return t("list.statusNotAllowed");
    }

    if (haystack.includes("row-level security") || haystack.includes("42501")) {
      return t("list.sessionError");
    }

    return t("projEditor.errSave");
  }

  saveButton.addEventListener("click", () => save());
  publishButton.addEventListener("click", publish);

  previewButton.addEventListener("click", async () => {
    // Preview never mutates or clears dirty state.
    const coverUrl = await coverField.resolvePreviewUrl();

    const documentation = await Promise.all(
      documentationManager.getItems().map(async item => ({
        altText: item.altText,
        isActive: item.isActive,
        pending: Boolean(item.pendingFiles) || !item.id,
        url: item.pendingPreviewUrl
          ? item.pendingPreviewUrl
          : await resolveMediaUrl(item.bucket, item.desktopPath)
      }))
    );

    openProjectPreview({
      coverUrl,
      coverAlt: trimmed(fields.coverAlt.value),
      coverPending: coverField.hasPending(),
      documentation,
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
      coverField.destroy();
      documentationManager.destroy();
      clear(root);
    }
  };
}
