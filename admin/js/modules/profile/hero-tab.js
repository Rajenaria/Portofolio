/*
  Hero tab (Phase 6).

  Manages the Hero text on the profile_content singleton plus the three fixed
  hero_media slots.

  THREE FIXED SLOTS
  -----------------
  The public Hero is a three-position interactive photo stack. That is a locked
  V1 contract (Features doc section 11.2), so this tab offers replace-only:
  no add, no delete, no reorder, no animation settings. The database backs this
  up with slot_number BETWEEN 1 AND 3 and grants UPDATE only, so even a tampered
  client cannot create a fourth slot.
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
      label: "Name",
      required: true,
      maxLength: LIMITS.name,
      value: profile.name,
      help: "Shown as the main Hero name."
    }),
    professionalTitle: textField({
      id: "hero-professional-title",
      label: "Professional Title",
      required: true,
      maxLength: LIMITS.professionalTitle,
      value: profile.professional_title
    }),
    heroDescription: textareaField({
      id: "hero-description",
      label: "Hero Description",
      required: true,
      maxLength: LIMITS.heroDescription,
      value: profile.hero_description,
      rows: 4,
      help: "Plain text only. No HTML or formatting markup."
    })
  };

  const textSection = el("section", "admin-subsection");
  append(textSection, el("h3", "subsection-title", "Hero Content"));

  const grid = el("div", "form-grid");
  append(grid, fields.name.node, fields.professionalTitle.node);
  append(textSection, grid, fields.heroDescription.node);

  const photosSection = el("section", "admin-subsection");
  append(photosSection, el("h3", "subsection-title", "Hero Photos"));
  append(
    photosSection,
    el(
      "p",
      "form-help",
      "The public Hero uses exactly three photo positions. Slots can be replaced but not added, removed or reordered."
    )
  );

  const slotsGrid = el("div", "hero-slots");
  const slots = [];

  [1, 2, 3].forEach(slotNumber => {
    const record =
      heroSlots.find(row => Number(row.slot_number) === slotNumber) || {};

    const wrapper = el("div", "hero-slot");

    const media = createMediaField({
      title: `Hero Photo 0${slotNumber}`,
      emptyText: "No image configured.",
      current: record.desktop_path
        ? {
            bucket: record.bucket_name || MEDIA_BUCKET,
            desktopPath: record.desktop_path,
            mobilePath: record.mobile_path
          }
        : null,
      onChange: markDirty
    });

    const alt = textField({
      id: `hero-alt-${slotNumber}`,
      label: "Alt Text",
      maxLength: LIMITS.altText,
      value: record.alt_text,
      help: "Describes the photo for screen readers."
    });

    alt.control.addEventListener("input", markDirty);

    append(wrapper, media.element, alt.node);
    append(slotsGrid, wrapper);

    slots.push({
      slotNumber,
      media,
      alt,
      initialAlt: trimmed(record.alt_text),
      record
    });
  });

  append(photosSection, slotsGrid);

  const actions = el("div", "form-actions");

  const previewButton = el("button", "admin-button admin-button-secondary", "Preview");
  previewButton.type = "button";

  const saveButton = el("button", "admin-button admin-button-primary", "Save Changes");
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

    return slots.some(
      slot =>
        slot.media.hasPending() || trimmed(slot.alt.value) !== slot.initialAlt
    );
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
    saveButton.textContent = next ? label || "Saving..." : "Save Changes";
  }

  async function save() {
    if (saving) {
      return false;
    }

    const valid = applyValidation(fields, {
      name: { label: "Name", required: true, maxLength: LIMITS.name },
      professionalTitle: {
        label: "Professional Title",
        required: true,
        maxLength: LIMITS.professionalTitle
      },
      heroDescription: {
        label: "Hero Description",
        required: true,
        maxLength: LIMITS.heroDescription
      }
    });

    if (!valid) {
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    const altErrors = slots.filter(
      slot => trimmed(slot.alt.value).length > LIMITS.altText
    );

    if (altErrors.length > 0) {
      altErrors.forEach(slot =>
        slot.alt.setError(`Alt text must be ${LIMITS.altText} characters or fewer.`)
      );
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    setSaving(true, "Saving...");

    // 1. Hero text on the profile singleton.
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
      toast("Could not save the Hero content. Your changes are still here.", "error");
      return false;
    }

    // 2. Per-slot media and alt text. Untouched slots are never rewritten.
    const warnings = [];

    for (const slot of slots) {
      const altValue = trimmedOrNull(slot.alt.value);
      const altChanged = trimmed(slot.alt.value) !== slot.initialAlt;
      const files = slot.media.getPendingFiles();

      if (files) {
        setSaving(true, "Uploading...");

        try {
          const result = await replaceMedia({
            directory: `hero/slot-${slot.slotNumber}`,
            desktopFile: files.desktopFile,
            mobileFile: files.mobileFile,
            previous: slot.media.getStored(),
            commit: async paths => {
              const { data, error } = await supabaseClient
                .from("hero_media")
                .update({
                  bucket_name: paths.bucket,
                  desktop_path: paths.desktopPath,
                  mobile_path: paths.mobilePath,
                  alt_text: altValue
                })
                .eq("slot_number", slot.slotNumber)
                .select("slot_number");

              if (error || !data || data.length === 0) {
                throw new Error("hero_media update did not apply");
              }
            }
          });

          slot.media.commit({
            bucket: result.paths.bucket,
            desktopPath: result.paths.desktopPath,
            mobilePath: result.paths.mobilePath
          });

          slot.initialAlt = trimmed(slot.alt.value);

          if (result.cleanupWarning) {
            warnings.push(`Hero Photo 0${slot.slotNumber}: ${result.cleanupWarning}`);
          }
        } catch (error) {
          console.error(error);
          setSaving(false);
          toast(
            error && error.message && error.name === "MediaStorageError"
              ? error.message
              : `Could not replace Hero Photo 0${slot.slotNumber}. The previous image is unchanged.`,
            "error"
          );
          return false;
        }

        continue;
      }

      if (altChanged) {
        const { data, error } = await supabaseClient
          .from("hero_media")
          .update({ alt_text: altValue })
          .eq("slot_number", slot.slotNumber)
          .select("slot_number");

        if (error || !data || data.length === 0) {
          if (error) {
            console.error(error);
          }

          setSaving(false);
          toast(`Could not save the alt text for Hero Photo 0${slot.slotNumber}.`, "error");
          return false;
        }

        slot.initialAlt = trimmed(slot.alt.value);
      }
    }

    setSaving(false);

    if (warnings.length > 0) {
      warnings.forEach(message => toast(message, "error"));
    } else {
      toast("Changes saved successfully.");
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
      previewLine("Name", fields.name.value),
      previewLine("Professional Title", fields.professionalTitle.value),
      previewLine("Hero Description", fields.heroDescription.value)
    );

    const photos = el("div", "preview-photo-grid");

    slots.forEach(slot => {
      const card = el("figure", "preview-photo");
      const url = slot.media.getPreviewUrl();

      if (url) {
        const img = el("img", "preview-photo-image");
        img.src = url;
        img.alt = trimmed(slot.alt.value) || `Hero photo 0${slot.slotNumber}`;
        append(card, img);
      } else {
        append(card, el("p", "media-field-empty", "No image configured."));
      }

      const caption = el("figcaption", "preview-photo-caption");
      append(
        caption,
        el("span", "preview-photo-title", `Hero Photo 0${slot.slotNumber}`)
      );

      if (slot.media.hasPending()) {
        append(caption, el("span", "status-badge status-badge-pending", "Pending"));
      }

      append(card, caption);
      append(photos, card);
    });

    append(body, el("h4", "preview-heading", "Hero Photos"), photos);

    openModal({
      title: "Hero preview",
      description:
        "Read-only preview of the current form values, including unsaved changes. This is an Admin content preview, not the public Hero layout.",
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

  return {
    element: root,
    isDirty: computeDirty,
    save,
    resetDirty: resetDirtyBaseline,
    destroy() {
      slots.forEach(slot => slot.media.destroy());
      clear(root);
    }
  };
}
