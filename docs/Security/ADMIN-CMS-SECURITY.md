# ADMIN-CMS-SECURITY.md

**Project:** Project Web Portfolio — Admin Dashboard / CMS  
**Status:** Security Planning / Baseline Specification  
**Scope:** Admin CMS V1 + interaction with existing Supabase Portfolio V1  
**Primary Constraint:** Rp0 / free-only stack  
**Admin Model:** Single owner account  
**Implementation Status:** **DO NOT WRITE FINAL RLS SQL UNTIL DATABASE SCHEMA IS FROZEN**

---

# 1. PURPOSE

This document defines the security requirements for the Portfolio Admin CMS.

The target is not to make `/admin/` impossible to discover.

The target is:

> Finding, opening, modifying, or reverse-engineering the Admin frontend must not grant privileged access.

Security must be enforced at the actual data and storage boundaries.

Core model:

```text
BROWSER UI
    ↓
Supabase Auth
    ↓
JWT identity + MFA assurance
    ↓
Postgres RLS / Storage RLS
    ↓
AUTHORIZED OPERATION
```

Not:

```text
if (isAdmin) {
    showButton()
}
```

Frontend visibility is UX only.

Authorization is enforced by Supabase/Postgres policies.

---

# 2. SECURITY GOALS

The system must prevent unauthorized users from:

- creating content,
- editing content,
- deleting content,
- publishing content,
- unpublishing content,
- archiving content,
- restoring content,
- changing ordering,
- uploading media,
- replacing media,
- deleting media,
- reading Draft content,
- reading Archived content,
- reading Trash content,
- reading private draft media,
- changing Technologies,
- changing Profile/About content.

The public may only read content intentionally exposed by policy.

---

# 3. THREAT MODEL

Assume an attacker can:

- discover `/admin/`,
- inspect HTML/CSS/JavaScript,
- inspect the browser Network tab,
- obtain the Supabase project URL,
- obtain the client publishable key,
- call Supabase REST endpoints manually,
- call Storage endpoints manually,
- change frontend JavaScript in DevTools,
- forge form values,
- modify hidden inputs,
- change project IDs/slugs,
- submit SQL-looking strings,
- submit HTML/script-looking strings,
- upload renamed/malformed files,
- repeatedly attempt login,
- reuse public IDs/URLs,
- send requests without using the Admin UI.

The application must remain safe under these assumptions.

---

# 4. NON-GOAL: SECRET ADMIN URL

The Admin URL is not considered a secret.

Example:

```text
https://example.com/admin/
```

may eventually be discovered.

Security therefore does not depend on:

- obscure path names,
- robots.txt,
- not linking Admin in Navbar,
- JavaScript redirect tricks,
- hiding buttons,
- minifying code.

We may still use:

```html
<meta name="robots" content="noindex,nofollow,noarchive">
```

to discourage indexing.

This is privacy/cleanliness only, not authorization.

---

# 5. AUTHENTICATION MODEL

## 5.1 One Account Only

CMS V1 has exactly one Admin account.

Requirements:

- Supabase email/password Auth,
- owner account created manually,
- no public Register page,
- no social login,
- no anonymous Admin login,
- no multi-admin,
- no public invitation flow.

Supabase setting:

```text
Allow new users to sign up = OFF
```

Only an existing manually created account may sign in.

---

# 6. ADMIN IDENTITY

Being authenticated is NOT enough.

Forbidden rule:

```text
role == authenticated
→ Admin
```

Required rule:

```text
authenticated
AND
auth.uid() == OWNER_ADMIN_UUID
AND
MFA assurance == aal2
→ Admin write permission
```

This protects the CMS even if another authenticated Auth user exists.

The owner UUID must be treated as authorization configuration.

It is not a password or secret, but it must not be used as the only security measure.

---

# 7. MFA — REQUIRED

Admin CMS requires TOTP MFA.

Flow:

```text
Email + Password
    ↓
aal1
    ↓
TOTP Challenge
    ↓
aal2
    ↓
Admin access
```

The UI must not consider MFA complete merely because a TOTP screen was displayed.

The application must check the Authenticator Assurance Level.

Required:

```text
aal2
```

for CMS write operations.

## Critical Rule

MFA must be enforced in:

- Admin navigation guard,
- database authorization,
- Storage authorization where practical.

Frontend-only MFA is insufficient.

---

# 8. MFA ENROLLMENT

Initial setup is performed deliberately for the single owner account.

Expected first-time flow:

```text
Owner account
    ↓
Login
    ↓
No verified TOTP factor
    ↓
Enroll authenticator
    ↓
Scan QR
    ↓
Verify TOTP
    ↓
Factor becomes verified
```

The Admin UI must not provide public MFA enrollment to arbitrary users.

Only the authorized owner account may enroll/manage its factor.

---

# 9. PASSWORD POLICY

Recommended Admin password:

- unique,
- generated/stored in a password manager,
- preferably 14+ characters,
- not reused anywhere else,
- mixture of character classes where supported.

Supabase Auth minimum password configuration should be set strongly.

Recommended baseline:

```text
minimum length >= 12
```

Prefer longer owner-generated credentials.

Known leaked-password protection may depend on the Supabase plan, therefore it must not be treated as a Free-plan requirement.

MFA remains mandatory.

---

# 10. LOGIN UX

Login page contains only:

```text
Email
Password
Sign In
```

Do not display:

- Register,
- Continue with Google,
- anonymous sign-in,
- list of valid users.

Failed authentication should use a generic message:

```text
Invalid email or password.
```

Do not intentionally expose:

```text
This email exists.
This account is the Admin.
Unknown user.
```

where unnecessary.

---

# 11. ACCOUNT RECOVERY

CMS V1 does not need a public Forgot Password workflow unless explicitly approved later.

Because there is only one owner, recovery can initially be handled through the Supabase project dashboard.

This reduces unused public Auth surface.

If a password-recovery UI is later added:

- it must use Supabase-supported recovery,
- it must use allowlisted redirect URLs,
- it must not create users,
- it must use generic responses,
- it must be security-reviewed separately.

---

# 12. AUTH RATE LIMITING

Supabase Auth built-in rate limiting remains enabled.

Do not attempt to bypass it.

Admin UI must handle:

```text
429 Too Many Requests
```

with a user-friendly message.

Example:

```text
Too many attempts.
Please wait before trying again.
```

Do not expose raw rate-limit internals.

---

# 13. CAPTCHA

Current V1 decision:

CAPTCHA is not required to be visible from day one.

If login receives bot/credential-stuffing traffic, add:

- Cloudflare Turnstile, or
- another Supabase-supported free CAPTCHA option.

CAPTCHA supplements:

- password,
- MFA,
- rate limit.

It does not replace them.

---

# 14. SESSION MODEL — FREE PLAN REALITY

The project must remain Rp0.

Current Supabase Free-plan constraint:

Server-enforced:

- time-boxed session lifetime,
- inactivity timeout,
- single-session-per-user

must NOT be assumed available.

Therefore the V1 security specification must not promise those controls.

## Required Free-Plan Session Behavior

Use standard Supabase session persistence so refresh survives page reload.

On every Admin load:

```text
read session
    ↓
verify valid authenticated user
    ↓
verify auth.uid() matches owner
    ↓
verify aal2
    ↓
only then render privileged Admin state
```

Any failed condition:

```text
stop Admin initialization
clear privileged local state
redirect to appropriate Auth step
```

---

# 15. ACCESS TOKEN EXPIRATION

Use the normal short-lived Supabase access-token model.

Do not intentionally increase JWT lifetime above the normal recommended range without security review.

Baseline:

```text
default approximately 1 hour access token
```

Refresh is handled by the Supabase client.

Remember:

- signing out revokes refresh capability,
- an already issued access JWT may remain valid until its expiry.

RLS must still validate identity/claims on requests.

---

# 16. OPTIONAL CLIENT-SIDE IDLE LOGOUT

Because Free plan does not provide server-enforced inactivity timeout, Admin may implement a client-side convenience timeout later.

Example:

```text
30–60 minutes no Admin interaction
→ call signOut()
```

However:

> Client-side idle logout is NOT a security boundary.

Reasons:

- JavaScript may be paused,
- page may be closed,
- attacker may call APIs directly,
- session control ultimately lives in Auth.

Do not describe this feature as server-enforced session expiration.

---

# 17. LOGOUT

Logout must call Supabase Auth sign-out and clear Admin-local state.

For a single-owner CMS, recommended V1 button behavior:

```text
Logout
→ terminate the current browser session
```

An optional separate emergency action may later provide:

```text
Sign out all sessions
```

Do not unexpectedly sign out every device from an ordinary UI action unless explicitly intended.

On logout:

- clear cached Admin data,
- clear unsaved sensitive state,
- redirect to Login,
- do not continue privileged background requests.

---

# 18. ADMIN ROUTE GUARD

Every `/admin/` initialization must begin with an Auth guard.

Concept:

```text
/admin/
    ↓
Checking session...
    ↓

NO SESSION
→ Login

OWNER + aal1
→ MFA

NON-OWNER
→ Unauthorized + sign out

OWNER + aal2
→ Admin Shell
```

The Admin dashboard must not briefly render privileged Draft data before the guard completes.

Use a guarded loading state.

---

# 19. AUTH STATE CHANGES

Listen for Supabase Auth state changes.

Required handling includes:

```text
SIGNED_OUT
→ destroy Admin state
→ Login

session becomes invalid
→ destroy Admin state
→ Login

token refreshed
→ continue only if owner + required assurance still valid
```

Do not assume that a session stays valid because it was valid when the page first loaded.

---

# 20. CLIENT API KEY RULE

Frontend may contain:

```text
Supabase project URL
Supabase publishable key
```

because a browser application cannot keep those values secret.

The publishable key is an identifier/access entry point, not authorization.

Security comes from:

- Auth,
- RLS,
- Storage policies.

---

# 21. FORBIDDEN FRONTEND SECRETS

Never place in:

- HTML,
- JS,
- source repository,
- GitHub Pages build output:

```text
sb_secret_...
service_role
database password
JWT signing private key
private API secret
Supabase Management API token
```

If a secret is ever accidentally committed:

```text
1. treat it as compromised
2. revoke/rotate it
3. remove it from active configuration
4. audit repository history
```

Deleting the visible line alone is not sufficient.

---

# 22. SECRET / SERVICE ROLE POLICY

The Admin browser does not need a secret/service-role key.

Normal CMS CRUD should be accomplished through:

```text
publishable key
+
owner Auth JWT
+
RLS
```

This is preferred.

Only introduce backend secret access if a later feature genuinely cannot be implemented safely with RLS.

If an Edge Function requires a secret:

- store it in server-side environment secrets,
- perform explicit owner authorization before privileged work,
- never return the secret to browser.

---

# 23. DATABASE SECURITY MODEL

All CMS tables in an exposed schema must:

```text
ENABLE ROW LEVEL SECURITY
```

No table should rely on default API accessibility.

Policies are written per operation:

- SELECT,
- INSERT,
- UPDATE,
- DELETE.

Avoid one overly broad policy where explicit policies are clearer.

---

# 24. PUBLIC VS ADMIN PRINCIPLE

Public policies answer:

```text
What is intentionally visible on the Portfolio?
```

Admin policies answer:

```text
Is this request from the owner with aal2?
```

These concerns remain separate.

---

# 25. OWNER WRITE CONDITION

Planning-level condition:

```text
is owner:
    auth.uid() == OWNER_ADMIN_UUID

is strong session:
    auth.jwt().aal == aal2
```

CMS mutation permission:

```text
is_owner
AND
aal2
```

Final SQL syntax will be written only after schema freeze.

---

# 26. RLS — PROFILES

Public:

```text
SELECT
→ public profile record only
```

Admin:

```text
UPDATE
→ owner UUID + aal2
```

Normally V1 does not need arbitrary public Profile INSERT/DELETE.

Prefer a single controlled record.

---

# 27. RLS — HERO MEDIA

Public:

```text
SELECT
→ configured active Hero slots
```

Admin:

```text
INSERT / UPDATE / DELETE
→ owner UUID + aal2
```

Database must enforce valid logical slot numbers:

```text
1
2
3
```

The UI is not the only place enforcing the 3-slot rule.

---

# 28. RLS — ABOUT INTERESTS

Public:

```text
SELECT
→ active items
```

Admin:

```text
INSERT / UPDATE / DELETE
→ owner UUID + aal2
```

---

# 29. RLS — ABOUT ORGANIZATION CONTENT

Public:

```text
SELECT
→ intended public organization content
```

Admin:

```text
UPDATE
→ owner UUID + aal2
```

---

# 30. RLS — ABOUT ORGANIZATION SKILLS

Public:

```text
SELECT
→ active items
```

Admin:

```text
INSERT / UPDATE / DELETE
→ owner UUID + aal2
```

---

# 31. RLS — ABOUT GALLERY

Public:

```text
SELECT
→ active items only
```

Admin:

```text
INSERT / UPDATE / DELETE
→ owner UUID + aal2
```

Disabled gallery items must not be returned through normal public queries.

---

# 32. RLS — EXPERIENCES

Public:

```text
SELECT
WHERE
status = published
AND deleted_at is null
```

Admin owner + aal2:

```text
SELECT all
INSERT
UPDATE
DELETE where supported
```

Draft and Archived experiences must not be public.

---

# 33. RLS — EXPERIENCE TAGS

Public tag access must depend on the parent Experience.

Public:

```text
SELECT
only if parent Experience is published and not deleted
```

Do not expose Draft Experience tags simply because the child table has a public SELECT policy.

Admin:

```text
owner + aal2
```

---

# 34. RLS — PROJECTS

Public:

```text
SELECT
WHERE
status = published
AND deleted_at is null
```

No public access to:

- Draft,
- Archived,
- Trash.

Admin owner + aal2:

```text
SELECT all
INSERT
UPDATE
DELETE
```

Delete behavior is still governed by business workflow:

```text
soft delete first
permanent delete only explicit action
```

---

# 35. RLS — PROJECT PARAGRAPHS

Public:

```text
SELECT
only if parent Project is published
and parent deleted_at is null
```

Admin:

```text
owner + aal2
```

Never create a blanket public child-table SELECT that leaks Draft content.

---

# 36. RLS — PROJECT MEDIA METADATA

Public:

```text
SELECT
only if:
parent Project is published
AND parent not deleted
AND media is active
```

Admin:

```text
owner + aal2
```

---

# 37. RLS — PROJECT TECHNOLOGIES

Public relationship:

```text
SELECT
only if parent Project is published and not deleted
```

Admin:

```text
INSERT / DELETE
→ owner + aal2
```

No public relationship writes.

---

# 38. RLS — TECHNOLOGIES

Technology security needs special handling because Disabled technologies may still be used by an existing published Project.

Public Technology read may be allowed when:

```text
is_active = true
OR
technology is referenced by a currently published Project
```

Public Tech Stack renderer separately filters:

```text
is_active = true
AND
show_in_public_stack = true
```

This preserves legacy Project chips without showing Disabled technology in the About Tech Stack.

Admin mutation:

```text
owner + aal2
```

---

# 39. DATABASE CONSTRAINTS ARE SECURITY SUPPORT

RLS controls who may operate.

Constraints control what valid data may exist.

Use database constraints for rules such as:

- status enum/check,
- unique project slug,
- Hero slot number,
- required relations,
- sort-order sanity where appropriate,
- URL length constraints,
- string maximum lengths where practical.

Do not rely solely on frontend validation.

---

# 40. SQL INJECTION DEFENSE

The CMS must not construct SQL statements by concatenating user-controlled strings.

Required:

- use `supabase-js` query APIs,
- pass values as query values,
- use parameterized database functions if RPC is introduced,
- no dynamic SQL built from textarea/input values,
- no user-provided column/table names,
- no raw SQL endpoint exposed to Admin.

Example attack string:

```text
'; DROP TABLE projects; --
```

must be treated as:

```text
ordinary text input / invalid content
```

not executable database syntax.

---

# 41. DYNAMIC FILTER SAFETY

Be careful with any API that accepts raw PostgREST/filter expressions.

Do not concatenate arbitrary user input into complex raw filter grammar.

For search:

- use supported query-builder operators,
- normalize length,
- escape/handle wildcard semantics where needed,
- never turn search text into arbitrary query syntax.

---

# 42. XSS DEFENSE

CMS text is plain structured content.

It is not arbitrary HTML.

Forbidden V1 inputs:

- custom HTML,
- custom JavaScript,
- script blocks,
- event handler attributes,
- arbitrary SVG markup,
- custom CSS.

Public rendering should default to safe DOM APIs:

```text
textContent
createTextNode
setAttribute for validated safe values
```

Avoid:

```text
innerHTML = cmsValue
```

---

# 43. STORED XSS

Stored XSS is especially important because Admin content is saved in Supabase and later rendered publicly.

Example malicious value:

```html
<img src=x onerror=alert(1)>
```

Expected behavior:

```text
display as harmless text
or reject by content rules
```

It must never become executable HTML.

Do not assume:

```text
Only I can use Admin, therefore XSS does not matter.
```

Data may be corrupted through:

- compromised credentials,
- future imports,
- direct API attempts,
- coding mistakes.

---

# 44. URL VALIDATION

Fields such as:

- GitHub URL,
- Demo URL,
- optional external links

must be parsed and validated.

Production baseline:

```text
https:
```

only unless a specific valid use case requires another scheme.

Explicitly reject dangerous schemes such as:

```text
javascript:
data:
vbscript:
```

When opening external pages in a new tab, use appropriate safe `rel` behavior.

---

# 45. IMAGE UPLOAD INPUT SECURITY

Admin input accepts:

- JPG,
- JPEG,
- PNG,
- WebP.

Do not accept:

- SVG,
- GIF,
- HTML,
- JS,
- PDF as image,
- executable formats,
- arbitrary binary.

Do not trust extension alone.

Do not trust MIME header alone.

---

# 46. IMAGE VALIDATION PIPELINE

Required local pipeline:

```text
File selected
    ↓
check input size
    ↓
check expected extension
    ↓
check MIME as preliminary signal
    ↓
attempt browser image decode
    ↓
validate dimensions
    ↓
re-encode to WebP
    ↓
only generated WebP is eligible for upload
```

This is significantly safer than uploading the original file unchanged.

---

# 47. IMAGE LIMITS

Current owner-approved original input limit:

```text
15 MB
```

Add dimension/decompression safeguards.

Planning baseline:

```text
max dimension: approximately 12,000 px on either axis
max decoded area: approximately 50 megapixels
```

Exact implementation limits may be adjusted after testing legitimate portfolio assets.

Purpose:

- avoid excessive memory use,
- avoid decompression-bomb-like images,
- keep browser processing stable.

---

# 48. STORAGE OUTPUT FORMAT

Although Admin input may be JPG/PNG/WebP:

> Storage CMS media should preferably receive generated WebP only.

This allows stronger bucket restrictions.

Recommended Storage MIME allowlist:

```text
image/webp
```

Recommended Storage per-object maximum should be significantly lower than the 15 MB original-input limit.

Planning baseline:

```text
<= 5 MB generated object
```

Normal optimized assets should be much smaller.

---

# 49. IMAGE METADATA / PRIVACY

Browser re-encoding should create new image output rather than preserving the original file binary.

Benefits include normally removing unnecessary metadata such as:

- EXIF fields,
- original filename metadata,
- GPS metadata where present.

Do not intentionally preserve sensitive metadata unless required.

---

# 50. GENERATED STORAGE NAMES

Never use an original filename as security identity.

Do not trust:

```text
../../project.webp
<script>.webp
cover.php.webp
```

Storage paths are generated by application logic.

Use:

- UUIDs,
- known folder structure,
- controlled fixed filenames where appropriate.

Example:

```text
projects/{project_uuid}/documentation/{media_uuid}/desktop.webp
```

---

# 51. STORAGE ACCESS MODEL

Portfolio published images are intentionally public.

Draft images should not accidentally become public simply because they exist.

Recommended security architecture uses two logical states:

```text
PRIVATE STAGING
→ Draft / Preview media

PUBLIC PUBLISHED MEDIA
→ only content intentionally Published
```

Exact bucket implementation is finalized during Storage/database design.

---

# 52. RECOMMENDED BUCKET STRATEGY

Preferred security-first model:

```text
portfolio-staging
→ PRIVATE

portfolio-media
→ PUBLIC
```

## `portfolio-staging`

Used for:

- Draft Project cover,
- Draft documentation,
- pending replacement images,
- Admin preview assets.

Read/write:

```text
owner + authenticated/MFA rules only
```

## `portfolio-media`

Used only for content that is intentionally public.

Retrieval:

```text
public
```

Mutation:

```text
owner + aal2 only
```

A public bucket being publicly readable must not imply public upload/delete permission.

---

# 53. PUBLISH MEDIA TRANSITION

Planning concept:

```text
Draft media
→ private staging
→ Preview
→ Publish requested
→ copy/promote generated media to public bucket
→ database public references/status updated
→ verify success
```

The exact transactional order must be designed carefully.

Do not make a Project `published` before required public media is successfully available.

---

# 54. UNPUBLISH / ARCHIVE MEDIA

We need explicit privacy behavior during final Storage design.

Security-first desired behavior:

```text
Unpublish / Archive
→ Project no longer queryable by public
→ publicly served Project media should be removed/revoked where feasible
→ private editable source/state remains available to owner
```

This transition must avoid destroying the only valid copy.

Final copy/move strategy is decided after Storage capacity and implementation behavior are tested.

---

# 55. SAFE REPLACE

Never:

```text
delete current image
→ attempt upload
```

Required:

```text
process new image
→ upload new image
→ verify upload
→ database update
→ verify database state
→ then clean old object
```

Failure before final cleanup:

```text
old media remains usable
```

---

# 56. STORAGE RLS

Storage writes are protected using policies on:

```text
storage.objects
```

Owner mutation conditions must restrict:

- target bucket,
- authenticated identity,
- owner UUID,
- MFA assurance where enforceable,
- permitted object path.

Do not create:

```text
authenticated can upload everything
```

as a broad policy.

---

# 57. STORAGE PATH RESTRICTION

Policies should limit writes to CMS-owned prefixes/buckets.

Example planning idea:

```text
bucket = portfolio-staging
AND
path begins with an approved CMS namespace
AND
owner + aal2
```

The exact Storage helper/functions are finalized with SQL.

---

# 58. DIRECT STORAGE ATTACK TESTS

Before launch, test manually:

```text
anonymous upload
→ denied

anonymous delete
→ denied

authenticated non-owner upload
→ denied

authenticated non-owner delete
→ denied

owner aal1 write
→ denied

owner aal2 write
→ allowed

public read published asset
→ allowed

public read private staging
→ denied
```

---

# 59. IDOR / OBJECT ID MANIPULATION

Project IDs and Media IDs are not authorization.

An attacker may replace:

```text
project_id=A
```

with:

```text
project_id=B
```

RLS must still enforce access.

Do not write code like:

```text
if URL contains project UUID:
    allow update
```

The database must authorize every target row.

---

# 60. PUBLIC SLUGS

Project slug is public routing data.

It does not grant special access.

Public query:

```text
slug = requested_slug
AND status = published
AND deleted_at is null
```

A known Draft slug must not allow Draft retrieval.

---

# 61. PREVIEW SECURITY

Draft Preview must never require making the Draft publicly readable.

Admin Preview:

```text
owner session + aal2
→ read Draft
→ render using public-equivalent template
```

Do not implement Preview by temporarily setting:

```text
status = published
```

even for seconds.

---

# 62. FORM VALIDATION

Validation exists at multiple layers:

```text
Admin UI
+
application query layer
+
database constraints
```

Frontend validation improves UX.

It does not replace database enforcement.

Validate:

- required fields,
- string lengths,
- enum/status values,
- URLs,
- dates/years,
- file properties,
- slug format,
- list size where relevant.

---

# 63. STRING LENGTH LIMITS

All text fields should have reasonable maximum lengths.

Examples to finalize with database schema:

```text
name
professional title
project title
category
role
location
slug
alt text
short description
```

Long fields:

```text
description
paragraph
intro
```

also need deliberate limits.

Purpose:

- input quality,
- layout stability,
- abuse protection,
- predictable database use.

---

# 64. SLUG VALIDATION

Project slug:

```text
lowercase
letters
numbers
hyphens
```

Example:

```text
football-club-mobile-app
```

Reject:

```text
../admin
<script>
?x=1
spaces
```

Database requires unique slug.

Do not use slug as primary security identifier.

---

# 65. STATUS TRANSITION VALIDATION

Do not accept arbitrary status strings from modified forms.

Allowed states:

```text
draft
published
archived
```

Project Trash is represented separately by `deleted_at`.

Actions must validate permitted transitions.

Example:

```text
Draft → Published
Published → Draft
Draft/Published → Archived
Archived → Draft
```

Invalid state must be rejected.

---

# 66. DELETE SAFETY

Project Delete:

```text
soft delete first
```

Permanent Delete requires:

- owner,
- aal2,
- explicit confirmation,
- deliberate operation.

UI typed `DELETE` is UX protection only.

RLS remains authorization.

---

# 67. CASCADE / ORPHAN SECURITY

Final schema must define how related records are removed.

Examples:

- project paragraphs,
- project media metadata,
- project technology relationships.

Do not leave uncontrolled orphan records containing Draft content.

Storage objects are separate from database cascade behavior and need explicit cleanup workflow.

---

# 68. ERROR HANDLING

User-facing errors must be safe.

Good:

```text
Could not save this project.
Please try again.
```

Bad:

```text
Postgres error at public.projects line...
RLS policy owner_aal2_write...
JWT...
SQL statement...
```

Detailed development errors may go to console during development.

Production Admin UI should avoid leaking internals.

---

# 69. AUTH ERROR NORMALIZATION

Login errors should not unnecessarily reveal account configuration.

Rate-limit:

```text
Too many attempts. Please wait and try again.
```

Invalid credentials:

```text
Invalid email or password.
```

MFA invalid:

```text
Invalid verification code.
```

Do not render raw provider error JSON to the page.

---

# 70. LOGGING

Do not log:

- password,
- TOTP code,
- access token,
- refresh token,
- secret key,
- full sensitive Auth object.

Development logging should be intentional.

Production console should not contain noisy sensitive debugging.

---

# 71. BROWSER STORAGE

Because session persistence is required, Auth session information may be managed by the Supabase browser client.

This increases the importance of XSS prevention.

Never manually copy Auth tokens into:

- custom localStorage keys,
- session logs,
- DOM data attributes,
- query strings.

Use Supabase Auth client lifecycle rather than creating a custom token storage mechanism.

---

# 72. QUERY STRING SECURITY

Never put:

- Auth tokens,
- secrets,
- passwords,
- TOTP values

in URL query parameters.

Project public slug is safe routing data:

```text
project.html?slug=football-club
```

Admin credentials are not.

---

# 73. DEPENDENCY SECURITY

Keep Admin dependencies minimal.

Prefer:

- browser platform APIs,
- existing maintained Supabase JS client,
- no unnecessary UI framework,
- no random image-upload package.

Before adding a dependency, ask:

```text
Is it actually needed?
Is it maintained?
Does it execute on sensitive Admin pages?
Can browser-native code do the job?
```

Fewer dependencies reduce supply-chain attack surface.

---

# 74. SUPABASE CLIENT VERSION

Use a maintained current Supabase JavaScript client version.

Do not intentionally build new Admin functionality on an obsolete major version.

Exact installation/import approach is decided before implementation based on current repository/package configuration.

---

# 75. CONTENT SECURITY POLICY — PLANNING REQUIREMENT

A restrictive Content Security Policy is desirable for the Admin because XSS is a major risk.

However, exact CSP depends on:

- hosting capabilities,
- Supabase JS loading method,
- image sources,
- current V1 asset/CDN dependencies.

Therefore:

> Do not write a final CSP until dependency and hosting audit is complete.

Target principles:

- scripts from known origins only,
- no arbitrary inline script if avoidable,
- network connections only to required Supabase origin(s),
- images from self/blob/data/required Storage origins,
- no arbitrary third-party embeds.

---

# 76. CLICKJACKING — DEPLOYMENT CHECK

Admin should ideally prevent being embedded by unrelated sites.

The strongest implementation generally requires response security headers.

Because the Admin is planned on static hosting, header capabilities must be verified during deployment planning.

Until then:

- do not claim clickjacking is fully solved,
- destructive confirmations remain required,
- avoid actions triggered by a single ambiguous click.

This is a deployment security item.

---

# 77. CORS IS NOT AUTHORIZATION

Do not rely on browser CORS as the Admin security model.

Attackers may call Supabase APIs outside the browser.

Correct model:

```text
RLS decides authorization.
```

CORS is an additional browser network policy, not a substitute.

---

# 78. GUESTBOOK BOUNDARY

Existing Guestbook is not rebuilt in CMS V1.

However, before final CMS launch, audit its existing Supabase security:

- comments table RLS,
- public insert path,
- approval states,
- Edge Function `submit-comment` if used,
- rate limiting,
- spam filters,
- secrets.

Do not weaken existing Guestbook protections while introducing CMS tables.

---

# 79. SEPARATION OF PUBLIC AND ADMIN QUERIES

Keep public data-loading code logically separate from Admin CRUD code.

Public code should not contain privileged Admin operations merely hidden behind buttons.

Example:

```text
public renderer
→ SELECT intentionally public data only
```

Admin modules:

```text
owner session
→ CRUD according to RLS
```

This reduces accidental privilege exposure.

---

# 80. PUBLIC QUERY RULES

All public renderers must include explicit expected state.

Examples:

```text
Experiences:
published only

Projects:
published + not deleted only

About Gallery:
active only

Tech Stack:
active + show_in_public_stack only
```

RLS should still enforce the same visibility even if a frontend query forgets a filter.

Defense in depth:

```text
frontend filter
+
RLS
```

---

# 81. MFA DATABASE ENFORCEMENT

When final RLS policies are written, policies must account for the JWT `aal` assurance claim.

Goal:

```text
owner aal1
→ read public normally
→ CMS writes DENIED

owner aal2
→ CMS writes ALLOWED
```

This is a mandatory security test.

---

# 82. ADMIN UUID CHANGE PROCEDURE

If the owner Auth account is ever replaced:

1. create/verify new owner account,
2. enroll MFA,
3. update authorization configuration/policies safely,
4. test new account,
5. revoke old account/session,
6. remove old authorization,
7. security test again.

Do not leave old UUID access active indefinitely.

---

# 83. DATABASE BACKUP / RECOVERY REALITY

The application uses a free backend plan.

Do not assume premium backup/recovery capabilities are available.

Important content should still exist in recoverable form where practical:

- source repository,
- owner original images on local device,
- occasional structured data export/manual backup strategy later.

Backup strategy is operational resilience, not authentication.

A detailed backup plan may be added after database design.

---

# 84. SECURITY BEFORE MIGRATION

Do not convert a static public section to dynamic before its RLS policies have been tested.

Required order:

```text
schema
→ constraints
→ RLS
→ security tests
→ Admin CRUD
→ public renderer
→ migration
```

Not:

```text
public renderer
→ database open for testing
→ security later
```

---

# 85. DEVELOPMENT POLICY

During development, do not temporarily use:

```text
public write = true
RLS disabled
authenticated can delete all
```

and forget to fix it later.

If temporary local development exceptions are unavoidable:

- document them,
- never deploy them,
- add final security check before branch merge.

Prefer developing against correct RLS from the start.

---

# 86. RLS TEST MATRIX

Every table must be tested under at least:

```text
ANON
AUTHENTICATED NON-OWNER
OWNER AAL1
OWNER AAL2
```

For each applicable operation:

```text
SELECT
INSERT
UPDATE
DELETE
```

Expected values are explicitly documented before release.

---

# 87. BASE ACCESS MATRIX

Planning baseline:

```text
                         ANON   NON-OWNER   OWNER AAL1   OWNER AAL2

Public published SELECT   YES      YES          YES          YES
Draft SELECT              NO       NO           NO*          YES
CMS INSERT                NO       NO           NO           YES
CMS UPDATE                NO       NO           NO           YES
CMS DELETE                NO       NO           NO           YES
Storage private read      NO       NO           NO*          YES
Storage upload            NO       NO           NO           YES
Storage delete            NO       NO           NO           YES
```

`NO*` is intentional security-first behavior: CMS Draft/private access requires the stronger MFA session.

---

# 88. AUTHENTICATED NON-OWNER TEST

Even though public signup is disabled, create/test a non-owner authenticated scenario during security verification if feasible.

Reason:

We need proof that:

```text
authenticated
≠
Admin
```

Do not rely on:

```text
there is currently only one user
```

as the policy.

---

# 89. DIRECT REST ATTACK TEST

Use browser DevTools/cURL-like testing during development with non-privileged credentials.

Attempt:

```text
INSERT project
UPDATE profile
DELETE project
SELECT draft
```

Expected:

```text
denied
```

This confirms security survives bypassing the Admin UI.

---

# 90. DEVTOOLS MODIFICATION TEST

Manually edit browser state:

```text
isAdmin = true
status = published
project_id = another UUID
```

Expected:

```text
unauthorized server/database operations still fail
```

This confirms frontend state is not trusted.

---

# 91. SQL-LIKE PAYLOAD TESTS

Test text inputs with benign attack-shaped strings such as:

```text
' OR '1'='1
'; DROP TABLE projects; --
```

Expected:

- no SQL structure modification,
- query remains valid/safe,
- value stored as data if valid for that field or rejected by content rules.

---

# 92. XSS TESTS

Test appropriate text fields with:

```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<a href="javascript:alert(1)">x</a>
```

Expected:

```text
never execute
```

The renderer must display safe text or reject the input.

---

# 93. URL ATTACK TESTS

Test link fields:

```text
javascript:alert(1)
data:text/html,...
file:///...
```

Expected:

```text
rejected
```

Valid production:

```text
https://...
```

---

# 94. FILE ATTACK TESTS

Test:

- `.html` renamed `.jpg`,
- `.svg`,
- `.js`,
- fake MIME,
- corrupted PNG,
- huge dimensions,
- >15 MB input,
- file decoding failure.

Expected:

```text
rejected before Storage upload
```

Only valid decoded/re-encoded WebP output proceeds.

---

# 95. PUBLISH SECURITY TEST

Attempt to publish a Project with:

- missing required fields,
- failed cover upload,
- invalid URL,
- missing public media copy,
- invalid status.

Expected:

```text
Publish fails safely.
Draft remains intact.
Public site remains unchanged.
```

---

# 96. SAFE FAILURE PRINCIPLE

For multi-step mutations:

```text
new media upload
database mutation
old media cleanup
```

errors must leave the system in the safest recoverable state.

Prefer:

```text
extra orphan new file temporarily
```

over:

```text
public record pointing to missing image
```

Cleanup can be retried.

Data loss cannot.

---

# 97. SECURITY AUDIT CHECKPOINTS

Perform explicit security review:

## Before Phase 2 completes

- Auth settings,
- MFA,
- owner UUID,
- API key handling,
- RLS baseline.

## Before first public dynamic renderer

- public SELECT policies,
- Draft isolation.

## Before image upload goes live

- Storage policies,
- MIME/size restrictions,
- safe replace.

## Before final deployment

- complete attack matrix,
- secrets scan,
- console audit,
- dependency audit,
- Guestbook regression audit.

---

# 98. CURRENT OPEN ITEMS

These require actual Supabase/project inspection before final implementation:

1. Current Supabase API key generation:
   - publishable key or legacy anon key?

2. Existing Guestbook tables and policies.

3. Existing Storage buckets.

4. Existing Edge Functions.

5. Current Auth provider/settings.

6. Current Supabase JS version/import method.

7. Current GitHub Pages/custom-domain deployment.

8. Final staging/public media bucket transition behavior.

9. Final security-header capability on chosen Admin hosting.

These are not guessed in this document.

---

# 99. REQUIRED SUPABASE AUDIT MATERIAL

Before final RLS SQL, collect from the current Supabase project:

```text
Authentication
├── Providers
├── General Configuration
├── MFA settings
└── Rate Limits

Database
├── Tables
├── current RLS policies
└── functions/triggers used by Guestbook

Storage
├── Buckets
└── current storage.objects policies

Edge Functions
└── function names + source/config where relevant

API Settings
└── key type names only
```

Never send secret values.

Redact:

```text
sb_secret_...
service_role
database password
personal access token
```

---

# 100. LOCKED SECURITY DECISIONS

Confirmed baseline:

- single owner Admin,
- no public signup,
- email/password Auth,
- mandatory TOTP MFA,
- `aal2` required for CMS privileged access,
- owner UUID specific authorization,
- RLS on all CMS tables,
- Storage RLS for writes,
- publishable key only in frontend,
- no service-role/secret key in browser,
- Draft not public,
- Archived not public,
- Trash not public,
- secure structured text rendering,
- no arbitrary HTML,
- SQL-safe query strategy,
- image type/size/decode validation,
- browser re-encode to WebP,
- generated storage paths,
- safe image replace workflow,
- Auth rate limiting retained,
- CAPTCHA added if login abuse requires it,
- session persistence retained,
- Free-plan limitations explicitly respected,
- frontend checks never treated as authorization.

---

# 101. SECURITY ACCEPTANCE CRITERIA

CMS security is not accepted until all of these pass:

```text
1. Opening /admin without session cannot reveal Draft data.
2. Valid non-owner session cannot perform CMS writes.
3. Owner aal1 cannot perform CMS writes.
4. Owner aal2 can perform expected CMS writes.
5. Direct REST write without authorization fails.
6. Direct Storage write without authorization fails.
7. Draft Project cannot be publicly queried.
8. Archived Project cannot be publicly queried.
9. Trashed Project cannot be publicly queried.
10. Draft private media cannot be publicly retrieved.
11. Malicious HTML does not execute.
12. SQL-shaped input does not alter queries.
13. Invalid uploads are rejected.
14. Failed image replacement preserves old working media.
15. No elevated API secret exists in public source/build.
16. Public Portfolio features still work after security policies are enabled.
17. Existing Guestbook security is not weakened.
```

---

# 102. FINAL SECURITY PRINCIPLE

Assume:

```text
The attacker knows the URL.
The attacker sees the JavaScript.
The attacker sees the publishable key.
The attacker knows table names.
The attacker can call the API manually.
```

The system must still remain secure because:

```text
AUTHENTICATION
+
OWNER AUTHORIZATION
+
MFA AAL2
+
RLS
+
STORAGE POLICIES
+
SAFE INPUT/OUTPUT HANDLING
=
ADMIN CMS SECURITY BOUNDARY
```

---

# 103. DOCUMENT SOURCES / VERIFICATION BASIS

This planning baseline was checked against current official guidance from:

- Supabase Documentation — Row Level Security
- Supabase Documentation — Multi-Factor Authentication / TOTP
- Supabase Documentation — Authenticator Assurance Level
- Supabase Documentation — Storage Access Control
- Supabase Documentation — Storage Buckets
- Supabase Documentation — API Keys
- Supabase Documentation — User Sessions
- Supabase Documentation — General Auth Configuration
- Supabase Documentation — Auth Rate Limits
- Supabase Documentation — Password Security
- Supabase Documentation — Signing Out
- OWASP Cheat Sheet Series — SQL Injection Prevention
- OWASP Cheat Sheet Series — Cross-Site Scripting Prevention
- OWASP Cheat Sheet Series — File Upload
- OWASP Cheat Sheet Series — Authentication
- OWASP Cheat Sheet Series — Session Management

Final SQL/policies must be revalidated against the then-current schema and Supabase configuration before deployment.

---

**END — ADMIN CMS SECURITY BASELINE**
