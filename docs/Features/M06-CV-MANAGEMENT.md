# M06 - CV Management and Synchronization

Status: DONE — LOCAL VERIFIED. Closure approved by the Project Owner (2026-10-21).
M06-01 through M06-05 are complete at the implementation and isolated local
verification level. Recorded results are retained without rerunning tests for
closure. Release is not approved by this status.
M01-M05 implementation and existing release blockers remain in place.

## Approved contract and implementation

The existing singleton `public.profile_content` receives only four new nullable
columns: `cv_version uuid`, `cv_filename varchar(180)`, `cv_size_bytes integer`,
and `cv_updated_at timestamptz`. A database CHECK requires all four to be NULL
or complete together, with a PDF filename and size 1..5242880 bytes (5 MiB).
No new table or certificate schema is introduced.

The dedicated `portfolio-cv` bucket is private. The server constructs
`cv/<UUID>.pdf`; neither bucket nor path is supplied by the client. Versions
are immutable during normal upload; no automatic delete or overwrite exists.
The M02 certificate bucket, policies, functions and quotas are unchanged.

`manage-cv` verifies the bearer token with Auth `getUser`, then calls
`can_manage_cv` using that user's JWT. That RPC evaluates the existing database
owner registry and AAL2 helper. Only after this authorization does the separate
server client use its service role for Storage and activation. Frontend code
receives no service-role key, secret, raw private path or signed URL.

A CV-specific trigger rejects changes to CV metadata through ordinary profile
REST writes, including owner/AAL2 writes and direct requests outside the UI.
`activate_cv` is a service-only conditional update against the prior UUID.
Existing Profile text/photo queries and save payloads stay separate. Storage
policies restrict raw reads to owner/AAL2 and deny direct browser mutations,
including mutations admitted by an unrelated permissive policy. Existing
buckets continue through these restrictive rules unchanged.

Server validation checks filename/extension, application/pdf MIME, size,
PDF header, terminal startxref/EOF and the referenced table/xref-stream marker.
It reads at most 5 MiB with a 10-second body deadline, verifies stored bytes
by SHA-256 and sets a 15-second timeout on each backend request. Client checks
reuse the existing PDF signature helper after the stricter CV-specific limits.
This is bounded structural validation, not sanitization, antivirus or a full
PDF parser; active PDF content is not removed. Delivery is an attachment with
nosniff and sandbox headers. A deployment must validate representative owner
PDF exports and the Edge runtime, not infer compatibility from synthetic PDFs.

The dedicated `consume_cv_budget` RPC reuses the M02 event table without
altering `consume_request_budget`: upload 5 attempts/10 minutes, download/read
60 requests/minute per HMAC identity. Advisory locking precedes counting and
insertion under READ COMMITTED. The existing trusted-proxy/pepper mechanism is
reused. Missing limiter configuration/errors fail closed. Without a verified
proxy address requests share a restrictive budget; this is not claimed as
verified per-user/IP abuse protection. Platform/global abuse protection and
event retention/capacity remain deployment checks.

## Admin to public flow

1. Profile has a fourth CV tab using existing admin controls and bilingual text.
   It displays verified active filename, size, timestamp and download link.
2. Selecting a PDF stages it without upload. Save uses one operation UUID and
   records the prior active version. Dirty tracking guards leaving the tab.
3. The server uploads to a unique path with upsert disabled, verifies existence
   and exact stored bytes, rereads the prior version and activates with CAS.
4. It rereads metadata, verifies the referenced object/hash and rereads metadata
   again. Only a consistent result returns success. Zero-row updates/conflicts
   cannot report success.
5. Ambiguous upload/commit responses retain both objects. The UI reconciles with
   a verified server read; otherwise it keeps the staged file/operation for retry.
   A competing activation requires discard/reload before selecting again.
6. Public `js/cms/cv.js` reads only the four metadata columns with no-store and
   assigns one versioned `cv-document?v=<UUID>` URL to hero and footer together.
   Cross-origin attachment behavior relies on Content-Disposition, not download.
7. Each delivery request reads active metadata, rejects inactive UUIDs, retrieves
   the private object and checks metadata again. Replies use no-store/CDN
   no-store, attachment, nosniff and sanitized errors; no signed redirect exists.

Revocation protects new endpoint requests after the active version changes.
Files already downloaded or responses already in progress cannot be recalled.

## Compatibility and cache transition

The static PDF fallback is allowed only after a confirmed all-NULL CV row, or an
explicit missing-CV-column error followed by a successful legacy singleton read.
Missing rows, partial/invalid metadata and network failures disable both links
and provide retry feedback. A page that has already observed dynamic metadata
also rejects a later downgrade. Other Profile CMS fields remain usable when the
CV migration is unavailable.

**Release blocker:** the historical `assets/documents/CV-Rajendra Aria Nismara.pdf`
file remains present and can remain independently public. Neither endpoint
checks nor new no-store headers revoke historical static URLs or existing CDN/
browser copies. Before claiming only the active CV is publicly available, agree
and validate retirement/routing of that legacy URL and cache behavior during a
coordinated rollout. No legacy file was deleted or production route changed.
New links stop using the static PDF once valid dynamic metadata is configured.

Old managed versions remain private for authorized recovery; no recovery UI or
automatic orphan cleanup is introduced. Recovery must use the same validation
and concurrency rules before any reactivation. Review references before cleanup.

## Local validation evidence

All backend objects, credentials and rows used by tests are synthetic. Browser
requests are fulfilled from repository bytes/fixtures or denied; a dead proxy
and DNS denial add network isolation. No production endpoint is forwarded.
Fixtures and downloads are written outside the repository. No dependencies were
installed. Assertions use actual handlers and actual browser UI, not mock-only
copies of their implementation.

| Check | Actual result |
| --- | --- |
| M06 handler/module/security checks | 72 PASS, 0 FAIL |
| M06 Chrome admin -> handler -> public integration | 42 PASS, 0 FAIL |
| M01 automated regression | 126/126 PASS |
| M01 browser regression | 3/3 PASS |
| M02 module regression | 45/45 PASS |
| M02 browser regression | 47/47 PASS |
| M03 browser regression | 189 PASS, 0 FAIL |
| M04 metadata regression | 34/34 PASS |
| M04 browser regression | 94/94 PASS |
| M05 browser regression | 97 PASS, 0 FAIL; favicon NOT RUN (deferred) |
| PostgreSQL trigger/grants/RLS/Storage/Auth/concurrency runtime | NOT RUN |
| Deno deployment/runtime typecheck | NOT RUN (Deno unavailable) |
| Historic caches, proxy trust, deployment | NOT VERIFIED |
| Native zoom 200%, physical devices, other browsers, screen reader | NOT VERIFIED |

M06 covers invalid/empty/spoofed/oversize PDFs, missing authorization/non-owner/
AAL1, server entrypoint authorization, chunked size bounds/body timeout, all
upload/verification/activation confirmation failure stages, stable-operation
retry, competing CAS model, old-version rejection, attachment bytes/headers,
metadata failures, confirmed legacy fallback, unsaved guard, ordinary Profile
save payload separation, first upload and lost-ack reconciliation. Actual Chrome
attachment download completed and bytes matched the synthetic PDF. SQL checks
are static; the CAS double does not prove real PostgreSQL concurrency or RLS.

Reusable commands:

```text
node --experimental-vm-modules scripts/test-m06-cv.js
node --experimental-vm-modules scripts/test-m06-browser.js <external-output-directory>
node scripts/test-publish-upload-integrity.js
node --experimental-vm-modules scripts/test-m02-security.js
node scripts/test-m02-browser.js <external-output-directory>
node scripts/test-m03-carousel.js <external-output-directory>
node scripts/test-m04-cover.js
node scripts/test-m04-projects.js <external-output-directory>
node scripts/test-m05-visual.js <external-output-directory>
```

Session evidence lives outside the repository in
`C:/Users/USEPRE~1/AppData/Local/Temp/portfolio-m06-u4egkwqq`:
module JSON, browser results/network decisions, synthetic downloads/screenshots,
regression results, baseline hashes and M06-only review diff.
M01 browser verification reused the existing external regression fixture.

## Final scope and repository checks

M06 modifies five existing files (Profile tab integration, translations, homepage,
CMS fetch compatibility and Supabase local config) and adds eleven files for CV
handlers, validation/UI, migration, tests and this report. No file was deleted.
Hash comparison preserves 155 other baseline files byte-for-byte, including the
M01-M05 implementation outside these five integration points. Source syntax,
local import targets, TOML parsing and added-line whitespace checks PASS.

CRLF-aware `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check`
PASS. Plain `git diff --check` flags carriage returns as trailing whitespace in
the existing mixed-line-ending worktree; those files were not normalized or
changed to silence that result. No Git configuration was changed.

Git status at review: 32 tracked modified entries and 29 untracked entries
(directories may represent multiple files). The pre-M06 dirty baseline had 32
tracked modified and 19 untracked entries; all earlier work is retained.
See external `git-status.txt`, `m06-scope-check.json` and `m06-review.diff` for
the full status and the M06-only changes against that baseline.

The private bucket/server access design follows the documented
[Supabase private bucket behavior](https://supabase.com/docs/guides/storage/buckets/fundamentals)
and [server service-key boundary](https://supabase.com/docs/guides/storage/security/access-control).
These references establish platform behavior, not successful validation of this
deployment. The implementation's Auth verification uses the documented
[getUser(jwt)](https://supabase.com/docs/reference/javascript/auth-getuser) path.

## Prepared changes and release blockers

Migration `20261019030000_m06_cv_management.sql`: prepared locally, NOT APPLIED.
Edge Functions `manage-cv` and `cv-document`: prepared locally, NOT DEPLOYED.
Local config declares the private bucket and function gateway settings.
`manage-cv` has gateway verify_jwt=false because its handler independently
verifies the bearer token AND owner/AAL2; deployment must verify this exact path
cannot be bypassed. `cv-document` intentionally admits anonymous requests.

Required release validation, under separate authorization:

- Preserve every M02 blocker: real migration/RLS/owner-AAL2/Storage access,
  shared certificate bucket consumers, historical URL/CDN behavior, trusted
  proxy, PostgreSQL limiter concurrency and reference audit before orphan cleanup.
- Apply/test the M02 prerequisites before M06; verify helper/event table/grants,
  four-column constraint, trigger against direct REST/UPSERT, service-only RPCs,
  bucket incompatibility rejection and restrictive Storage policy composition.
- Exercise real concurrent activations/rate-limit requests, Storage verification,
  ambiguous network outcomes and row/object consistency with disposable data.
- Validate representative PDF exports, Edge runtime/SDK/headers, private raw URLs,
  old version rejection, authenticated recovery access and no-store behavior.
- Coordinate SQL, bucket configuration, functions, existing server-only limiter
  settings and frontend rollout. Do not activate CV metadata until delivery is
  operational. An unavailable dynamic endpoint must not trigger static fallback.
- Resolve the historical static CV route/cache transition described above.
- Preserve unapplied M04 migration and legacy schema compatibility checks.
- Preserve M05 favicon DEFER and expanded hero toward text OPEN for owner review;
  preserve the outstanding original E-Commerce detail material requirement.

No production protection is claimed active. No commit, push, deployment, remote
migration, real Storage cleanup or production access was performed for closure.
M06 is closed as DONE - LOCAL VERIFIED; M07 has not started. Await next instructions.
