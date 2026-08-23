/*
  Certificate editor (Phase C).

  Full-page Add/Edit form, never a modal, matching the Experience and Projects
  editors. Five groups, in the order the owner fills them in:

      BASIC INFORMATION   title, publisher, period, category (-> icon)
      CARD DETAILS        issuer line, badge, description
      DOCUMENT            the certificate file, plus the issuer URL
      VISIBILITY          where this record currently stands
      PREVIEW             both faces of the card

  The group help text still says which face each field lands on, because that
  is what the owner is really deciding — the grouping just no longer forces
  them to think in terms of card geometry first.

  `title` appears once. The public card renders it on both faces; giving it two
  inputs would let the two sides drift apart.

  VISIBILITY IS READ-ONLY HERE
  ----------------------------
  Status is shown, never edited. Publishing is an explicit action in the list
  view, where the minimum-published rule is explained and enforced; a status
  dropdown buried in a form would let the owner trip that rule with no context.

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
import { el, append, clear, statusBadge } from "../../core/dom.js";
import { toast } from "../../core/toast.js";
import { t } from "../../core/i18n.js";

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
import { createTranslationSection, mergeTranslationPatch } from "../../core/translation-fields.js";

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
      label: t("certEditor.fieldTitle"),
      required: true,
      maxLength: LIMITS.title,
      value: record ? record.title : "",
      help: t("certEditor.fieldTitleHelp")
    }),

    publisher: textField({
      id: "certificate-publisher",
      label: t("certEditor.fieldPublisher"),
      maxLength: LIMITS.publisher,
      value: record ? record.publisher : "",
      help: t("certEditor.fieldPublisherHelp")
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

    issuerLine: textField({
      id: "certificate-issuer-line",
      label: t("certEditor.fieldIssuer"),
      maxLength: LIMITS.issuerLine,
      value: record ? record.issuer_line : "",
      help: t("certEditor.fieldIssuerHelp")
    }),

    badgeText: textField({
      id: "certificate-badge-text",
      label: t("certEditor.fieldBadge"),
      maxLength: LIMITS.badgeText,
      value: record ? record.badge_text : "",
      help: t("certEditor.fieldBadgeHelp")
    }),

    description: textareaField({
      id: "certificate-description",
      label: t("certEditor.fieldDescription"),
      maxLength: LIMITS.description,
      value: record ? record.description : "",
      rows: 4,
      help: t("certEditor.fieldDescriptionHelp")
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

  append(root, backButton);

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
  append(detailsGrid, fields.issuerLine.node, fields.badgeText.node);
  append(detailsSection, detailsGrid, fields.description.node);

  const TRANSLATABLE_KEYS = ["title", "issuer_line", "badge_text", "description"];

  const translationSection = createTranslationSection({
    fields: [
      { key: "title", label: t("certEditor.fieldTitle"), maxLength: LIMITS.title },
      { key: "issuer_line", label: t("certEditor.fieldIssuer"), maxLength: LIMITS.issuerLine },
      { key: "badge_text", label: t("certEditor.fieldBadge"), maxLength: LIMITS.badgeText },
      {
        key: "description",
        label: t("certEditor.fieldDescription"),
        maxLength: LIMITS.description,
        multiline: true
      }
    ],
    translations: record ? record.translations : null
  });

  const translationsGroup = group("common.translationsTitle", "common.translationsHelp");
  append(translationsGroup, translationSection.element);

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
    translationsGroup,
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
    return JSON.stringify({ ...currentData(), translations: translationSection.getValues() });
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

  Object.values(translationSection.fields).forEach(field => {
    field.control.addEventListener("input", markDirty);
    field.control.addEventListener("change", markDirty);
  });

  renderPreview();

  /* ---------------- save ---------------- */

  function setSaving(next) {
    saving = next;
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
      issuerLine: {
        label: t("certEditor.fieldIssuer"),
        maxLength: LIMITS.issuerLine
      },
      badgeText: {
        label: t("certEditor.fieldBadge"),
        maxLength: LIMITS.badgeText
      },
      description: {
        label: t("certEditor.fieldDescription"),
        maxLength: LIMITS.description
      },
      externalUrl: {
        label: t("certEditor.fieldExternalUrl"),
        maxLength: LIMITS.externalUrl
      }
    });

    if (!valid) {
      toast(t("certEditor.errFields"), "error");
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
      issuer_line: trimmedOrNull(fields.issuerLine.value),
      badge_text: trimmedOrNull(fields.badgeText.value),
      description: trimmedOrNull(fields.description.value),
      external_url: trimmedOrNull(fields.externalUrl.value),
      translations: mergeTranslationPatch({
        existingTranslations: record ? record.translations : null,
        ownKeys: TRANSLATABLE_KEYS,
        values: translationSection.getValues()
      })
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

    setSaving(false);

    if (!result || result.error || !result.data) {
      if (result && result.error) {
        console.error(result.error);
      }

      toast(t(isNew ? "certEditor.errCreate" : "certEditor.errSave"), "error");
      return false;
    }

    documentField.commit(committedDocument);

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
