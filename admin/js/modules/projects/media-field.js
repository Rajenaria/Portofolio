import { applyCover } from "../../../../js/cms/project-cover.js";

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
import { tIndonesian as t } from "../../core/i18n.js";

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
  emptyText,
  current,
  compact = false,
  layout = null,
  onChange
}) {
  const root = el("div", compact ? "media-field media-field-compact" : "media-field");

  if (title) {
    const header = el("div", "media-field-header");
    append(header, el("h4", "media-field-title", title));
    append(root, header);
  }

  const previewSlot = el("div", "media-field-preview");
  if (layout) previewSlot.classList.add("project-cover-preview");
  function styleCover(img) {
    if (layout) applyCover(img, layout);
  }
  const statusSlot = el("div", "media-field-status");
  const actions = el("div", "media-field-actions");

  const replaceButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("projMedia.addImage")
  );
  replaceButton.type = "button";

  const clearButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("projMedia.discardPending")
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
      styleCover(img);
      img.src = pendingUrl;
      img.alt = t("projMedia.replacementPreview");
      append(previewSlot, img);
      return;
    }

    if (!stored || !stored.desktopPath) {
      append(
        previewSlot,
        el("p", "media-field-empty", emptyText || t("projMedia.emptyField"))
      );
      return;
    }

    append(previewSlot, el("p", "media-field-empty", t("projMedia.loadingPreview")));

    const url = await resolveMediaUrl(stored.bucket, stored.desktopPath);

    // A newer render started while the signed URL was being minted.
    if (token !== renderToken) {
      return;
    }

    clear(previewSlot);

    if (!url) {
      append(
        previewSlot,
        el("p", "media-field-empty", t("projMedia.storedLoadError"))
      );
      return;
    }

    const img = el("img", "media-field-image");
    styleCover(img);
    img.src = url;
    img.alt = t("projMedia.currentLabel");
    img.loading = "lazy";
    img.addEventListener("error", () => {
      clear(previewSlot);
      append(
        previewSlot,
        el("p", "media-field-empty", t("projMedia.storedLoadError"))
      );
    });

    append(previewSlot, img);
  }

  function renderStatus() {
    clear(statusSlot);

    if (pending) {
      const line = el("p", "media-field-line");
      append(
        line,
        el("span", "status-badge status-badge-pending", t("projMedia.pendingUpload"))
      );
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
        el("p", "form-help", t("projMedia.bothVariants"))
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
          `${
            stored.bucket === "portfolio-staging"
              ? t("projMedia.staged")
              : t("projMedia.public")
          } · ${stored.desktopPath}`
        )
      );
      return;
    }

    append(statusSlot, el("p", "form-help", t("projMedia.noneStored")));
  }

  function render() {
    renderPreview();
    renderStatus();

    // "Add" until something exists to replace, so an empty field never claims
    // there is a current image.
    replaceButton.textContent = t(
      pending || (stored && stored.desktopPath)
        ? "projMedia.replaceImage"
        : "projMedia.addImage"
    );
  }

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function openReplaceDialog() {
    let picker = null;
    let controller = null;

    const holder = el("div", "media-replace-body project-editor-modal-body");

    append(
      holder,
      el(
        "p",
        "form-help",
        t("projMedia.sizeHelp", {
          desktop: DESKTOP_MAX_DIMENSION,
          mobile: MOBILE_MAX_DIMENSION
        })
      )
    );

    const pickerSlot = el("div", "media-replace-picker");
    const busy = el("p", "media-replace-busy");
    busy.setAttribute("role", "status");
    busy.setAttribute("aria-live", "polite");

    append(holder, pickerSlot, busy);

    picker = createImagePicker({
      label: t("projMedia.sourceImage"),
      processing: { maxDimension: DESKTOP_MAX_DIMENSION },
      onReady: async result => {
        busy.textContent = t("projMedia.generating");

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
              : t("projMedia.errVariant");
        }
      }
    });

    append(pickerSlot, picker.element);

    controller = openModal({
      title: title ? `${replaceButton.textContent}: ${title}` : replaceButton.textContent,
      body: holder,
      actions: [
        { label: t("common.cancel"), variant: "secondary", onClick: ctl => ctl.close() }
      ],
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

    setLayout(value) {
      layout = value;
      const img = previewSlot.querySelector("img");
      if (img) styleCover(img);
    },

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
