/* =========================================================
   HERO INTERACTIVE PHOTO STACK
   Isolated feature — does not touch script.js/guestbook.js.
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const stage = document.getElementById("heroPhotoStage");
    const stack = document.getElementById("heroPhotoStack");

    if (!stage || !stack) {
        return;
    }

    const cards = Array.from(stack.querySelectorAll(".hero-photo-card"));

    if (cards.length === 0) {
        return;
    }

    const SELECT_DURATION = 620;

    let order = cards.map((_, i) => i);
    let isSpread = false;
    let isAnimating = false;

    function applyPositions() {
        order.forEach((cardIndex, position) => {
            cards[cardIndex].setAttribute("data-position", String(position));
        });
    }

    function spread() {
        if (isAnimating || isSpread) {
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
        if (isAnimating) {
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

        window.setTimeout(() => {
            card.classList.remove("is-selecting");
            isAnimating = false;
        }, SELECT_DURATION);
    }

    cards.forEach((card) => {
        const cardIndex = Number(card.dataset.photoIndex);

        card.addEventListener("click", (event) => {
            event.preventDefault();

            if (isAnimating) {
                return;
            }

            if (!isSpread) {
                spread();
                return;
            }

            selectCard(cardIndex);
        });
    });

    stage.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "touch") {
            return;
        }
        spread();
    });

    stage.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "touch") {
            return;
        }
        collapse();
    });

    stage.addEventListener("focusin", () => {
        spread();
    });

    stage.addEventListener("focusout", (event) => {
        if (stage.contains(event.relatedTarget)) {
            return;
        }
        collapse();
    });

    document.addEventListener("click", (event) => {
        if (!isSpread || stage.contains(event.target)) {
            return;
        }
        collapse();
    });

    applyPositions();

});
