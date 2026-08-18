/*
  Hero tab (Phase 6, visibility added in Phase B2).

  Manages the Hero text on the profile_content singleton plus the three fixed
  hero_media slots.

  THREE FIXED SLOTS
  -----------------
  The public Hero is a three-position interactive photo stack. That is a locked
  V1 contract (Features doc section 11.2), so this tab offers replace-only:
  no add, no delete, no reorder, no animation settings. The database backs this
  up with slot_number BETWEEN 1 AND 3 and grants UPDATE only, so even a tampered
  client cannot create a fourth slot.

  VISIBILITY
  ----------
  Slots 2 and 3 can be taken off the public site without losing what is stored
  in them. Two things follow from that, and both matter:

    - Hiding is a METADATA change. It writes is_visible and nothing else: no
      upload, no path rewrite, no alt-text reset, and above all no Storage
      delete. A hidden photo has to survive so it can be shown again later.

    - Slot 1 cannot be hidden. It is the primary photo and the key the public
      renderer uses to decide whether the CMS owns the Hero at all, so hiding
      it would drop the whole section back to the static fallback. The control
      is rendered disabled here and the database enforces it for real through
      hero_media_slot_one_always_visible.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { openModal } from "../../core/modal.js";

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
      "The public Hero uses exactly three photo positions. Slots can be replaced but not added, removed or reordered. Photos 02 and 03 can be hidden from the public site; hiding keeps the uploaded image."
    )
  );

  const slotsGrid = el("div", "hero-slots");
  const slots = [];

  [1, 2, 3].forEach(slotNumber => {
    const record =
      heroSlots.find(row => Number(row.slot_number) === slotNumber) || {};

    const isPrimary = slotNumber === 1;

    // A row that predates the column, or a slot never configured, is public.
    const initialVisible = record.is_visible !== false;

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

    /*
      Same checkbox component the About interests and Organization skills
      lists already use for is_active, so visibility reads as the one
      existing "is this published" control rather than a new widget.
    */
    const visible = checkboxField({
      id: `hero-visible-${slotNumber}`,
      label: "Visible on public site",
      checked: isPrimary ? true : initialVisible,
      help: isPrimary
        ? "Primary photo — always visible. The Hero cannot be published without it."
        : "Hidden photos keep their image and alt text, and are not rendered on the public site."
    });

    const statusSlot = el("div", "hero-slot-status");

    if (isPrimary) {
      visible.control.checked = true;
      visible.control.disabled = true;
    } else {
      visible.control.addEventListener("change", () => {
        syncVisibilityState();
        markDirty();
      });
    }

    append(wrapper, media.element, alt.node, visible.node, statusSlot);
    append(slotsGrid, wrapper);

    slots.push({
      slotNumber,
      isPrimary,
      media,
      alt,
      visible,
      wrapper,
      statusSlot,
      initialAlt: trimmed(record.alt_text),
      initialVisible: isPrimary ? true : initialVisible,
      record
    });
  });

  /*
    Reflects the current toggle state on the slot itself: the stored thumbnail
    stays exactly as it is (the owner still needs to recognise which photo is
    in there), the card is only dimmed and badged.
  */
  function syncVisibilityState() {
    slots.forEach(slot => {
      const hidden = !slot.isPrimary && slot.visible.value === false;

      slot.wrapper.classList.toggle("is-hidden-slot", hidden);
      clear(slot.statusSlot);

      if (hidden) {
        append(
          slot.statusSlot,
          el(
            "span",
            "status-badge status-badge-inactive",
            "Hidden on public site"
          )
        );
      }
    });
  }

  syncVisibilityState();

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
        slot.media.hasPending() ||
        trimmed(slot.alt.value) !== slot.initialAlt ||
        currentVisible(slot) !== slot.initialVisible
    );
  }

  /*
    Slot 1 is reported as visible no matter what the DOM says. Its control is
    disabled, but reading it through one accessor means a tampered checkbox
    still cannot make the save path send is_visible: false for the primary
    photo — which the database would reject anyway.
  */
  function currentVisible(slot) {
    return slot.isPrimary ? true : slot.visible.value !== false;
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
      const visibleValue = currentVisible(slot);
      const visibilityChanged = visibleValue !== slot.initialVisible;
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
                  alt_text: altValue,
                  is_visible: visibleValue
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
          slot.initialVisible = visibleValue;

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

      /*
        No new image for this slot, so this is a metadata-only write. The
        payload carries ONLY the fields that actually changed: bucket_name,
        desktop_path and mobile_path are never mentioned, so toggling
        visibility cannot disturb the stored image, and nothing here can
        reach Storage at all.
      */

      const patch = {};

      if (altChanged) {
        patch.alt_text = altValue;
      }

      if (visibilityChanged) {
        patch.is_visible = visibleValue;
      }

      if (Object.keys(patch).length === 0) {
        continue;
      }

      const { data, error } = await supabaseClient
        .from("hero_media")
        .update(patch)
        .eq("slot_number", slot.slotNumber)
        .select("slot_number");

      if (error || !data || data.length === 0) {
        if (error) {
          console.error(error);
        }

        setSaving(false);
        toast(
          `Could not save the changes to Hero Photo 0${slot.slotNumber}.`,
          "error"
        );
        return false;
      }

      slot.initialAlt = trimmed(slot.alt.value);
      slot.initialVisible = visibleValue;
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

      if (!currentVisible(slot)) {
        card.classList.add("is-hidden-slot");
        append(
          caption,
          el("span", "status-badge status-badge-inactive", "Hidden")
        );
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
