/* The normal intro completes both designed three-second CSS animations and
   the overlay exit. CMS readiness remains bounded and never extends the intro. */
(function () {
    "use strict";
    const root = document.documentElement;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pending = new Set(["hero", "about", "experience", "technologies", "certificates", "projects"]);
    const completed = new Set();
    const exitPending = new Set();
    let finished = false, exiting = false, started = false;
    let failureTimer, criticalTimer, resolveCritical;
    const criticalReady = new Promise(resolve => { resolveCritical = resolve; });
    criticalTimer = setTimeout(resolveCritical, 1500);

    function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(failureTimer);
        clearTimeout(criticalTimer);
        resolveCritical();
        root.classList.remove("is-loading");
        root.classList.add("is-loaded");
        document.getElementById("initial-loader")?.remove();
        document.removeEventListener("animationstart", onStart, true);
        document.removeEventListener("animationend", onEnd, true);
        document.removeEventListener("animationcancel", onCancel, true);
        document.removeEventListener("transitionend", onExit, true);
        document.removeEventListener("visibilitychange", onVisibility);
        motion.removeEventListener("change", onMotion);
        window.removeEventListener("pagehide", finish);
    }
    function fallbackAfter(ms) {
        clearTimeout(failureTimer);
        failureTimer = setTimeout(finish, ms);
    }
    function animationKey(event) {
        if (!event.target.matches?.("#initial-loader .loader")) return null;
        if (event.animationName === "l8-0" && !event.pseudoElement) return "bars";
        if (event.animationName === "l8-1" && event.pseudoElement === "::after") return "marker";
        return null;
    }
    function onStart(event) {
        if (!animationKey(event) || started || exiting || finished) return;
        started = true;
        // Failure recovery is relative to actual CSS startup, never a normal cutoff.
        const duration = getComputedStyle(event.target, event.pseudoElement || null).animationDuration;
        const ms = parseFloat(duration) * (duration.trim().endsWith("ms") ? 1 : 1000);
        fallbackAfter((Number.isFinite(ms) ? ms : 3000) + 1200);
    }
    async function exit() {
        if (finished || exiting) return;
        exiting = true;
        await criticalReady;
        if (finished) return;
        const overlay = document.getElementById("initial-loader");
        if (!overlay || motion.matches) { finish(); return; }
        exitPending.add("opacity");
        exitPending.add("transform");
        overlay.style.pointerEvents = "none";
        overlay.setAttribute("aria-hidden", "true");
        overlay.classList.add("is-leaving");
        // Covers missing/disabled transitions; normal completion uses transitionend.
        fallbackAfter(900);
    }
    function onEnd(event) {
        const key = animationKey(event);
        if (!key || finished || exiting) return;
        completed.add(key);
        if (completed.size === 2) exit();
    }
    function onExit(event) {
        if (!exiting || event.target.id !== "initial-loader") return;
        exitPending.delete(event.propertyName);
        if (exitPending.size === 0) finish();
    }
    function onCancel(event) {
        if (!animationKey(event) || exiting) return;
        if (motion.matches) exit();
        else finish();
    }
    function onMotion() { if (motion.matches) exit(); }
    function onVisibility() { if (document.hidden) finish(); }
    function heroSettled() {
        const image = document.querySelector(".hero-photo-card img");
        Promise.resolve(image?.decode?.()).catch(() => {}).then(resolveCritical);
    }
    window.portfolioReady = {
        mark(section) { pending.delete(section); if (section === "hero") heroSettled(); },
        release() { pending.clear(); resolveCritical(); },
        pending() { return Array.from(pending); }
    };
    // Register before parsing the overlay: a delayed defer script must not lose events.
    document.addEventListener("animationstart", onStart, true);
    document.addEventListener("animationend", onEnd, true);
    document.addEventListener("animationcancel", onCancel, true);
    document.addEventListener("transitionend", onExit, true);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    window.addEventListener("pagehide", finish, { once: true });
    fallbackAfter(4000); // CSS/animation never initialized.
    root.classList.add("is-loading");
    if (motion.matches) criticalReady.then(exit);
})();
