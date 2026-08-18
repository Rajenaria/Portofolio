/*
  About Me tab (Phase 6).

  Two independent parts:

    1. the About text + photo on the profile_content singleton, saved together
       through "Save Changes";
    2. the Area of Interest list (about_interests), which persists through its
       own explicit add/edit/reorder/remove mutations exactly like the other
       ordered collections.

  Keeping (2) outside the form save is deliberate: list mutations are already
  atomic and immediate, so a half-saved list can never exist.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { openModal, confirmDialog } from "../../core/modal.js";

import {
  textField,
  textareaField,
  checkboxField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import { replaceMedia, MEDIA_BUCKET } from "../../core/media-storage.js";
import { createMediaField } from "./media-field.js";
import { createOrderedList } from "./ordered-list.js";

const LIMITS = {
  heading: 160,
  highlight: 160,
  lead: 600,
  photoAlt: 250,
  interestLabel: 120
};

export function createAboutTab({ profile, onDirtyChange }) {
  const root = el("div", "profile-tab-panel");

  /* ---------------- photo ---------------- */

  const photoSection = el("section", "admin-subsection");
  append(photoSection, el("h3", "subsection-title", "About Photo"));

  const media = createMediaField({
    title: "About Photo",
    emptyText: "No image configured.",
    current: profile.about_photo_desktop_path
      ? {
          bucket: profile.about_photo_bucket || MEDIA_BUCKET,
          desktopPath: profile.about_photo_desktop_path,
          mobilePath: profile.about_photo_mobile_path
        }
      : null,
    onChange: markDirty
  });

  const photoAlt = textField({
    id: "about-photo-alt",
    label: "Photo Alt Text",
    maxLength: LIMITS.photoAlt,
    value: profile.about_photo_alt,
    help: "Describes the About photo for screen readers."
  });

  append(photoSection, media.element, photoAlt.node);

  /* ---------------- text ---------------- */

  const fields = {
    heading: textField({
      id: "about-heading",
      label: "Heading",
      required: true,
      maxLength: LIMITS.heading,
      value: profile.about_heading_main
    }),
    highlight: textField({
      id: "about-highlight",
      label: "Highlighted Text",
      maxLength: LIMITS.highlight,
      value: profile.about_heading_highlight,
      help: "Optional emphasised part of the heading."
    }),
    lead: textareaField({
      id: "about-lead",
      label: "Lead Paragraph",
      required: true,
      maxLength: LIMITS.lead,
      value: profile.about_lead,
      rows: 3
    }),
    description: textareaField({
      id: "about-description",
      label: "Description",
      required: true,
      value: profile.about_description,
      rows: 7,
      help: "Plain text only. No HTML or formatting markup."
    }),
    photoAlt
  };

  const textSection = el("section", "admin-subsection");
  append(textSection, el("h3", "subsection-title", "About Content"));

  const grid = el("div", "form-grid");
  append(grid, fields.heading.node, fields.highlight.node);
  append(textSection, grid, fields.lead.node, fields.description.node);

  const actions = el("div", "form-actions");

  const previewButton = el("button", "admin-button admin-button-secondary", "Preview");
  previewButton.type = "button";

  const saveButton = el("button", "admin-button admin-button-primary", "Save Changes");
  saveButton.type = "button";

  append(actions, previewButton, saveButton);

  /* ---------------- interests ---------------- */

  const interests = createOrderedList({
    table: "about_interests",
    title: "Area of Interest",
    addLabel: "+ Add Interest",
    emptyTitle: "No interests yet.",
    emptyDescription: "Add your first Area of Interest.",
    selectColumns: "id, label, sort_order, is_active, created_at",
    describeRow: row => row.label,
    renderRow: row => {
      const wrap = el("div", "ordered-row-main");
      append(wrap, el("span", "ordered-title", row.label));

      if (row.is_active === false) {
        append(wrap, el("span", "status-badge status-badge-disabled", "Disabled"));
      }

      return wrap;
    },
    removeConfirm: row => ({
      title: `Remove "${row.label}"?`,
      lines: [
        "This Area of Interest will be permanently removed from your About section.",
        "This cannot be undone."
      ],
      confirmLabel: "Remove",
      variant: "danger"
    }),
    onAdd: api => openInterestEditor(null, api),
    onEdit: (row, api) => openInterestEditor(row, api)
  });

  append(root, photoSection, textSection, actions, interests.element);

  function openInterestEditor(existing, api) {
    const isNew = !existing;
    const form = el("form", "modal-form");
    form.noValidate = true;

    const formError = el("p", "form-error");
    formError.setAttribute("role", "alert");

    const label = textField({
      id: "interest-label",
      label: "Label",
      required: true,
      maxLength: LIMITS.interestLabel,
      value: existing ? existing.label : "",
      help: "Plain text, for example: Embedded Systems."
    });

    const active = checkboxField({
      id: "interest-active",
      label: "Active",
      checked: existing ? existing.is_active !== false : true,
      help: "Inactive interests stay stored but are hidden from the public site."
    });

    append(form, formError, label.node, active.node);

    const submit = el("button", "visually-hidden");
    submit.type = "submit";
    submit.tabIndex = -1;
    append(form, submit);

    const initialSnapshot = JSON.stringify([label.value, active.value]);

    const controller = openModal({
      title: isNew ? "Add Interest" : "Edit Interest",
      body: form,
      actions: [
        { label: "Cancel", variant: "secondary", onClick: ctl => ctl.requestClose("cancel") },
        {
          label: isNew ? "Add Interest" : "Save Changes",
          variant: "primary",
          onClick: () => persist()
        }
      ],
      onRequestClose: async () => {
        if (JSON.stringify([label.value, active.value]) === initialSnapshot) {
          return true;
        }

        return await confirmDialog({
          title: "Discard changes?",
          lines: ["You have unsaved changes in this form."],
          confirmLabel: "Discard",
          cancelLabel: "Keep Editing",
          variant: "danger"
        });
      }
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      persist();
    });

    async function persist() {
      label.setError("");
      formError.textContent = "";

      const value = trimmed(label.value);

      if (value === "") {
        label.setError("Label is required.");
        label.focus();
        return;
      }

      if (value.length > LIMITS.interestLabel) {
        label.setError(`Label must be ${LIMITS.interestLabel} characters or fewer.`);
        label.focus();
        return;
      }

      controller.setBusy(true, isNew ? "Adding..." : "Saving...");

      const payload = { label: value, is_active: active.value };

      let result;

      if (isNew) {
        payload.sort_order = api.nextSortOrder();
        result = await supabaseClient.from("about_interests").insert(payload).select("id");
      } else {
        result = await supabaseClient
          .from("about_interests")
          .update(payload)
          .eq("id", existing.id)
          .select("id");
      }

      controller.setBusy(false);

      if (result.error || !result.data || result.data.length === 0) {
        if (result.error) {
          console.error(result.error);
        }

        formError.textContent =
          "Could not save this interest. Your session may not be authorized.";
        return;
      }

      controller.close();
      toast(isNew ? "Interest added." : "Changes saved successfully.");
      await api.reload();
    }
  }

  /* ---------------- dirty tracking ---------------- */

  function snapshot() {
    return JSON.stringify({
      heading: trimmed(fields.heading.value),
      highlight: trimmed(fields.highlight.value),
      lead: trimmed(fields.lead.value),
      description: trimmed(fields.description.value),
      photoAlt: trimmed(fields.photoAlt.value)
    });
  }

  let baseline = snapshot();
  let dirty = false;
  let saving = false;

  function computeDirty() {
    return snapshot() !== baseline || media.hasPending();
  }

  function markDirty() {
    const next = computeDirty();

    if (next !== dirty) {
      dirty = next;
      onDirtyChange(dirty);
    }
  }

  [fields.heading, fields.highlight, fields.lead, fields.description, fields.photoAlt]
    .forEach(field => field.control.addEventListener("input", markDirty));

  function resetDirtyBaseline() {
    baseline = snapshot();
    dirty = false;
    onDirtyChange(false);
  }

  /* ---------------- save ---------------- */

  function setSaving(next, label) {
    saving = next;
    saveButton.disabled = next;
    previewButton.disabled = next;
    saveButton.textContent = next ? label || "Saving..." : "Save Changes";
  }

  async function save() {
    if (saving) {
      return false;
    }

    const valid = applyValidation(fields, {
      heading: { label: "Heading", required: true, maxLength: LIMITS.heading },
      highlight: { label: "Highlighted Text", maxLength: LIMITS.highlight },
      lead: { label: "Lead Paragraph", required: true, maxLength: LIMITS.lead },
      description: { label: "Description", required: true },
      photoAlt: { label: "Photo Alt Text", maxLength: LIMITS.photoAlt }
    });

    if (!valid) {
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    setSaving(true, "Saving...");

    const textPayload = {
      about_heading_main: trimmedOrNull(fields.heading.value),
      about_heading_highlight: trimmedOrNull(fields.highlight.value),
      about_lead: trimmedOrNull(fields.lead.value),
      about_description: trimmedOrNull(fields.description.value),
      about_photo_alt: trimmedOrNull(fields.photoAlt.value)
    };

    const files = media.getPendingFiles();

    if (!files) {
      const { data, error } = await supabaseClient
        .from("profile_content")
        .update(textPayload)
        .eq("singleton_key", 1)
        .select("id");

      setSaving(false);

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(error);
        }

        toast("Could not save the About content. Your changes are still here.", "error");
        return false;
      }

      toast("Changes saved successfully.");
      return true;
    }

    setSaving(true, "Uploading...");

    try {
      const result = await replaceMedia({
        directory: "about/profile",
        desktopFile: files.desktopFile,
        mobileFile: files.mobileFile,
        previous: media.getStored(),
        commit: async paths => {
          const { data, error } = await supabaseClient
            .from("profile_content")
            .update({
              ...textPayload,
              about_photo_bucket: paths.bucket,
              about_photo_desktop_path: paths.desktopPath,
              about_photo_mobile_path: paths.mobilePath
            })
            .eq("singleton_key", 1)
            .select("id");

          if (error || !data || data.length === 0) {
            throw new Error("profile_content update did not apply");
          }
        }
      });

      media.commit({
        bucket: result.paths.bucket,
        desktopPath: result.paths.desktopPath,
        mobilePath: result.paths.mobilePath
      });

      setSaving(false);
      toast(result.cleanupWarning || "Changes saved successfully.", result.cleanupWarning ? "error" : "success");
      return true;
    } catch (error) {
      console.error(error);
      setSaving(false);
      toast(
        error && error.name === "MediaStorageError"
          ? error.message
          : "Could not replace the About photo. The previous image is unchanged.",
        "error"
      );
      return false;
    }
  }

  saveButton.addEventListener("click", async () => {
    const saved = await save();

    if (saved) {
      resetDirtyBaseline();
    }
  });

  /* ---------------- preview ---------------- */

  previewButton.addEventListener("click", () => {
    const body = el("div", "content-preview");

    const url = media.getPreviewUrl();

    if (url) {
      const figure = el("figure", "preview-photo");
      const img = el("img", "preview-photo-image");
      img.src = url;
      img.alt = trimmed(fields.photoAlt.value) || "About photo";
      append(figure, img);

      const caption = el("figcaption", "preview-photo-caption");
      append(caption, el("span", "preview-photo-title", "About Photo"));

      if (media.hasPending()) {
        append(caption, el("span", "status-badge status-badge-pending", "Pending"));
      }

      append(figure, caption);
      append(body, figure);
    } else {
      append(body, el("p", "media-field-empty", "No About photo configured."));
    }

    append(
      body,
      previewLine("Heading", fields.heading.value),
      previewLine("Highlighted Text", fields.highlight.value),
      previewLine("Lead Paragraph", fields.lead.value),
      previewLine("Description", fields.description.value),
      previewLine("Photo Alt Text", fields.photoAlt.value)
    );

    const rows = interests.getRows();
    const listBlock = el("div", "preview-line");
    append(listBlock, el("span", "preview-label", "Area of Interest"));

    if (rows.length === 0) {
      append(listBlock, el("p", "preview-value", "—"));
    } else {
      const list = el("ul", "preview-list");
      rows.forEach(row => {
        const item = el("li", "preview-list-item");
        append(item, el("span", null, row.label));

        if (row.is_active === false) {
          append(item, el("span", "status-badge status-badge-disabled", "Disabled"));
        }

        append(list, item);
      });
      append(listBlock, list);
    }

    append(body, listBlock);

    openModal({
      title: "About preview",
      description:
        "Read-only preview of the current form values, including unsaved changes. This is an Admin content preview, not the public About layout.",
      body,
      actions: [{ label: "Close", variant: "secondary", onClick: ctl => ctl.close() }]
    });
  });

  function previewLine(label, value) {
    const block = el("div", "preview-line");
    append(
      block,
      el("span", "preview-label", label),
      el("p", "preview-value", trimmed(value) || "—")
    );
    return block;
  }

  interests.load();

  return {
    element: root,
    isDirty: computeDirty,
    save,
    resetDirty: resetDirtyBaseline,
    destroy() {
      media.destroy();
      clear(root);
    }
  };
}
