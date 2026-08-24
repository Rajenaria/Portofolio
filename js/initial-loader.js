/* =========================================================
   INITIAL LOADER

   Holds a fullscreen overlay over the public homepage until the
   first screen is genuinely ready, so a visitor never watches
   Hero photos, CMS cards, icons and fonts pop into place one by
   one.

   WHAT "READY" MEANS
   ------------------
   Not a timer. The overlay waits on real signals:

       window load        stylesheets, fonts and eager images
       document.fonts     no reflow the moment text swaps face
       six CMS sections   each SETTLED, not each successful
       Hero image decode  the one picture that is above the fold

   A CMS section counts as settled when it has either rendered
   its data or fallen back to the static markup. Every module
   marks itself from a `finally`, so a failed Supabase request
   still releases the loader — a broken network must never leave
   a visitor staring at a permanent loading screen.

   THE REVEAL GATE
   ---------------
   Two conditions, both required:

       READY            everything above has settled
       CYCLE COMPLETE   the loader animation has reached a clean
                        loop boundary

   Readiness on its own never reveals the site; it arms the exit
   and lets the animation finish the turn it is in. Cutting the
   bars off half way through reads as a stutter rather than as a
   deliberate hand-off.

   Ready at 1.2s therefore still exits at the 3s boundary; ready
   at 3.5s exits at the 6s one. FAILSAFE_MS is the hard ceiling
   over both, so a stalled resource cannot hold a visitor.

   NO FRAMEWORK, NO BUILD STEP
   ---------------------------
   Loaded as a classic script from <head> so window.portfolioReady
   exists before any deferred module runs and can never miss an
   early mark.
========================================================= */

(function () {

    "use strict";

    /* Sections that must settle before the site is revealed. Each
       one is marked by its own CMS module. */
    const SECTIONS = [
        "hero",
        "about",
        "experience",
        "technologies",
        "certificates",
        "projects"
    ];

    const MINIMUM_MS = 700;

    /* One full turn of the l8 animation, matching the 3s in style.css.
       The site is not revealed part-way through a cycle: half a "Loading"
       word dropping out of view reads as a stutter, not as an exit. */
    const CYCLE_MS = 3000;

    /* Beat between the animation completing and the sheet lifting, so the
       two motions read as separate steps rather than one. */
    const PAUSE_MS = 150;

    /* Raised because the reveal now also waits for a clean cycle boundary:
       readiness landing just after a boundary costs almost a whole extra
       cycle. Still a hard ceiling — nothing can hold the page past it. */
    const FAILSAFE_MS = 7500;

    const EXIT_MS = 550;

    /* Reduced motion switches the animation off entirely, so there are no
       cycle boundaries to wait for — and making that visitor sit through a
       decorative 3s wait would be exactly backwards. */
    const prefersReducedMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const startedAt = Date.now();

    const pending = new Set(SECTIONS);
    let overlay = null;
    let finished = false;
    let failsafeTimer = 0;


    /* ---------------------------------------------------------
       PUBLIC SIGNAL API

       Defined immediately, before the DOM exists, so a module
       that settles unusually early still has something to call.
    --------------------------------------------------------- */

    const readiness = {

        mark(section) {

            if (!pending.has(section)) {
                return;
            }

            pending.delete(section);
            maybeFinish();
        },

        /* Escape hatch for manual testing and for any future
           section that needs to give up early. */
        release() {
            pending.clear();
            maybeFinish();
        },

        pending() {
            return Array.from(pending);
        }
    };

    window.portfolioReady = readiness;


    /* ---------------------------------------------------------
       READINESS GATES
    --------------------------------------------------------- */

    function afterWindowLoad() {

        return new Promise(resolve => {

            if (document.readyState === "complete") {
                resolve();
                return;
            }

            window.addEventListener("load", resolve, { once: true });
        });

    }

    function afterFonts() {

        if (!document.fonts || !document.fonts.ready) {
            return Promise.resolve();
        }

        // A font that never resolves must not hold the page.
        return document.fonts.ready.catch(() => {});

    }

    function afterSections() {

        return new Promise(resolve => {

            if (pending.size === 0) {
                resolve();
                return;
            }

            sectionsResolved = resolve;
        });

    }

    let sectionsResolved = null;

    function maybeFinish() {

        if (pending.size === 0 && sectionsResolved) {
            const done = sectionsResolved;
            sectionsResolved = null;
            done();
        }

    }

    /*
        Decodes only what the first screen actually shows. The Hero
        photo stack is the whole point of this wait; project,
        experience and footer imagery stays lazy and is deliberately
        not awaited.

        decode() rejects for a broken or cross-origin-tainted image,
        which is not a reason to hold the page, so every failure is
        swallowed.
    */
    function afterHeroImages() {

        const images = Array.from(
            document.querySelectorAll(".hero-photo-card img")
        );

        if (images.length === 0) {
            return Promise.resolve();
        }

        return Promise.all(
            images.map(image => {

                if (typeof image.decode !== "function") {
                    return Promise.resolve();
                }

                return image.decode().catch(() => {});

            })
        );

    }


    /*
        Resolves at the next clean end of the loader animation.

        `animationiteration` fires exactly at the loop boundary, which is the
        only moment the bars are back in their starting arrangement. Readiness
        merely ARMS the exit; this decides when it is allowed to happen.

        The pseudo-element runs its own animation (l8-1), so events are
        filtered to the bar's own l8-0. The timeout is a backstop for the
        cases where no boundary can ever arrive — animation disabled by the
        OS, the element gone, a paused tab — and is one cycle plus a margin,
        since the next boundary is never further away than that.
    */

    function afterCycleBoundary() {

        if (prefersReducedMotion || !overlay) {
            return Promise.resolve();
        }

        const bar = overlay.querySelector(".loader");

        if (!bar) {
            return Promise.resolve();
        }

        return new Promise(resolve => {

            let settled = false;

            function finish() {

                if (settled) {
                    return;
                }

                settled = true;
                bar.removeEventListener("animationiteration", onIteration);
                resolve();
            }

            function onIteration(event) {

                if (event.animationName === "l8-0" && !event.pseudoElement) {
                    finish();
                }

            }

            bar.addEventListener("animationiteration", onIteration);

            window.setTimeout(finish, CYCLE_MS + 250);

        });

    }


    function pause(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }


    /* ---------------------------------------------------------
       EXIT
    --------------------------------------------------------- */

    function reveal() {

        if (finished) {
            return;
        }

        finished = true;
        window.clearTimeout(failsafeTimer);

        document.documentElement.classList.remove("is-loading");
        document.documentElement.classList.add("is-loaded");
        window.dispatchEvent(new Event("portfolio:ready"));

        if (!overlay) {
            return;
        }

        /* Stops the overlay swallowing clicks the instant the exit
           starts, rather than when it finishes. */
        overlay.style.pointerEvents = "none";
        overlay.setAttribute("aria-hidden", "true");
        overlay.classList.add("is-leaving");

        window.setTimeout(() => {

            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }

            overlay = null;

        }, EXIT_MS);

    }


    /* ---------------------------------------------------------
       START
    --------------------------------------------------------- */

    function begin() {

        overlay = document.getElementById("initial-loader");

        /* The failsafe is armed regardless of anything else, and is
           the reason a permanent loading screen cannot happen. */
        failsafeTimer = window.setTimeout(reveal, FAILSAFE_MS);

        Promise.all([
            afterWindowLoad(),
            afterFonts(),
            afterSections()
        ])
            .then(afterHeroImages)
            .catch(() => {})
            /*
                The gate is READY *and* CYCLE COMPLETE. Readiness alone never
                reveals the site; it only lets the loader finish what it is
                doing.
            */
            .then(() => pause(Math.max(0, MINIMUM_MS - (Date.now() - startedAt))))
            .then(afterCycleBoundary)
            .then(() => pause(prefersReducedMotion ? 0 : PAUSE_MS))
            .then(reveal);

    }

    document.documentElement.classList.add("is-loading");

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", begin, { once: true });
    } else {
        begin();
    }

})();
