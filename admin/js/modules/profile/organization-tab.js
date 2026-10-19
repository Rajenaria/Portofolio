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
import { t } from "../../core/i18n.js";

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
      label: t("about.fieldHeading"),
      required: true,
      maxLength: LIMITS.heading,
      value: organization.heading_main
    }),
    highlight: textField({
      id: "org-highlight",
      label: t("about.fieldHighlight"),
      maxLength: LIMITS.highlight,
      value: organization.heading_highlight
    }),
    paragraph1: textareaField({
      id: "org-paragraph-1",
      label: t("org.fieldParagraph1"),
      required: true,
      value: organization.paragraph_1,
      rows: 5,
      help: t("about.fieldDescriptionHelp")
    }),
    paragraph2: textareaField({
      id: "org-paragraph-2",
      label: t("org.fieldParagraph2"),
      value: organization.paragraph_2,
      rows: 5
    })
  };

  /* One shape for every group, matching the editors in the other modules. */
  function group(titleKey, helpKey) {
    const node = el("section", "admin-subsection");

    append(node, el("h3", "subsection-title", t(titleKey)));

    if (helpKey) {
      append(node, el("p", "form-help", t(helpKey)));
    }

    return node;
  }

  const textSection = group("org.contentTitle", "org.contentHelp");

  const grid = el("div", "form-grid");
  append(grid, fields.heading.node, fields.highlight.node);
  append(textSection, grid, fields.paragraph1.node, fields.paragraph2.node);

  const actions = el("div", "form-actions");

  const previewButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("common.preview")
  );
  previewButton.type = "button";

  const saveButton = el("button", "admin-button admin-button-primary", t("common.saveChanges"));
  saveButton.type = "button";

  append(actions, previewButton, saveButton);

  /* ---------------- skills ---------------- */

  const skills = createOrderedList({
    table: "about_organization_skills",
    title: t("org.skillsTitle"),
    addLabel: t("org.skillAdd"),
    emptyTitle: t("org.skillEmpty"),
    emptyDescription: t("org.skillEmptyHelp"),
    selectColumns: "id, title, description, sort_order, is_active, created_at",
    describeRow: row => row.title,
    renderRow: row => {
      const wrap = el("div", "ordered-row-main");
      const head = el("div", "ordered-row-head");
      append(head, el("span", "ordered-title", row.title));

      if (row.is_active === false) {
        append(head, el("span", "status-badge status-badge-disabled", t("status.inactive")));
      }

      append(wrap, head, el("p", "ordered-description", row.description));

      return wrap;
    },
    removeConfirm: row => ({
      title: t("org.skillRemoveTitle", { title: row.title }),
      lines: [t("org.skillRemoveLine"), t("confirm.cannotBeUndone")],
      confirmLabel: t("common.remove"),
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
      label: t("common.title"),
      required: true,
      maxLength: LIMITS.skillTitle,
      value: existing ? existing.title : ""
    });

    const description = textareaField({
      id: "skill-description",
      label: t("common.description"),
      required: true,
      maxLength: LIMITS.skillDescription,
      value: existing ? existing.description : "",
      rows: 4
    });

    const active = checkboxField({
      id: "skill-active",
      label: t("status.active"),
      checked: existing ? existing.is_active !== false : true
    });

    append(form, formError, title.node, description.node, active.node);

    const submit = el("button", "visually-hidden");
    submit.type = "submit";
    submit.tabIndex = -1;
    append(form, submit);

    const initialSnapshot = JSON.stringify([title.value, description.value, active.value]);

    const controller = openModal({
      title: t(isNew ? "org.skillAddTitle" : "org.skillEditTitle"),
      body: form,
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: t(isNew ? "org.skillAddTitle" : "common.saveChanges"),
          variant: "primary",
          onClick: () => persist()
        }
      ],
      onRequestClose: async () => {
        if (JSON.stringify([title.value, description.value, active.value]) === initialSnapshot) {
          return true;
        }

        return await confirmDialog({
          title: t("discard.title"),
          lines: [t("discard.line")],
          confirmLabel: t("discard.confirm"),
          cancelLabel: t("discard.cancel"),
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
          title: {
            label: t("common.title"),
            required: true,
            maxLength: LIMITS.skillTitle
          },
          description: {
            label: t("common.description"),
            required: true,
            maxLength: LIMITS.skillDescription
          }
        }
      );

      if (!ok) {
        return;
      }

      controller.setBusy(true, t(isNew ? "common.adding" : "common.saving"));

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

        formError.textContent = t("org.skillErrSave");
        return;
      }

      controller.close();
      toast(t(isNew ? "org.skillAdded" : "about.saved"));
      await api.reload();
    }
  }

  /* ---------------- gallery ---------------- */

  const gallery = createOrderedList({
    table: "about_gallery",
    title: t("org.galleryTitle"),
    addLabel: t("org.galleryAdd"),
    emptyTitle: t("org.galleryEmpty"),
    emptyDescription: t("org.galleryEmptyHelp"),
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
        img.alt = row.alt_text || t("org.galleryPhoto");
        img.loading = "lazy";
        img.addEventListener("error", () => {
          clear(thumbWrap);
          append(
            thumbWrap,
            el("span", "gallery-thumb-fallback", t("org.galleryUnavailable"))
          );
        });
        append(thumbWrap, img);
      } else {
        append(thumbWrap, el("span", "gallery-thumb-fallback", t("projMedia.noImage")));
      }

      const meta = el("div", "gallery-meta");
      const head = el("div", "ordered-row-head");
      append(
        head,
        el("span", "ordered-title", row.alt_text || t("org.galleryUntitled"))
      );
      append(
        head,
        el(
          "span",
          row.is_active === false
            ? "status-badge status-badge-disabled"
            : "status-badge status-badge-active",
          t(row.is_active === false ? "status.inactive" : "status.active")
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
      title: t("org.photoRemoveTitle"),
      lines: [
        row.alt_text ? `"${row.alt_text}"` : t("projMedia.thisImage"),
        t("org.photoRemoveLine"),
        t("confirm.cannotBeUndone")
      ],
      confirmLabel: t("common.remove"),
      variant: "danger"
    }),
    onAfterRemove: async row => {
      const result = await removeObjects(row.bucket_name || MEDIA_BUCKET, [
        row.desktop_path,
        row.mobile_path
      ]);

      return result.failed.length > 0
        ? t("org.photoCleanupWarning")
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
      title: t(isNew ? "org.photoField" : "org.photoCurrent"),
      emptyText: t(isNew ? "org.photoChoose" : "pmedia.empty"),
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
      label: t("projMedia.altLabel"),
      required: true,
      maxLength: LIMITS.galleryAlt,
      value: existing ? existing.alt_text : "",
      help: t("org.photoAltHelp")
    });

    const caption = textField({
      id: "gallery-caption",
      label: t("common.caption"),
      maxLength: LIMITS.galleryCaption,
      value: existing ? existing.caption : "",
      help: t("org.photoCaptionHelp")
    });

    const active = checkboxField({
      id: "gallery-active",
      label: t("status.active"),
      checked: existing ? existing.is_active !== false : true,
      help: t("org.photoActiveHelp")
    });

    append(form, formError, media.element, alt.node, caption.node, active.node);

    const controller = openModal({
      title: t(isNew ? "org.photoAddTitle" : "org.photoEditTitle"),
      isDirty: () => media.hasPending() || trimmed(alt.value) !== trimmed(existing ? existing.alt_text : "") ||
        trimmed(caption.value) !== trimmed(existing ? existing.caption : "") ||
        active.value !== (existing ? existing.is_active : true),
      body: form,
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: t(isNew ? "org.photoAddTitle" : "common.saveChanges"),
          variant: "primary",
          onClick: () => persist()
        }
      ],
      onRequestClose: async () => {
        if (!media.hasPending() && trimmed(alt.value) === trimmed(existing ? existing.alt_text : "") &&
            trimmed(caption.value) === trimmed(existing ? existing.caption : "") &&
              active.value === (existing ? existing.is_active : true)) {
          return true;
        }

        return await confirmDialog({
          title: t("discard.title"),
          lines: [t("discard.line")],
          confirmLabel: t("discard.confirm"),
          cancelLabel: t("discard.cancel"),
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
          alt: {
            label: t("projMedia.altLabel"),
            required: true,
            maxLength: LIMITS.galleryAlt
          },
          caption: { label: t("common.caption"), maxLength: LIMITS.galleryCaption }
        }
      );

      if (!ok) {
        return;
      }

      const files = media.getPendingFiles();

      if (isNew && !files) {
        formError.textContent = t("org.photoErrChoose");
        return;
      }

      const metadata = {
        alt_text: trimmed(alt.value),
        caption: trimmedOrNull(caption.value),
        is_active: active.value
      };

      controller.setBusy(true, t(files ? "common.uploading" : "common.saving"));

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
          toast(t("org.photoAdded"));
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
            : t("org.photoErrSave");
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
    saveButton.textContent = next
      ? label || t("common.saving")
      : t("common.saveChanges");
  }

  async function save() {
    if (saving) {
      return false;
    }

    const valid = applyValidation(fields, {
      heading: {
        label: t("about.fieldHeading"),
        required: true,
        maxLength: LIMITS.heading
      },
      highlight: { label: t("about.fieldHighlight"), maxLength: LIMITS.highlight },
      paragraph1: { label: t("org.fieldParagraph1"), required: true },
      paragraph2: { label: t("org.fieldParagraph2") }
    });

    if (!valid) {
      toast(t("about.errFields"), "error");
      return false;
    }

    setSaving(true, t("common.saving"));

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

      toast(t("org.errSave"), "error");
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
      previewLine(t("about.fieldHeading"), fields.heading.value),
      previewLine(t("about.fieldHighlight"), fields.highlight.value),
      previewLine(t("org.fieldParagraph1"), fields.paragraph1.value),
      previewLine(t("org.fieldParagraph2"), fields.paragraph2.value)
    );

    const skillRows = skills.getRows();
    const skillBlock = el("div", "preview-line");
    append(skillBlock, el("span", "preview-label", t("org.skillsTitle")));

    if (skillRows.length === 0) {
      append(skillBlock, el("p", "preview-value", "—"));
    } else {
      const list = el("ul", "preview-list");
      skillRows.forEach(row => {
        const item = el("li", "preview-list-item preview-list-item-block");
        append(item, el("strong", null, row.title), el("span", null, row.description));

        if (row.is_active === false) {
          append(item, el("span", "status-badge status-badge-disabled", t("status.inactive")));
        }

        append(list, item);
      });
      append(skillBlock, list);
    }

    append(body, skillBlock);

    const galleryRows = gallery.getRows();
    const galleryBlock = el("div", "preview-line");
    append(galleryBlock, el("span", "preview-label", t("org.galleryTitle")));

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
          img.alt = row.alt_text || t("org.galleryPhoto");
          append(figure, img);
        } else {
          append(figure, el("p", "media-field-empty", t("projMedia.noImage")));
        }

        const caption = el("figcaption", "preview-photo-caption");
        append(
          caption,
          el("span", "preview-photo-title", row.alt_text || t("org.galleryUntitled"))
        );

        if (row.is_active === false) {
          append(caption, el("span", "status-badge status-badge-disabled", t("status.inactive")));
        }

        append(figure, caption);
        append(strip, figure);
      });

      append(galleryBlock, strip);
    }

    append(body, galleryBlock);

    openModal({
      title: t("org.previewTitle"),
      description: t("org.previewDescription"),
      body,
      actions: [
        { label: t("common.close"), variant: "secondary", onClick: ctl => ctl.close() }
      ]
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
