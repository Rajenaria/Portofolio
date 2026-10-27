/*
  Hero text and one primary photo, backed by hero_media slot_number = 1.
  Legacy slots 2 and 3 remain in the database and Storage untouched.
  The shared media field holds local variants until the existing Save flow.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { openModal } from "../../core/modal.js";

import {
  textField,
  textareaField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import { replaceMedia, MEDIA_BUCKET } from "../../core/media-storage.js";
import { createMediaField } from "./media-field.js";
import { t } from "../../core/i18n.js";

const PRIMARY_SLOT = 1;

const LIMITS = {
  name: 100,
  professionalTitle: 160,
  heroDescription: 600,
  altText: 250
};

export function createHeroTab({ profile, heroSlots, onDirtyChange }) {
  const root = el("div", "profile-tab-panel");

  const fields = {
    name: textField({
      id: "hero-name",
      label: t("hero.fieldName"),
      required: true,
      maxLength: LIMITS.name,
      value: profile.name,
      help: t("hero.fieldNameHelp")
    }),
    professionalTitle: textField({
      id: "hero-professional-title",
      label: t("hero.fieldTitle"),
      required: true,
      maxLength: LIMITS.professionalTitle,
      value: profile.professional_title
    }),
    heroDescription: textareaField({
      id: "hero-description",
      label: t("hero.fieldDescription"),
      required: true,
      maxLength: LIMITS.heroDescription,
      value: profile.hero_description,
      rows: 4,
      help: t("hero.fieldDescriptionHelp")
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

  const textSection = group("hero.contentTitle", "hero.contentHelp");

  const grid = el("div", "form-grid");
  append(grid, fields.name.node, fields.professionalTitle.node);
  append(textSection, grid, fields.heroDescription.node);

  const photosSection = group("hero.photosTitle", "hero.photosHelp");

  const record = heroSlots.find(row => Number(row.slot_number) === PRIMARY_SLOT) || {};
  const wrapper = el("div", "hero-slot");
  const heading = el("div", "hero-slot-heading");
  append(heading,
    el("span", "hero-slot-name", t("hero.primarySlot")),
    el("span", "status-badge status-badge-active", t("hero.primaryAlways"))
  );
  const media = createMediaField({
    title: t("hero.primarySlot"),
    emptyText: t("pmedia.empty"),
    current: record.desktop_path ? {
      bucket: record.bucket_name || MEDIA_BUCKET,
      desktopPath: record.desktop_path,
      mobilePath: record.mobile_path
    } : null,
    onChange: markDirty
  });
  const alt = textField({
    id: "hero-alt-1",
    label: t("hero.altLabel"),
    maxLength: LIMITS.altText,
    value: record.alt_text,
    help: t("hero.altHelp")
  });
  alt.control.addEventListener("input", markDirty);
  const primary = { media, alt, initialAlt: trimmed(record.alt_text) };
  append(wrapper, heading, media.element, alt.node);
  append(photosSection, wrapper);

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
  append(root, textSection, photosSection, actions);

  /* ---------------- dirty tracking ---------------- */

  function snapshot() {
    return JSON.stringify({
      name: trimmed(fields.name.value),
      title: trimmed(fields.professionalTitle.value),
      description: trimmed(fields.heroDescription.value)
    });
  }

  let baseline = snapshot();
  let dirty = false;
  let saving = false;

  function computeDirty() {
    if (snapshot() !== baseline) {
      return true;
    }

    return primary.media.hasPending() ||
      trimmed(primary.alt.value) !== primary.initialAlt;
  }

  function markDirty() {
    const next = computeDirty();

    if (next !== dirty) {
      dirty = next;
      onDirtyChange(dirty);
    }
  }

  [fields.name, fields.professionalTitle, fields.heroDescription].forEach(field => {
    field.control.addEventListener("input", markDirty);
  });

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
      name: { label: t("hero.fieldName"), required: true, maxLength: LIMITS.name },
      professionalTitle: {
        label: t("hero.fieldTitle"),
        required: true,
        maxLength: LIMITS.professionalTitle
      },
      heroDescription: {
        label: t("hero.fieldDescription"),
        required: true,
        maxLength: LIMITS.heroDescription
      }
    });

    if (!valid) {
      toast(t("hero.errFields"), "error");
      return false;
    }

    if (trimmed(primary.alt.value).length > LIMITS.altText) {
      primary.alt.setError(t("hero.errAltTooLong", { max: LIMITS.altText }));
      toast(t("hero.errFields"), "error");
      return false;
    }

    setSaving(true, t("common.saving"));

    if (snapshot() !== baseline) {
      // Hero text stays on its singleton; a photo-only edit does not rewrite it.
      const profileUpdate = await supabaseClient
        .from("profile_content")
        .update({
          name: trimmedOrNull(fields.name.value),
          professional_title: trimmedOrNull(fields.professionalTitle.value),
          hero_description: trimmedOrNull(fields.heroDescription.value)
        })
        .eq("singleton_key", 1)
        .select("id");

      if (profileUpdate.error || !profileUpdate.data || profileUpdate.data.length === 0) {
        if (profileUpdate.error) {
          console.error(profileUpdate.error);
        }

        setSaving(false);
        toast(t("hero.errSave"), "error");
        return false;
      }

    }

    // Only slot 1 can be written. Never serialize or reset legacy slots.
    const warnings = [];
    const altValue = trimmedOrNull(primary.alt.value);
    const altChanged = trimmed(primary.alt.value) !== primary.initialAlt;
    const files = primary.media.getPendingFiles();

    if (files) {
      setSaving(true, t("common.uploading"));
      try {
        const result = await replaceMedia({
          directory: `hero/slot-${PRIMARY_SLOT}`,
          desktopFile: files.desktopFile,
          mobileFile: files.mobileFile,
          // Legacy slots may still reference old Hero files; retain them.
          previous: null,
          commit: async paths => {
            const { data, error } = await supabaseClient
              .from("hero_media")
              .update({
                bucket_name: paths.bucket,
                desktop_path: paths.desktopPath,
                mobile_path: paths.mobilePath,
                alt_text: altValue
              })
              .eq("slot_number", PRIMARY_SLOT)
              .select("slot_number");
            if (error || !data || data.length === 0) {
              throw new Error("hero_media update did not apply");
            }
          }
        });
        primary.media.commit({
          bucket: result.paths.bucket,
          desktopPath: result.paths.desktopPath,
          mobilePath: result.paths.mobilePath
        });
        primary.initialAlt = trimmed(primary.alt.value);
        if (result.cleanupWarning) {
          warnings.push(t("hero.slotWarning", { warning: result.cleanupWarning }));
        }
      } catch (error) {
        console.error(error);
        setSaving(false);
        toast(
          error && error.message && error.name === "MediaStorageError"
            ? error.message : t("hero.errSlotReplace"),
          "error"
        );
        return false;
      }
    } else if (altChanged) {
      // Metadata-only edit cannot touch image paths, visibility or Storage.
      const { data, error } = await supabaseClient
        .from("hero_media")
        .update({ alt_text: altValue })
        .eq("slot_number", PRIMARY_SLOT)
        .select("slot_number");
      if (error || !data || data.length === 0) {
        if (error) console.error(error);
        setSaving(false);
        toast(t("hero.errSlotSave"), "error");
        return false;
      }
      primary.initialAlt = trimmed(primary.alt.value);
    }

    setSaving(false);

    if (warnings.length > 0) {
      warnings.forEach(message => toast(message, "error"));
    } else {
      toast(t("hero.saved"));
    }

    return true;
  }

  saveButton.addEventListener("click", async () => {
    const saved = await save();

    if (saved) {
      resetDirtyBaseline();
    }
  });

  function resetDirtyBaseline() {
    baseline = snapshot();
    dirty = false;
    onDirtyChange(false);
  }

  /* ---------------- preview ---------------- */

  previewButton.addEventListener("click", () => {
    const body = el("div", "content-preview");

    append(
      body,
      previewLine(t("hero.fieldName"), fields.name.value),
      previewLine(t("hero.fieldTitle"), fields.professionalTitle.value),
      previewLine(t("hero.fieldDescription"), fields.heroDescription.value)
    );

    const photos = el("div", "hero-primary-preview");

    const card = el("figure", "preview-photo");
    const url = primary.media.getPreviewUrl();
    if (url) {
      const img = el("img", "preview-photo-image");
      img.src = url;
      img.alt = trimmed(primary.alt.value) || t("hero.photoAlt");
      append(card, img);
    } else {
      append(card, el("p", "media-field-empty", t("pmedia.empty")));
    }
    const caption = el("figcaption", "preview-photo-caption");
    append(caption, el("span", "preview-photo-title", t("hero.primarySlot")));
    if (primary.media.hasPending()) {
      append(caption, el("span", "status-badge status-badge-pending", t("projPreview.pending")));
    }
    append(card, caption);
    append(photos, card);

    append(body, el("h4", "preview-heading", t("hero.photosTitle")), photos);

    openModal({
      title: t("hero.previewTitle"),
      description:
        t("hero.previewDescription"),
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

  return {
    element: root,
    isDirty: computeDirty,
    save,
    resetDirty: resetDirtyBaseline,
    destroy() {
      primary.media.destroy();
      clear(root);
    }
  };
}
