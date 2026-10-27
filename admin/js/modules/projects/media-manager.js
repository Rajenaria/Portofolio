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
import { resolveMediaUrl, newMediaId } from "../../core/media-storage.js";
import { createProjectMediaField, deriveVariants } from "./media-field.js";
import { toast } from "../../core/toast.js";
import { ACCEPTED_MIME_TYPES } from "../../core/image-processor.js";
import { applyImageCrop } from "../../../../js/cms/project-cover.js";
import { tIndonesian as t } from "../../core/i18n.js";

export const ALT_TEXT_MAX = 250;

let localIdCounter = 0;

export function createDocumentationManager({ initialMedia = [], metadata = {}, onChange, onCrop, getCrop = () => ({}) }) {
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
  let adding = false, destroyed = false;
  const multiple = el("input"); multiple.type = "file"; multiple.multiple = true; multiple.accept = ACCEPTED_MIME_TYPES.join(","); multiple.hidden = true;
  const batch = el("button","admin-button admin-button-secondary","Tambah Beberapa Gambar"); batch.type = "button";
  batch.addEventListener("click",() => multiple.click());
  multiple.addEventListener("change",async () => {
    if (adding) return;
    const files = [...multiple.files]; multiple.value = "";
    if (files.length > 20) { toast("Pilih maksimal 20 gambar dalam satu unggahan.","error"); return; }
    adding = true; root.inert = true; notify();
    try {
      for (const file of files) {
        const variants = await deriveVariants(file), id = newMediaId();
        if (destroyed) break;
        const pair = {desktopFile:variants.desktop.optimized.file,mobileFile:variants.mobile.optimized.file};
        items.push({id,key:id,isNew:true,bucket:null,desktopPath:null,mobilePath:null,altText:file.name.replace(/\.[^.]+$/,"").slice(0,ALT_TEXT_MAX),sortOrder:items.length,isActive:true,pendingFiles:pair,pendingPreviewUrl:URL.createObjectURL(pair.desktopFile)});
      }
    } catch (error) { toast("Sebagian gambar tidak dapat diproses. Gambar yang berhasil tetap tersimpan di editor; periksa sebelum menyimpan.","error"); }
    finally { adding = false; root.inert = false; render(); notify(); }
  });
  append(header,batch,multiple);

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
    title: metadata[row.id]?.title ?? row.alt_text ?? "",
    caption: metadata[row.id]?.caption || "",
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
    pendingFiles: null,
    pendingPreviewUrl: null
  }));

  let removed = [];

  function notify() {
    if (destroyed) return;
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

    if (onCrop) append(actions,actionButton("Atur Posisi","Atur posisi gambar pada Gallery 3D",() => onCrop(item),"crop"));
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
      applyImageCrop(img,getCrop(item.id));
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
    applyImageCrop(img,getCrop(item.id));
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

    if (item.id && !item.isNew) {
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
    const form = el("form", "modal-form project-editor-modal-body");
    form.noValidate = true;

    const alt = textField({
      id: "documentation-alt",
      label: t("projMedia.altLabel"),
      maxLength: ALT_TEXT_MAX,
      value: item.title ?? item.altText,
      help: t("projMedia.altHelp")
    });

    const caption = textField({id:"documentation-caption",label:"Keterangan (opsional)",maxLength:ALT_TEXT_MAX,value:item.caption || "",help:"Judul dan keterangan tampil bersama pada galeri publik; total maksimal 250 karakter."});
    append(form, alt.node,caption.node);

    const initialValue = JSON.stringify([alt.value,caption.value]);

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
        if (JSON.stringify([alt.value,caption.value]) === initialValue) {
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
      const message = validateText([alt.value.trim(),caption.value.trim()].filter(Boolean).join(" \u2014 "), {
        label: t("projMedia.altLabel"),
        maxLength: ALT_TEXT_MAX
      });

      alt.setError(message);

      if (message) {
        alt.focus();
        return;
      }

      items = items.map(entry =>
        entry.key === item.key ? { ...entry, title:trimmed(alt.value),caption:trimmed(caption.value),altText:[trimmed(alt.value),trimmed(caption.value)].filter(Boolean).join(" \u2014 ") } : entry
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

    const form = el("form", "modal-form project-editor-modal-body");
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
      value: isAdd ? "" : item.title ?? item.altText,
      help: t("projMedia.altHelp")
    });

    const caption = textField({id:"documentation-new-caption",label:"Keterangan (opsional)",maxLength:ALT_TEXT_MAX,value:isAdd ? "" : item.caption || ""});
    append(form, formError, field.element, alt.node,caption.node);

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
        if (!field.hasPending() && (isAdd ? alt.value === "" && caption.value === "" : alt.value === (item.title ?? item.altText) && caption.value === (item.caption || ""))) {
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

      const message = validateText([alt.value.trim(),caption.value.trim()].filter(Boolean).join(" \u2014 "), {
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
          id: newMediaId(),
          isNew: true,
          key,
          bucket: null,
          desktopPath: null,
          mobilePath: null,
          title:trimmed(alt.value),caption:trimmed(caption.value),altText:[trimmed(alt.value),trimmed(caption.value)].filter(Boolean).join(" \u2014 "),
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
            title:trimmed(alt.value),caption:trimmed(caption.value),altText:[trimmed(alt.value),trimmed(caption.value)].filter(Boolean).join(" \u2014 "),
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
    getDetails: () => Object.fromEntries(items.map(item => [item.id,{title:item.title ?? item.altText,caption:item.caption || ""}])),
    getRemoved: () => removed.slice(),
    count: () => items.length,
    isProcessing: () => adding,
    refreshPreviews: () => render(),
    commitAdded(key,stored) {
      const item = items.find(entry => entry.key === key); if (!item) return;
      releasePreview(item); Object.assign(item,stored,{isNew:false,pendingFiles:null,pendingPreviewUrl:null});
    },

    snapshot: () =>
      JSON.stringify({
        items: items.map(item => [
          item.id || null,
          item.altText, item.title, item.caption,
          item.sortOrder,
          item.isActive,
          Boolean(item.pendingFiles)
        ]),
        removed: removed.map(entry => entry.id)
      }),

    /* Called after a successful save so the gallery mirrors the database. */
    setSavedMedia(rows) {
      items.forEach(releasePreview);

      const details = Object.fromEntries(items.map(item => [item.id,{title:item.title ?? item.altText,caption:item.caption || ""}]));
      items = rows.map((row, index) => ({
        id: row.id,
        key: row.id,
        bucket: row.bucket_name,
        desktopPath: row.desktop_path,
        mobilePath: row.mobile_path,
        altText: row.alt_text || "",
        title:details[row.id]?.title ?? row.alt_text ?? "", caption:details[row.id]?.caption || "",
        sortOrder: Number(row.sort_order) || index,
        isActive: row.is_active !== false,
        pendingFiles: null,
        pendingPreviewUrl: null
      }));

      removed = [];
      render();
    },

    destroy() {
      destroyed = true;
      items.forEach(releasePreview);
    }
  };
}
