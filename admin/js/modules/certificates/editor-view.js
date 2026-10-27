/* Certificate editor: public card fields, existing document pipeline and lifecycle.
   Historical issuer_line/description remain in the database and are omitted from
   writes. Front/back preview uses the same category mapping and public face CSS.
*/

import { supabaseClient } from "../../core/supabase.js";
import { requireCmsUpgrade } from "../../../../js/cms/backend-compatibility.js";
import { el, append, clear, statusBadge } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { tIndonesian as t } from "../../core/i18n.js";

import {
  textField,
  selectField,
  applyValidation,
  trimmed,
  trimmedOrNull
} from "../../core/form.js";

import { categoryOptions, DEFAULT_CATEGORY, isKnownCategory } from "./categories.js";
import { buildCertificatePreview } from "./preview.js";
import { createDocumentField } from "./document-field.js";
import { replaceDocument, removeDocument, hasDocument } from "../../core/document-storage.js";

/* Mirrors the column widths in 20260818110000_certificates_schema.sql. */
const LIMITS = {
  title: 80,
  publisher: 64,
  period: 60,
  badgeText: 60,
  externalUrl: 500
};

const HTTP_URL = /^https?:\/\/[^\s]+$/i;

export function createCertificateEditor({ record, onDirtyChange, onSaved, onBack }) {
  requireCmsUpgrade();
  const isNew = !record;
  const root = el("div", "certificate-editor-view");
  root.lang = "id";

  const fields = {
    title: textField({
      id: "certificate-title",
      label: t("certEditor.fieldTitle"),
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : "",
      help: "Maksimal 80 karakter. Tampil pada sisi depan dan belakang kartu."
    }),

    publisher: textField({
      id: "certificate-publisher",
      label: "Penerbit / Penyelenggara (opsional)",
      maxLength: LIMITS.publisher,
      value: record ? record.publisher : "",
      help: "Maksimal 64 karakter. Tampil bersama kategori sertifikat."
    }),

    period: textField({
      id: "certificate-period",
      label: t("certEditor.fieldPeriod"),
      maxLength: LIMITS.period,
      value: record ? record.period : "",
      help: t("certEditor.fieldPeriodHelp")
    }),

    category: selectField({
      id: "certificate-category",
      label: t("certEditor.fieldCategory"),
      required: true,
      options: categoryOptions(),
      value:
        record && isKnownCategory(record.category)
          ? record.category
          : DEFAULT_CATEGORY,
      help: t("certEditor.fieldCategoryHelp")
    }),

    badgeText: textField({
      id: "certificate-badge-text",
      label: "Nilai / Hasil (opsional)",
      maxLength: LIMITS.badgeText,
      value: record ? record.badge_text : "",
      help: "Maksimal 60 karakter. Kosongkan jika tidak diperlukan."
    }),

    credentialId: textField({
      id: "certificate-credential-id", label: "ID Kredensial (opsional)",
      maxLength: 80, value: record?.credential_id || ""
    }),

    externalUrl: textField({
      id: "certificate-external-url",
      label: t("certEditor.fieldExternalUrl"),
      maxLength: LIMITS.externalUrl,
      value: record ? record.external_url : "",
      help: t("certEditor.fieldExternalUrlHelp")
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

  const backButton = el(
    "button",
    "admin-button admin-button-ghost",
    t("certEditor.back")
  );
  backButton.type = "button";
  backButton.addEventListener("click", () => onBack());

  append(root, backButton, el("p","form-help","Kolom bertanda * wajib diisi. Kolom lainnya opsional; ID kredensial dan nilai/hasil hanya tampil jika diisi. Ikon kartu mengikuti kategori secara otomatis."));

  /* One shape for every group, so the five sections read as one form rather
     than five improvised panels. */
  function group(titleKey, helpKey) {
    const node = el("section", "admin-subsection");

    append(node, el("h3", "subsection-title", t(titleKey)));

    if (helpKey) {
      append(node, el("p", "form-help", t(helpKey)));
    }

    return node;
  }

  const basicSection = group("certEditor.basic", "certEditor.basicHelp");

  const basicGrid = el("div", "form-grid");
  append(basicGrid, fields.title.node, fields.publisher.node);
  append(basicSection, basicGrid);

  const basicGrid2 = el("div", "form-grid");
  append(basicGrid2, fields.period.node, fields.category.node);
  append(basicSection, basicGrid2);

  const detailsSection = group("certEditor.details", "certEditor.detailsHelp");

  const detailsGrid = el("div", "form-grid");
  append(detailsGrid, fields.credentialId.node, fields.badgeText.node);
  append(detailsSection, detailsGrid);

  const documentSection = group("certEditor.document", "certEditor.documentHelp");
  append(documentSection, documentField.element, fields.externalUrl.node);

  const visibilitySection = group(
    "certEditor.visibility",
    "certEditor.visibilityHelp"
  );

  const statusRow = el("div", "cert-status-row");

  if (isNew) {
    append(
      statusRow,
      statusBadge("draft"),
      el("span", "form-help", t("certEditor.newRecordStatus"))
    );
  } else {
    append(
      statusRow,
      el("span", "cert-status-label", t("certEditor.currentStatus")),
      statusBadge(record.status)
    );
  }

  append(visibilitySection, statusRow);

  const previewSection = group("certEditor.preview", null);

  const previewHost = el("div", "cert-preview-host");
  append(previewSection, previewHost);

  const actions = el("div", "form-actions");

  const saveButton = el(
    "button",
    "admin-button admin-button-primary",
    t("certEditor.save")
  );
  saveButton.type = "button";

  append(actions, saveButton);
  append(
    root,
    basicSection,
    detailsSection,
    documentSection,
    visibilitySection,
    previewSection,
    actions
  );

  /* ---------------- live preview ---------------- */

  function currentData() {
    return {
      title: trimmed(fields.title.value),
      publisher: trimmed(fields.publisher.value),
      period: trimmed(fields.period.value),
      category: fields.category.value,
      badgeText: trimmed(fields.badgeText.value),
      credentialId: trimmed(fields.credentialId.value),
      externalUrl: trimmed(fields.externalUrl.value),
      /* Pending files are not uploaded yet, so the preview links to what is
         actually reachable today: the stored document, or the issuer URL. */
      document: (() => {
        const stored = documentField.getStored();
        return stored && !documentField.isRemoving()
          ? (hasDocument(stored.bucket, stored.path) ? stored : null)
          : null;
      })()
    };
  }

  let renderedPreview = null;
  function renderPreview() {
    const data = currentData(), signature = JSON.stringify(data);
    // A text field's blur/change must not replace the preview button being clicked.
    if (signature === renderedPreview) return;
    const face = previewHost.querySelector(".cert-preview")?.dataset.face;
    clear(previewHost);
    append(previewHost, buildCertificatePreview(data,face));
    renderedPreview = signature;
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
    root.inert = next;
    saveButton.disabled = next;
    backButton.disabled = next;
    saveButton.textContent = next ? t("common.saving") : t("certEditor.save");
  }

  async function save() {
    if (saving) {
      return false;
    }

    const valid = applyValidation(fields, {
      title: {
        label: t("certEditor.fieldTitle"),
        required: true,
        maxLength: LIMITS.title
      },
      publisher: {
        label: t("certEditor.fieldPublisher"),
        maxLength: LIMITS.publisher
      },
      period: { label: t("certEditor.fieldPeriod"), maxLength: LIMITS.period },
      badgeText: {
        label: "Nilai / Hasil (opsional)",
        maxLength: LIMITS.badgeText
      },
      credentialId: { label: "Credential ID", maxLength: 80 },
      externalUrl: {
        label: t("certEditor.fieldExternalUrl"),
        maxLength: LIMITS.externalUrl
      }
    });

    if (!valid) {
      toast(t("certEditor.errFields"), "error");
      return false;
    }

    // Validate the live card before persisting; never silently cut stored text.
    // Measure both faces synchronously, then restore the selected face before paint.
    const previewOverflow = [...previewHost.querySelectorAll(".cert-preview-column")].map(column => {
      const hidden = column.hidden; column.hidden = false;
      const overflow = [...column.querySelectorAll(".cert-preview-title,.cert-preview-back-title,.cert-preview-publisher,.cert-preview-back-subtitle,.cert-preview-details dd,.cert-preview-back-inner")].some(node => node.scrollHeight > node.clientHeight + 2);
      column.hidden = hidden; return overflow;
    }).some(Boolean);
    if (previewOverflow) {
      toast("Teks melebihi ruang kartu. Ringkas judul, penerbit, atau detail opsional sebelum menyimpan.", "error");
      return false;
    }

    const externalUrl = trimmed(fields.externalUrl.value);

    /* Mirrors certificates_external_url_check; the database rejects anything
       else regardless, this just explains it before the round trip. */
    if (externalUrl !== "" && !HTTP_URL.test(externalUrl)) {
      fields.externalUrl.setError(t("certEditor.errUrl"));
      toast(t("certEditor.errFields"), "error");
      return false;
    }

    if (!isKnownCategory(fields.category.value)) {
      fields.category.setError(t("certEditor.errCategory"));
      toast(t("certEditor.errFields"), "error");
      return false;
    }

    const payload = {
      title: trimmed(fields.title.value),
      publisher: trimmedOrNull(fields.publisher.value),
      period: trimmedOrNull(fields.period.value),
      category: fields.category.value,
      badge_text: trimmedOrNull(fields.badgeText.value),
      credential_id: trimmedOrNull(fields.credentialId.value),
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
          Upload, verify, commit, then read the reference back. Uncertain results
          retain both generations; previous versions are not deleted automatically.
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
            const confirmed = await supabaseClient.from("certificates")
              .select("document_bucket,document_path,document_type")
              .eq("id", result.data.id).maybeSingle();
            if (confirmed.error || !confirmed.data ||
                confirmed.data.document_bucket !== paths.bucket ||
                confirmed.data.document_path !== paths.path ||
                confirmed.data.document_type !== paths.type) {
              throw new Error("certificate reference could not be confirmed");
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
            cleanupWarning = t("certEditor.docCleanupWarning");
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
          : t(isNew ? "certEditor.errCreate" : "certEditor.errSave"),
        "error"
      );
      return false;
    }

    if (!result || result.error || !result.data) {
      setSaving(false);
      if (result && result.error) {
        console.error(result.error);
      }

      toast(t(isNew ? "certEditor.errCreate" : "certEditor.errSave"), "error");
      return false;
    }

    documentField.commit(committedDocument);

    setSaving(false);
    baseline = snapshot();
    dirty = false;
    onDirtyChange(false);

    if (cleanupWarning) {
      toast(cleanupWarning, "error");
    } else {
      toast(t(isNew ? "certEditor.created" : "certEditor.saved"));
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
