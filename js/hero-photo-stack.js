/* =========================================================
   HERO INTERACTIVE PHOTO STACK
   Isolated feature — does not touch script.js/guestbook.js.

   REBUILDABLE
   -----------
   The stack no longer assumes three cards exist for the life of
   the page. js/cms/profile-about.js removes the cards belonging
   to hidden or unconfigured Hero slots and then calls
   window.refreshHeroPhotoStack(), so this controller has to be
   able to re-read the DOM and start again from whatever is left.

   Everything that survives a rebuild lives in module scope and is
   reset by build(); everything bound to a card is registered in
   cardCleanups and released before the next build. The stage
   listeners are attached once PER STAGE ELEMENT, not once per
   build — rebinding them on every build is exactly how
   duplicate-handler bugs start, and a plain boolean guard would
   fail the opposite way if the stage element itself were ever
   swapped out.

   Calling build() repeatedly is safe and idempotent.

   CARD COUNT
   ----------
   data-count on the stack is written from the DOM, not from the
   CMS, so the CSS geometry can never disagree with the number of
   cards actually present. One card is not a stack: it gets no
   spread, no promote, no pointer affordance and no tab stop.
========================================================= */

(function () {

    "use strict";

    const SELECT_DURATION = 620;

    let stage = null;
    let stack = null;

    /* `cards` is the live card list. A card's identity is its
       POSITION IN THIS ARRAY, never its data-photo-index: once
       optional slots can be removed those attributes are sparse
       (a two-card stack can be slots 1 and 3), and indexing by
       them would read the wrong card or undefined. */
    let cards = [];

    /* Stack order, front first. Values are indices into `cards`. */
    let order = [];

    let isSpread = false;
    let isAnimating = false;
    let interactive = false;

    let selectTimer = 0;
    let cardCleanups = [];

    /* The stage element these handlers are currently attached to, not a
       boolean. A flag would silently skip rebinding if the stage element
       itself were ever replaced, leaving hover/focus dead on the new one. */
    let boundStage = null;
    let documentBound = false;


    function applyPositions() {

        order.forEach((cardIndex, position) => {
            cards[cardIndex].setAttribute("data-position", String(position));
        });

    }


    function spread() {

        if (!interactive || isAnimating || isSpread) {
            return;
        }

        isSpread = true;
        stack.classList.add("is-spread");

    }


    function collapse() {

        if (isAnimating || !isSpread) {
            return;
        }

        isSpread = false;
        stack.classList.remove("is-spread");

    }


    function selectCard(cardIndex) {

        if (!interactive || isAnimating) {
            return;
        }

        if (order[0] === cardIndex) {
            collapse();
            return;
        }

        isAnimating = true;
        isSpread = false;

        const card = cards[cardIndex];
        card.classList.add("is-selecting");

        order = [cardIndex, ...order.filter((i) => i !== cardIndex)];
        applyPositions();
        stack.classList.remove("is-spread");

        window.clearTimeout(selectTimer);

        selectTimer = window.setTimeout(() => {
            card.classList.remove("is-selecting");
            isAnimating = false;
        }, SELECT_DURATION);

    }


    /* ---------------------------------------------------------
       STAGE + DOCUMENT LISTENERS

       Attached once per element, NOT once per build. They read
       module-scope state rather than closing over a particular
       card list, so a rebuild cannot leave them pointing at cards
       that no longer exist.
    --------------------------------------------------------- */

    function handleStagePointerEnter(event) {

        if (event.pointerType === "touch") {
            return;
        }

        spread();
    }

    function handleStagePointerLeave(event) {

        if (event.pointerType === "touch") {
            return;
        }

        collapse();
    }

    function handleStageFocusIn() {
        spread();
    }

    function handleStageFocusOut(event) {

        if (stage.contains(event.relatedTarget)) {
            return;
        }

        collapse();
    }

    function handleDocumentClick(event) {

        if (!isSpread || !stage || stage.contains(event.target)) {
            return;
        }

        collapse();
    }


    function bindStage() {

        /* Already attached to this exact element — nothing to do.
           This is what keeps repeated refreshes from stacking up
           handlers. */
        if (boundStage === stage) {
            return;
        }

        if (boundStage) {
            boundStage.removeEventListener("pointerenter", handleStagePointerEnter);
            boundStage.removeEventListener("pointerleave", handleStagePointerLeave);
            boundStage.removeEventListener("focusin", handleStageFocusIn);
            boundStage.removeEventListener("focusout", handleStageFocusOut);
        }

        stage.addEventListener("pointerenter", handleStagePointerEnter);
        stage.addEventListener("pointerleave", handleStagePointerLeave);
        stage.addEventListener("focusin", handleStageFocusIn);
        stage.addEventListener("focusout", handleStageFocusOut);

        boundStage = stage;

        /* document is never replaced, so this one really is a
           once-per-page binding. */
        if (!documentBound) {
            documentBound = true;
            document.addEventListener("click", handleDocumentClick);
        }

    }


    /* ---------------------------------------------------------
       BUILD / REBUILD
    --------------------------------------------------------- */

    function build() {

        stage = document.getElementById("heroPhotoStage");
        stack = document.getElementById("heroPhotoStack");

        if (!stage || !stack) {
            return;
        }

        /* Release the previous generation before reading the new
           one, so a card that is about to be dropped cannot leave
           a live click handler behind. */

        cardCleanups.forEach((release) => release());
        cardCleanups = [];

        window.clearTimeout(selectTimer);

        isAnimating = false;
        isSpread = false;
        stack.classList.remove("is-spread");

        cards = Array.from(stack.querySelectorAll(".hero-photo-card"));

        if (cards.length === 0) {
            stack.setAttribute("data-count", "0");
            return;
        }

        order = cards.map((_, i) => i);
        interactive = cards.length > 1;

        stack.setAttribute("data-count", String(cards.length));

        cards.forEach((card, cardIndex) => {

            /* A card promoted just before a rebuild could still be
               carrying the flourish class. */
            card.classList.remove("is-selecting");

            /*
                A lone photo has nothing to activate. Disabling the
                button is the least invasive way to say so with the
                markup as it stands: it drops out of the tab order
                and stops responding, while the <picture> inside is
                untouched and still reachable by assistive tech
                through its alt text. CSS drops the pointer cursor
                to match.
            */
            card.disabled = !interactive;

            if (!interactive) {
                return;
            }

            const onClick = (event) => {

                event.preventDefault();

                if (isAnimating) {
                    return;
                }

                if (!isSpread) {
                    spread();
                    return;
                }

                selectCard(cardIndex);
            };

            card.addEventListener("click", onClick);

            cardCleanups.push(() => {
                card.removeEventListener("click", onClick);
            });

        });

        applyPositions();
        bindStage();

    }


    /*
        Narrow refresh hook, matching the convention already used by
        window.refreshProjectCarousel and
        window.refreshOrganizationGallery.
    */

    window.refreshHeroPhotoStack = build;

    document.addEventListener("DOMContentLoaded", build);

})();
