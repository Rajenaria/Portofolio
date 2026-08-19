/*
  Experience editor (Phase 7).

  A full-page editor mounted inside the existing Admin shell — not a modal
  (brief section 4, Design doc section 20). It edits only columns that actually
  exist in public.experiences:

    type, title, role, location, description

  plus the staged tag list from tags-editor.js. id, created_at, sort_order and
  updated_at are never written by this form; updated_at stays DB-trigger
  managed and sort_order only changes through explicit reorder in the list.

  STATUS
  ------
  Saving never changes status. A published Experience stays published when
  edited; status only moves through the explicit Publish / Archive / Restore
  actions (brief sections 5, 6 and 9).
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear, statusBadge, updatedAt } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { t } from "../../core/i18n.js";

import {
  textField,
  textareaField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import { createTagsEditor } from "./tags-editor.js";
import { openExperiencePreview } from "./preview.js";

export const LIMITS = {
  type: 80,
  title: 160,
  role: 180,
  location: 180
};

export function createExperienceEditor({
  record,
  tags: initialTags = [],
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

  const root = el("div", "experience-editor");

  /* ---------------- header ---------------- */

  const back = el("button", "link-button", t("expEditor.back"));
  back.type = "button";
  back.addEventListener("click", () => onBack());

  const header = el("div", "editor-header");
  const headingBlock = el("div", "editor-heading");

  const heading = el(
    "h2",
    "editor-title",
    isNew ? t("expEditor.newTitle") : record.title || t("exp.untitled")
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

  syncPublishButton();

  /* ---------------- fields ---------------- */

  const fields = {
    title: textField({
      id: "experience-title",
      label: t("expEditor.fieldTitle"),
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : "",
      help: t("expEditor.fieldTitleHelp")
    }),
    type: textField({
      id: "experience-type",
      label: t("expEditor.fieldType"),
      maxLength: LIMITS.type,
      value: record ? record.type : "",
      help: t("expEditor.fieldTypeHelp")
    }),
    role: textField({
      id: "experience-role",
      label: t("common.role"),
      maxLength: LIMITS.role,
      value: record ? record.role : ""
    }),
    location: textField({
      id: "experience-location",
      label: t("common.location"),
      maxLength: LIMITS.location,
      value: record ? record.location : ""
    }),
    description: textareaField({
      id: "experience-description",
      label: t("common.description"),
      value: record ? record.description : "",
      rows: 8,
      help: t("expEditor.fieldDescriptionHelp")
    })
  };

  /* One shape for every group, matching the Certificates editor so the two
     forms read as the same product. */
  function group(titleKey, helpKey) {
    const node = el("section", "admin-subsection");

    append(node, el("h3", "subsection-title", t(titleKey)));

    if (helpKey) {
      append(node, el("p", "form-help", t(helpKey)));
    }

    return node;
  }

  const basicSection = group("expEditor.basic", "expEditor.basicHelp");

  const grid = el("div", "form-grid");
  append(grid, fields.title.node, fields.type.node, fields.role.node, fields.location.node);
  append(basicSection, grid);

  const descriptionSection = group(
    "expEditor.description",
    "expEditor.descriptionHelp"
  );
  append(descriptionSection, fields.description.node);

  const tagsEditor = createTagsEditor({
    initialTags,
    onChange: markDirty
  });

  const settingsSection = group("expEditor.visibility", "expEditor.visibilityHelp");

  const settingsList = el("dl", "settings-list");
  append(settingsSection, settingsList);

  renderSettings();

  append(root, basicSection, descriptionSection, tagsEditor.element, settingsSection);

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

  /* ---------------- dirty tracking ---------------- */

  function formSnapshot() {
    return JSON.stringify({
      title: trimmed(fields.title.value),
      type: trimmed(fields.type.value),
      role: trimmed(fields.role.value),
      location: trimmed(fields.location.value),
      description: trimmed(fields.description.value)
    });
  }

  let baselineForm = formSnapshot();
  let baselineTags = tagsEditor.snapshot();
  let dirty = false;
  let busy = false;

  function computeDirty() {
    return formSnapshot() !== baselineForm || tagsEditor.snapshot() !== baselineTags;
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

  function resetBaseline() {
    baselineForm = formSnapshot();
    baselineTags = tagsEditor.snapshot();
    dirty = false;
    onDirtyChange(false);
  }

  /* ---------------- helpers ---------------- */

  function currentValues() {
    return {
      type: trimmedOrNull(fields.type.value),
      title: trimmedOrNull(fields.title.value),
      role: trimmedOrNull(fields.role.value),
      location: trimmedOrNull(fields.location.value),
      description: trimmedOrNull(fields.description.value)
    };
  }

  function setBusy(next, label) {
    busy = next;
    saveButton.disabled = next;
    publishButton.disabled = next || state.status === "published";
    previewButton.disabled = next;
    back.disabled = next;

    if (label) {
      saveButton.textContent = label;
    } else {
      saveButton.textContent = t(
        state.id ? "common.saveChanges" : "common.saveDraft"
      );
    }
  }

  function syncPublishButton() {
    if (state.status === "published") {
      publishButton.textContent = t("status.published");
      publishButton.disabled = true;
      publishButton.title = t("expEditor.alreadyPublished");
      return;
    }

    publishButton.textContent = t("common.publish");
    publishButton.disabled = false;
    publishButton.removeAttribute("title");
  }

  function validate({ forPublish }) {
    const rules = {
      title: {
        label: t("expEditor.fieldTitle"),
        required: true,
        maxLength: LIMITS.title
      },
      type: { label: t("expEditor.fieldType"), maxLength: LIMITS.type },
      role: { label: t("common.role"), maxLength: LIMITS.role },
      location: { label: t("common.location"), maxLength: LIMITS.location }
    };

    if (forPublish) {
      /*
        The database only requires `title`. Requiring a description before
        publishing is an application-level rule so a published card can never
        render empty; Save Draft stays permissive.
      */
      rules.description = { label: t("common.description"), required: true };
    }

    const ok = applyValidation(fields, rules);

    if (!ok) {
      toast(t("expEditor.errFields"), "error");
    }

    return ok;
  }

  async function nextSortOrder() {
    const { data, error } = await supabaseClient
      .from("experiences")
      .select("sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      return 0;
    }

    if (!data || data.length === 0) {
      return 0;
    }

    // max(sort_order) + 1: correct even when the sequence has gaps.
    return (Number(data[0].sort_order) || 0) + 1;
  }

  /* ---------------- tag persistence ---------------- */

  let loadedTags = initialTags.map(tag => ({
    id: tag.id,
    label: tag.label,
    sort_order: Number(tag.sort_order) || 0
  }));

  async function persistTags(experienceId) {
    const current = tagsEditor.getTags();
    const currentIds = new Set(current.filter(tag => tag.id).map(tag => tag.id));

    const toDelete = loadedTags
      .filter(tag => !currentIds.has(tag.id))
      .map(tag => tag.id);

    const toInsert = current
      .filter(tag => !tag.id)
      .map(tag => ({
        experience_id: experienceId,
        label: tag.label,
        sort_order: tag.sort_order
      }));

    const toUpdate = current.filter(tag => {
      if (!tag.id) {
        return false;
      }

      const previous = loadedTags.find(entry => entry.id === tag.id);

      return (
        previous &&
        (previous.label !== tag.label || previous.sort_order !== tag.sort_order)
      );
    });

    if (toDelete.length > 0) {
      const { error } = await supabaseClient
        .from("experience_tags")
        .delete()
        .in("id", toDelete);

      if (error) {
        throw error;
      }
    }

    for (const tag of toUpdate) {
      const { data, error } = await supabaseClient
        .from("experience_tags")
        .update({ label: tag.label, sort_order: tag.sort_order })
        .eq("id", tag.id)
        .select("id");

      if (error || !data || data.length === 0) {
        throw error || new Error("experience_tags update did not apply");
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabaseClient
        .from("experience_tags")
        .insert(toInsert);

      if (error) {
        throw error;
      }
    }

    const { data, error } = await supabaseClient
      .from("experience_tags")
      .select("id, label, sort_order")
      .eq("experience_id", experienceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    loadedTags = (data || []).map(tag => ({
      id: tag.id,
      label: tag.label,
      sort_order: Number(tag.sort_order) || 0
    }));

    tagsEditor.setSavedTags(loadedTags);
  }

  /* ---------------- save ---------------- */

  async function save({ forPublish = false } = {}) {
    if (busy) {
      return false;
    }

    if (!validate({ forPublish })) {
      return false;
    }

    setBusy(true, t(forPublish ? "common.publishing" : "common.saving"));

    const payload = currentValues();

    try {
      if (!state.id) {
        payload.status = "draft";
        payload.sort_order = await nextSortOrder();

        const { data, error } = await supabaseClient
          .from("experiences")
          .insert(payload)
          .select("id, status, sort_order, created_at, updated_at, published_at");

        if (error || !data || data.length === 0) {
          throw error || new Error("experiences insert did not apply");
        }

        state.id = data[0].id;
        state.status = data[0].status;
        state.sortOrder = data[0].sort_order;
        state.createdAt = data[0].created_at;
        state.updatedAtValue = data[0].updated_at;
        state.publishedAt = data[0].published_at;
      } else {
        // status, sort_order, created_at are deliberately absent here.
        const { data, error } = await supabaseClient
          .from("experiences")
          .update(payload)
          .eq("id", state.id)
          .select("id, status, sort_order, created_at, updated_at, published_at");

        if (error || !data || data.length === 0) {
          throw error || new Error("experiences update did not apply");
        }

        state.status = data[0].status;
        state.sortOrder = data[0].sort_order;
        state.createdAt = data[0].created_at;
        state.updatedAtValue = data[0].updated_at;
        state.publishedAt = data[0].published_at;
      }

      await persistTags(state.id);
    } catch (error) {
      console.error(error);
      setBusy(false);
      toast(friendlyError(error), "error");
      return false;
    }

    setBusy(false);
    heading.textContent = trimmed(fields.title.value) || t("exp.untitled");
    refreshStatusUi();
    resetBaseline();

    if (!forPublish) {
      toast(t(isNewLabelUsed() ? "expEditor.draftSaved" : "expEditor.saved"));
    }

    if (typeof onSaved === "function") {
      onSaved({ id: state.id, status: state.status });
    }

    return true;
  }

  let firstSaveDone = !isNew;

  function isNewLabelUsed() {
    if (!firstSaveDone) {
      firstSaveDone = true;
      return true;
    }

    return false;
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

    const patch = { status: "published" };

    // published_at records the FIRST publish; later edits do not overwrite it
    // (ADMIN-CMS-DATABASE.md section 87).
    if (!state.publishedAt) {
      patch.published_at = new Date().toISOString();
    }

    const { data, error } = await supabaseClient
      .from("experiences")
      .update(patch)
      .eq("id", state.id)
      .select("status, published_at, updated_at");

    setBusy(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast(t("expEditor.errPublish"), "error");
      return;
    }

    state.status = data[0].status;
    state.publishedAt = data[0].published_at;
    state.updatedAtValue = data[0].updated_at;

    refreshStatusUi();
    toast(t("expEditor.published"));

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

    if (haystack.includes("experience_tags_experience_label_lower_unique")) {
      return t("expEditor.errDuplicateTag");
    }

    if (haystack.includes("experiences_status_check")) {
      return t("list.statusNotAllowed");
    }

    if (haystack.includes("row-level security") || haystack.includes("42501")) {
      return t("list.sessionError");
    }

    return t("expEditor.errSave");
  }

  saveButton.addEventListener("click", () => save());
  publishButton.addEventListener("click", publish);

  previewButton.addEventListener("click", () => {
    openExperiencePreview({
      type: trimmed(fields.type.value),
      title: trimmed(fields.title.value),
      role: trimmed(fields.role.value),
      location: trimmed(fields.location.value),
      description: trimmed(fields.description.value),
      tags: tagsEditor.getTags(),
      status: state.status
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
