/*
  Organization tab (Phase 6).

  Three parts:

    1. about_organization singleton text, saved through "Save Changes";
    2. about_organization_skills, an ordered list with its own mutations;
    3. about_gallery, an ordered list whose rows own Storage objects.

  The gallery is the only list in this phase that touches Storage, so it uses
  the safe-replace and delete ordering from js/core/media-storage.js:

    add     upload pair -> insert row (upload rolled back if the insert fails)
    replace upload pair -> update row -> delete old objects
    remove  delete row  -> delete objects (an orphan file beats a dead row)
    disable is_active = false, Storage untouched
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

import {
  replaceMedia,
  uploadVariantPair,
  removeObjects,
  publicUrl,
  newMediaId,
  MEDIA_BUCKET
} from "../../core/media-storage.js";

import { createMediaField } from "./media-field.js";
import { createOrderedList } from "./ordered-list.js";

const LIMITS = {
  heading: 160,
  highlight: 160,
  skillTitle: 120,
  skillDescription: 500,
  galleryAlt: 250,
  galleryCaption: 300
};

export function createOrganizationTab({ organization, onDirtyChange }) {
  const root = el("div", "profile-tab-panel");

  /* ---------------- singleton text ---------------- */

  const fields = {
    heading: textField({
      id: "org-heading",
      label: "Heading",
      required: true,
      maxLength: LIMITS.heading,
      value: organization.heading_main
    }),
    highlight: textField({
      id: "org-highlight",
      label: "Highlighted Text",
      maxLength: LIMITS.highlight,
      value: organization.heading_highlight
    }),
    paragraph1: textareaField({
      id: "org-paragraph-1",
      label: "Paragraph 1",
      required: true,
      value: organization.paragraph_1,
      rows: 5,
      help: "Plain text only. No HTML or formatting markup."
    }),
    paragraph2: textareaField({
      id: "org-paragraph-2",
      label: "Paragraph 2",
      value: organization.paragraph_2,
      rows: 5
    })
  };

  const textSection = el("section", "admin-subsection");
  append(textSection, el("h3", "subsection-title", "Organization Content"));

  const grid = el("div", "form-grid");
  append(grid, fields.heading.node, fields.highlight.node);
  append(textSection, grid, fields.paragraph1.node, fields.paragraph2.node);

  const actions = el("div", "form-actions");

  const previewButton = el("button", "admin-button admin-button-secondary", "Preview");
  previewButton.type = "button";

  const saveButton = el("button", "admin-button admin-button-primary", "Save Changes");
  saveButton.type = "button";

  append(actions, previewButton, saveButton);

  /* ---------------- skills ---------------- */

  const skills = createOrderedList({
    table: "about_organization_skills",
    title: "Organization Skills",
    addLabel: "+ Add Skill",
    emptyTitle: "No organization skills yet.",
    emptyDescription: "Add the first skill shown in your Organization section.",
    selectColumns: "id, title, description, sort_order, is_active, created_at",
    describeRow: row => row.title,
    renderRow: row => {
      const wrap = el("div", "ordered-row-main");
      const head = el("div", "ordered-row-head");
      append(head, el("span", "ordered-title", row.title));

      if (row.is_active === false) {
        append(head, el("span", "status-badge status-badge-disabled", "Disabled"));
      }

      append(wrap, head, el("p", "ordered-description", row.description));

      return wrap;
    },
    removeConfirm: row => ({
      title: `Remove "${row.title}"?`,
      lines: [
        "This skill will be permanently removed from your Organization section.",
        "This cannot be undone."
      ],
      confirmLabel: "Remove",
      variant: "danger"
    }),
    onAdd: api => openSkillEditor(null, api),
    onEdit: (row, api) => openSkillEditor(row, api)
  });

  function openSkillEditor(existing, api) {
    const isNew = !existing;
    const form = el("form", "modal-form");
    form.noValidate = true;

    const formError = el("p", "form-error");
    formError.setAttribute("role", "alert");

    const title = textField({
      id: "skill-title",
      label: "Title",
      required: true,
      maxLength: LIMITS.skillTitle,
      value: existing ? existing.title : ""
    });

    const description = textareaField({
      id: "skill-description",
      label: "Description",
      required: true,
      maxLength: LIMITS.skillDescription,
      value: existing ? existing.description : "",
      rows: 4
    });

    const active = checkboxField({
      id: "skill-active",
      label: "Active",
      checked: existing ? existing.is_active !== false : true
    });

    append(form, formError, title.node, description.node, active.node);

    const submit = el("button", "visually-hidden");
    submit.type = "submit";
    submit.tabIndex = -1;
    append(form, submit);

    const initialSnapshot = JSON.stringify([title.value, description.value, active.value]);

    const controller = openModal({
      title: isNew ? "Add Skill" : "Edit Skill",
      body: form,
      actions: [
        { label: "Cancel", variant: "secondary", onClick: ctl => ctl.requestClose("cancel") },
        {
          label: isNew ? "Add Skill" : "Save Changes",
          variant: "primary",
          onClick: () => persist()
        }
      ],
      onRequestClose: async () => {
        if (JSON.stringify([title.value, description.value, active.value]) === initialSnapshot) {
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
      formError.textContent = "";

      const ok = applyValidation(
        { title, description },
        {
          title: { label: "Title", required: true, maxLength: LIMITS.skillTitle },
          description: {
            label: "Description",
            required: true,
            maxLength: LIMITS.skillDescription
          }
        }
      );

      if (!ok) {
        return;
      }

      controller.setBusy(true, isNew ? "Adding..." : "Saving...");

      const payload = {
        title: trimmed(title.value),
        description: trimmed(description.value),
        is_active: active.value
      };

      let result;

      if (isNew) {
        payload.sort_order = api.nextSortOrder();
        result = await supabaseClient
          .from("about_organization_skills")
          .insert(payload)
          .select("id");
      } else {
        result = await supabaseClient
          .from("about_organization_skills")
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
          "Could not save this skill. Your session may not be authorized.";
        return;
      }

      controller.close();
      toast(isNew ? "Skill added." : "Changes saved successfully.");
      await api.reload();
    }
  }

  /* ---------------- gallery ---------------- */

  const gallery = createOrderedList({
    table: "about_gallery",
    title: "Organization Gallery",
    addLabel: "+ Add Photo",
    emptyTitle: "No gallery photos yet.",
    emptyDescription: "Add your first organization photo.",
    selectColumns:
      "id, bucket_name, desktop_path, mobile_path, alt_text, caption, sort_order, is_active, created_at",
    describeRow: row => row.alt_text || "gallery photo",
    renderRow: row => {
      const wrap = el("div", "ordered-row-main gallery-row");

      const thumbWrap = el("div", "gallery-thumb");
      const url = publicUrl(row.bucket_name, row.desktop_path);

      if (url) {
        const img = el("img", "gallery-thumb-image");
        img.src = url;
        img.alt = row.alt_text || "Gallery photo";
        img.loading = "lazy";
        img.addEventListener("error", () => {
          clear(thumbWrap);
          append(thumbWrap, el("span", "gallery-thumb-fallback", "Image unavailable"));
        });
        append(thumbWrap, img);
      } else {
        append(thumbWrap, el("span", "gallery-thumb-fallback", "No image"));
      }

      const meta = el("div", "gallery-meta");
      const head = el("div", "ordered-row-head");
      append(head, el("span", "ordered-title", row.alt_text || "Untitled photo"));
      append(
        head,
        el(
          "span",
          row.is_active === false
            ? "status-badge status-badge-disabled"
            : "status-badge status-badge-active",
          row.is_active === false ? "Disabled" : "Active"
        )
      );

      append(meta, head);

      if (row.caption) {
        append(meta, el("p", "ordered-description", row.caption));
      }

      append(wrap, thumbWrap, meta);

      return wrap;
    },
    removeConfirm: row => ({
      title: "Remove this gallery photo?",
      lines: [
        row.alt_text ? `"${row.alt_text}"` : "This photo",
        "The photo and its stored image files will be permanently removed.",
        "This cannot be undone."
      ],
      confirmLabel: "Remove",
      variant: "danger"
    }),
    onAfterRemove: async row => {
      const result = await removeObjects(row.bucket_name || MEDIA_BUCKET, [
        row.desktop_path,
        row.mobile_path
      ]);

      return result.failed.length > 0
        ? "Photo removed. Its stored image files could not be deleted and may need manual cleanup."
        : null;
    },
    onAdd: api => openGalleryEditor(null, api),
    onEdit: (row, api) => openGalleryEditor(row, api)
  });

  function openGalleryEditor(existing, api) {
    const isNew = !existing;
    const form = el("form", "modal-form");
    form.noValidate = true;

    const formError = el("p", "form-error");
    formError.setAttribute("role", "alert");

    const media = createMediaField({
      title: isNew ? "Photo" : "Current Photo",
      emptyText: isNew ? "Choose an image to add." : "No image configured.",
      current:
        existing && existing.desktop_path
          ? {
              bucket: existing.bucket_name || MEDIA_BUCKET,
              desktopPath: existing.desktop_path,
              mobilePath: existing.mobile_path
            }
          : null,
      onChange: () => {
        formError.textContent = "";
      }
    });

    const alt = textField({
      id: "gallery-alt",
      label: "Alt Text",
      required: true,
      maxLength: LIMITS.galleryAlt,
      value: existing ? existing.alt_text : "",
      help: "Required. Describes the photo for screen readers."
    });

    const caption = textField({
      id: "gallery-caption",
      label: "Caption",
      maxLength: LIMITS.galleryCaption,
      value: existing ? existing.caption : "",
      help: "Optional."
    });

    const active = checkboxField({
      id: "gallery-active",
      label: "Active",
      checked: existing ? existing.is_active !== false : true,
      help: "Disabled photos keep their files but are hidden from the public gallery."
    });

    append(form, formError, media.element, alt.node, caption.node, active.node);

    const controller = openModal({
      title: isNew ? "Add Photo" : "Edit Photo",
      body: form,
      actions: [
        { label: "Cancel", variant: "secondary", onClick: ctl => ctl.requestClose("cancel") },
        {
          label: isNew ? "Add Photo" : "Save Changes",
          variant: "primary",
          onClick: () => persist()
        }
      ],
      onRequestClose: async () => {
        if (!media.hasPending() && trimmed(alt.value) === trimmed(existing ? existing.alt_text : "") &&
            trimmed(caption.value) === trimmed(existing ? existing.caption : "")) {
          return true;
        }

        return await confirmDialog({
          title: "Discard changes?",
          lines: ["You have unsaved changes in this form."],
          confirmLabel: "Discard",
          cancelLabel: "Keep Editing",
          variant: "danger"
        });
      },
      onClosed: () => media.destroy()
    });

    async function persist() {
      formError.textContent = "";

      const ok = applyValidation(
        { alt, caption },
        {
          alt: { label: "Alt Text", required: true, maxLength: LIMITS.galleryAlt },
          caption: { label: "Caption", maxLength: LIMITS.galleryCaption }
        }
      );

      if (!ok) {
        return;
      }

      const files = media.getPendingFiles();

      if (isNew && !files) {
        formError.textContent = "Choose an image before adding this photo.";
        return;
      }

      const metadata = {
        alt_text: trimmed(alt.value),
        caption: trimmedOrNull(caption.value),
        is_active: active.value
      };

      controller.setBusy(true, files ? "Uploading..." : "Saving...");

      try {
        if (isNew) {
          // Upload first, then insert. A failed insert removes the objects.
          const uploaded = await uploadVariantPair({
            directory: `about/gallery/${newMediaId()}`,
            desktopFile: files.desktopFile,
            mobileFile: files.mobileFile
          });

          const { data, error } = await supabaseClient
            .from("about_gallery")
            .insert({
              ...metadata,
              bucket_name: uploaded.bucket,
              desktop_path: uploaded.desktopPath,
              mobile_path: uploaded.mobilePath,
              sort_order: api.nextSortOrder()
            })
            .select("id");

          if (error || !data || data.length === 0) {
            await removeObjects(uploaded.bucket, [
              uploaded.desktopPath,
              uploaded.mobilePath
            ]);

            throw error || new Error("about_gallery insert did not apply");
          }

          controller.setBusy(false);
          controller.close();
          toast("Photo added.");
          await api.reload();
          return;
        }

        if (!files) {
          const { data, error } = await supabaseClient
            .from("about_gallery")
            .update(metadata)
            .eq("id", existing.id)
            .select("id");

          if (error || !data || data.length === 0) {
            throw error || new Error("about_gallery update did not apply");
          }

          controller.setBusy(false);
          controller.close();
          toast("Changes saved successfully.");
          await api.reload();
          return;
        }

        const result = await replaceMedia({
          directory: `about/gallery/${newMediaId()}`,
          desktopFile: files.desktopFile,
          mobileFile: files.mobileFile,
          previous: {
            bucket: existing.bucket_name || MEDIA_BUCKET,
            desktopPath: existing.desktop_path,
            mobilePath: existing.mobile_path
          },
          commit: async paths => {
            const { data, error } = await supabaseClient
              .from("about_gallery")
              .update({
                ...metadata,
                bucket_name: paths.bucket,
                desktop_path: paths.desktopPath,
                mobile_path: paths.mobilePath
              })
              .eq("id", existing.id)
              .select("id");

            if (error || !data || data.length === 0) {
              throw error || new Error("about_gallery update did not apply");
            }
          }
        });

        controller.setBusy(false);
        controller.close();
        toast(result.cleanupWarning || "Changes saved successfully.", result.cleanupWarning ? "error" : "success");
        await api.reload();
      } catch (error) {
        console.error(error);
        controller.setBusy(false);
        formError.textContent =
          error && error.name === "MediaStorageError"
            ? error.message
            : "Could not save this photo. Any previous image is unchanged.";
      }
    }
  }

  append(root, textSection, actions, skills.element, gallery.element);

  /* ---------------- dirty tracking ---------------- */

  function snapshot() {
    return JSON.stringify({
      heading: trimmed(fields.heading.value),
      highlight: trimmed(fields.highlight.value),
      paragraph1: trimmed(fields.paragraph1.value),
      paragraph2: trimmed(fields.paragraph2.value)
    });
  }

  let baseline = snapshot();
  let dirty = false;
  let saving = false;

  function computeDirty() {
    return snapshot() !== baseline;
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
      paragraph1: { label: "Paragraph 1", required: true },
      paragraph2: { label: "Paragraph 2" }
    });

    if (!valid) {
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    setSaving(true, "Saving...");

    const { data, error } = await supabaseClient
      .from("about_organization")
      .update({
        heading_main: trimmedOrNull(fields.heading.value),
        heading_highlight: trimmedOrNull(fields.highlight.value),
        paragraph_1: trimmedOrNull(fields.paragraph1.value),
        paragraph_2: trimmedOrNull(fields.paragraph2.value)
      })
      .eq("singleton_key", 1)
      .select("id");

    setSaving(false);

    if (error || !data || data.length === 0) {
      if (error) {
        console.error(error);
      }

      toast("Could not save the Organization content. Your changes are still here.", "error");
      return false;
    }

    toast("Changes saved successfully.");
    return true;
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

    append(
      body,
      previewLine("Heading", fields.heading.value),
      previewLine("Highlighted Text", fields.highlight.value),
      previewLine("Paragraph 1", fields.paragraph1.value),
      previewLine("Paragraph 2", fields.paragraph2.value)
    );

    const skillRows = skills.getRows();
    const skillBlock = el("div", "preview-line");
    append(skillBlock, el("span", "preview-label", "Organization Skills"));

    if (skillRows.length === 0) {
      append(skillBlock, el("p", "preview-value", "—"));
    } else {
      const list = el("ul", "preview-list");
      skillRows.forEach(row => {
        const item = el("li", "preview-list-item preview-list-item-block");
        append(item, el("strong", null, row.title), el("span", null, row.description));

        if (row.is_active === false) {
          append(item, el("span", "status-badge status-badge-disabled", "Disabled"));
        }

        append(list, item);
      });
      append(skillBlock, list);
    }

    append(body, skillBlock);

    const galleryRows = gallery.getRows();
    const galleryBlock = el("div", "preview-line");
    append(galleryBlock, el("span", "preview-label", "Organization Gallery"));

    if (galleryRows.length === 0) {
      append(galleryBlock, el("p", "preview-value", "—"));
    } else {
      const strip = el("div", "preview-photo-grid");

      galleryRows.forEach(row => {
        const figure = el("figure", "preview-photo");
        const url = publicUrl(row.bucket_name, row.desktop_path);

        if (url) {
          const img = el("img", "preview-photo-image");
          img.src = url;
          img.alt = row.alt_text || "Gallery photo";
          append(figure, img);
        } else {
          append(figure, el("p", "media-field-empty", "No image"));
        }

        const caption = el("figcaption", "preview-photo-caption");
        append(caption, el("span", "preview-photo-title", row.alt_text || "Untitled"));

        if (row.is_active === false) {
          append(caption, el("span", "status-badge status-badge-disabled", "Disabled"));
        }

        append(figure, caption);
        append(strip, figure);
      });

      append(galleryBlock, strip);
    }

    append(body, galleryBlock);

    openModal({
      title: "Organization preview",
      description:
        "Read-only preview of the current form values, including unsaved changes. This is an Admin content preview, not the public Organization layout.",
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

  skills.load();
  gallery.load();

  return {
    element: root,
    isDirty: computeDirty,
    save,
    resetDirty: resetDirtyBaseline,
    destroy() {
      clear(root);
    }
  };
}
