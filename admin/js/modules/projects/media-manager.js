/*
  Documentation gallery manager (Phase 8B).

  Backs public.project_media, whose actual columns are:

      id, project_id, bucket_name, desktop_path, mobile_path,
      alt_text (nullable, 250), sort_order, is_active, created_at, updated_at

  There is NO caption column and NO media_type/role column in the implemented
  schema, so neither is invented here. Cover identity stays on public.projects
  (cover_bucket / cover_desktop_path / cover_mobile_path / cover_alt) and is
  never duplicated into project_media.

  STAGED, NOT IMMEDIATE
  ---------------------
  Every change — new image, replacement, alt edit, enable/disable, reorder,
  removal — is held locally and applied by the editor's Save. That keeps the
  dirty guard meaningful and means a brand new Project (which has no id yet)
  can still have its gallery prepared before the first save.

  Storage work belongs to the editor + js/core/media-storage.js; this module
  never uploads or deletes anything by itself.
*/

import { el, append, clear } from "../../core/dom.js";
import { openModal, confirmDialog } from "../../core/modal.js";
import { textField, trimmed, trimmedOrNull, validateText } from "../../core/form.js";
import { resolveMediaUrl } from "../../core/media-storage.js";
import { createProjectMediaField } from "./media-field.js";
import { t } from "../../core/i18n.js";

export const ALT_TEXT_MAX = 250;

let localIdCounter = 0;

export function createDocumentationManager({ initialMedia = [], onChange }) {
  const root = el("section", "admin-subsection");

  const header = el("div", "subsection-header");
  append(header, el("h3", "subsection-title", t("projMedia.docTitle")));

  const addButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("projMedia.docAdd")
  );
  addButton.type = "button";
  addButton.addEventListener("click", () => openAddDialog());
  append(header, addButton);

  const listSlot = el("div", "media-grid-slot");

  append(
    root,
    header,
    el("p", "form-help", t("projMedia.docHelp")),
    listSlot
  );

  /*
    Working copy. `id` is present for rows that already exist in the database;
    new entries carry a temporary local key and their processed files.
  */
  let items = initialMedia.map(row => ({
    id: row.id,
    key: row.id,
    bucket: row.bucket_name,
    desktopPath: row.desktop_path,
    mobilePath: row.mobile_path,
    altText: row.alt_text || "",
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
    pendingFiles: null,
    pendingPreviewUrl: null
  }));

  let removed = [];

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function releasePreview(item) {
    if (item.pendingPreviewUrl) {
      URL.revokeObjectURL(item.pendingPreviewUrl);
      item.pendingPreviewUrl = null;
    }
  }

  /*
    Every mutation rebuilds the whole list, which destroys the button the owner
    just used. `focusHint` names the card and the action to focus afterwards so
    keyboard users are not dropped back to the top of the document each time.
  */
  function render(focusHint) {
    clear(listSlot);

    if (items.length === 0) {
      append(
        listSlot,
        el("p", "form-help", t("projMedia.docEmpty"))
      );

      // No cards left to focus, so any hint resolves to the Add button.
      restoreFocus(focusHint ? { key: null } : null);
      return;
    }

    const grid = el("ol", "media-grid");

    items.forEach((item, index) => {
      append(grid, buildCard(item, index));
    });

    append(listSlot, grid);
    restoreFocus(focusHint);
  }

  function restoreFocus(focusHint) {
    if (!focusHint) {
      return;
    }

    // Deferred by one frame: a confirm dialog tears its overlay down after the
    // promise resolves, and that teardown would otherwise blur us again.
    requestAnimationFrame(() => applyFocus(focusHint));
  }

  function applyFocus(focusHint) {
    if (focusHint.key === null) {
      addButton.focus();
      return;
    }

    const card = listSlot.querySelector(`.media-card[data-key="${CSS.escape(focusHint.key)}"]`);

    if (!card) {
      addButton.focus();
      return;
    }

    const exact = card.querySelector(`button[data-action="${focusHint.action}"]`);

    if (exact && !exact.disabled) {
      exact.focus();
      return;
    }

    // The intended button became unavailable (an end-of-list Move, say), so
    // fall back to the first action the owner can still use on that card.
    const fallback = Array.from(card.querySelectorAll("button")).find(
      button => !button.disabled
    );

    (fallback || addButton).focus();
  }

  function buildCard(item, index) {
    const card = el("li", "media-card");
    card.dataset.key = String(item.key);

    if (!item.isActive) {
      card.classList.add("is-inactive");
    }

    const position = String(index + 1).padStart(2, "0");
    const label = item.altText || t("projMedia.imageAt", { position });

    const thumb = el("div", "media-card-thumb");
    append(thumb, el("span", "gallery-thumb-fallback", t("common.loading")));
    paintThumb(thumb, item);

    const body = el("div", "media-card-body");

    const head = el("div", "ordered-row-head");
    append(head, el("span", "ordered-position", position));

    append(
      head,
      el(
        "span",
        item.isActive
          ? "status-badge status-badge-active"
          : "status-badge status-badge-disabled",
        t(item.isActive ? "status.active" : "status.inactive")
      )
    );

    if (item.pendingFiles) {
      append(
        head,
        el("span", "status-badge status-badge-pending", t("projMedia.pendingUpload"))
      );
    }

    if (!item.id) {
      append(head, el("span", "status-badge status-badge-pending", t("projMedia.new")));
    }

    append(body, head);

    append(
      body,
      el(
        "p",
        "media-card-alt",
        item.altText
          ? t("projMedia.altOf", { text: item.altText })
          : t("projMedia.noAlt")
      )
    );

    if (item.desktopPath) {
      append(
        body,
        el(
          "p",
          "media-field-detail",
          `${
            item.bucket === "portfolio-staging"
              ? t("projMedia.staged")
              : t("projMedia.public")
          } · ${item.desktopPath}`
        )
      );
    }

    const actions = el("div", "ordered-actions");

    const up = actionButton(
      t("action.moveUp"),
      t("projMedia.moveUpOf", { label }),
      () => move(index, -1),
      "up"
    );

    const down = actionButton(
      t("action.moveDown"),
      t("projMedia.moveDownOf", { label }),
      () => move(index, 1),
      "down"
    );

    if (index === 0) {
      up.disabled = true;
    }

    if (index === items.length - 1) {
      down.disabled = true;
    }

    append(
      actions,
      up,
      down,
      actionButton(
        t("common.replace"),
        t("projMedia.replaceOf", { label }),
        () => openReplaceDialog(item),
        "replace"
      ),
      actionButton(
        t("projMedia.editAlt"),
        t("projMedia.editAltOf", { label }),
        () => openAltDialog(item),
        "alt"
      ),
      actionButton(
        t(item.isActive ? "common.disable" : "common.enable"),
        t("projMedia.toggleOf", {
          action: t(item.isActive ? "common.disable" : "common.enable"),
          label
        }),
        () => toggleActive(item),
        "active"
      )
    );

    const remove = actionButton(
      t("common.remove"),
      t("projMedia.removeOf", { label }),
      () => removeItem(item, position),
      "remove"
    );
    remove.classList.add("is-danger");
    append(actions, remove);

    append(body, actions);
    append(card, thumb, body);

    return card;
  }

  async function paintThumb(thumb, item) {
    if (item.pendingPreviewUrl) {
      clear(thumb);
      const img = el("img", "gallery-thumb-image");
      img.src = item.pendingPreviewUrl;
      img.alt = item.altText || t("projMedia.pendingDoc");
      append(thumb, img);
      return;
    }

    if (!item.desktopPath) {
      clear(thumb);
      append(thumb, el("span", "gallery-thumb-fallback", t("projMedia.noImage")));
      return;
    }

    const url = await resolveMediaUrl(item.bucket, item.desktopPath);

    if (!document.contains(thumb)) {
      return;
    }

    clear(thumb);

    if (!url) {
      append(thumb, el("span", "gallery-thumb-fallback", t("projMedia.unavailable")));
      return;
    }

    const img = el("img", "gallery-thumb-image");
    img.src = url;
    img.alt = item.altText || t("projMedia.docImage");
    img.loading = "lazy";
    img.addEventListener("error", () => {
      clear(thumb);
      append(thumb, el("span", "gallery-thumb-fallback", t("projMedia.unavailable")));
    });
    append(thumb, img);
  }

  function actionButton(text, ariaLabel, handler, action) {
    const button = el("button", "ordered-action", text);
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.dataset.action = action;
    button.addEventListener("click", handler);
    return button;
  }

  function move(index, direction) {
    const target = index + direction;

    if (target < 0 || target >= items.length) {
      return;
    }

    const copy = items.slice();
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);

    // Dense 0..n-1 ordering; gaps and duplicates in the stored data are
    // normalised the moment the owner reorders.
    items = copy.map((item, position) => ({ ...item, sortOrder: position }));

    render({ key: moved.key, action: direction < 0 ? "up" : "down" });
    notify();
  }

  function toggleActive(item) {
    items = items.map(entry =>
      entry.key === item.key ? { ...entry, isActive: !entry.isActive } : entry
    );

    render({ key: item.key, action: "active" });
    notify();
  }

  async function removeItem(item, position) {
    const confirmed = await confirmDialog({
      title: t("projMedia.removeTitle", { position }),
      lines: [
        item.altText ? `"${item.altText}"` : t("projMedia.thisImage"),
        t(item.id ? "projMedia.removeStored" : "projMedia.removePending")
      ],
      confirmLabel: t("common.remove"),
      variant: "danger"
    });

    if (!confirmed) {
      return;
    }

    releasePreview(item);

    if (item.id) {
      // Existing rows are remembered so the editor can delete their objects.
      removed.push({
        id: item.id,
        bucket: item.bucket,
        desktopPath: item.desktopPath,
        mobilePath: item.mobilePath
      });
    }

    items = items
      .filter(entry => entry.key !== item.key)
      .map((entry, index) => ({ ...entry, sortOrder: index }));

    // The card that owned the focus is gone; the Add button is the nearest
    // sensible landing place.
    render({ key: null });
    notify();
  }

  function openAltDialog(item) {
    const form = el("form", "modal-form");
    form.noValidate = true;

    const alt = textField({
      id: "documentation-alt",
      label: t("projMedia.altLabel"),
      maxLength: ALT_TEXT_MAX,
      value: item.altText,
      help: t("projMedia.altHelp")
    });

    append(form, alt.node);

    const initialValue = alt.value;

    const controller = openModal({
      title: t("projMedia.editAltTitle"),
      body: form,
      size: "small",
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        { label: t("projMedia.saveAlt"), variant: "primary", onClick: () => apply() }
      ],
      onRequestClose: async () => {
        if (alt.value === initialValue) {
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
      apply();
    });

    function apply() {
      const message = validateText(alt.value, {
        label: t("projMedia.altLabel"),
        maxLength: ALT_TEXT_MAX
      });

      alt.setError(message);

      if (message) {
        alt.focus();
        return;
      }

      items = items.map(entry =>
        entry.key === item.key ? { ...entry, altText: trimmed(alt.value) } : entry
      );

      controller.close();
      render({ key: item.key, action: "alt" });
      notify();
    }
  }

  function openAddDialog() {
    openMediaDialog({ mode: "add" });
  }

  function openReplaceDialog(item) {
    openMediaDialog({ mode: "replace", item });
  }

  function openMediaDialog({ mode, item }) {
    const isAdd = mode === "add";

    const form = el("form", "modal-form");
    form.noValidate = true;

    const formError = el("p", "form-error");
    formError.setAttribute("role", "alert");

    const field = createProjectMediaField({
      title: t(isAdd ? "projMedia.docImageField" : "projMedia.currentImage"),
      emptyText: t(isAdd ? "projMedia.chooseToAdd" : "projMedia.emptyField"),
      compact: true,
      current:
        !isAdd && item.desktopPath
          ? {
              bucket: item.bucket,
              desktopPath: item.desktopPath,
              mobilePath: item.mobilePath
            }
          : null,
      onChange: () => {
        formError.textContent = "";
      }
    });

    const alt = textField({
      id: "documentation-new-alt",
      label: t("projMedia.altLabel"),
      maxLength: ALT_TEXT_MAX,
      value: isAdd ? "" : item.altText,
      help: t("projMedia.altHelp")
    });

    append(form, formError, field.element, alt.node);

    const controller = openModal({
      title: t(isAdd ? "projMedia.addDocTitle" : "projMedia.replaceDocTitle"),
      body: form,
      actions: [
        {
          label: t("common.cancel"),
          variant: "secondary",
          onClick: ctl => ctl.requestClose("cancel")
        },
        {
          label: t(isAdd ? "projMedia.useImage" : "projMedia.useReplacement"),
          variant: "primary",
          onClick: () => apply()
        }
      ],
      onRequestClose: async () => {
        if (!field.hasPending() && (isAdd ? alt.value === "" : alt.value === item.altText)) {
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
      onClosed: () => field.destroy()
    });

    async function apply() {
      formError.textContent = "";

      const message = validateText(alt.value, {
        label: t("projMedia.altLabel"),
        maxLength: ALT_TEXT_MAX
      });

      alt.setError(message);

      if (message) {
        alt.focus();
        return;
      }

      const files = field.getPendingFiles();

      if (isAdd && !files) {
        formError.textContent = t("projMedia.chooseFirst");
        return;
      }

      const previewUrl = files ? await field.resolvePreviewUrl() : null;
      let focusKey = isAdd ? null : item.key;

      if (isAdd) {
        const key = `local-${(localIdCounter += 1)}`;
        focusKey = key;

        items = items.concat({
          id: null,
          key,
          bucket: null,
          desktopPath: null,
          mobilePath: null,
          altText: trimmed(alt.value),
          sortOrder: items.length,
          isActive: true,
          pendingFiles: files,
          // The blob URL is cloned from the picker so closing the dialog cannot
          // revoke the thumbnail still shown in the gallery.
          pendingPreviewUrl: URL.createObjectURL(files.desktopFile)
        });
      } else {
        items = items.map(entry => {
          if (entry.key !== item.key) {
            return entry;
          }

          if (files) {
            releasePreview(entry);
          }

          return {
            ...entry,
            altText: trimmed(alt.value),
            pendingFiles: files || entry.pendingFiles,
            pendingPreviewUrl: files
              ? URL.createObjectURL(files.desktopFile)
              : entry.pendingPreviewUrl
          };
        });
      }

      controller.close();
      render({ key: focusKey, action: "replace" });
      notify();
    }
  }

  render();

  return {
    element: root,

    getItems: () => items.map(item => ({ ...item })),
    getRemoved: () => removed.slice(),
    count: () => items.length,

    snapshot: () =>
      JSON.stringify({
        items: items.map(item => [
          item.id || null,
          item.altText,
          item.sortOrder,
          item.isActive,
          Boolean(item.pendingFiles)
        ]),
        removed: removed.map(entry => entry.id)
      }),

    /* Called after a successful save so the gallery mirrors the database. */
    setSavedMedia(rows) {
      items.forEach(releasePreview);

      items = rows.map((row, index) => ({
        id: row.id,
        key: row.id,
        bucket: row.bucket_name,
        desktopPath: row.desktop_path,
        mobilePath: row.mobile_path,
        altText: row.alt_text || "",
        sortOrder: Number(row.sort_order) || index,
        isActive: row.is_active !== false,
        pendingFiles: null,
        pendingPreviewUrl: null
      }));

      removed = [];
      render();
    },

    destroy() {
      items.forEach(releasePreview);
    }
  };
}
