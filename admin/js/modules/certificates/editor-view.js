/*
  Certificate editor (Phase C).

  Full-page Add/Edit form, never a modal, matching the Experience and Projects
  editors. The form is organised by WHICH FACE OF THE CARD each field appears
  on, because that is how the owner thinks about it:

      FRONT   title, publisher, period, category (-> icon)
      BACK    title (shared), issuer line, badge, description

  `title` appears once. The public card renders it on both faces; giving it two
  inputs would let the two sides drift apart.

  The badge stays on the BACK. The public front is deliberately sparse — icon,
  period, title, publisher — and this editor previews the card, it does not
  redesign it.

  REQUIRED FIELDS
  --------------
  Only Title and Category are required, and they are required to save at all,
  not merely to publish. Everything the front and back render is optional in
  the public markup: js/certificates.js emits the year, publisher and subtitle
  nodes unconditionally (an empty one simply renders empty) and skips the badge
  and description entirely when they are blank. So a certificate with just a
  title and a category renders coherently, and marking more fields with a red
  asterisk would be inventing a rule the card does not have.

  The certificate document is uploaded here through core/document-storage.js,
  which never deletes the previous object until the database has accepted the
  new reference.
*/

import { supabaseClient } from "../../core/supabase.js";
import { el, append, clear } from "../../core/dom.js";
import { toast } from "../../core/toast.js";

import {
  textField,
  textareaField,
  selectField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import { categoryOptions, DEFAULT_CATEGORY, isKnownCategory } from "./categories.js";
import { buildCertificatePreview } from "./preview.js";
import { createDocumentField } from "./document-field.js";
import { replaceDocument, removeDocument, documentUrl } from "../../core/document-storage.js";

/* Mirrors the column widths in 20260818110000_certificates_schema.sql. */
const LIMITS = {
  title: 180,
  publisher: 140,
  period: 60,
  issuerLine: 180,
  badgeText: 60,
  description: 400,
  externalUrl: 500
};

const HTTP_URL = /^https?:\/\/[^\s]+$/i;

export function createCertificateEditor({ record, onDirtyChange, onSaved, onBack }) {
  const isNew = !record;
  const root = el("div", "certificate-editor-view");

  const fields = {
    title: textField({
      id: "certificate-title",
      label: "Title",
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : "",
      help: "Shown large on the front of the card, and again on the back."
    }),

    publisher: textField({
      id: "certificate-publisher",
      label: "Publisher / Institution",
      maxLength: LIMITS.publisher,
      value: record ? record.publisher : "",
      help: "Small uppercase line under the title on the front. For example: Udemy."
    }),

    period: textField({
      id: "certificate-period",
      label: "Period / Year",
      maxLength: LIMITS.period,
      value: record ? record.period : "",
      help: "Free text, so ranges work. For example: 2025, or 2021 — 2025."
    }),

    category: selectField({
      id: "certificate-category",
      label: "Category",
      required: true,
      options: categoryOptions(),
      value:
        record && isKnownCategory(record.category)
          ? record.category
          : DEFAULT_CATEGORY,
      help: "Chooses the icon shown on the front of the card. The icon itself is not editable."
    }),

    issuerLine: textField({
      id: "certificate-issuer-line",
      label: "Issuer Line",
      maxLength: LIMITS.issuerLine,
      value: record ? record.issuer_line : "",
      help: "Uppercase line on the back. For example: Universitas Telkom · Bandung."
    }),

    badgeText: textField({
      id: "certificate-badge-text",
      label: "Badge / Value",
      maxLength: LIMITS.badgeText,
      value: record ? record.badge_text : "",
      help: "Optional pill on the back. For example: GPA 3.51/4.00. Left empty, no pill is rendered."
    }),

    description: textareaField({
      id: "certificate-description",
      label: "Description",
      maxLength: LIMITS.description,
      value: record ? record.description : "",
      rows: 4,
      help: "Plain text only, shown on the back. No HTML or formatting markup."
    }),

    externalUrl: textField({
      id: "certificate-external-url",
      label: "External verification URL",
      maxLength: LIMITS.externalUrl,
      value: record ? record.external_url : "",
      help: "Optional. A link the issuer hosts, for example a Credly badge. Must start with http:// or https://."
    })
  };

  /*
    The uploaded certificate itself. The field validates and holds the file;
    nothing reaches Storage until Save, so abandoning the form cannot leave an
    orphan object.
  */
  const documentField = createDocumentField({
    current:
      record && record.document_path
        ? {
            bucket: record.document_bucket,
            path: record.document_path,
            type: record.document_type
          }
        : null,
    onChange: () => markDirty()
  });

  /* ---------------- layout ---------------- */

  const backButton = el("button", "admin-button admin-button-ghost", "← Back to Certificates");
  backButton.type = "button";
  backButton.addEventListener("click", () => onBack());

  append(root, backButton);

  const frontSection = el("section", "admin-subsection");
  append(
    frontSection,
    el("h3", "subsection-title", "Front of card"),
    el(
      "p",
      "form-help",
      "The front is deliberately sparse: icon, period, title and publisher."
    )
  );

  const frontGrid = el("div", "form-grid");
  append(frontGrid, fields.title.node, fields.publisher.node);
  append(frontSection, frontGrid);

  const frontGrid2 = el("div", "form-grid");
  append(frontGrid2, fields.period.node, fields.category.node);
  append(frontSection, frontGrid2);

  const backSection = el("section", "admin-subsection");
  append(
    backSection,
    el("h3", "subsection-title", "Back of card"),
    el(
      "p",
      "form-help",
      "The back repeats the title, then adds the issuer line, an optional badge and a short description."
    )
  );

  const backGrid = el("div", "form-grid");
  append(backGrid, fields.issuerLine.node, fields.badgeText.node);
  append(backSection, backGrid, fields.description.node);

  const documentSection = el("section", "admin-subsection");
  append(
    documentSection,
    el("h3", "subsection-title", "Certificate document"),
    el(
      "p",
      "form-help",
      "The certificate itself. It opens in a new tab from the public card once the public section is connected to the CMS."
    ),
    documentField.element,
    fields.externalUrl.node
  );

  const previewSection = el("section", "admin-subsection");
  append(previewSection, el("h3", "subsection-title", "Preview"));

  const previewHost = el("div", "cert-preview-host");
  append(previewSection, previewHost);

  const actions = el("div", "form-actions");

  const saveButton = el("button", "admin-button admin-button-primary", "Save Certificate");
  saveButton.type = "button";

  append(actions, saveButton);
  append(root, frontSection, backSection, documentSection, previewSection, actions);

  /* ---------------- live preview ---------------- */

  function currentData() {
    return {
      title: trimmed(fields.title.value),
      publisher: trimmed(fields.publisher.value),
      period: trimmed(fields.period.value),
      category: fields.category.value,
      issuerLine: trimmed(fields.issuerLine.value),
      badgeText: trimmed(fields.badgeText.value),
      description: trimmed(fields.description.value),
      externalUrl: trimmed(fields.externalUrl.value),
      /* Pending files are not uploaded yet, so the preview links to what is
         actually reachable today: the stored document, or the issuer URL. */
      documentUrl: (() => {
        const stored = documentField.getStored();
        return stored && !documentField.isRemoving()
          ? documentUrl(stored.bucket, stored.path)
          : null;
      })()
    };
  }

  function renderPreview() {
    clear(previewHost);
    append(previewHost, buildCertificatePreview(currentData()));
  }

  /* ---------------- dirty tracking ---------------- */

  function snapshot() {
    return JSON.stringify(currentData());
  }

  let baseline = snapshot();
  let dirty = false;
  let saving = false;

  function computeDirty() {
    return snapshot() !== baseline || documentField.isDirty();
  }

  function markDirty() {
    renderPreview();

    const next = computeDirty();

    if (next !== dirty) {
      dirty = next;
      onDirtyChange(dirty);
    }
  }

  Object.values(fields).forEach(field => {
    field.control.addEventListener("input", markDirty);
    field.control.addEventListener("change", markDirty);
  });

  renderPreview();

  /* ---------------- save ---------------- */

  function setSaving(next) {
    saving = next;
    saveButton.disabled = next;
    backButton.disabled = next;
    saveButton.textContent = next ? "Saving..." : "Save Certificate";
  }

  async function save() {
    if (saving) {
      return false;
    }

    const valid = applyValidation(fields, {
      title: { label: "Title", required: true, maxLength: LIMITS.title },
      publisher: { label: "Publisher / Institution", maxLength: LIMITS.publisher },
      period: { label: "Period / Year", maxLength: LIMITS.period },
      issuerLine: { label: "Issuer Line", maxLength: LIMITS.issuerLine },
      badgeText: { label: "Badge / Value", maxLength: LIMITS.badgeText },
      description: { label: "Description", maxLength: LIMITS.description },
      externalUrl: { label: "External verification URL", maxLength: LIMITS.externalUrl }
    });

    if (!valid) {
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    const externalUrl = trimmed(fields.externalUrl.value);

    /* Mirrors certificates_external_url_check; the database rejects anything
       else regardless, this just explains it before the round trip. */
    if (externalUrl !== "" && !HTTP_URL.test(externalUrl)) {
      fields.externalUrl.setError("Enter a full URL starting with http:// or https://.");
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    if (!isKnownCategory(fields.category.value)) {
      fields.category.setError("Choose a category from the list.");
      toast("Please correct the highlighted fields.", "error");
      return false;
    }

    const payload = {
      title: trimmed(fields.title.value),
      publisher: trimmedOrNull(fields.publisher.value),
      period: trimmedOrNull(fields.period.value),
      category: fields.category.value,
      issuer_line: trimmedOrNull(fields.issuerLine.value),
      badge_text: trimmedOrNull(fields.badgeText.value),
      description: trimmedOrNull(fields.description.value),
      external_url: trimmedOrNull(fields.externalUrl.value)
    };

    setSaving(true);

    /*
      One writer for both create and update, so the document paths are set in
      exactly the same statement as the rest of the record.
    */
    async function persist(extra) {
      const body = { ...payload, ...extra };

      if (isNew) {
        /*
          New certificates always start as drafts, at the end of the list.
          Status is never set here: publishing is an explicit action in the
          list view, where the minimum-published rule is explained.
        */
        const { data: tail } = await supabaseClient
          .from("certificates")
          .select("sort_order")
          .is("deleted_at", null)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextOrder =
          tail && tail.length > 0 ? Number(tail[0].sort_order) + 1 : 0;

        return await supabaseClient
          .from("certificates")
          .insert({ ...body, status: "draft", sort_order: nextOrder })
          .select("id")
          .maybeSingle();
      }

      return await supabaseClient
        .from("certificates")
        .update(body)
        .eq("id", record.id)
        .select("id")
        .maybeSingle();
    }

    const pendingDocument = documentField.getPending();
    const storedDocument = documentField.getStored();
    const removingDocument = documentField.isRemoving();

    let result = null;
    let committedDocument = storedDocument;
    let cleanupWarning = null;

    try {
      if (pendingDocument) {
        /*
          Upload, verify, then commit the row in the same call. document-storage
          only deletes the previous object AFTER the database has accepted the
          new reference, so any failure leaves the old document live.
        */
        const outcome = await replaceDocument({
          file: pendingDocument.file,
          type: pendingDocument.type,
          previous: storedDocument,
          commit: async paths => {
            result = await persist({
              document_bucket: paths.bucket,
              document_path: paths.path,
              document_type: paths.type
            });

            if (result.error || !result.data) {
              throw new Error("certificate write did not apply");
            }
          }
        });

        committedDocument = {
          bucket: outcome.bucket,
          path: outcome.path,
          type: outcome.type
        };
        cleanupWarning = outcome.cleanupWarning;
      } else if (removingDocument) {
        result = await persist({
          document_bucket: null,
          document_path: null,
          document_type: null
        });

        if (result.error || !result.data) {
          throw new Error("certificate write did not apply");
        }

        /* Detach first, delete second: an object with no row pointing at it is
           recoverable noise, a row pointing at a deleted object is a broken
           link on the public site. */
        if (storedDocument) {
          const removed = await removeDocument(storedDocument.bucket, storedDocument.path);

          if (removed.failed.length > 0) {
            cleanupWarning =
              "Saved. The old document file could not be removed and may need manual cleanup.";
          }
        }

        committedDocument = null;
      } else {
        result = await persist({});
      }
    } catch (error) {
      console.error(error);
      setSaving(false);

      toast(
        error && error.name === "MediaStorageError" && error.message
          ? error.message
          : isNew
            ? "Could not create this certificate. Your changes are still here."
            : "Could not save this certificate. Your changes are still here.",
        "error"
      );
      return false;
    }

    setSaving(false);

    if (!result || result.error || !result.data) {
      if (result && result.error) {
        console.error(result.error);
      }

      toast(
        isNew
          ? "Could not create this certificate. Your changes are still here."
          : "Could not save this certificate. Your changes are still here.",
        "error"
      );
      return false;
    }

    documentField.commit(committedDocument);

    baseline = snapshot();
    dirty = false;
    onDirtyChange(false);

    if (cleanupWarning) {
      toast(cleanupWarning, "error");
    } else {
      toast(isNew ? "Certificate created as a draft." : "Certificate saved.");
    }

    if (typeof onSaved === "function") {
      onSaved(result.data.id);
    }

    return true;
  }

  saveButton.addEventListener("click", save);

  return {
    element: root,
    isDirty: computeDirty,
    save,
    destroy() {
      documentField.destroy();
      clear(root);
    }
  };
}
