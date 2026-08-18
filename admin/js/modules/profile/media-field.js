/*
  Media field: current image + "Replace Image" flow (Phase 6).

  Used by all five image slots in Profile & About: Hero 01-03, the About photo
  and every gallery item. It owns three things and nothing else:

    1. showing what is currently stored (public URL derived for display only),
    2. running the shared Image Picker so the owner SEES the optimisation,
    3. holding the two pending WebP variants until the caller saves.

  IT NEVER UPLOADS. Storage work belongs to js/core/media-storage.js and is
  triggered by the owning tab's Save action.

  RESPONSIVE CONTRACT
  -------------------
  The owner picks ONE source image. Two variants are derived from that same
  source (docs/Features/005 section 26):

      desktop  max 2000 px
      mobile   max 1200 px

  Both go through the shared processor, so both inherit its safety limits,
  aspect-ratio preservation and no-upscale rule.
*/

import { el, append, clear } from "../../core/dom.js";
import { openModal } from "../../core/modal.js";
import { createImagePicker } from "../../core/image-picker.js";
import { processImage, formatBytes } from "../../core/image-processor.js";
import { publicUrl } from "../../core/media-storage.js";

export const DESKTOP_MAX_DIMENSION = 2000;
export const MOBILE_MAX_DIMENSION = 1200;

/*
  Derives the mobile variant from the same original the picker already
  validated and decoded once. Reprocessing the original (not the desktop
  output) avoids compounding lossy artefacts.
*/
export async function deriveVariants(originalFile) {
  const desktop = await processImage(originalFile, {
    maxDimension: DESKTOP_MAX_DIMENSION
  });

  const mobile = await processImage(originalFile, {
    maxDimension: MOBILE_MAX_DIMENSION
  });

  return { desktop, mobile };
}

export function createMediaField({
  title,
  emptyText = "No image configured.",
  current,
  onChange
}) {
  const root = el("div", "media-field");

  const header = el("div", "media-field-header");
  append(header, el("h3", "media-field-title", title));
  append(root, header);

  const previewSlot = el("div", "media-field-preview");
  const statusSlot = el("div", "media-field-status");
  const actions = el("div", "media-field-actions");

  const replaceButton = el(
    "button",
    "admin-button admin-button-secondary",
    "Replace Image"
  );
  replaceButton.type = "button";

  const clearButton = el(
    "button",
    "admin-button admin-button-secondary",
    "Discard Pending"
  );
  clearButton.type = "button";
  clearButton.hidden = true;

  append(actions, replaceButton, clearButton);
  append(root, previewSlot, statusSlot, actions);

  let stored = current ? { ...current } : null;
  let pending = null;
  let pendingUrl = null;

  function releasePendingUrl() {
    if (pendingUrl) {
      URL.revokeObjectURL(pendingUrl);
      pendingUrl = null;
    }
  }

  function renderPreview() {
    clear(previewSlot);

    if (pending) {
      releasePendingUrl();
      pendingUrl = URL.createObjectURL(pending.desktop.optimized.blob);

      const img = el("img", "media-field-image");
      img.src = pendingUrl;
      img.alt = "Preview of the replacement image";
      append(previewSlot, img);
      return;
    }

    const url =
      stored && stored.desktopPath
        ? publicUrl(stored.bucket, stored.desktopPath)
        : null;

    if (!url) {
      append(previewSlot, el("p", "media-field-empty", emptyText));
      return;
    }

    const img = el("img", "media-field-image");
    img.src = url;
    img.alt = "Current image";
    img.loading = "lazy";

    // A stored path whose object is missing must not look like a broken page.
    img.addEventListener("error", () => {
      clear(previewSlot);
      append(
        previewSlot,
        el("p", "media-field-empty", "Stored image could not be loaded.")
      );
    });

    append(previewSlot, img);
  }

  function renderStatus() {
    clear(statusSlot);

    if (pending) {
      const badge = el("span", "status-badge status-badge-pending", "Pending upload");
      const line = el("p", "media-field-line");
      append(line, badge);
      append(statusSlot, line);

      append(
        statusSlot,
        el(
          "p",
          "media-field-detail",
          `Desktop ${pending.desktop.optimized.width} × ${pending.desktop.optimized.height} · ${formatBytes(
            pending.desktop.optimized.size
          )}`
        ),
        el(
          "p",
          "media-field-detail",
          `Mobile ${pending.mobile.optimized.width} × ${pending.mobile.optimized.height} · ${formatBytes(
            pending.mobile.optimized.size
          )}`
        ),
        el(
          "p",
          "form-help",
          "Both variants were generated from the same source image and will be uploaded when you save."
        )
      );

      clearButton.hidden = false;
      return;
    }

    clearButton.hidden = true;

    if (stored && stored.desktopPath) {
      append(
        statusSlot,
        el("p", "media-field-detail", `Desktop: ${stored.desktopPath}`),
        el("p", "media-field-detail", `Mobile: ${stored.mobilePath || "—"}`)
      );
      return;
    }

    append(
      statusSlot,
      el("p", "form-help", "No image stored yet for this slot.")
    );
  }

  function render() {
    renderPreview();
    renderStatus();
  }

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function openReplaceDialog() {
    let picker = null;
    let controller = null;

    const holder = el("div", "media-replace-body");

    append(
      holder,
      el(
        "p",
        "form-help",
        `One source image is used to generate both variants: desktop up to ${DESKTOP_MAX_DIMENSION} px and mobile up to ${MOBILE_MAX_DIMENSION} px. Images are never enlarged or cropped.`
      )
    );

    const pickerSlot = el("div", "media-replace-picker");
    const busy = el("p", "media-replace-busy");
    busy.setAttribute("role", "status");
    busy.setAttribute("aria-live", "polite");

    append(holder, pickerSlot, busy);

    picker = createImagePicker({
      label: "Source Image",
      processing: { maxDimension: DESKTOP_MAX_DIMENSION },
      onReady: async result => {
        busy.textContent = "Generating mobile variant...";

        try {
          const variants = await deriveVariants(result.original.file);

          releasePendingUrl();

          pending = {
            desktop: variants.desktop,
            mobile: variants.mobile,
            sourceName: result.original.name
          };

          render();
          notify();

          busy.textContent = "";
          controller.close();
        } catch (error) {
          console.error(error);
          busy.textContent =
            error && error.message
              ? error.message
              : "Could not prepare the mobile variant. Please try another image.";
        }
      }
    });

    append(pickerSlot, picker.element);

    controller = openModal({
      title: `Replace ${title}`,
      body: holder,
      actions: [
        {
          label: "Cancel",
          variant: "secondary",
          onClick: ctl => ctl.close()
        }
      ],
      onClosed: () => {
        picker.destroy();
      }
    });
  }

  replaceButton.addEventListener("click", openReplaceDialog);

  clearButton.addEventListener("click", () => {
    releasePendingUrl();
    pending = null;
    render();
    notify();
  });

  render();

  return {
    element: root,

    hasPending: () => Boolean(pending),

    getPending: () => pending,

    /* Files ready for media-storage.uploadVariantPair(). */
    getPendingFiles: () =>
      pending
        ? {
            desktopFile: pending.desktop.optimized.file,
            mobileFile: pending.mobile.optimized.file
          }
        : null,

    getStored: () => (stored ? { ...stored } : null),

    /* Preview blob URL for the read-only content preview. */
    getPreviewUrl: () => {
      if (pending) {
        return pendingUrl;
      }

      return stored && stored.desktopPath
        ? publicUrl(stored.bucket, stored.desktopPath)
        : null;
    },

    /* Called after a successful save so the field reflects the new state. */
    commit(paths) {
      releasePendingUrl();
      pending = null;
      stored = paths ? { ...paths } : stored;
      render();
    },

    reset() {
      releasePendingUrl();
      pending = null;
      render();
      notify();
    },

    destroy() {
      releasePendingUrl();
    }
  };
}
