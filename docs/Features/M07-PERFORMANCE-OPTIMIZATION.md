# M07 - Performance Optimization

Status: DONE — LOCAL VERIFIED (2026-10-21). Closure approved by the Project Owner.
Deployment remains unapproved. The pre-existing uncommitted M06
closure document is preserved byte-for-byte from this milestone's baseline.

## Current owner-approved review follow-up

See [M07 Review Follow-up](M07-REVIEW-FOLLOWUP.md) for the restored complete intro,
removed Project controls, targeted verification, Live Server diagnosis and the
preview diagnosis. The approved launcher is documented in
[M07 Safe Local Preview](M07-SAFE-LOCAL-PREVIEW.md). The two-second loader and 1.7-1.9 s reveal
measurements below are historical, superseded by that approved follow-up.
M07 is closed; the local fixture preview is retained. The approved M08 decision
and current roadmap are recorded in [M08 Frontend Architecture](M08-FRONTEND-ARCHITECTURE.md).

## Initial M07 review record (before owner follow-up)

## Scope and subtask status

| Subtask | Local result |
| --- | --- |
| M07-01 baseline and bottleneck analysis | Complete; fresh comparable measurements |
| M07-02 images/fonts/assets | Complete; five full-resolution WebP variants, loading priorities |
| M07-03 loader/particles | Complete; bounded first-screen gate and demand-driven lifecycle |
| M07-04 rendering/JavaScript | Complete; pointer work coalesced per frame, geometry reads grouped |
| M07-05 comparison/regression/review | Complete at the isolated local level; see limits below |

No framework, dependencies, database/Storage/auth contracts, carousel architecture,
CMS queries, branding or hero fan geometry were changed. PROJECT/README describe
an earlier guestbook-only architecture; actual CMS/admin modules were used as
the source of current behavior. No unrelated documentation was rewritten.

## Measurement method

Reusable native Chrome/CDP harness: `scripts/test-m07-performance.js`.
Chrome 155 headless on Windows, three runs/profile/phase, 12-second observation
window before interaction. Reported values are medians. PerformanceObserver
collects paint, LCP, CLS session windows excluding recent input, and long tasks.
CDP collects task/script/layout/style durations and a heap sample. requestAnimationFrame
callbacks are counted by callback name. No Lighthouse score, field Web Vitals,
INP or sustained-memory-leak measurement is claimed.

| Profile | Viewport / DPR | CPU throttle | Local HTTP network emulation |
| --- | --- | --- | --- |
| Desktop | 1440x900 / 1 | 1x | 40 ms latency, 2,500,000 bytes/s (20 Mbps) |
| Mobile | 390x844 / 1, mobile emulation | 4x | 150 ms latency, 200,000 bytes/s (1.6 Mbps) |

Static files are served over real loopback HTTP; HTML/CSS/JS use gzip. HTTP cache
is disabled and responses use no-store. Each phase uses a fresh Chrome profile,
reused across its runs; OS/V8 cache and host scheduling are not fully controlled.
No other regression browser suites ran during the performance samples.

All requests pass through Fetch interception. Only the known loopback static
origin continues to the local server. Synthetic localhost CMS responses are
fulfilled in memory; guestbook network execution is stubbed. Every external
origin, including production, fonts/icons/CDNs, is denied. A dead proxy plus DNS
denial (with an explicit loopback exception) add isolation. The fixed dataset
uses an unconfigured profile/CV singleton, empty CMS collections and compatible
static fallback content. It does not represent a populated production CMS.
Synthetic API latency is not a measurement of Supabase latency. CDN typography,
icons and real font timing remain NOT VERIFIED. Current body text uses the
existing system-font stack; no new webfont strategy was introduced.

An initial harness attempt also denied loopback and reached Chrome's error page.
Those samples in `before/` and `probe/` are INVALID and excluded. The valid
comparison uses only `baseline/m07-baseline.json` and `after/m07-optimized.json`,
both with zero captured runtime exceptions and verified local page origin.
No M00 measurements were reused.

## Baseline findings and changes

The old loader waited on window load, fonts and all six CMS sections, then a
three-second animation boundary, with its timeout starting at DOMContentLoaded.
Its measured median release was 8.359 s desktop and 4.408 s mobile. Large eager
assets and unrelated sections could therefore delay access to the first screen.

The new gate preserves `window.portfolioReady.mark/release/pending`, waits on the
hero signal and primary hero decode, and has a two-second deadline armed in the
head before DOMContentLoaded. Other CMS signals remain available but do not block
reveal. The overlay defaults to hidden unless its script adds is-loading; absent,
failed or disabled JavaScript therefore leaves content accessible. Visibility
change/pagehide also releases the overlay. Font readiness and animation-cycle
completion no longer gate access. The bar artwork remains unchanged. Asynchronous
CMS content can appear after reveal; existing reserved image geometry is retained.

Five PNGs observed in actual desktop resource loading receive WebP counterparts.
The original files are retained and dimensions are unchanged. Homepage desktop
sources and the education CSS background use the new files; every 650px mobile
source remains unchanged. Primary hero width/height is explicit and high priority
is preserved. About photo is lazy, low priority and reserves intrinsic dimensions.
Iconify's existing external script is deferred; Devicon stays in place because
static markup still uses its classes. Version query strings are updated for
changed public scripts/styles; production cache behavior is not claimed verified.

| Original -> WebP | Dimensions | Original bytes | New bytes |
| --- | --- | --- | --- |
| profile/hadow.png -> hadow.webp | 1080x1350 | 1,424,313 | 803,428 |
| profile/Profil 1.png -> profil-1.webp | 2160x2700 | 4,242,991 | 2,262,662 |
| projects/web.png -> web.webp | 6000x3375 | 5,655,542 | 4,309,308 |
| projects/ticket.png -> ticket.webp | 6000x3375 | 3,079,904 | 2,355,744 |
| backgrounds/background.png -> background.webp | 6000x3375 | 5,659,827 | 4,758,126 |

Total: 20,062,577 -> 14,489,268 bytes (-27.8%). Originals are not deleted, so
repository disk usage grows by the new variants' size. Decoded dimensions and
image memory requirements do not fall merely because transfer size decreases.

Existing optimizers were inspected but Sharp/Pillow are not installed in this
checkout. No dependencies were installed. A temporary, isolated Chrome canvas
encoder outside the repository used quality=1, original dimensions and no resize.
Decoded alpha values match exactly. Alpha-weighted RGB PSNR was at least 58 dB
(or exact visible pixels) for these outputs; it discounts RGB error by alpha,
not hidden RGB values in transparent pixels. This is a quality check, not a
blanket bit-for-bit lossless claim. All five before/after contact sheets were
visually inspected; no clear visual difference was observed at the reviewed
scale. Full-resolution owner/device review remains useful. Reproduction code,
quality JSON and previews remain outside the repository with the session evidence.

Baseline particles ran approximately 60 callbacks/s even offscreen, settled and
under reduced motion. They now animate only for pointer-driven spring work,
stop below a 0.05px settling threshold, and honor IntersectionObserver visibility,
responsive media, reduced motion and document visibility. Pointer events are
coalesced; geometry reads precede transform writes once per frame. Original
particle positions, icons, radius, force and spring factor are retained.
Pagehide removes active listeners/disconnects the observer and cancels RAF;
pageshow rebinds once for BFCache recovery. No continuous LLM/library/polling or
new animation dependency is introduced. Other carousel/scroll architecture is
unchanged because the baseline did not justify a broad rewrite.

## Comparable performance results

| Metric (median, 12 s window) | Desktop before | Desktop after | Mobile before | Mobile after |
| --- | ---: | ---: | ---: | ---: |
| FCP, ms | 300 | 288 | 1,372 | 1,220 |
| LCP, ms | 3,432 | 1,788 | 1,452 | 1,272 |
| Loader release, ms | 8,358.5 | 1,731.3 | 4,407.9 | 1,919.8 |
| CLS | 0.01108 | 0.01236 | 0.01084 | 0.01084 |
| Subresource transfer, bytes | 21,366,352 | 15,790,893 | 636,753 | 634,603 |
| CDP TaskDuration, ms | 1,617.0 | 1,883.9 | 4,116.7 | 3,942.4 |
| CDP ScriptDuration, ms | 75.8 | 17.9 | 62.7 | 53.8 |
| Long-task count | 0 | 0 | 1 | 0 |
| Long-task duration, ms | 0 | 0 | 81 | 0 |
| Blocking above 50 ms, ms | 0 | 0 | 31 | 0 |
| Offscreen particle callbacks | 706 | 0 | 0 | 0 |
| JS heap sample, bytes | 1,422,788 | 1,100,572 | 1,938,776 | 1,615,208 |

Desktop LCP -47.9%, loader access delay -79.3%, subresource transfer -26.1%.
Mobile LCP -12.4%, loader access delay -56.4%; mobile transfer is almost unchanged
(-0.34%), consistent with preserving the existing mobile image variants.
FCP still includes the loader and must not be mistaken for content access time.
Subresource transfer excludes the main document and resources blocked externally.
Blocking-above-50 is the observed fixed-window sum, NOT Lighthouse TBT.

Not every metric improves. Desktop median TaskDuration rises 267 ms (+16.5%):
raw before 1883/1608/1617 ms, after 2458/1763/1884 ms. Desktop CLS rises by
0.00128; the largest after sample is 0.02334. These remain visible review limits,
not hidden by aggregate scores. Early reveal can expose asynchronous CMS/layout
changes; their exact share of the small CLS difference is NOT VERIFIED.

A focused paired trace was therefore collected from the saved baseline source
and current source with matching desktop conditions. Instrumented main-thread
TaskDuration was 2429.5 -> 1835.2 ms, and renderer RunTask event duration
2872.9 -> 2109.0 ms. Worker ImageDecodeTask totals were 321.4 -> 219.0 ms;
Decode Image totals were 99.5 -> 111.6 ms. Nested events overlap and must not be
summed together or confused with main-thread work. This pair does not reproduce
a persistent total CPU increase, and also does not prove a general CPU reduction.
Trace overhead and run variability prevent attributing the original median change
conclusively. Keep total CPU and CLS as follow-up measurements on representative
content/devices before release; no additional speculative runtime rewrite was made.
Image decode was inspected only in this focused desktop trace, not across all
mobile samples. A heap sample is not evidence of absence of memory leaks.

## Integrated verification

| Check | Actual result |
| --- | --- |
| M07 browser lifecycle/fallback assertions | 11 PASS, 0 FAIL |
| Visible pointer repulsion | PASS (additional asserted lifecycle observation) |
| M01 automated / isolated browser | 126/126 and 3/3 PASS |
| M02 module / browser | 45/45 and 47/47 PASS |
| M03 browser | 1811 PASS, 0 FAIL |
| M04 metadata / browser | 34/34 and 94/94 PASS |
| M05 browser | 97 PASS, 0 FAIL |
| M06 module / browser | 72/72 and 42/42 PASS |

M07 assertions cover offscreen/settled/reduced-motion RAF stop, BFCache particle
count and resumed pointer animation, active visibility cancellation, mobile hiding,
delayed/failed noncritical CMS and a delayed defer script, failed loader
script and disabled JavaScript. Hidden-document and BFCache events are synthetic
browser fixtures, not a claim of testing every OS/browser suspension behavior.
M03-M06 regressions cover keyboard/focus, responsive image selection, carousel
states, reduced motion, admin guards and CV flow with synthetic backend data.
Images are real local assets in the performance runs; most regression media are
synthetic. No production network/data was accessed. No repeated full regression
suite was run after each subtask; the suites ran in this final phase.

Native 200% zoom, other browsers, physical devices, screen readers, real CDN
fonts/icons, warm-cache/deployment behavior and production metrics: NOT VERIFIED.
Real PostgreSQL/Storage/RLS/Auth/AAL2/concurrency: NOT RUN.
No installed generic lint/build/typecheck suite is claimed. Node syntax checks
and source/diff checks apply only as reported in the final scope evidence.

Measurement references: [LCP resource priority](https://web.dev/articles/optimize-lcp)
and [Chrome network inspection](https://developer.chrome.com/docs/devtools/network).
They guide interpretation; they do not substitute for production measurements.

## Commands, evidence and release checkpoint

```text
node scripts/test-m07-performance.js <external-output> baseline 3
node scripts/test-m07-performance.js <external-output> optimized 3
node scripts/test-m07-performance.js <external-output> baseline 1 --desktop-only --trace
node scripts/test-m07-performance.js <external-output> optimized 1 --desktop-only --trace
```

For baseline after editing, set M07_SOURCE_ROOT to the saved pre-M07 source tree;
for the optimized phase leave it unset. The phase argument labels results; it
never rolls back source files. Keep comparisons on the same harness/profiles.
Existing M01-M06 commands/scripts are retained; M01 browser uses its existing
external fixture. See verification summary JSON for the exact results.

Evidence root: `C:/Users/USEPRE~1/AppData/Local/Temp/portfolio-m07-7jm372up`.
Contains saved baseline source/hashes, valid before/after JSON, comparison,
paired traces, encoding code/quality/previews, regression JSON/screenshots,
Git status and M07-only review diff. Temporary evidence is session-local and
should be archived by the owner if required for long-term release records.

All existing M02/M04/M06 release blockers remain: unapplied migrations and
undeployed Edge Functions, real owner/AAL2 and Storage/RLS, direct metadata-write
guards, concurrency/CAS/limiter, trusted proxy and event retention, shared bucket
consumers/recovery, historical public/signed URLs and CDN/browser caches,
CV static URL transition, coordinated schema/function/frontend rollout and
reference audit before any orphan cleanup. No automatic orphan deletion.
Favicon remains DEFER; expanded hero fan remains OPEN for owner review;
original E-Commerce detail material is still required. No production protection
is asserted active by this performance work.

The new WebP paths require static asset rollout alongside the referencing HTML/
CSS. Original assets remain available. Follow-up CPU/CLS, real CDN rendering,
cache versioning and full-resolution visual checks remain part of release review.
Final scope verification: four existing application files changed, five new
WebP variants, one benchmark script and this report; zero deletions. The other
167 baseline files, including M06 closure, remain byte-for-byte unchanged.
Node syntax, 650px source preservation, CV link preservation, static image target
existence and CRLF-aware Git diff checks PASS. Git status contains five tracked
modified entries (including the pre-existing M06 document) and seven untracked
files. `m07-scope-check.json` separates M07 from that existing work.

No commit, push, merge, deployment, migration, credentials/policy change or
production access was performed. This initial record stopped at M07 REVIEW;
the approved closure below supersedes that historical checkpoint.

## Approved milestone closure (2026-10-21)

Status: DONE — LOCAL VERIFIED. The Project Owner confirms approval of the M07
visual result and isolated preview launcher. All M01-M07 implementation,
fixtures, regression scripts, measurements and evidence references are retained.
Recorded results are historical completed runs, not tests rerun for closure:
the final preview reports 44 PASS, 0 FAIL, with separate visible Chrome and
DevTools smoke checks PASS. Initial performance/regression results and the
follow-up corrections remain documented in their original sections/reports.

All release blockers M02/M04/M06 and unverified browser/device/backend/cache/
deployment conditions remain active. Favicon DEFER, the separately scoped M05
hero fan geometry OPEN item, and missing original E-Commerce material remain.
Closure does not authorize additional geometry changes or claim production readiness.

Closure work changes documentation only; no application changes, retesting,
dependency changes, production access, migrations, deployment or Git mutations.
M08 is closed with Option A approved; M09 implementation has not started.
