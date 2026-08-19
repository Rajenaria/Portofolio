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
import { t } from "../../core/i18n.js";

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

  /* One shape for every group, matching the editors in the other modules. */
  function group(titleKey, helpKey) {
    const node = el("section", "admin-subsection");

    append(node, el("h3", "subsection-title", t(titleKey)));

    if (helpKey) {
      append(node, el("p", "form-help", t(helpKey)));
    }

    return node;
  }

  const photoSection = group("about.photoTitle", "about.photoHelp");

  const media = createMediaField({
    title: t("about.photoTitle"),
    emptyText: t("pmedia.empty"),
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
    label: t("about.fieldPhotoAlt"),
    maxLength: LIMITS.photoAlt,
    value: profile.about_photo_alt,
    help: t("about.fieldPhotoAltHelp")
  });

  append(photoSection, media.element, photoAlt.node);

  /* ---------------- text ---------------- */

  const fields = {
    heading: textField({
      id: "about-heading",
      label: t("about.fieldHeading"),
      required: true,
      maxLength: LIMITS.heading,
      value: profile.about_heading_main
    }),
    highlight: textField({
      id: "about-highlight",
      label: t("about.fieldHighlight"),
      maxLength: LIMITS.highlight,
      value: profile.about_heading_highlight,
      help: t("about.fieldHighlightHelp")
    }),
    lead: textareaField({
      id: "about-lead",
      label: t("about.fieldLead"),
      required: true,
      maxLength: LIMITS.lead,
      value: profile.about_lead,
      rows: 3
    }),
    description: textareaField({
      id: "about-description",
      label: t("about.fieldDescription"),
      required: true,
      value: profile.about_description,
      rows: 7,
      help: t("about.fieldDescriptionHelp")
    }),
    photoAlt
  };

  const textSection = group("about.contentTitle", "about.contentHelp");

  const grid = el("div", "form-grid");
  append(grid, fields.heading.node, fields.highlight.node);
  append(textSection, grid, fields.lead.node, fields.description.node);

  const actions = el("div", "form-actions");

  const previewButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("common.preview")
  );
  previewButton.type = "button";

  const saveButton = el(
    "button",
    "admin-button admin-button-primary",
    t("common.saveChanges")
  );
  saveButton.type = "button";

  append(actions, previewButton, saveButton);

  /* ---------------- interests ---------------- */

  const interests = createOrderedList({
    table: "about_interests",
    title: t("interest.title"),
    addLabel: t("interest.add"),
    emptyTitle: t("interest.empty"),
    emptyDescription: t("interest.emptyHelp"),
    selectColumns: "id, label, sort_order, is_active, created_at",
    describeRow: row => row.label,
    renderRow: row => {
      const wrap = el("div", "ordered-row-main");
      append(wrap, el("span", "ordered-title", row.label));

      if (row.is_active === false) {
        append(
          wrap,
          el("span", "status-badge status-badge-disabled", t("status.inactive"))
        );
      }

      return wrap;
    },
    removeConfirm: row => ({
      title: t("interest.removeTitle", { label: row.label }),
      lines: [t("interest.removeLine"), t("confirm.cannotBeUndone")],
      confirmLabel: t("common.remove"),
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
      label: t("common.label"),
      required: true,
      maxLength: LIMITS.interestLabel,
      value: existing ? existing.label : "",
      help: t("interest.fieldLabelHelp")
    });

    const active = checkboxField({
      id: "interest-active",
      label: t("status.active"),
      checked: existing ? existing.is_active !== false : true,
      help: t("interest.activeHelp")
    });

    append(form, formError, label.node, active.node);

    const submit = el("button", "visually-hidden");
    submit.type = "submit";
    submit.tabIndex = -1;
    append(form, submit);

    const initialSnapshot = JSON.stringify([label.value, active.value]);

    const controller = openModal({
      title: t(isNew ? "interest.addTitle" : "interest.editTitle"),
      body: form,
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: t(isNew ? "interest.addTitle" : "common.saveChanges"),
          variant: "primary",
          onClick: () => persist()
        }
      ],
      onRequestClose: async () => {
        if (JSON.stringify([label.value, active.value]) === initialSnapshot) {
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
      label.setError("");
      formError.textContent = "";

      const value = trimmed(label.value);

      if (value === "") {
        label.setError(t("interest.errRequired"));
        label.focus();
        return;
      }

      if (value.length > LIMITS.interestLabel) {
        label.setError(t("interest.errTooLong", { max: LIMITS.interestLabel }));
        label.focus();
        return;
      }

      controller.setBusy(true, t(isNew ? "common.adding" : "common.saving"));

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

        formError.textContent = t("interest.errSave");
        return;
      }

      controller.close();
      toast(t(isNew ? "interest.added" : "about.saved"));
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
      lead: { label: t("about.fieldLead"), required: true, maxLength: LIMITS.lead },
      description: { label: t("about.fieldDescription"), required: true },
      photoAlt: { label: t("about.fieldPhotoAlt"), maxLength: LIMITS.photoAlt }
    });

    if (!valid) {
      toast(t("about.errFields"), "error");
      return false;
    }

    setSaving(true, t("common.saving"));

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

        toast(t("about.errSave"), "error");
        return false;
      }

      toast(t("about.saved"));
      return true;
    }

    setSaving(true, t("common.uploading"));

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
      toast(
        result.cleanupWarning || t("about.saved"),
        result.cleanupWarning ? "error" : "success"
      );
      return true;
    } catch (error) {
      console.error(error);
      setSaving(false);
      toast(
        error && error.name === "MediaStorageError"
          ? error.message
          : t("about.errPhoto"),
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
      img.alt = trimmed(fields.photoAlt.value) || t("about.photoAlt");
      append(figure, img);

      const caption = el("figcaption", "preview-photo-caption");
      append(caption, el("span", "preview-photo-title", t("about.photoTitle")));

      if (media.hasPending()) {
        append(
          caption,
          el("span", "status-badge status-badge-pending", t("projPreview.pending"))
        );
      }

      append(figure, caption);
      append(body, figure);
    } else {
      append(body, el("p", "media-field-empty", t("about.photoEmpty")));
    }

    append(
      body,
      previewLine(t("about.fieldHeading"), fields.heading.value),
      previewLine(t("about.fieldHighlight"), fields.highlight.value),
      previewLine(t("about.fieldLead"), fields.lead.value),
      previewLine(t("about.fieldDescription"), fields.description.value),
      previewLine(t("about.fieldPhotoAlt"), fields.photoAlt.value)
    );

    const rows = interests.getRows();
    const listBlock = el("div", "preview-line");
    append(listBlock, el("span", "preview-label", t("interest.title")));

    if (rows.length === 0) {
      append(listBlock, el("p", "preview-value", t("common.none")));
    } else {
      const list = el("ul", "preview-list");
      rows.forEach(row => {
        const item = el("li", "preview-list-item");
        append(item, el("span", null, row.label));

        if (row.is_active === false) {
          append(
            item,
            el("span", "status-badge status-badge-disabled", t("status.inactive"))
          );
        }

        append(list, item);
      });
      append(listBlock, list);
    }

    append(body, listBlock);

    openModal({
      title: t("about.previewTitle"),
      description: t("about.previewDescription"),
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
