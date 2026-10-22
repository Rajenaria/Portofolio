# M05 - Hero and Global Visual Polish

Status: DONE — LOCAL VERIFIED. Closure approved by the Project Owner. Favicon remains deferred by owner decision.

## Scope and decisions

M01-M04 implementation, security, media lifecycle, project detail content and
carousel geometry are retained. No schema, dependencies, authentication, RLS,
Storage or guestbook request/response contracts are changed.

M05-02 is DEFERRED by explicit Project Owner decision: "Tunda favicon sampai
logo personal ditentukan; lanjutkan subtask M05 lainnya."
The branding inventory contains social/technology icons; `icon.png` is a strip
of third-party application logos. No personal logo, SVG or ICO was found.
No favicon/monogram/asset or favicon reference was invented. Homepage, admin,
generic detail and the two legacy HTML entry points still need favicon rollout
once the owner selects a personal identity. Asset paths and cache behavior are
NOT RUN for favicon, rather than reported as fixed.

## Implementation

- M05-01: desktop hero photo-column top padding reserves navbar and hover/focus
  lift clearance. The existing grid can grow on short desktop viewports. The
  property resets at 1050px; tablet/mobile composition is retained. No new stack
  transforms, margins, image source selection or card proportions were added.
- M05-03: main landmark and visible-on-focus skip link; named primary navigation;
  closed mobile menu inert/aria-hidden state and focus return; named About dots;
  inactive About panels and organization photos inert/aria-hidden; current-dot
  state; About arrow navigation with nested-gallery/input guards. Existing
  selectors and public CMS module contracts remain available.
- M05-04: native focus feedback on existing navigation/CTA controls, modest pressed
  feedback, focus-triggered section reveal, hero selected/expanded announcements,
  Escape collapse and keyboard focus preservation across pointer leave. Reduced
  motion uses immediate hero selection and About/gallery transitions.
- M05-05: synthetic CMS and isolated browser fixtures; no real backend writes.

The M04 regression fixture now waits for offscreen lazy images to load before
asserting currentSrc. It sets eager loading only inside the browser fixture;
production image lazy loading and responsive selection remain unchanged.

## Evidence and verification limits

Read-only baseline measurement reproduced photo/navbar intersection on
1440x600 and 1440x720 viewports: minimum vertical gap -20px at rest and about
-26.4px expanded. After the spacing fix, gaps were 58px at rest, 51.6px spread,
and 31.8px focus+hover. At 1440x900 the corresponding 74/67.6/47.8px gaps were
retained. Thirty preliminary geometry samples had positive navbar clearance,
no page horizontal overflow and no runtime exception. These were minimal safety
checks, not a full milestone regression claim.

The native Chrome/CDP integration uses intercepted source requests, in-memory
CMS/storage fixtures, DNS denial and a deny proxy. No production credentials
are used. The guestbook network script is disabled in these public UI fixtures;
its backend/authorization behavior is covered only by the existing isolated M02
suite. CDN scripts/fonts/icons are blocked. Screenshots and measurements do not
prove production CDN/cache behavior or real browser/device compatibility.

## Open items and carried risks

- Favicon awaits the owner's personal logo/identity decision.
- Existing expanded desktop photo fan extends toward the text column; this
  decorative geometry was deliberately preserved. Screenshots need owner visual
  review before any composition/fan redesign. Navbar clearance is measured;
  no claim of collision-free expanded text composition is made.
- Native 200% zoom, other browsers, physical devices and screen reader output:
  NOT VERIFIED. Semantic/focus checks are not an actual screen reader test.
- Real PostgreSQL/Storage/RLS/owner-AAL2 and concurrency: NOT RUN.
- Deployment, historical CDN cache and trusted proxy assumptions: NOT VERIFIED.
- All M02 release blockers and the unapplied M04 cover migration remain in place.
  Do not automatically delete orphan files with ambiguous database outcomes.
- Original E-Commerce case-study material still belongs to the Project Owner.
- Loader, particles and major asset/performance work remain deferred to M07.
  No FPS, Lighthouse or Web Vitals metrics are claimed.

No commit, push, deployment, migration execution or production access is
performed. M06 must not start automatically.

## Final verification result

- M05-01, M05-03 and M05-04: implemented and locally verified.
- M05-02: DEFERRED with explicit owner approval; favicon testing NOT RUN.
- M05-05: completed at the isolated local level; milestone DONE - LOCAL VERIFIED.
- M05 browser: 97 PASS, 0 FAIL, no runtime exceptions. Includes 72 hero checks
  across eight viewport sizes, 1/2/3 photos and rest/spread/focus-hover states;
  four long-CMS-profile checks; main/skip-link, native Enter/Space/Escape,
  mobile-menu focus return, About arrows/rapid navigation, organization states,
  keyboard feedback, reduced motion and mobile sticky-navbar expansion checks.
- M01: 126/126 automated and 3/3 isolated browser scenarios PASS.
- M02: 45/45 module and 47/47 browser PASS.
- M03: 189/189 browser PASS; native zoom remains NOT VERIFIED.
- M04: 34/34 metadata and 94/94 browser PASS. The browser fixture correction
  concerns loading timing only; the M04 production controller is unchanged.
- Changed/new JavaScript syntax and Git whitespace diff checks: PASS.

Commands executed:

- `node scripts/test-m05-visual.js <external-output-directory>`
- `node scripts/test-publish-upload-integrity.js`
- `node --experimental-vm-modules scripts/test-m02-security.js`
- `node scripts/test-m02-browser.js <external-output-directory>`
- `node scripts/test-m03-carousel.js <external-output-directory>`
- `node scripts/test-m04-cover.js`
- `node scripts/test-m04-projects.js <external-output-directory>`

M01 browser verification reused its existing external fixture with the current
repository source. Node syntax checks consumed the changed/new JavaScript via
`node --input-type=module --check`; no dependencies were installed.
Evidence, network decisions, screenshots, baseline hashes and the M05-only diff
are stored outside the repository in `portfolio-m05-70p9f8pt` under the local
temporary directory. The reusable M05 script remains in `scripts/`.

## Approved milestone closure (2026-10-19)

M05 is closed at the implementation and isolated local testing level.
Recorded results from the completed runs: M05 browser 97 PASS, 0 FAIL;
M01-M04 regressions PASS as detailed above; syntax and diff checks PASS.
Native 200% zoom, other browsers, physical devices, screen readers and
deployment remain NOT VERIFIED. No tests were rerun for closure.

All M01-M05 implementation is retained. Favicon remains DEFERRED until the
personal logo is determined; no branding creation or replacement is authorized.
The expanded hero photo fan extending toward the text column remains OPEN for
visual review; geometry changes require explicit approval. All M02 release
blockers and M04 migration rollout prerequisites remain active.

Closure changes are limited to this document's status and closure notes.
No source change, refactor, commit, push, deployment, migration execution or
production access was performed. M06 has not started; stop at the checkpoint
and await the next instruction.
