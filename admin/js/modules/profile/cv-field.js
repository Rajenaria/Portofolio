/*
  CV field (Profile > Hero tab).

  Same three responsibilities as certificates/document-field.js — show what is
  stored, validate a picked file, hold it until Save — but PDF only, because
  this file is handed straight to visitors by the public Download CV button.

  Kept separate from the certificate field rather than adding a mode switch
  there: the two differ in accepted types, labels and the download filename,
  and neither should grow a branch for the other.

  IT NEVER UPLOADS. Storage work belongs to core/document-storage.js and is
  triggered by the Hero tab's Save action, so an abandoned form never leaves an
  orphan object behind.

  SECURITY: every label and value reaches the DOM through core/dom.js, which
  writes with textContent. There is no innerHTML path here.
*/

import { el, append, clear } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import {
  processDocument,
  DocumentProcessorError,
  MAX_DOCUMENT_BYTES
} from "../../core/document-processor.js";
import { documentUrl, documentDownloadUrl } from "../../core/document-storage.js";
import { formatBytes } from "../../core/image-processor.js";
import { t, getLanguage } from "../../core/i18n.js";

export function createCvField({ current, onChange, downloadName }) {
  const root = el("div", "document-field");

  const statusSlot = el("div", "document-field-status");
  const actions = el("div", "document-field-actions");

  const input = el("input", "visually-hidden");
  input.type = "file";
  input.id = "profile-cv-input";
  input.accept = ".pdf,application/pdf";

  const chooseButton = el(
    "button",
    "admin-button admin-button-secondary",
    t("cv.upload")
  );
  chooseButton.type = "button";

  const viewLink = el("a", "admin-button admin-button-secondary", t("cv.view"));
  viewLink.target = "_blank";
  viewLink.rel = "noopener noreferrer";

  const downloadLink = el("a", "admin-button admin-button-ghost", t("cv.download"));
  downloadLink.target = "_blank";
  downloadLink.rel = "noopener noreferrer";

  const removeButton = el("button", "admin-button admin-button-ghost", t("cv.remove"));
  removeButton.type = "button";

  const discardButton = el("button", "admin-button admin-button-ghost", t("cv.discard"));
  discardButton.type = "button";

  append(actions, chooseButton, viewLink, downloadLink, removeButton, discardButton);
  append(root, input, statusSlot, actions);

  /*
    stored   : what the database currently references
    pending  : a validated file waiting for Save
    removing : the owner asked to detach the stored CV on Save
  */
  let stored = current && current.path ? { ...current } : null;
  let pending = null;
  let removing = false;

  function notify() {
    if (typeof onChange === "function") {
      onChange();
    }
  }

  /* Dates follow the interface language, matching core/dom.js updatedAt(). */
  function formatUpdated(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toLocaleDateString(getLanguage() === "id" ? "id-ID" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function render() {
    clear(statusSlot);

    const url = stored ? documentUrl(stored.bucket, stored.path) : null;
    const showStored = Boolean(stored) && !removing && !pending;

    viewLink.hidden = !showStored || !url;
    downloadLink.hidden = viewLink.hidden;
    removeButton.hidden = !showStored;
    discardButton.hidden = !pending && !removing;
    chooseButton.textContent = stored && !removing ? t("cv.replace") : t("cv.upload");

    if (url) {
      viewLink.href = url;
      downloadLink.href = documentDownloadUrl(
        stored.bucket,
        stored.path,
        typeof downloadName === "function" ? downloadName() : null
      );
    } else {
      viewLink.removeAttribute("href");
      downloadLink.removeAttribute("href");
    }

    if (pending) {
      const line = el("p", "document-field-line");
      append(line, el("span", "status-badge status-badge-pending", t("cv.pending")));
      append(statusSlot, line);

      append(
        statusSlot,
        el(
          "p",
          "document-field-detail",
          `${t("cv.storedPdf")} · ${formatBytes(pending.storedSize)}`
        ),
        el("p", "document-field-detail", t("cv.from", { name: pending.originalName })),
        el("p", "form-help", t("cv.pendingHelp"))
      );
      return;
    }

    if (removing) {
      const line = el("p", "document-field-line");
      append(line, el("span", "status-badge status-badge-inactive", t("cv.willRemove")));
      append(statusSlot, line);
      append(statusSlot, el("p", "form-help", t("cv.removeHelp")));
      return;
    }

    if (stored) {
      append(statusSlot, el("p", "document-field-detail", t("cv.storedPdf")));

      const updated = formatUpdated(stored.updatedAt);

      if (updated) {
        append(
          statusSlot,
          el("p", "document-field-detail", t("cv.updated", { date: updated }))
        );
      }

      return;
    }

    append(
      statusSlot,
      el("p", "form-help", t("cv.empty", { size: formatBytes(MAX_DOCUMENT_BYTES) }))
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

      /*
        processDocument also accepts images and converts them to WebP. That is
        right for a certificate scan and wrong here: the public button hands
        this file to a visitor as their CV, so anything that is not a PDF is
        rejected rather than silently converted.
      */
      if (result.type !== "pdf") {
        toast(t("cv.errNotPdf"), "error");
        return;
      }

      pending = result;
      removing = false;
      render();
      notify();
    } catch (error) {
      if (!(error instanceof DocumentProcessorError)) {
        console.error(error);
      }

      toast(error && error.message ? error.message : t("cv.errGeneric"), "error");
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
