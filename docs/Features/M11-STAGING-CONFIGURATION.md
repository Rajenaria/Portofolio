# M11-02 — Staging Configuration Preparation

> Update 2026-10-23: **M11 — STAGING VERIFIED / PRODUCTION RELEASE REVIEW**.
> Tujuh fungsi ACTIVE, owner+AAL2 dan lima bucket terverifikasi; 119 server +
> 44 browser PASS, regresi1053PASS. Production tetap NONAKTIF.
> Lihat [laporan final](M11-TECHNICAL-COMPLETION.md) dan [matriks](M11-STAGING-TEST-MATRIX.json).
> Bagian berikut mempertahankan catatan historis checkpoint M11-02.

Status: **M11-02 — DONE / LOCAL VERIFIED**. Owner-approved closure,
2026-10-22. Baseline: `5e1691de7f750365543030486cf399e59c44d0f7`, branch
`backup/portfolio-m06`. M11-01 checkpoint retained; no commit in M11-02.
No cloud project/API, database, migration or deployment was accessed/executed.

Closure approved on 2026-10-22. The prior evidence is retained: 435 assertions
PASS, 0 FAIL and zero real connections in the isolated preview audits. Tests
were not rerun for closure. Public CMS, Admin CMS and guestbook share explicit
environment configuration; unknown hosts and incomplete configuration fail
closed. Production configuration remains NONACTIVE, and
`portofolio-rajenaria.vercel.app` remains CANDIDATE ONLY. Real backend and
deployment remain NOT VERIFIED. All release blockers remain active.
M11-03 is STAGING EXECUTION PLAN / OWNER APPROVAL REQUIRED; execution has not
started. Closure changes documentation only and grants no cloud permission.

## Origin decision and deployment readiness

Owner supplied `https://portofolio-rajenaria.vercel.app` as **CANDIDATE ONLY**,
with admin likely under `/admin/`. The domain was not found in repository
references before this change. Its mention in the new policy comment is not
deployment evidence. No DNS/website/API request was made to verify it.

Production is **NONACTIVE / FAIL-CLOSED**. The approved-production-origin list
in `js/environment.js` remains empty. An explicit production input still fails
until the owner confirms exact origins and authorizes updating that policy.
There is no `*.vercel.app` allowlist. Staging account, project/ref, domain,
public key provenance, synthetic owner UUID, costs/quotas and deployment
protection are **NOT VERIFIED** and remain owner decisions.

Do not deploy the raw checkout to a live site: it intentionally has no active
backend configuration. Existing remote deployment was not changed by this work.
Fixture preview remains usable without real credentials or a running backend.

## One public environment contract

- `js/environment-config.js` supplies one deployment document. Checkout value
  is `null`. It contains no actual keys, credentials, owner IDs or active URL.
- `js/environment.js` validates/resolves it. Both public ES Modules and admin
  import those files; guestbook receives them as classic scripts before its
  DOMContentLoaded handler. Re-evaluation is idempotent.
- Public/admin/guestbook all use the same identity. Public fetches assert the
  captured identity before I/O; admin validates URL/key/owner before SDK/Auth
  construction; guestbook validates before GET/POST. Input replacement/mutation
  after the first read or a conflicting consumer config fails closed.
- Hostname only constrains an explicitly selected document; it never chooses
  a default environment. Missing input, malformed values, unknown origin,
  `file://`, wildcard hosts and mismatches do not select another backend.

Exact fields (no extra fields, including server secrets, are accepted):

```json
{
  "schemaVersion": 1,
  "deploymentId": "reviewed-local-id",
  "environment": "local",
  "frontendOrigins": ["http://127.0.0.1:8000"],
  "backendOrigin": "http://127.0.0.1:54321",
  "projectRef": "local",
  "publishableKey": "REPLACE_WITH_ENVIRONMENT_PUBLISHABLE_KEY",
  "ownerUserId": "REPLACE_WITH_SYNTHETIC_AUTH_USER_UUID"
}
```

This example is deliberately invalid until operator-supplied public fields are
available; it is not a credential or executable staging configuration.

| Mode | Rules |
| --- | --- |
| local / fixture | Frontend and backend exact origins must be loopback; ref `local`. No remote backend. Fixture is tooling input, not a production app mode. |
| staging / preview | Exact HTTPS frontend origins and HTTPS `<20-character-ref>.supabase.co` backend matching projectRef. Known production ref is denied. |
| production | Explicit production profile/ref AND owner-approved exact frontend origins. Currently always denied because approval list is empty. |

All modes require a publishable-format key and owner UUID. Owner ID is a UI
check only; authorization remains in Auth/RLS and validated owner+AAL2 handlers.
An opaque publishable key cannot be cryptographically bound to a project by
these local string checks: actual key provenance must be verified in M11-03.
Do not claim a locally accepted profile proves a usable key or real owner.
Client code/configuration is not protection against an attacker executing
arbitrary JavaScript; CSP, server validation and RLS remain necessary.

## Static artifact and CSP

No framework, bundler, dependency or production build was introduced.
`scripts/prepare-environment.js` uses Node built-ins and copies the original
static frontend/admin/assets into a **new directory outside the repository**.
It does not install, link accounts, execute SQL, serve HTTP or deploy.

After a separate environment approval, invocation is:

```text
node scripts/prepare-environment.js EXTERNAL_PUBLIC_CONFIG.json NEW_EXTERNAL_ARTIFACT
```

The command validates before creating its target, rejects existing output
directories and symlinks, and never overwrites source. Failed partial output
must not be deployed. No automatic deletion/cleanup of existing directories.
Only index/project HTML, legacy routes, css/js/assets/admin and Vercel files
are copied. Docs, scripts, SQL, dependencies, `.env` and Git are not copied.

It emits exactly one public config, Vercel HTTP CSP and matching HTML meta CSP
for all five current/legacy entries. HTTP `frame-ancestors` stays in headers,
not meta. Backend connect/image sources are exact for that artifact; no broad
Supabase wildcard or production origin in staging. No WebSocket permission is
needed by current code. Existing route/security/cache headers remain, with
`no-store` specifically for `/js/environment-config.js` to avoid stale profiles.
The raw checkout CSP has no backend allowlist. Meta provides the same guard
under a plain local HTTP server; it does not require Vercel to be present.

Artifact inputs/CSP cannot be made correct by setting Vercel environment
variables alone: browser source does not read server environment variables.
An approved runner/operator must prepare and deploy the matching static artifact.
An exact stable preview alias/origin must be chosen before preparing its profile;
unanticipated generated URLs stay blocked. Verify production branch, domain
assignments, automatic deployments and protection before any push/deploy.
A new Vercel project's first deployment may use its Production environment;
its project/domain/backend separation must be reviewed before that operation.
None of those cloud settings were inspected here.

## Guestbook and function gateway

Removed its fixed production read/submit target and key. GET keeps the approved
comment filter; POST still sends only `{name,message}`, JSON Content-Type,
without a fabricated user token. Existing validation, moderation responses,
429/error retention, successful reset/animation and handler budgets remain.
Missing/mismatched input shows a generic configuration message without values.

Local `supabase/config.toml` now explicitly declares:

```toml
[functions.submit-comment]
verify_jwt = false
```

This describes the public gateway contract: anonymous submission does not have
a user JWT. Gateway checking and application abuse control are separate.
`submit-comment` still validates/moderates server-side and uses the M02 budget;
no handler code changed. Management endpoints still verify a real user and
owner+AAL2 themselves, regardless of their gateway flag. This local declaration
does not change any remote function setting or prove gateway compatibility.

The isolated launcher now provides synthetic config/CSP and accepts guestbook
reads only at its loopback CMS origin. Remote Supabase guestbook origins are
denied. Unknown requests and default writes remain denied, except explicit
synthetic test routes in individual harnesses. Temporary profiles and the
fallback deny proxy/DNS guard remain. There is no production preview switch,
duplicate renderer, fixture CMS in application code or query-param safeguard.

## All 18 migrations: dependency/bootstrap plan, not execution

Migration contents are byte-identical to the checkpoint. Read order:

1. `20260815212736_remote_schema.sql`: guestbook baseline/default grants.
2. `20260815213435_admin_cms_schema.sql`: CMS/private owner registry.
3. `20260815213442_admin_cms_rls.sql`: Auth owner/AAL2 helpers and RLS.
4. `20260815213447_admin_cms_storage_policies.sql`: M01 media bucket policies.
5. `20260815213451_admin_cms_seed.sql`: singleton/slot foundation, not Auth user.
6. `20260815234351_harden_public_default_privileges.sql`: default ACL hardening.
7. `20260818020000_security_hardening_pre_production.sql`: grants/constraints.
8. `20260818100000_hero_media_visibility.sql`: hero visibility.
9. `20260818110000_certificates_schema.sql`: certificates/RLS.
10. `20260818110100_certificates_minimum_published.sql`: historical count latch.
11. `20260818110200_certificates_seed.sql`: historical owner certificate content.
12. `20260818120000_certificate_documents.sql`: document references/policies.
13. `20261019010000_m02_request_budgets.sql`: advisory-lock request budget RPC.
14. `20261019011000_m02_certificate_privacy.sql`: private shared document bucket;
    drops minimum trigger, preserving documents/state. Privacy allows 0–2 cards.
15. `20261019020000_m04_project_cover_layout.sql`: three legacy cover columns.
16. `20261019030000_m06_cv_management.sql`: protected metadata, conditional
    activation/private CV bucket; depends on owner helpers and M02 event table.
17. `20261021090000_m09_project_snapshots.sql`: private drafts/revisions/assets,
    CAS/idempotent operations, catalog and legacy direct-DML revocation.
18. `20261021091000_m09_project_assets.sql`: private asset bucket, registry,
    delivery and budgets; depends on snapshots and M02 events.

After explicit M11-03 authorization:

- Provision a separately identified disposable staging project/database. Verify
  project ref/host/database identity before every mutation. No production clone,
  credential reuse, existing-volume reset or deletion as a setup shortcut.
- Inspect baseline extension availability/dependencies. `DROP EXTENSION pg_net`
  lacks IF EXISTS; failure is a hypothesis, not a reproduced error. If the fresh
  baseline differs, stop for a reviewed bootstrap/migration decision. Do not
  edit history or silently run compensating SQL.
- In a reviewed temporary operator config, explicitly disable automatic seed
  or select an approved synthetic seed. Repository config still references
  absent `supabase/seed.sql`; no CLI failure/success has been measured.
- Full migration replay includes five historical owner certificate records.
  Do not call that dataset synthetic. Approve either a documented disposable
  synthetic-only copy with a narrowly recorded seed substitution, or historical
  reference fixtures plus clearly separate DEMO records. Do not overwrite owner
  data or change repository historical migrations.
- Create required buckets through supported configuration/API with exact MIME,
  size and visibility; verify M02 shared bucket consumers and M06/M09 guards.
  A missing bucket makes an UPDATE affect zero rows; migration completion alone
  does not prove the intended bucket exists/private.
- Replay in timestamp order, then inspect final grants/RLS and default ACLs
  before exposing API/frontend access. Test fresh bootstrap AND a separate
  legacy-data upgrade rehearsal. No unconditional full-chain reapply on an
  existing populated database; reconcile migration history/schema first.
- Seed clearly labelled DEMO projects/certificates/comments/media/CV in the
  disposable target only. Use real public DTO/schema and supported service
  workflows; never invent owner achievements or import real private documents.

All SQL/bootstrap behavior: **NOT RUN / NOT VERIFIED**.

## Synthetic owner, real MFA and seven functions — future checklist

1. Operator creates a synthetic staging Auth account in the correct project;
   no identity/credential was created here. Keep signup restrictions intact.
2. Admit its actual UUID to that project's `app_private.admin_users` using an
   authorized server/operator path; do not bypass the FK or singleton registry.
   Prepare frontend public config with the same UUID. A config UUID alone gives
   no privilege. Verify no production owner UUID/identity was copied.
3. Sign in through the actual admin password flow at AAL1, enroll TOTP through
   existing `mfa.enroll`, then `challenge`/`verify` using an authenticator. Verify
   the real session AAL2 and RPC admission. Never mint a fake JWT/AAL claim or
   log/store a TOTP secret in repository/evidence.
4. Prove anonymous, non-owner (including AAL2), expired sessions and owner AAL1
   are denied before proving owner AAL2 success. Direct profile CV metadata
   writes and project DML must remain denied; Save Draft must not publish.
5. Seven local/staging endpoints: `submit-comment`, `certificate-document`,
   `manage-cv`, `cv-document`, `manage-project`, `project-asset`, `project-media`.
   Six existing gateway declarations and the public guestbook declaration are
   prepared; actual routing, CORS, JWT/gateway behavior are NOT VERIFIED.
6. Server-only environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_PEPPER`. Do not place service keys,
   access tokens, passwords or DB URLs in public artifact input. SDK imports
   include historical `@2` versus M09 `@2.112.3`; record resolved runtime versions
   and review reproducibility before deployment. No dependency installed here.
7. Leave `TRUSTED_PROXY_IP_HEADER` unset until the gateway proves it overwrites
   one valid address. Existing shared conservative quota is not proof of per-IP
   limiting. Test spoofed/chained/missing headers, exhaustion, concurrent
   PostgreSQL callers and fail-closed limiter errors using real staging.

## Coordinated cutover and recovery — future approval required

- Establish snapshot/code/migration/function/config IDs, a maintenance window,
  data and separate Storage-object recovery copies; rehearse recovery first.
- Rehearse additive schema/functions, publication/privacy migrations and
  finalized permissions under restricted access. M09's revocation is a cutover
  boundary, not just additive schema. Block old admin writers during activation.
- Validate seven functions/authorization/private delivery against the prepared
  backend, then activate the matched public/admin artifact and exact CSP.
  Do not expose a half-migrated schema or old admin with revoked write grants.
- Revalidate legacy published records/routes and M04 covers, M06 CV and M09
  snapshots/catalog. Keep schemas, compatible RPCs and media needed by old reads.
- Require refreshed admin clients; stale saves must fail visibly, not report
  success. Reconcile ambiguous operation IDs/current revisions before retry.
- Revalidate HTML/JS/config cache behavior, no-store deliveries, status changes,
  historical public/signed URLs and CDN caches. Static CV URL transition remains
  an owner decision; a new no-store endpoint cannot revoke an old cached file.
- On failure, restrict writers and retain the last confirmed published snapshot,
  draft/revisions and old/new objects. Prefer reviewed forward repair. Frontend
  rollback alone cannot restore legacy DML after M09. Never reopen write grants
  or make private buckets public as an automatic rollback. No orphan cleanup.

## Local changes and verification

Changes are limited to the shared config/contract and artifact script, public/
admin/guestbook adapters, entry CSP/config scripts, Vercel headers, local public
guestbook gateway declaration, CLI-artifact ignore rules, fixtures/tests/docs.
One necessary error-path correction in `js/cms/certificates.js` waits for the
DOMContentLoaded controller before an immediate config failure and guards the
rebuild method. This avoids calling the same-named DOM element; no card design,
carousel geometry, authorization or DTO changed.

Existing browser harnesses receive explicit synthetic config/CSP through the
existing fixture utility. Their network-denial assertion accepts either an
intercepted 403 or browser CSP rejection; neither permits an external response.
No historical carousel/UI test is repurposed to claim a new design result.

Evidence root: `C:\Users\USEPRE~1\AppData\Local\Temp\portfolio-m11-02-y80nx9am`.
All evidence and generated synthetic artifacts remain outside the repository.

### Actual final results (2026-10-22)

| Targeted check | Result | Evidence under that root |
| --- | --- | --- |
| M11 contract and static artifact | 58 PASS / 0 FAIL | `contract-final/environment-results.json` |
| M11 original public/admin browser and guestbook | 31 PASS / 0 FAIL | `environment-browser-verified/browser-results.json` |
| M02 security modules | 45 PASS / 0 FAIL | `m02-security.log` |
| M02 browser | 47 PASS / 0 FAIL | `test-m02-browser-verified/` |
| M06 browser | 42 PASS / 0 FAIL | `test-m06-browser-verified/` |
| M03 interactions only | 45 PASS / 0 FAIL | `test-m03-carousel-verified/` |
| Isolated preview | 45 PASS / 0 FAIL | `test-preview-portfolio-verified/preview-results.json` |
| M09 browser | 67 PASS / 0 FAIL | `m09-browser/browser-results.json` |
| M10 admin | 17 PASS / 0 FAIL | `m10-admin/admin-results.json` |
| M05 interactions only | 21 PASS / 0 FAIL | `m05-targeted/m05-browser-results.json` |
| M07 one desktop load plus lifecycle follow-up | 17 PASS / 0 FAIL | `m07-targeted/m07-followup.json` |

Total: **435 PASS, 0 FAIL**, counting only the final successful result per
target, not earlier attempts. Initial harness failures were corrected: the
artifact test now inspects the meta policy rather than historical HTML comments;
network-denial probes accept CSP rejection; synthetic form/config re-evaluation
matches the actual lifecycle. The genuine certificate startup error was fixed
as described above. Final browser evidence contains no runtime exceptions.
Generator checks additionally reject empty-origin and null input before any
artifact directory creation. No historical milestone is closed/retested in full.

Exact command forms used (replace `OUT` with the named external evidence folder):

```text
node scripts/test-m11-environment.js OUT
node scripts/test-m11-environment-browser.js OUT
node --experimental-vm-modules scripts/test-m02-security.js
node scripts/test-m02-browser.js OUT
node scripts/test-m06-browser.js OUT
node scripts/test-m03-carousel.js OUT --interactions-only
node scripts/test-preview-portfolio.js OUT
node --experimental-vm-modules scripts/test-m09-browser.js OUT
node --experimental-vm-modules scripts/test-m10-admin.js OUT
node scripts/test-m05-visual.js OUT --interactions-only
node scripts/test-m07-performance.js OUT followup 1 --desktop-only
```

M11 browser verifies missing/invalid/mismatched config prevents application API
requests and SDK/Auth creation; valid fixture config enables the real vendored
SDK and original renderer. Guestbook retains its payload, 429 inputs and success
reset; config mutation blocks a subsequent request. CSP rejects an unapproved
target. M11, M09, M10 and all three preview-launch audits record
`realConnections: 0`, no isolation errors and profile cleanup PASS. CDP
interception, a dead external proxy and DNS-denial flags support isolation;
this is not an OS-wide packet capture or proof about other applications.

M07 collects synthetic local timing only (one desktop run); it does not establish
production Core Web Vitals, a mobile performance distribution or release SLOs.
M05 records favicon NOT RUN (owner deferral); native zoom, other browsers,
physical devices and screen reader remain NOT VERIFIED. Full M01/M04 suites
and full historical visual matrices were NOT RUN in M11-02. Their adapted
fixture harnesses are retained; prior milestone results are historical evidence.

Static review (`final-static-review.json`) found no JS syntax failures or missing
relative ES Module imports. Both `git diff --check` and
`git -c core.whitespace=cr-at-eol diff --check` PASS for the current M11-02 diff.
An initial regex import scan matched a documentation example; the final check
uses parsed module dependencies. A whitespace-only added line was corrected.
No unrelated CRLF normalization was performed. Historical M10 check limitations
remain recorded in its report, not reinterpreted as a new test result.

Hash comparison with the pre-change baseline confirms **88 protected files
unchanged**, covering all 18 migrations, every Edge Function/shared source,
CSS, existing assets and package manifests. Credential-pattern review of the
25 modified and six new files found no actual embedded public key, private key
or token; only synthetic fixture inputs and public schema labels are present.
This pattern review is not a credential rotation or external security audit.

### File manifest and Git checkpoint

Six new files:

- `js/environment.js`, `js/environment-config.js`.
- `scripts/prepare-environment.js`.
- `scripts/test-m11-environment.js`, `scripts/test-m11-environment-browser.js`.
- `docs/Features/M11-STAGING-CONFIGURATION.md` (this report).

25 modified files:

- `.gitignore`, `README.md`, `vercel.json`, `supabase/config.toml`.
- `index.html`, `project.html`, both `projects/project-*.html` legacy entries.
- `js/cms/client.js`, `js/cms/certificates.js`, `js/guestbook.js`.
- `admin/admin.js`, `admin/index.html`, `admin/js/core/config.js`,
  `admin/js/core/supabase.js`.
- `scripts/fixtures/portfolio-preview/fixture.js`, `scripts/preview-portfolio.js`.
- `scripts/test-m02-browser.js`, `scripts/test-m03-carousel.js`,
  `scripts/test-m04-projects.js`, `scripts/test-m05-visual.js`,
  `scripts/test-m06-browser.js`, `scripts/test-m07-performance.js`,
  `scripts/test-m10-admin.js`, `scripts/test-preview-portfolio.js`.

Branch remains `backup/portfolio-m06`; HEAD remains
`5e1691de7f750365543030486cf399e59c44d0f7`. No staged files, no commit/push.
Working tree: **25 modified, 6 untracked**. Review diff is saved externally as
`m11-review.diff`; generated artifacts and browser profiles are not commit input.

## Review gate

M11-02 is not real staging verification. No cloud identity, actual credentials,
Auth/RLS/Storage/PostgreSQL concurrency, gateway/proxy/CDN state, Vercel settings
or production-origin ownership has been verified. Existing release blockers
from M02/M04/M06/M09/M10 remain. M11-03 needs separate approval.
