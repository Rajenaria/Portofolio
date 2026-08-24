# Admin CV Management — Design Specification

**Project:** Project Web Portfolio — Admin Dashboard / CMS
**Status:** Design approved — ready for implementation planning
**Date:** 2026-08-24
**Depends on:** 005-ADMIN-DASHBOARD-CMS-V2 (Profile module, document storage, Storage policies)

---

## 1. PROBLEM

The public "Download CV" button points at a file committed to the repository:

```
assets/documents/CV-Rajendra Aria Nismara.pdf   (189 KB)
```

Replacing the CV therefore requires editing the repository and redeploying. The
owner wants to swap in a newer CV from the Admin CMS at any time, the same way
certificates, projects and photos are already managed.

There are **two** buttons bound to that file, not one:

| Location | File | Line |
|---|---|---|
| Hero CTA | `index.html` | ~295 |
| Footer secondary button | `index.html` | ~2520 |

Both must follow the CMS.

---

## 2. DECISIONS TAKEN

| Question | Decision | Reason |
|---|---|---|
| Where in Admin | Profile → **Hero tab** | The CV button lives in the Hero section; no new menu for a single file |
| Repo PDF | **Kept as fallback** | Button keeps working if Supabase is unreachable |
| Download filename | **Auto-generated** `CV-<name>.pdf` from `profile_content.name` | Stays professional regardless of the uploaded filename |
| Storage location | Reuse `portfolio-documents`, new `cv/` directory | Bucket is already public, PDF-capable, 10 MB, and its policies are bucket-scoped |
| Versioning | Single current file (replace in place) | Owner asked to "swap to the latest", not to keep a history |

### Rejected alternatives

- **New `portfolio-cv` bucket** — would need manual bucket creation plus four new
  Storage policies for one file. No benefit over a directory.
- **Admin commits to the repo via the GitHub API** — requires a GitHub token in
  browser code, which the project's security rules forbid, and adds redeploy
  latency.

---

## 3. ARCHITECTURE

### 3.1 Storage

```
portfolio-documents/cv/<uuid>.pdf
```

The existing Storage policies in `20260818120000_certificate_documents.sql` are
scoped by `bucket_id` and file extension, **not** by path prefix:

```sql
bucket_id = 'portfolio-documents'
and app_private.is_owner_admin_aal2()
and lower(storage.extension(name)) in ('pdf', 'webp')
```

A `cv/` directory is therefore already covered. **No new Storage policy is
required**, and none may be added — widening the policy would be a regression.

### 3.2 Database

Additive migration on the `profile_content` singleton:

```sql
alter table public.profile_content
  add column if not exists cv_bucket varchar(80),
  add column if not exists cv_path text,
  add column if not exists cv_updated_at timestamptz;

alter table public.profile_content
  add constraint profile_content_cv_complete_check
  check (
    (cv_bucket is null and cv_path is null)
    or
    (cv_bucket is not null and cv_path is not null)
  );
```

The completeness constraint mirrors `certificates_document_complete_check`: a
half-written reference would render a broken link.

No filename column — the download name is derived from `name` at render time.
No type column — CV is PDF only, enforced by the Admin field and by the Storage
extension allow-list.

**RLS:** unchanged. `profile_content` already has
`Public can read profile content ... using (true)`, so the new columns are
publicly readable, which is correct for a public download, and writes stay
owner + AAL2.

### 3.3 Shared storage helper

`admin/js/core/document-storage.js` currently hardcodes:

```js
const DIRECTORY = "certificates";
```

used by both the upload path and `verifyUpload()`'s listing call. Change: accept
an optional `directory` argument defaulting to `"certificates"`, threaded through
`replaceDocument()` and `verifyUpload()`.

This is the smallest change that serves the goal. Certificate call sites keep
working untouched because the default preserves current behaviour.

`documentDownloadUrl()` already appends `?download`, and its existing comment
records why (the HTML `download` attribute is ignored cross-origin). The CV needs
the named variant `?download=<filename>`, so that helper gains an optional
filename argument.

### 3.4 Admin UI — `admin/js/modules/profile/cv-field.js` (new)

A focused component modelled on `certificates/document-field.js`, but PDF-only.
Kept separate rather than generalising the certificate field, so neither grows a
mode switch.

Responsibilities — exactly three, matching the certificate field's contract:

1. show what is currently stored (public URL derived for display only),
2. validate a picked file through `core/document-processor.js`,
3. hold the processed file until the Hero tab saves.

**It never uploads.** Storage work happens in the Hero tab's Save handler, so an
abandoned form cannot leave an orphan object.

Controls: Upload/Replace, View (new tab, `rel="noopener noreferrer"`), Download,
Remove, Discard pending, plus "last updated" from `cv_updated_at`.

### 3.5 Admin save flow — `hero-tab.js`

Hero tab already writes `profile_content` (name, professional_title,
hero_description, translations). The CV joins that same write:

- **No pending file, no removal** → CV columns absent from the patch entirely.
- **Pending file** → `replaceDocument({ directory: "cv", file, type: "pdf", previous, commit })`
  where `commit` writes `cv_bucket`, `cv_path`, `cv_updated_at = now()`.
- **Removal** → patch sets all three to `null`, then the object is deleted after
  the database accepts it.

Ordering rationale is inherited from `replaceDocument()`: upload → verify →
commit → only then delete the old object. Every failure leaves the previously
working CV referenced and reachable.

### 3.6 Public rendering

`index.html`: both anchors get a `data-cv-link` attribute. The existing static
`href` and `download` attribute stay exactly as they are — that is the fallback.

```html
<a href="assets/documents/CV-Rajendra Aria Nismara.pdf" data-cv-link download>
```

`js/cms/profile-about.js`: the `profile_content` select gains `cv_bucket,
cv_path`. A new `renderCvLink(profile)` runs in the same dispatch as the other
Hero renderers:

```
publicDocumentUrl(cv_bucket, cv_path)  →  null  →  leave static href untouched
                                       →  url   →  href = url + "?download=" + encoded name
```

`publicDocumentUrl()` already exists in `js/cms/client.js` and rejects anything
outside `portfolio-documents`, so a tampered row cannot redirect the button.

The filename is `CV-<name>.pdf` built from `profile_content.name`, passed through
`encodeURIComponent`. Not language-dependent — no translation entry needed.

---

## 4. ERROR HANDLING

| Situation | Behaviour |
|---|---|
| CMS unreachable / row empty | Static repo PDF is served; button always works |
| `cv_bucket` not `portfolio-documents` | Treated as no CV; static fallback |
| Upload fails | Old CV stays referenced; new object removed |
| Verify fails | New object removed; database untouched |
| Database write fails | New object removed; old CV still live |
| Old-object delete fails | New CV is live; warning toast only (never roll back) |
| Non-PDF or >10 MB picked | Rejected by `document-processor.js` before save |

---

## 5. SECURITY NOTES

- No new Storage policy, no new bucket, no widening of the extension allow-list.
- No `service_role` key; the publishable key plus the owner's AAL2 JWT only.
- Object path is UUID-based; the owner's filename never becomes storage identity.
- The database stores bucket + path, never a full URL.
- The download filename is `encodeURIComponent`-escaped before entering the query
  string.
- CV columns are readable by anon, which is intended — the CV is a public
  download. Nothing non-public is added to `profile_content`.

---

## 6. TESTING

**Admin**
1. Upload a PDF → Save → reload → field shows the file and a fresh "last updated".
2. Replace with a second PDF → Save → old object no longer in the bucket.
3. Remove → Save → columns null, public button falls back to the repo file.
4. Pick a file then leave without saving → no object created.
5. Non-PDF and >10 MB files are rejected before save.

**Public**
6. With a CV in the CMS: both hero and footer buttons point at the Supabase URL
   and download as `CV-<name>.pdf`.
7. With CMS unreachable: both buttons still serve the repo PDF.
8. Regression: Hero text, About, translations and EN/ID switching unaffected.

**Database**
9. Migration is additive and re-runnable; existing rows get `null` CV columns.
10. Completeness constraint rejects a half-written reference.

---

## 7. DEPLOYMENT

The migration must be applied to the production database
(`supabase db push`). **Owner approval is required before it is run** — the same
gate used for `20260823180000_public_translations.sql`.

No bucket creation, no Dashboard policy change, no new environment variable.
