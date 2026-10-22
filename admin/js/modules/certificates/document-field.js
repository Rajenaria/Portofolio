/*
  Certificate document field (Phase D).

  Owns three things and nothing else:

    1. showing what is stored, with authenticated preview/download actions,
    2. validating a picked file through document-processor.js,
    3. holding the processed file until the editor saves.

  IT NEVER UPLOADS. Storage work belongs to core/document-storage.js and is
  triggered by the editor's Save action, so a failed form never leaves an
  orphan object behind.

  "View Certificate" opens in a new tab with rel="noopener noreferrer". There
  is deliberately no iframe or <embed> viewer: the site CSP sets
  frame-src 'none' and object-src 'none', and an in-page viewer would mean
  relaxing both for a cosmetic gain.
*/

import { el, append, clear } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import {
  processDocument,
  DocumentProcessorError,
  MAX_DOCUMENT_BYTES
} from "../../core/document-processor.js";
import { hasDocument, openDocument } from "../../core/document-storage.js";
import { formatBytes } from "../../core/image-processor.js";
import { t } from "../../core/i18n.js";

const TYPE_LABELS = {
  pdf: "certDoc.typePdf",
  webp: "certDoc.typeWebp"
};

function typeLabel(type) {
  return TYPE_LABELS[type] ? t(TYPE_LABELS[type]) : t("certDoc.document");
}

export function createDocumentField({ current, onChange }) {
  const root = el("div", "document-field");

  const statusSlot = el("div", "document-field-status");
  const actions = el("div", "document-field-actions");

  const input = el("input", "visually-hidden");
  input.type = "file";
  input.id = "certificate-document-input";
  input.accept = ".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

  const chooseButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("certDoc.upload")
  );
  chooseButton.type = "button";

  const viewLink = el(
    "a",
    "admin-button admin-button-secondary",
    t("certDoc.view")
  );
  viewLink.target = "_blank";
  viewLink.rel = "noopener noreferrer";

  const downloadLink = el("a", "admin-button admin-button-ghost", t("certDoc.download"));
  downloadLink.target = "_blank";
  downloadLink.rel = "noopener noreferrer";

  const removeButton = el(
    "button",
    "admin-button admin-button-ghost",
    t("certDoc.remove")
  );
  removeButton.type = "button";

  const discardButton = el(
    "button",
    "admin-button admin-button-ghost",
    t("certDoc.discard")
  );
  discardButton.type = "button";

  append(actions, chooseButton, viewLink, downloadLink, removeButton, discardButton);
  append(root, input, statusSlot, actions);

  /*
    stored   : what the database currently references
    pending  : a validated file waiting for Save
    removing : the owner asked to detach the stored document on Save
  */
  let stored = current && current.path ? { ...current } : null;
  let pending = null;
  let removing = false;

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  function render() {
    clear(statusSlot);

    const url = stored && hasDocument(stored.bucket, stored.path);
    const showStored = Boolean(stored) && !removing && !pending;

    viewLink.hidden = !showStored || !url;
    downloadLink.hidden = viewLink.hidden;
    removeButton.hidden = !showStored;
    discardButton.hidden = !pending && !removing;
    chooseButton.textContent =
      stored && !removing ? t("certDoc.replace") : t("certDoc.upload");

    viewLink.href = "#";
    downloadLink.href = "#";

    if (pending) {
      const line = el("p", "document-field-line");
      append(
        line,
        el("span", "status-badge status-badge-pending", t("certDoc.pending"))
      );
      append(statusSlot, line);

      append(
        statusSlot,
        el(
          "p",
          "document-field-detail",
          `${typeLabel(pending.type)} · ${formatBytes(pending.storedSize)}`
        ),
        el(
          "p",
          "document-field-detail",
          t("certDoc.from", { name: pending.originalName })
        ),
        el("p", "form-help", t("certDoc.pendingHelp"))
      );
      return;
    }

    if (removing) {
      const line = el("p", "document-field-line");
      append(
        line,
        el("span", "status-badge status-badge-inactive", t("certDoc.willRemove"))
      );
      append(statusSlot, line);
      append(statusSlot, el("p", "form-help", t("certDoc.removeHelp")));
      return;
    }

    if (stored) {
      append(
        statusSlot,
        el("p", "document-field-detail", typeLabel(stored.type)),
        el("p", "document-field-detail", stored.path)
      );
      return;
    }

    append(
      statusSlot,
      el(
        "p",
        "form-help",
        t("certDoc.empty", { size: formatBytes(MAX_DOCUMENT_BYTES) })
      )
    );
  }

  chooseButton.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.value = "";

    if (!file) {
      return;
    }

    chooseButton.disabled = true;

    try {
      const result = await processDocument(file);
      pending = result;
      removing = false;
      render();
      notify();
    } catch (error) {
      if (!(error instanceof DocumentProcessorError)) {
        console.error(error);
      }

      toast(
        error && error.message ? error.message : t("certDoc.errGeneric"),
        "error"
      );
    } finally {
      chooseButton.disabled = false;
    }
  });

  removeButton.addEventListener("click", () => {
    removing = true;
    pending = null;
    render();
    notify();
  });

  discardButton.addEventListener("click", () => {
    pending = null;
    removing = false;
    render();
    notify();
  });

  [viewLink, downloadLink].forEach(link => link.addEventListener("click", async event => {
    event.preventDefault();
    if (!stored || removing || pending || link.getAttribute("aria-busy") === "true") return;
    link.setAttribute("aria-busy", "true");
    try { await openDocument(stored.bucket, stored.path, { download: link === downloadLink }); }
    finally { link.removeAttribute("aria-busy"); }
  }));
  render();

  return {
    element: root,

    hasPending: () => Boolean(pending),
    isRemoving: () => removing,
    isDirty: () => Boolean(pending) || removing,

    getPending: () => pending,
    getStored: () => (stored ? { ...stored } : null),

    /* Called after a successful save so the field reflects what is now stored. */
    commit(next) {
      pending = null;
      removing = false;
      stored = next && next.path ? { ...next } : null;
      render();
    },

    destroy() {
      clear(root);
    }
  };
}
