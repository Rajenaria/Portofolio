# Admin CV Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner replace the public "Download CV" PDF from the Admin CMS instead of committing a new file to the repository.

**Architecture:** The CV is stored in the existing public `portfolio-documents` bucket under a new `cv/` directory, referenced by three new columns on the `profile_content` singleton. The Admin panel lives in Profile → Hero tab and reuses the certificate document pipeline (validate on pick, upload on save). The public hero and footer buttons keep their static `href` as a fallback and are re-pointed at the Supabase URL when a CV exists.

**Tech Stack:** Vanilla ES modules (no build step), Supabase JS v2 (vendored), Supabase Storage + Postgres RLS.

**Spec:** `docs/Features/006-ADMIN-CV-MANAGEMENT.md`

## Global Constraints

- **There is no test framework in this repository.** `npm test` is a stub (`echo "Error: no test specified" && exit 1`). Do not add one — that is out of scope. Verification in every task below is: (a) `node --input-type=module --check` for syntax, (b) browser assertions against a local static server for public-side behaviour, (c) owner-performed manual checks for anything behind Admin login.
- **Admin verification requires the owner's credentials (email + password + MFA TOTP).** An implementing engineer without them cannot complete the Admin steps in Task 7. Stop and hand those steps to the owner rather than skipping or faking them.
- **Do not create a new Storage bucket and do not add or widen any Storage policy.** The existing `portfolio-documents` policies are scoped by `bucket_id` + file extension, so `cv/` is already covered. Widening them is a security regression.
- **Never introduce `service_role`, secrets, or new environment variables into browser code.** Publishable key + the owner's AAL2 JWT only.
- **Never render CMS values with `innerHTML`.** Use `textContent` / `setAttribute`, matching `admin/js/core/dom.js`.
- Local server for browser checks: `python -m http.server 8000` from the repo root (port 8000; note ports 5000–5140 and 50000–50059 are reserved on this machine).
- Local Supabase is **not** running, so the public site falls back to static content locally. That makes the fallback path testable locally and the CMS path testable only against production.
- Cache-busting is manual in this repo (`?v=N` in `index.html`). Any change to `css/style.css` or a `js/**` file that `index.html` references by version **must** bump that version or browsers will serve the old file.
- Follow existing file conventions: 2-space indent in `admin/**`, 4-space indent in `js/**`.

---

### Task 1: Database migration for CV columns

**Files:**
- Create: `supabase/migrations/20260824090000_profile_cv.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `public.profile_content.cv_bucket varchar(80)`, `.cv_path text`, `.cv_updated_at timestamptz`, and constraint `profile_content_cv_complete_check`.

- [ ] **Step 1: Create the migration file**

```sql
-- =========================================================
-- PROFILE CV — DOCUMENT REFERENCE COLUMNS
--
-- Backs the public "Download CV" button with a CMS-managed file so the owner
-- can publish a newer CV without committing to the repository.
--
-- The file itself lives in the EXISTING portfolio-documents bucket, under a
-- new cv/ directory. That bucket is already public, already limited to
-- application/pdf + image/webp, and its Storage policies in
-- 20260818120000_certificate_documents.sql are scoped by bucket_id and file
-- extension rather than by path prefix:
--
--     bucket_id = 'portfolio-documents'
--     and app_private.is_owner_admin_aal2()
--     and lower(storage.extension(name)) in ('pdf', 'webp')
--
-- so cv/ is covered with NO new policy. Do not add one — widening those
-- policies would weaken every certificate document too.
--
-- Additive only. Existing rows get NULL CV columns and the public site keeps
-- serving the static repository PDF until the owner uploads one.
-- =========================================================

begin;

alter table public.profile_content
  add column if not exists cv_bucket varchar(80),
  add column if not exists cv_path text,
  add column if not exists cv_updated_at timestamptz;

-- The reference is one object: bucket and path are present together or absent
-- together. A half-written reference would render a dead download link.
-- Mirrors certificates_document_complete_check.
alter table public.profile_content
  add constraint profile_content_cv_complete_check
  check (
    (cv_bucket is null and cv_path is null)
    or
    (cv_bucket is not null and cv_path is not null)
  );

commit;

-- ---------------------------------------------------------
-- NOTES
--
--   * No cv_type column: the CV is always a PDF. The Admin field accepts
--     nothing else and the Storage extension allow-list is the backstop.
--
--   * No filename column: the download name is generated at render time from
--     profile_content.name, so it stays clean regardless of what was uploaded.
--
--   * RLS is unchanged. "Public can read profile content" is already
--     using (true), so the new columns are publicly readable — correct for a
--     public download — and writes remain owner + AAL2.
-- ---------------------------------------------------------
```

- [ ] **Step 2: Confirm the constraint name is not already taken**

Run: `grep -rn "profile_content_cv_complete_check" supabase/migrations/`
Expected: only the new file matches. A second match means the migration would fail on apply.

- [ ] **Step 3: Confirm no new Storage policy was added**

Run: `grep -c "storage.objects" supabase/migrations/20260824090000_profile_cv.sql`
Expected: `0`. Any match violates the Global Constraints.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260824090000_profile_cv.sql
git commit -m "feat: add CV document columns to profile_content"
```

> **Do not apply this to production yet.** Task 7 gates that on owner approval.

---

### Task 2: Let document-storage.js target a directory and name the download

**Files:**
- Modify: `admin/js/core/document-storage.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `replaceDocument({ file, type, previous, commit, directory })` — `directory` optional, defaults to `"certificates"`, so existing certificate call sites are unchanged.
  - `documentDownloadUrl(bucket, path, filename)` — `filename` optional; when given, emits `?download=<encoded filename>` instead of bare `?download`.

- [ ] **Step 1: Rename the constant and thread it through**

In `admin/js/core/document-storage.js`, replace:

```js
const DIRECTORY = "certificates";
```

with:

```js
/* Default keeps every existing certificate call site working unchanged;
   the Profile CV field passes "cv". */
const DEFAULT_DIRECTORY = "certificates";
```

- [ ] **Step 2: Make verifyUpload take the directory it should list**

Replace the `verifyUpload` signature and its `.list()` call:

```js
async function verifyUpload(path, directory) {
  const name = path.split("/").pop();

  const { data, error } = await supabaseClient.storage
    .from(DOCUMENT_BUCKET)
    .list(directory, { limit: 100, search: name });
```

Leave the rest of the function body as it is.

- [ ] **Step 3: Accept and use `directory` in replaceDocument**

Replace the opening of `replaceDocument`:

```js
export async function replaceDocument({
  file,
  type,
  previous,
  commit,
  directory = DEFAULT_DIRECTORY
}) {
  const path = `${directory}/${uuid()}.${type}`;

  await uploadObject(path, file, type);

  try {
    await verifyUpload(path, directory);
    await commit({ bucket: DOCUMENT_BUCKET, path, type });
```

Leave the `catch`, cleanup and return exactly as they are.

- [ ] **Step 4: Add the optional download filename**

Replace `documentDownloadUrl`:

```js
/*
  Supabase Storage serves a public object inline. Appending ?download turns it
  into an attachment, which is what a Download action wants — the HTML
  `download` attribute is ignored cross-origin.

  Passing a filename makes Storage send that name instead of the stored UUID,
  so a visitor gets "CV-Name.pdf" rather than a random identifier.
*/
export function documentDownloadUrl(bucket, path, filename) {
  const url = documentUrl(bucket, path);

  if (!url) {
    return null;
  }

  return filename
    ? `${url}?download=${encodeURIComponent(filename)}`
    : `${url}?download`;
}
```

- [ ] **Step 5: Verify syntax and that certificates still compile**

```bash
node --input-type=module --check < admin/js/core/document-storage.js
node --input-type=module --check < admin/js/modules/certificates/document-field.js
node --input-type=module --check < admin/js/modules/certificates/editor-view.js
```

Expected: all three exit 0 with no output.

- [ ] **Step 6: Verify no certificate call site passes a directory**

Run: `grep -rn "replaceDocument({" admin/js/modules/`
Expected: only `certificates/editor-view.js`, and it does **not** pass `directory` — it relies on the default.

- [ ] **Step 7: Commit**

```bash
git add admin/js/core/document-storage.js
git commit -m "refactor: allow document-storage to target a directory and name downloads"
```

---

### Task 3: Admin interface strings for the CV field

**Files:**
- Modify: `admin/js/core/i18n.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `cv.*` dictionary keys in both `id` and `en`, used by Task 4 and Task 5.

- [ ] **Step 1: Add the Indonesian block**

In `admin/js/core/i18n.js`, inside the `id: {` dictionary, immediately after the line `"certDoc.errGeneric": ...`, add:

```js
    /* ---------- CV (Profile > Hero) ---------- */
    "cv.title": "CV",
    "cv.help": "PDF yang diunduh lewat tombol Download CV di website publik.",
    "cv.upload": "Unggah CV",
    "cv.replace": "Ganti CV",
    "cv.view": "Lihat CV",
    "cv.download": "Unduh",
    "cv.remove": "Hapus CV",
    "cv.discard": "Batalkan file",
    "cv.pending": "Menunggu diunggah",
    "cv.willRemove": "Akan dihapus",
    "cv.pendingHelp": "File diunggah saat Anda menyimpan tab Hero.",
    "cv.removeHelp": "CV tersimpan akan dilepas dan dihapus saat Anda menyimpan.",
    "cv.empty": "Belum ada CV. Website publik memakai file cadangan di repositori. PDF, maksimal {size}.",
    "cv.storedPdf": "Dokumen PDF",
    "cv.updated": "Diperbarui {date}",
    "cv.from": "Dari: {name}",
    "cv.errNotPdf": "CV harus berupa file PDF.",
    "cv.errGeneric": "File ini tidak bisa dipakai sebagai CV.",
    "cv.cleanupWarning": "CV baru sudah aktif, tapi file lama gagal dihapus.",
```

- [ ] **Step 2: Add the English block**

Inside the `en: {` dictionary, immediately after its `"certDoc.errGeneric": ...` line, add:

```js
    /* ---------- CV (Profile > Hero) ---------- */
    "cv.title": "CV",
    "cv.help": "The PDF served by the Download CV button on the public site.",
    "cv.upload": "Upload CV",
    "cv.replace": "Replace CV",
    "cv.view": "View CV",
    "cv.download": "Download",
    "cv.remove": "Remove CV",
    "cv.discard": "Discard file",
    "cv.pending": "Waiting to upload",
    "cv.willRemove": "Will be removed",
    "cv.pendingHelp": "The file is uploaded when you save the Hero tab.",
    "cv.removeHelp": "The stored CV is detached and deleted when you save.",
    "cv.empty": "No CV yet. The public site uses the fallback file in the repository. PDF, up to {size}.",
    "cv.storedPdf": "PDF document",
    "cv.updated": "Updated {date}",
    "cv.from": "From: {name}",
    "cv.errNotPdf": "The CV must be a PDF file.",
    "cv.errGeneric": "This file cannot be used as a CV.",
    "cv.cleanupWarning": "The new CV is live, but the old file could not be deleted.",
```

- [ ] **Step 3: Verify both dictionaries define the same CV keys**

```bash
node --input-type=module --check < admin/js/core/i18n.js
grep -c '"cv\.' admin/js/core/i18n.js
```

Expected: syntax check exits 0, and the count is `38` (19 keys × 2 languages). A mismatch means one dictionary is missing a key.

- [ ] **Step 4: Commit**

```bash
git add admin/js/core/i18n.js
git commit -m "feat: add Admin CV field strings"
```

---

### Task 4: CV field component

**Files:**
- Create: `admin/js/modules/profile/cv-field.js`

**Interfaces:**
- Consumes: `documentUrl(bucket, path)` and `documentDownloadUrl(bucket, path, filename)` from Task 2; `cv.*` strings from Task 3.
- Produces: `createCvField({ current, onChange, downloadName })` returning
  `{ element, hasPending(), isRemoving(), isDirty(), getPending(), getStored(), commit(next), destroy() }`.
  `current` is `{ bucket, path, updatedAt } | null`. `getPending()` returns the
  `processDocument` result (`{ file, type, originalName, originalSize, storedSize }`).
  `downloadName` is an optional `() => string` read at render time.

- [ ] **Step 1: Create the file**

```js
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
```

- [ ] **Step 2: Verify syntax**

```bash
node --input-type=module --check < admin/js/modules/profile/cv-field.js
```

Expected: exits 0 with no output.

- [ ] **Step 3: Confirm it reuses existing CSS rather than adding any**

Run: `grep -n "^\.document-field" admin/admin.css`
Expected: `.document-field`, `.document-field-actions`, `.document-field-detail`, `.document-field-line` all already exist. No CSS change is needed in this task; if a class used above is missing from that list, add it to `admin/admin.css` before committing.

- [ ] **Step 4: Commit**

```bash
git add admin/js/modules/profile/cv-field.js
git commit -m "feat: add PDF-only CV field component"
```

---

### Task 5: Wire the CV field into the Hero tab

**Files:**
- Modify: `admin/js/modules/profile/hero-tab.js`
- Modify: `admin/js/modules/profile/index.js:255`

**Interfaces:**
- Consumes: `createCvField(...)` from Task 4; `replaceDocument({ directory: "cv", ... })` and `removeDocument(...)` from Task 2; `cv.*` strings from Task 3.
- Produces: `profile_content.cv_bucket` / `.cv_path` / `.cv_updated_at` written by the Hero tab's Save action.

- [ ] **Step 1: Load the CV columns**

In `admin/js/modules/profile/index.js`, line 255, replace the select string with:

```js
          "id, name, professional_title, hero_description, about_heading_main, about_heading_highlight, about_lead, about_description, about_photo_bucket, about_photo_desktop_path, about_photo_mobile_path, about_photo_alt, translations, cv_bucket, cv_path, cv_updated_at"
```

- [ ] **Step 2: Import the field and the storage helpers**

In `admin/js/modules/profile/hero-tab.js`, after the existing line
`import { createTranslationSection, mergeTranslationPatch } from "../../core/translation-fields.js";` add:

```js
import { createCvField } from "./cv-field.js";
import { replaceDocument, removeDocument } from "../../core/document-storage.js";
```

- [ ] **Step 3: Build the CV section**

Immediately after the `const translationsGroup = group(...)` / `append(translationsGroup, translationSection.element);` pair, add:

```js
  /*
    The download filename is generated, never stored: whatever the owner names
    the uploaded file, a visitor gets "CV-<name>.pdf". Read as a function so it
    follows the Name field live instead of freezing at construction time.
  */
  const cvField = createCvField({
    current: profile.cv_path
      ? {
          bucket: profile.cv_bucket,
          path: profile.cv_path,
          updatedAt: profile.cv_updated_at
        }
      : null,
    downloadName: () => {
      const owner = trimmed(fields.name.value);
      return owner === "" ? "CV.pdf" : `CV-${owner}.pdf`;
    },
    onChange: markDirty
  });

  const cvSection = group("cv.title", "cv.help");
  append(cvSection, cvField.element);
```

- [ ] **Step 4: Mount the section**

Replace:

```js
  append(root, textSection, translationsGroup, photosSection, actions);
```

with:

```js
  append(root, textSection, translationsGroup, cvSection, photosSection, actions);
```

- [ ] **Step 5: Include the CV in dirty tracking**

In `computeDirty()`, replace:

```js
  function computeDirty() {
    if (snapshot() !== baseline) {
      return true;
    }
```

with:

```js
  function computeDirty() {
    if (snapshot() !== baseline || cvField.isDirty()) {
      return true;
    }
```

- [ ] **Step 6: Replace the profile write with a CV-aware one**

In `save()`, replace the whole block that starts `// 1. Hero text on the profile singleton.` and ends with the closing `}` of its `if (profileUpdate.error || ...)` guard, with:

```js
    // 1. Hero text on the profile singleton, plus the CV reference.
    const textPatch = {
      name: trimmedOrNull(fields.name.value),
      professional_title: trimmedOrNull(fields.professionalTitle.value),
      hero_description: trimmedOrNull(fields.heroDescription.value),
      translations: mergeTranslationPatch({
        existingTranslations: profile.translations,
        ownKeys: TRANSLATABLE_KEYS,
        values: translationSection.getValues()
      })
    };

    /* One writer for all three cases so the CV reference is always set in the
       same statement as the text it belongs to. Throws on a no-op update,
       which is how a failed RLS check surfaces. */
    async function persistProfile(extra) {
      const { data, error } = await supabaseClient
        .from("profile_content")
        .update({ ...textPatch, ...extra })
        .eq("singleton_key", 1)
        .select("id");

      if (error || !data || data.length === 0) {
        throw error || new Error("profile_content update did not apply");
      }
    }

    const pendingCv = cvField.getPending();
    const storedCv = cvField.getStored();
    const removingCv = cvField.isRemoving();

    let committedCv = storedCv;
    let cvWarning = null;

    try {
      if (pendingCv) {
        setSaving(true, t("common.uploading"));

        /*
          replaceDocument uploads, verifies, commits, and only then deletes the
          old object — so every failure below leaves the previous CV referenced
          and downloadable.
        */
        const outcome = await replaceDocument({
          directory: "cv",
          file: pendingCv.file,
          type: "pdf",
          previous: storedCv,
          commit: async paths => {
            await persistProfile({
              cv_bucket: paths.bucket,
              cv_path: paths.path,
              cv_updated_at: new Date().toISOString()
            });
          }
        });

        committedCv = { bucket: outcome.bucket, path: outcome.path, updatedAt: new Date().toISOString() };
        cvWarning = outcome.cleanupWarning;
      } else if (removingCv) {
        /* Row first, object second: an object nothing points at is recoverable
           noise, a row pointing at a deleted object is a dead public link. */
        await persistProfile({ cv_bucket: null, cv_path: null, cv_updated_at: null });

        if (storedCv) {
          const removed = await removeDocument(storedCv.bucket, storedCv.path);

          if (removed.failed.length > 0) {
            cvWarning = t("cv.cleanupWarning");
          }
        }

        committedCv = null;
      } else {
        await persistProfile({});
      }
    } catch (error) {
      console.error(error);
      setSaving(false);
      toast(t("hero.errSave"), "error");
      return false;
    }

    cvField.commit(committedCv);

    if (cvWarning) {
      toast(cvWarning, "error");
    }
```

Leave the hero_media slot loop that follows completely unchanged.

- [ ] **Step 7: Destroy the field with the tab**

In the returned object's `destroy()`, replace:

```js
    destroy() {
      slots.forEach(slot => slot.media.destroy());
      clear(root);
    }
```

with:

```js
    destroy() {
      slots.forEach(slot => slot.media.destroy());
      cvField.destroy();
      clear(root);
    }
```

- [ ] **Step 8: Verify syntax**

```bash
node --input-type=module --check < admin/js/modules/profile/hero-tab.js
node --input-type=module --check < admin/js/modules/profile/index.js
```

Expected: both exit 0.

- [ ] **Step 9: Verify the old single-statement write is gone**

Run: `grep -n "profileUpdate" admin/js/modules/profile/hero-tab.js`
Expected: no matches. A match means Step 6 left the old block behind.

- [ ] **Step 10: Commit**

```bash
git add admin/js/modules/profile/hero-tab.js admin/js/modules/profile/index.js
git commit -m "feat: manage the CV file from the Profile Hero tab"
```

---

### Task 6: Point the public buttons at the managed CV

**Files:**
- Modify: `index.html:295`, `index.html:2520` (add `data-cv-link`), plus the `?v=` versions
- Modify: `js/cms/profile-about.js`

**Interfaces:**
- Consumes: `profile_content.cv_bucket` / `.cv_path` from Task 1; `publicDocumentUrl(bucket, path)` already exported by `js/cms/client.js`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Mark both anchors**

In `index.html` line 295 (hero) the anchor currently reads:

```html
                <a
                    href="assets/documents/CV-Rajendra Aria Nismara.pdf"
                    class="simple-hero-button simple-cv-button"
                    download
                >
```

Add the attribute:

```html
                <a
                    href="assets/documents/CV-Rajendra Aria Nismara.pdf"
                    class="simple-hero-button simple-cv-button"
                    data-cv-link
                    download
                >
```

In `index.html` line 2520 (footer) the anchor currently reads:

```html
                    <a
                        href="assets/documents/CV-Rajendra Aria Nismara.pdf"
                        class="footer-secondary-button"
                        download
                    >
```

Add the attribute:

```html
                    <a
                        href="assets/documents/CV-Rajendra Aria Nismara.pdf"
                        class="footer-secondary-button"
                        data-cv-link
                        download
                    >
```

The static `href` and `download` attribute stay — that is the fallback when the
CMS has no CV or cannot be reached.

- [ ] **Step 2: Import the document URL builder**

In `js/cms/profile-about.js`, replace the client import block:

```js
import {
    readTable,
    publicMediaUrl,
    publicDocumentUrl,
    filled,
    IS_LOCAL_CMS
} from "./client.js";
```

- [ ] **Step 3: Add the renderer**

Immediately after the `renderHeroMedia` function's closing brace, add:

```js
/* ---------------------------------------------------------
   CV DOWNLOAD

   Both the Hero CTA and the footer button carry data-cv-link and ship with a
   static href pointing at the repository copy. That static href is the
   fallback and is left untouched unless the CMS has a usable CV, so the button
   never breaks when Supabase is unreachable.

   publicDocumentUrl rejects anything outside portfolio-documents, so a
   tampered row cannot redirect the button somewhere else.

   The filename is generated rather than stored: ?download=<name> is what makes
   Storage send an attachment with a readable name, because the HTML download
   attribute is ignored cross-origin.
--------------------------------------------------------- */

function renderCvLink(profile) {

    const links = document.querySelectorAll("[data-cv-link]");

    if (links.length === 0) {
        return;
    }

    const url = publicDocumentUrl(profile.cv_bucket, profile.cv_path);

    if (!url) {
        return;
    }

    const owner = filled(profile.name) ? profile.name.trim() : "";
    const filename = owner === "" ? "CV.pdf" : `CV-${owner}.pdf`;

    links.forEach(link => {
        link.setAttribute(
            "href",
            `${url}?download=${encodeURIComponent(filename)}`
        );
    });

}
```

- [ ] **Step 4: Call it**

In `renderFromResults`, immediately after the existing `renderHeroText(profile, language);` line, add:

```js
            renderCvLink(profile);
```

It sits outside the `aboutIsConfigured` branch on purpose: the CV is part of the
Hero, not the About section, and must render even when About is unconfigured.

- [ ] **Step 5: Load the columns**

In the `profile_content` select inside `load()`, replace:

```js
            "about_photo_mobile_path,about_photo_alt,translations&limit=1"
```

with:

```js
            "about_photo_mobile_path,about_photo_alt,translations," +
            "cv_bucket,cv_path&limit=1"
```

- [ ] **Step 6: Bump the cache-busting versions**

In `index.html`, bump the profile-about module (the file changed in this task):

```
js/cms/profile-about.js?v=4   ->   js/cms/profile-about.js?v=5
```

`css/style.css` is untouched in this task, so leave its version alone.

- [ ] **Step 7: Verify syntax**

```bash
node --input-type=module --check < js/cms/profile-about.js
```

Expected: exits 0.

- [ ] **Step 8: Verify the fallback in a browser**

Start the server, then load the page and assert both buttons still point at the
repository PDF (local has no Supabase, so this exercises the fallback path):

```bash
python -m http.server 8000
```

In the browser at `http://127.0.0.1:8000/index.html`, evaluate:

```js
[...document.querySelectorAll('[data-cv-link]')].map(a => a.getAttribute('href'))
```

Expected: an array of **two** entries, both `"assets/documents/CV-Rajendra Aria Nismara.pdf"`.
Two entries confirms both buttons were marked; unchanged hrefs confirm the
fallback holds when the CMS is unreachable.

- [ ] **Step 9: Verify no console errors were introduced**

In the same page, check the console. Expected: only the pre-existing
`net::ERR_CONNECTION_REFUSED` / `[cms] ... unavailable` entries from the absent
local Supabase, and the `favicon.ico` 404. No `TypeError` mentioning
`renderCvLink`, `cv_bucket` or `publicDocumentUrl`.

- [ ] **Step 10: Commit**

```bash
git add index.html js/cms/profile-about.js
git commit -m "feat: serve the CMS-managed CV from both public download buttons"
```

---

### Task 7: Production migration and end-to-end verification

**Files:** none modified.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified, live feature.

> Steps 2–8 require the owner's Admin credentials (email, password, MFA TOTP).
> An engineer without them must stop at Step 1 and hand the rest to the owner.

- [ ] **Step 1: Get explicit approval, then apply the migration**

Ask the owner to confirm applying the schema change to production. Only after a
clear yes:

```bash
npx supabase db push
```

Then confirm the columns exist without needing the Admin UI:

```bash
curl -s "https://hldacuppejztqzqaejsi.supabase.co/rest/v1/profile_content?select=cv_bucket,cv_path,cv_updated_at&limit=1" \
  -H "apikey: sb_publishable_B_Fq0qQhLmbz_MtxI8rFqA_S8MY1OuO" \
  -H "Authorization: Bearer sb_publishable_B_Fq0qQhLmbz_MtxI8rFqA_S8MY1OuO"
```

Expected: `[{"cv_bucket":null,"cv_path":null,"cv_updated_at":null}]`.
A `column ... does not exist` error means the push did not apply.

- [ ] **Step 2: Upload a CV (owner)**

Admin → Profile → Hero. The CV section shows "No CV yet". Pick a PDF, confirm it
shows "Waiting to upload", then Save.
Expected: success toast; the section now shows "PDF document" and today's date.

- [ ] **Step 3: Confirm it persists (owner)**

Reload the Admin page and reopen Profile → Hero.
Expected: the CV is still shown with View / Download / Replace / Remove.

- [ ] **Step 4: Confirm the public buttons follow it**

On the live public site, evaluate in the console:

```js
[...document.querySelectorAll('[data-cv-link]')].map(a => a.getAttribute('href'))
```

Expected: two identical Supabase URLs under `/storage/v1/object/public/portfolio-documents/cv/`,
each ending `?download=CV-<name>.pdf`. Click one and confirm the downloaded file
is named `CV-<name>.pdf`, not a UUID.

- [ ] **Step 5: Confirm replace deletes the old object (owner)**

Upload a second, different PDF and Save. Note the new `cv/` path, then check the
old object is gone:

Admin → the CV section should show the new file. In Supabase Dashboard →
Storage → `portfolio-documents` → `cv/`, expected: exactly **one** object.
More than one means the cleanup step failed — check for the
`cv.cleanupWarning` toast.

- [ ] **Step 6: Confirm rejection of bad files (owner)**

Try to pick a `.png` and a PDF larger than 10 MB.
Expected: both rejected with an error toast **before** Save; nothing uploaded.

- [ ] **Step 7: Confirm removal restores the fallback (owner)**

Click Remove, then Save. On the public site, re-run the Step 4 snippet.
Expected: both hrefs are back to `assets/documents/CV-Rajendra Aria Nismara.pdf`.

- [ ] **Step 8: Regression check**

On the public site confirm nothing else broke: Hero text, About, the certificate
carousel, and the EN/ID switch. In Admin, confirm the Certificates editor can
still upload a document — that path shares `document-storage.js` and must be
unaffected by Task 2.

- [ ] **Step 9: Push the branch**

```bash
git push origin feature/public-i18n-menu-fix
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| 3.1 Storage, `cv/` directory, no new policy | 1 (asserted), 2 (`directory` argument) |
| 3.2 Database columns + completeness constraint | 1 |
| 3.3 `document-storage.js` directory + named download | 2 |
| 3.4 `cv-field.js`, PDF-only, never uploads | 4 |
| 3.5 Hero tab save flow (3 cases, ordering) | 5 |
| 3.6 Public rendering, `data-cv-link`, fallback | 6 |
| 4. Error handling table | 4 (rejection), 5 (ordering), 6 (fallback), 7 (verification) |
| 5. Security notes | Global Constraints; asserted in 1 Step 3 |
| 6. Testing | 6 Steps 8–9, 7 Steps 2–8 |
| 7. Deployment gate | 7 Step 1 |

**Placeholder scan:** none — every code step contains the literal content to write.

**Type consistency:** `createCvField` returns the same shape used in Task 5
(`getPending`, `getStored`, `isRemoving`, `isDirty`, `commit`, `destroy`).
`getStored()` returns `{ bucket, path, updatedAt }`, which is what
`replaceDocument`'s `previous` needs (`{ bucket, path }` — the extra key is
ignored) and what `cvField.commit()` accepts back. `replaceDocument` resolves
`{ bucket, path, type, cleanupWarning }`, matching Task 5's destructuring.

**Known gap accepted deliberately:** there is no automated regression test for
any of this, because the repository has no test framework and adding one is out
of scope. Verification is syntax checks plus the manual matrix in Task 7.
