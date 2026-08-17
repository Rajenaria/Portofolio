/*
  Project media field (Phase 8B).

  A staging-aware image field used by the Project cover and by every
  documentation image. It owns three things:

    1. showing what is currently stored — public URL for portfolio-media,
       short-lived signed URL for the private portfolio-staging bucket;
    2. running the shared Image Picker so the owner SEES the optimisation;
    3. holding the two pending WebP variants until the caller saves.

  IT NEVER UPLOADS. Storage work belongs to js/core/media-storage.js and is
  triggered by the editor's Save / Publish.

  RESPONSIVE CONTRACT
  -------------------
  One source image produces two variants (Features doc section 26):

      desktop  max 2000 px
      mobile   max 1200 px

  Both go through the shared processor, inheriting its safety limits,
  aspect-ratio preservation and no-upscale rule.

  The derivation below mirrors modules/profile/media-field.js on purpose: the
  two managers are kept independent so a change to Profile media cannot alter
  Project media behaviour.
*/

import { el, append, clear } from "../../core/dom.js";
import { openModal } from "../../core/modal.js";
import { createImagePicker } from "../../core/image-picker.js";
import { processImage, formatBytes } from "../../core/image-processor.js";
import { resolveMediaUrl } from "../../core/media-storage.js";

export const DESKTOP_MAX_DIMENSION = 2000;
export const MOBILE_MAX_DIMENSION = 1200;

export async function deriveVariants(originalFile) {
  const desktop = await processImage(originalFile, {
    maxDimension: DESKTOP_MAX_DIMENSION
  });

  const mobile = await processImage(originalFile, {
    maxDimension: MOBILE_MAX_DIMENSION
  });

  return { desktop, mobile };
}

export function createProjectMediaField({
  title,
  emptyText = "No image configured.",
  current,
  compact = false,
  onChange
}) {
  const root = el("div", compact ? "media-field media-field-compact" : "media-field");

  if (title) {
    const header = el("div", "media-field-header");
    append(header, el("h4", "media-field-title", title));
    append(root, header);
  }

  const previewSlot = el("div", "media-field-preview");
  const statusSlot = el("div", "media-field-status");
  const actions = el("div", "media-field-actions");

  const replaceButton = el(
    "button",
    "admin-button admin-button-secondary",
    "Add Image"
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
  let renderToken = 0;

  function releasePendingUrl() {
    if (pendingUrl) {
      URL.revokeObjectURL(pendingUrl);
      pendingUrl = null;
    }
  }

  async function renderPreview() {
    const token = (renderToken += 1);
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

    if (!stored || !stored.desktopPath) {
      append(previewSlot, el("p", "media-field-empty", emptyText));
      return;
    }

    append(previewSlot, el("p", "media-field-empty", "Loading preview..."));

    const url = await resolveMediaUrl(stored.bucket, stored.desktopPath);

    // A newer render started while the signed URL was being minted.
    if (token !== renderToken) {
      return;
    }

    clear(previewSlot);

    if (!url) {
      append(
        previewSlot,
        el("p", "media-field-empty", "Stored image could not be loaded.")
      );
      return;
    }

    const img = el("img", "media-field-image");
    img.src = url;
    img.alt = "Current image";
    img.loading = "lazy";
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
      const line = el("p", "media-field-line");
      append(line, el("span", "status-badge status-badge-pending", "Pending upload"));
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
        el(
          "p",
          "media-field-detail",
          `${stored.bucket === "portfolio-staging" ? "Staged (private)" : "Public"} · ${stored.desktopPath}`
        )
      );
      return;
    }

    append(statusSlot, el("p", "form-help", "No image stored yet."));
  }

  function render() {
    renderPreview();
    renderStatus();

    // "Add" until something exists to replace, so an empty field never claims
    // there is a current image.
    replaceButton.textContent =
      pending || (stored && stored.desktopPath) ? "Replace Image" : "Add Image";
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
        `One source image is used to generate both variants: desktop up to ${DESKTOP_MAX_DIMENSION} px and mobile up to ${MOBILE_MAX_DIMENSION} px. Images are never enlarged or cropped, and the original file is never uploaded.`
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
      title: title ? `${replaceButton.textContent}: ${title}` : replaceButton.textContent,
      body: holder,
      actions: [{ label: "Cancel", variant: "secondary", onClick: ctl => ctl.close() }],
      // Cancelling the picker must never mark unrelated content dirty.
      onClosed: () => picker.destroy()
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

    getPendingFiles: () =>
      pending
        ? {
            desktopFile: pending.desktop.optimized.file,
            mobileFile: pending.mobile.optimized.file
          }
        : null,

    getStored: () => (stored ? { ...stored } : null),

    /* Blob URL while pending; resolved storage URL otherwise. */
    async resolvePreviewUrl() {
      if (pending) {
        return pendingUrl;
      }

      if (!stored || !stored.desktopPath) {
        return null;
      }

      return await resolveMediaUrl(stored.bucket, stored.desktopPath);
    },

    commit(paths) {
      releasePendingUrl();
      pending = null;
      stored = paths ? { ...paths } : stored;
      render();
    },

    setStored(paths) {
      stored = paths ? { ...paths } : null;
      render();
    },

    destroy() {
      releasePendingUrl();
    }
  };
}
