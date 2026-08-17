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

  const back = el("button", "link-button", "← Back to Experience");
  back.type = "button";
  back.addEventListener("click", () => onBack());

  const header = el("div", "editor-header");
  const headingBlock = el("div", "editor-heading");

  const heading = el(
    "h2",
    "editor-title",
    isNew ? "New Experience" : record.title || "Untitled experience"
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

  syncPublishButton();

  /* ---------------- fields ---------------- */

  const fields = {
    title: textField({
      id: "experience-title",
      label: "Title",
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : "",
      help: "Main heading of the Experience card."
    }),
    type: textField({
      id: "experience-type",
      label: "Type",
      maxLength: LIMITS.type,
      value: record ? record.type : "",
      help: "For example: Laboratory, Organization, Internship, Work."
    }),
    role: textField({
      id: "experience-role",
      label: "Role",
      maxLength: LIMITS.role,
      value: record ? record.role : ""
    }),
    location: textField({
      id: "experience-location",
      label: "Location",
      maxLength: LIMITS.location,
      value: record ? record.location : ""
    }),
    description: textareaField({
      id: "experience-description",
      label: "Description",
      value: record ? record.description : "",
      rows: 8,
      help: "Plain text only. No HTML or formatting markup. Required before publishing."
    })
  };

  const basicSection = el("section", "admin-subsection");
  append(basicSection, el("h3", "subsection-title", "Basic Information"));

  const grid = el("div", "form-grid");
  append(grid, fields.title.node, fields.type.node, fields.role.node, fields.location.node);
  append(basicSection, grid);

  const descriptionSection = el("section", "admin-subsection");
  append(
    descriptionSection,
    el("h3", "subsection-title", "Description"),
    fields.description.node
  );

  const tagsEditor = createTagsEditor({
    initialTags,
    onChange: markDirty
  });

  const settingsSection = el("section", "admin-subsection");
  append(settingsSection, el("h3", "subsection-title", "Settings"));

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
    row(
      "Created",
      state.createdAt ? updatedAt(state.createdAt) : el("span", null, "—")
    );
    row(
      "Last updated",
      state.updatedAtValue ? updatedAt(state.updatedAtValue) : el("span", null, "—")
    );
    row(
      "Published",
      state.publishedAt ? updatedAt(state.publishedAt) : el("span", null, "Not published yet")
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
      saveButton.textContent = state.id ? "Save Changes" : "Save Draft";
    }
  }

  function syncPublishButton() {
    if (state.status === "published") {
      publishButton.textContent = "Published";
      publishButton.disabled = true;
      publishButton.title = "This experience is already published.";
      return;
    }

    publishButton.textContent = "Publish";
    publishButton.disabled = false;
    publishButton.removeAttribute("title");
  }

  function validate({ forPublish }) {
    const rules = {
      title: { label: "Title", required: true, maxLength: LIMITS.title },
      type: { label: "Type", maxLength: LIMITS.type },
      role: { label: "Role", maxLength: LIMITS.role },
      location: { label: "Location", maxLength: LIMITS.location }
    };

    if (forPublish) {
      /*
        The database only requires `title`. Requiring a description before
        publishing is an application-level rule so a published card can never
        render empty; Save Draft stays permissive.
      */
      rules.description = { label: "Description", required: true };
    }

    const ok = applyValidation(fields, rules);

    if (!ok) {
      toast("Please correct the highlighted fields.", "error");
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

    setBusy(true, forPublish ? "Publishing..." : "Saving...");

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
    heading.textContent = trimmed(fields.title.value) || "Untitled experience";
    refreshStatusUi();
    resetBaseline();

    if (!forPublish) {
      toast(isNewLabelUsed() ? "Draft saved." : "Changes saved successfully.");
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

    setBusy(true, "Publishing...");

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

      toast("Could not publish this experience. It is still saved as a draft.", "error");
      return;
    }

    state.status = data[0].status;
    state.publishedAt = data[0].published_at;
    state.updatedAtValue = data[0].updated_at;

    refreshStatusUi();
    toast("Experience published.");

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

    if (haystack.includes("experience_tags_experience_label_lower_unique")) {
      return "This experience already has a tag with that label.";
    }

    if (haystack.includes("experiences_status_check")) {
      return "That status is not allowed.";
    }

    if (haystack.includes("row-level security") || haystack.includes("42501")) {
      return "Your session is not authorized for this change. Sign in again and retry.";
    }

    return "Could not save this experience. Your changes are still here.";
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
