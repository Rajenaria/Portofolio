import { titleFieldsForSave } from "./legacy-title.js";
import { normalizeCover, validCover, missingCoverSchema, PROJECT_DETAIL_FRAME_RATIO } from "../../../../js/cms/project-cover.js";
import { requireCmsUpgrade } from "../../../../js/cms/backend-compatibility.js";

﻿/* Visual Project editor arranged by public sections. Save/upload, promotion,
   owner/MFA, slug locking, publication and Trash/Restore contracts are retained.
   Cover uses existing crop columns; other frame crops and media text use the
   existing case_study object. Pending media receive stable UUIDs before saving
   so roadmap/Hero references survive upload and reorder without duplicate rows.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, statusBadge, updatedAt } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { tIndonesian as t } from "../../core/i18n.js";

import {
  textField,
  selectField,
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
  verifyVariantPair,
  MediaStorageError,
  resolveMediaUrl,
  newMediaId
} from "../../core/media-storage.js";

import { createParagraphsEditor } from "./paragraphs-editor.js";
import { createTechnologySelector } from "./technology-selector.js";
import { createProjectMediaField } from "./media-field.js";
import { createDocumentationManager } from "./media-manager.js";
import { openProjectPreview } from "./preview.js";
import { createCaseStudyEditor } from "./case-study-editor.js";
import { openCropEditor } from "./crop-editor.js";
import { loadProjectCategories, openCategoryManager } from "./categories.js";

export const LIMITS = {
  title: 180,
  slug: 140,
  cardCategory: 100,
  shortDescription: 400,
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
  coverSchemaAvailable = true,
  paragraphs: initialParagraphs = [],
  media: initialMedia = [],
  technologies = [],
  categories: initialCategories = [],
  selectedTechnologyIds = [],
  onDirtyChange,
  onSaved,
  onBack
}) {
  requireCmsUpgrade();
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
  root.lang = "id";

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
    "Pratinjau Lengkap"
  );
  previewButton.type = "button";

  const saveButton = el(
    "button",
    "admin-button admin-button-secondary",
    t(isNew ? "projEditor.saveDraft" : "common.saveChanges")
  );
  saveButton.type = "button";

  const publishButton = el(
    "button",
    "admin-button admin-button-primary",
    t("projEditor.publish")
  );
  publishButton.type = "button";

  append(actions, previewButton, saveButton, publishButton);
  append(header, headingBlock, actions);
  append(root, back, header, el("p","form-help","Kolom bertanda * wajib untuk menyimpan. Sebelum diterbitkan, lengkapi juga kategori, deskripsi singkat dan lengkap, peran, tahun, serta gambar cover. Kolom lainnya opsional."));

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
    cardCategory: selectField({
      id: "project-card-category",
      label: t("projEditor.fieldCategory"),
      required: true,
      options: [],
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
      help: "Opsional. Tampil sebagai label pada bagian ringkasan Halaman Project."
    }),
    aboutHeading: textField({
      id: "project-about-heading",
      label: t("projEditor.fieldAbout"),
      maxLength: LIMITS.aboutHeading,
      value: record ? record.about_heading : "",
      help: "Opsional. Judul bagian ringkasan; kosongkan untuk memakai judul bawaan website."
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

  let categories = initialCategories;
  let categoryManager = null;
  let destroyed = false;
  let categoryRefreshVersion = 0;
  function categoryOptions(value) {
    const select = fields.cardCategory.control;
    select.replaceChildren();
    const placeholder = el("option",null,"Pilih kategori project"); placeholder.value = ""; select.append(placeholder);
    categories.forEach(category => {
      const option = el("option",null,category.name+(category.is_active ? "" : " — Nonaktif"));
      option.value = category.name; option.disabled = !category.is_active; select.append(option);
    });
    if (value && !categories.some(category => category.name === value)) {
      const missing = el("option",null,`${value} — Tidak tersedia`); missing.value = value; missing.disabled = true; select.append(missing);
    }
    select.value = value || "";
  }
  categoryOptions(record?.card_category || "");
  const manageCategories = el("button","admin-button admin-button-secondary","Kelola Kategori"); manageCategories.type = "button";
  fields.cardCategory.node.append(manageCategories);
  fields.cardCategory.control.addEventListener("change",() => { fields.cardCategory.setError(""); markDirty(); });
  async function refreshCategories() {
    if (destroyed) return;
    const version = ++categoryRefreshVersion;
    const fresh = await loadProjectCategories();
    if (destroyed || !root.isConnected || version !== categoryRefreshVersion) return;
    // Read the selection after the request: do not overwrite a choice made
    // while the closing manager's refresh was still in flight.
    const previous = categories, value = fields.cardCategory.value;
    const selectedId = previous.find(row => row.name === value)?.id;
    categories = fresh;
    const selected = fresh.find(row => row.id === selectedId);
    categoryOptions(selected?.name || value);
    // A committed rename changes the same association, not other unsaved fields.
    const baseline = JSON.parse(baselineForm);
    const baselineId = previous.find(row => row.name === baseline.cardCategory)?.id;
    const renamedBaseline = fresh.find(row => row.id === baselineId);
    if (renamedBaseline) { baseline.cardCategory = renamedBaseline.name; baselineForm = JSON.stringify(baseline); }
    markDirty();
  }
  manageCategories.addEventListener("click",() => {
    if (categoryManager || busy) return;
    categoryManager = openCategoryManager({
      onChanged:refreshCategories,
      onClosed:() => {
        categoryManager = null;
        refreshCategories().catch(() => fields.cardCategory.setError("Daftar kategori belum dapat dimuat ulang. Coba Kelola Kategori kembali."));
      }
    });
  });

  /* ---------------- cover ---------------- */

  let coverLayout = { ...normalizeCover(record || {}), cover_fit:"cover" };
  function coverValues() { return {...coverLayout}; }
  const coverField = createProjectMediaField({
    layout: coverValues(),
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
  const cropButton = el("button","admin-button admin-button-secondary","Atur Posisi Cover"); cropButton.type = "button";
  cropButton.addEventListener("click",async () => {
    const url = await coverField.resolvePreviewUrl();
    if (!url) { toast("Tambahkan gambar cover terlebih dahulu.","error"); return; }
    openCropEditor({url,value:{x:coverLayout.cover_position_x,y:coverLayout.cover_position_y},onSave:position => {
      coverLayout = {cover_fit:"cover",cover_position_x:Math.round(position.x),cover_position_y:Math.round(position.y)};
      coverField.setLayout(coverValues()); markDirty();
    }});
  });
  append(coverSection,coverField.element,cropButton,fields.coverAlt.node);

  /* ---------------- documentation ---------------- */

  const documentationManager = createDocumentationManager({
    initialMedia,
    metadata: record?.case_study?.media_details,
    getCrop: id => caseStudyEditor.getGalleryCrop(id),
    onCrop: async item => {
      const url = item.pendingPreviewUrl || await resolveMediaUrl(item.bucket,item.desktopPath);
      if (!url) { toast("Gambar tidak dapat dimuat.","error"); return; }
      openCropEditor({url,value:caseStudyEditor.getGalleryCrop(item.id),ratio:PROJECT_DETAIL_FRAME_RATIO,onSave:value => { caseStudyEditor.setGalleryCrop(item.id,value); documentationManager.refreshPreviews(); }});
    },
    onChange: () => { caseStudyEditor.refreshMedia(); markDirty(); }
  });
  const caseStudyEditor = createCaseStudyEditor({
    value: record?.case_study,
    getMedia: () => documentationManager.getItems(),
    getCoverUrl: () => coverField.resolvePreviewUrl(),
    onChange: markDirty
  });

  function studyValues() { return {...caseStudyEditor.getValue(),media_details:documentationManager.getDetails()}; }

  // Public UI displays a year; retain an existing full date if its year is unchanged.
  const dateField = el("div", "form-field");
  const dateLabel = el("label", "form-label", "Tahun project");
  const dateInput = el("input", "admin-input");
  dateInput.type = "number"; dateInput.min = "1900"; dateInput.max = "2199"; dateInput.step = "1";
  dateInput.id = "project-date";
  dateLabel.htmlFor = dateInput.id;
  dateInput.value = record?.project_date?.slice(0,4) || "";
  function projectDate() { return /^\d{4}$/.test(dateInput.value) ? record?.project_date?.startsWith(dateInput.value+"-") ? record.project_date : dateInput.value+"-01-01" : ""; }
  const dateHelp = el("p", "form-help", "Tampil sebagai tahun pada kartu dan halaman detail.");
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
  append(cardSection, cardGrid, fields.shortDescription.node, dateField, featured.node);

  const detailSection = group("projEditor.details", "projEditor.detailsHelp");
  const detailGrid = el("div", "form-grid");
  append(detailGrid,fields.role.node);
  append(detailSection, detailGrid, fields.detailIntro.node);
  const advanced = el("details","project-editor-advanced");
  append(advanced,el("summary","form-subheading","Informasi Tambahan (opsional)"),fields.projectType.node,fields.aboutHeading.node);
  append(detailSection,advanced);

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
  append(cardSection,coverSection,technologySelector.element);
  append(detailSection,caseStudyEditor.metadata,paragraphsEditor.element);
  const editorSections = [
    ["Kartu Beranda","Tampil pada kartu project di halaman utama.",cardSection],
    ["Hero dan Metadata","Tampil pada bagian atas Halaman Project beserta ringkasannya.",detailSection],
    ["Detail Teknis","Tampil pada tab arsitektur, cara kerja, masalah dan solusi, serta fitur di Halaman Project.",caseStudyEditor.element],
    ["Roadmap","Tampil sebagai tahapan berurutan di Halaman Project.",caseStudyEditor.roadmapElement],
    ["Galeri Project","Tampil pada galeri 3D dan tampilan layar penuh di Halaman Project.",documentationManager.element],
    ["Simpan dan Terbitkan","Status publikasi menentukan apakah project tampil di website. Status pengerjaan pada Hero hanya label informasi.",settingsSection]
  ];
  const sectionNavigation = el("nav","project-editor-navigation"); sectionNavigation.setAttribute("aria-label","Bagian editor project");
  editorSections.forEach(([title,help,section],index) => {
    const heading = section.querySelector("h3,h4"); if (heading) { heading.textContent = title; heading.tabIndex = -1; }
    section.id = `project-editor-section-${index}`;
    section.prepend(el("p","project-editor-location",help));
    const action = el("button","admin-button admin-button-secondary",title); action.type = "button";
    action.addEventListener("click",() => { section.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"}); heading?.focus({preventScroll:true}); });
    sectionNavigation.append(action);
  });
  root.append(sectionNavigation,...editorSections.map(section => section[2]));

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
      detailIntro: trimmed(fields.detailIntro.value),
      role: trimmed(fields.role.value),
      projectDate: projectDate(),
      projectType: trimmed(fields.projectType.value),
      aboutHeading: trimmed(fields.aboutHeading.value),
      githubUrl: trimmed(fields.githubUrl.value),
      demoUrl: trimmed(fields.demoUrl.value),
      ...coverValues(),
      coverAlt: trimmed(fields.coverAlt.value),
      featured: featured.value,
      case_study: studyValues()
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
      documentationManager.isProcessing() ||
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
    const category = fields.cardCategory.value;
    if (!category || !categories.some(row => row.name === category && row.is_active)) {
      fields.cardCategory.setError("Pilih kategori project yang aktif sebelum menyimpan. Kategori lama yang tidak tersedia tidak diganti otomatis.");
      fields.cardCategory.focus(); return false;
    }
    if (documentationManager.isProcessing()) { toast("Tunggu sampai semua gambar selesai diproses.","error"); return false; }
    if (!caseStudyEditor.validate()) return false;
    if (!coverSchemaAvailable) {
      toast(t("projCover.schemaMissing"), "error");
      return false;
    }
    if (!validCover(coverValues()) || !dateInput.checkValidity()) {
      toast(t("projCover.invalid"), "error");
      return false;
    }
    const rules = {
      title: {
        label: t("projEditor.fieldTitle"),
        required: true,
        maxLength: LIMITS.title
      },
      slug: { label: t("projEditor.fieldSlug"), required: true, maxLength: LIMITS.slug },
      cardCategory: {
        label: t("projEditor.fieldCategory"),
        required: true,
        maxLength: LIMITS.cardCategory
      },
      shortDescription: {
        label: t("projEditor.fieldShort"),
        maxLength: LIMITS.shortDescription
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
      ...titleFieldsForSave(record, trimmedOrNull(fields.title.value)),
      detail_intro: trimmedOrNull(fields.detailIntro.value),
      role: trimmedOrNull(fields.role.value),
      project_date: projectDate() || null,
      project_type: trimmedOrNull(fields.projectType.value),
      about_heading: trimmedOrNull(fields.aboutHeading.value),
      github_url: trimmedOrNull(fields.githubUrl.value),
      demo_url: trimmedOrNull(fields.demoUrl.value),
      ...coverValues(),
      cover_alt: trimmedOrNull(fields.coverAlt.value),
      featured: featured.value,
      case_study: studyValues()
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
    root.inert = next;
    caseStudyEditor.setBusy(next);
    cropButton.disabled = next;
    saveButton.disabled = next;
    previewButton.disabled = next;
    back.disabled = next;
    publishButton.disabled = next || state.status === "published";

    saveButton.textContent =
      label || t(state.id ? "common.saveChanges" : "projEditor.saveDraft");
  }

  function syncPublishButton() {
    if (state.status === "published") {
      publishButton.textContent = t("status.published");
      publishButton.disabled = true;
      publishButton.title = t("projEditor.alreadyPublished");
      return;
    }

    publishButton.textContent = t("projEditor.publish");
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
    caseStudyEditor.refreshMedia();
  }

  /*
    Applies every staged media change. Ordering per operation is always:
    upload new -> verify -> write database -> only then delete the old object.
    Upload failures remove only new, unreferenced objects. Once a database
    write is attempted, retain both generations until its outcome is known.
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

      publishRecoveryNeeded = true;

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
      publishRecoveryNeeded = true;
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

      if (!item.id || item.isNew) {
        const uploaded = await uploadVariantPair({
          bucket,
          directory: `projects/${projectId}/documentation/${newMediaId()}`,
          desktopFile: files.desktopFile,
          mobileFile: files.mobileFile
        });

        publishRecoveryNeeded = true;

        const { data, error } = await supabaseClient
          .from("project_media")
          .insert({
            id: item.id || newMediaId(),
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
          throw error || new Error("project_media insert did not apply");
        }
        documentationManager.commitAdded(item.key,{id:data[0].id,bucket:uploaded.bucket,desktopPath:uploaded.desktopPath,mobilePath:uploaded.mobilePath});
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

        publishRecoveryNeeded = true;

        const { data, error } = await supabaseClient
          .from("project_media")
          .update(patch)
          .eq("id", item.id)
          .select("id");

        if (error || !data || data.length === 0) {
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

      publishRecoveryNeeded = true;

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
    publishRecoveryNeeded = false;

    return warnings;
  }

  let publishRecoveryNeeded = false;

  async function readProjectMediaState(projectId) {
    const [projectResult, mediaResult] = await Promise.all([
      supabaseClient
        .from("projects")
        .select("id, status, published_at, updated_at, deleted_at, cover_bucket, cover_desktop_path, cover_mobile_path")
        .eq("id", projectId)
        .maybeSingle(),
      supabaseClient
        .from("project_media")
        .select("id, bucket_name, desktop_path, mobile_path, alt_text, sort_order, is_active")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    ]);

    if (projectResult.error || !projectResult.data || mediaResult.error || !mediaResult.data) {
      throw projectResult.error || mediaResult.error || new Error("Project media could not be confirmed.");
    }

    const project = projectResult.data;
    return {
      project,
      cover: {
        bucket: project.cover_bucket,
        desktopPath: project.cover_desktop_path,
        mobilePath: project.cover_mobile_path
      },
      media: mediaResult.data
    };
  }

  function applyProjectMediaState(snapshot) {
    state.status = snapshot.project.status;
    state.publishedAt = snapshot.project.published_at;
    state.updatedAtValue = snapshot.project.updated_at;
    coverField.setStored(snapshot.cover.desktopPath ? snapshot.cover : null);
    loadedMedia = snapshot.media;
    documentationManager.setSavedMedia(loadedMedia);
    caseStudyEditor.refreshMedia();
    publishRecoveryNeeded = false;
    refreshStatusUi();
  }

  function mediaReferencesMatch(snapshot, expected) {
    const samePair = (a, b) =>
      a.bucket === b.bucket &&
      a.desktopPath === b.desktopPath &&
      a.mobilePath === b.mobilePath;
    return samePair(snapshot.cover, expected.cover) &&
      snapshot.media.length === expected.media.length &&
      snapshot.media.every(row => {
        const other = expected.media.find(entry => entry.id === row.id);
        return other && samePair(
          { bucket: row.bucket_name, desktopPath: row.desktop_path, mobilePath: row.mobile_path },
          { bucket: other.bucket_name, desktopPath: other.desktop_path, mobilePath: other.mobile_path }
        );
      });
  }

  async function verifyPublicProjectMedia(snapshot) {
    const pairs = [
      snapshot.cover,
      ...snapshot.media.map(row => ({
        bucket: row.bucket_name,
        desktopPath: row.desktop_path,
        mobilePath: row.mobile_path
      }))
    ];

    for (const pair of pairs) {
      if (pair.bucket !== MEDIA_BUCKET) {
        throw new Error("Project media is not ready for public access.");
      }
      await verifyVariantPair(pair);
    }
  }

  /*
    Keep staging until status and references are read back successfully.
    Failed database acknowledgements are ambiguous: after any reference write,
    retain public copies even if rollback succeeds, rather than risk deleting
    an object a delayed write may still reference. Fresh promotion keys make
    those retained copies harmless to retry.
  */
  async function promoteStagedMedia(projectId) {
    const original = await readProjectMediaState(projectId);
    const expected = {
      cover: { ...original.cover },
      media: original.media.map(row => ({ ...row }))
    };
    const changes = [];
    let referencesAttempted = false;
    let statusAttempted = false;
    let committed = null;
    const warnings = [];

    if (original.project.deleted_at) {
      throw new Error("A deleted project cannot be published.");
    }

    try {
      if (original.project.status !== "published") {
        if (original.cover.bucket === STAGING_BUCKET) {
          const promoted = await promoteVariantPair({ from: original.cover });
          changes.push({
            table: "projects",
            id: projectId,
            from: original.cover,
            promoted,
            previous: {
              cover_bucket: original.cover.bucket,
              cover_desktop_path: original.cover.desktopPath,
              cover_mobile_path: original.cover.mobilePath
            },
            next: {
              cover_bucket: promoted.bucket,
              cover_desktop_path: promoted.desktopPath,
              cover_mobile_path: promoted.mobilePath
            }
          });
          expected.cover = promoted;
        }

        for (const row of original.media.filter(entry => entry.bucket_name === STAGING_BUCKET)) {
          const from = {
            bucket: row.bucket_name,
            desktopPath: row.desktop_path,
            mobilePath: row.mobile_path
          };
          const promoted = await promoteVariantPair({ from });
          const next = {
            bucket_name: promoted.bucket,
            desktop_path: promoted.desktopPath,
            mobile_path: promoted.mobilePath
          };
          changes.push({
            table: "project_media",
            id: row.id,
            from,
            promoted,
            previous: {
              bucket_name: row.bucket_name,
              desktop_path: row.desktop_path,
              mobile_path: row.mobile_path
            },
            next
          });
          Object.assign(expected.media.find(entry => entry.id === row.id), next);
        }

        for (const change of changes) {
          referencesAttempted = true;
          change.attempted = true;
          const { data, error } = await supabaseClient
            .from(change.table)
            .update(change.next)
            .eq("id", change.id)
            .match(change.previous)
            .select("id");
          if (error || !data || data.length === 0) {
            throw error || new Error("Project media changed during publication.");
          }
        }
      }

      const ready = await readProjectMediaState(projectId);
      if (!mediaReferencesMatch(ready, expected) ||
          ready.project.status !== original.project.status || ready.project.deleted_at) {
        throw new Error("Project changed during publication.");
      }
      await verifyPublicProjectMedia(ready);

      if (ready.project.status !== "published") {
        statusAttempted = true;
        const patch = { status: "published" };
        if (!ready.project.published_at) {
          patch.published_at = new Date().toISOString();
        }

        const { data, error } = await supabaseClient
          .from("projects")
          .update(patch)
          .eq("id", projectId)
          .eq("status", ready.project.status)
          .is("deleted_at", null)
          .select("status, published_at, updated_at");
        if (error || !data || data.length === 0 || data[0].status !== "published") {
          throw error || new Error("Project publication could not be confirmed.");
        }
      }

      committed = await readProjectMediaState(projectId);
      if (committed.project.status !== "published" || committed.project.deleted_at ||
          !mediaReferencesMatch(committed, expected)) {
        throw new Error("Published project references could not be confirmed.");
      }
    } catch (error) {
      if (!referencesAttempted && !statusAttempted && changes.length === 0) {
        throw error;
      }

      try {
        let current = await readProjectMediaState(projectId);
        if (current.project.status === "published") {
          if (current.project.deleted_at || !mediaReferencesMatch(current, expected)) {
            throw new Error("Publication outcome requires a reload.");
          }
          // The status write may have succeeded even when its response was lost.
          await verifyPublicProjectMedia(current);
          committed = current;
        } else {
          for (const change of changes.filter(entry => entry.attempted).reverse()) {
            try {
              const result = await supabaseClient
                .from(change.table)
                .update(change.previous)
                .eq("id", change.id)
                .match(change.next)
                .select("id");
              if (result.error) {
                console.error(result.error);
              }
            } catch (rollbackError) {
              console.error(rollbackError);
            }
          }

          current = await readProjectMediaState(projectId);
          applyProjectMediaState(current);

          if (!referencesAttempted) {
            for (const change of changes) {
              await removeObjects(change.promoted.bucket, [
                change.promoted.desktopPath,
                change.promoted.mobilePath
              ]);
            }
          }
          throw error;
        }
      } catch (recoveryError) {
        // No destructive cleanup when the database outcome is uncertain.
        publishRecoveryNeeded = true;
        throw new MediaStorageError(
          t("projEditor.errPublishRecovery"),
          "PUBLISH_RECOVERY_REQUIRED",
          recoveryError
        );
      }
    }

    applyProjectMediaState(committed);
    for (const change of changes) {
      const cleanup = await removeObjects(change.from.bucket, [
        change.from.desktopPath,
        change.from.mobilePath
      ]);
      if (cleanup.failed.length > 0) {
        warnings.push("staged image files could not be removed");
      }
    }
    return { project: committed.project, warnings };
  }


  async function save({ forPublish = false } = {}) {
    if (busy) {
      return false;
    }

    if (publishRecoveryNeeded) {
      if (coverField.hasPending() || documentationManager.snapshot() !== baselineMedia) {
        toast(t("projEditor.errMediaRecovery"), "error");
        return false;
      }
      setBusy(true, t("common.loading"));
      try {
        applyProjectMediaState(await readProjectMediaState(state.id));
        baselineMedia = documentationManager.snapshot();
      } catch (error) {
        console.error(error);
        toast(t("projEditor.errMediaRecovery"), "error");
        return false;
      } finally {
        setBusy(false);
      }
    }

    if (forPublish && state.status === "published") {
      return false;
    }

    setBusy(true,t("common.loading"));
    try {
      const selectedCategory = fields.cardCategory.value;
      await refreshCategories();
      if (selectedCategory !== fields.cardCategory.value) {
        toast("Nama kategori telah berubah. Pilihan tetap terhubung ke kategori yang sama; periksa sebelum menyimpan.");
        return false;
      }
    } catch {
      fields.cardCategory.setError("Kategori belum dapat diverifikasi. Periksa koneksi dan coba simpan kembali.");
      return false;
    } finally { setBusy(false); }

    if (!validate({ forPublish })) {
      return false;
    }

    setBusy(true, t(forPublish ? "projEditor.publishing" : "common.saving"));

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
        publishRecoveryNeeded
          ? t("projEditor.errMediaRecovery")
          : error && error.name === "MediaStorageError"
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

    try {
      const saved = await save({ forPublish: true });
      if (!saved || state.status === "published") {
        return;
      }

      setBusy(true, t("projEditor.publishing"));
      const { warnings } = await promoteStagedMedia(state.id);
      resetBaseline();
      syncSlugLock();
      toast(
        warnings.length > 0
          ? t("projEditor.publishedWarn", { warnings: warnings.join("; ") })
          : t("projEditor.published"),
        warnings.length > 0 ? "error" : "success"
      );

      if (typeof onSaved === "function") {
        onSaved({ id: state.id, status: state.status });
      }
    } catch (error) {
      console.error(error);
      toast(t("projEditor.errPublishRecovery"), "error");
    } finally {
      setBusy(false);
    }
  }


  function refreshStatusUi() {
    clear(statusSlot);
    append(statusSlot, statusBadge(state.status));
    syncPublishButton();
    renderSettings();
    saveButton.textContent = t(
      state.id ? "common.saveChanges" : "projEditor.saveDraft"
    );
  }

  function friendlyError(error) {
    if (missingCoverSchema(error)) return t("projCover.schemaMissing");
    const haystack = `${error && error.code} ${error && error.message} ${error &&
      error.details}`.toLowerCase();

    if (haystack.includes("category_invalid") || haystack.includes("projects_card_category_fkey")) {
      return "Kategori telah berubah, dihapus, atau dinonaktifkan. Buka Kelola Kategori dan pilih kategori aktif kembali. Isi formulir tetap utuh.";
    }

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

  let preparingPreview = false;
  previewButton.addEventListener("click", async () => {
    if (preparingPreview || busy) return;
    preparingPreview = true;
    previewButton.disabled = true;
    previewButton.textContent = "Menyiapkan Pratinjau…";
    try {
      // Preview never mutates or clears dirty state.
      const coverUrl = await coverField.resolvePreviewUrl();

      const documentation = await Promise.all(
        documentationManager.getItems().map(async item => ({
          id: item.id,
          altText: item.altText,
          isActive: item.isActive,
          url: item.pendingPreviewUrl
            ? item.pendingPreviewUrl
            : await resolveMediaUrl(item.bucket, item.desktopPath)
        }))
      );

      if (!root.isConnected) return;
      openProjectPreview({
        ...titleFieldsForSave(record, trimmedOrNull(fields.title.value)),
        id: state.id,
        ...coverValues(),
        coverUrl,
        coverAlt: trimmed(fields.coverAlt.value),
        documentation,
        caseStudy: studyValues(),
        title: trimmed(fields.title.value),
        slug: trimmed(fields.slug.value),
        cardCategory: trimmed(fields.cardCategory.value),
        shortDescription: trimmed(fields.shortDescription.value),
        detailIntro: trimmed(fields.detailIntro.value),
        role: trimmed(fields.role.value),
        projectDate: projectDate(),
        projectType: trimmed(fields.projectType.value),
        aboutHeading: trimmed(fields.aboutHeading.value),
        githubUrl: trimmed(fields.githubUrl.value),
        demoUrl: trimmed(fields.demoUrl.value),
        featured: featured.value,
        status: state.status,
        paragraphs: paragraphsEditor.getParagraphs(),
        technologies: technologySelector.getSelectedTechnologies()
      });
    } catch {
      toast("Pratinjau belum dapat dimuat. Perubahan pada formulir tetap utuh.","error");
    } finally {
      preparingPreview = false;
      previewButton.disabled = busy;
      previewButton.textContent = "Pratinjau Lengkap";
    }
  });

  return {
    element: root,
    isDirty: computeDirty,
    getId: () => state.id,
    destroy() {
      destroyed = true;
      categoryManager?.close();
      categoryManager = null;
      coverField.destroy();
      documentationManager.destroy();
      caseStudyEditor.destroy();
      clear(root);
    }
  };
}
