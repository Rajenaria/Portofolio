/* =========================================
   PORTFOLIO RAJENDRA
   MAIN JAVASCRIPT
========================================= */
/* =========================================
   FLOATING NAVBAR
   EXPAND ON SCROLL
========================================= */

const mainNav =
    document.querySelector(
        "#mainNav"
    );


function updateMainNavbar() {

    if (!mainNav) {
        return;
    }


    /*
        Saat masih dekat bagian atas:
        navbar kecil / floating.

        Setelah scroll 80px:
        navbar melebar.
    */

    if (
        window.scrollY > 80
    ) {

        mainNav.classList.add(
            "is-expanded"
        );

    }

    else {

        mainNav.classList.remove(
            "is-expanded"
        );

    }

}


/* SCROLL */

window.addEventListener(
    "scroll",
    updateMainNavbar,
    {
        passive: true
    }
);


/* INITIAL */

updateMainNavbar();
/* =========================================
   MOBILE NAVIGATION
========================================= */

(function () {

    const nav =
        document.querySelector(
            "#mainNav"
        );


    const toggle =
        document.querySelector(
            "#mobileNavToggle"
        );


    const menu =
        document.querySelector(
            "#mobileNavMenu"
        );


    if (
        !nav ||
        !toggle ||
        !menu
    ) {
        return;
    }



    /* =====================================
       OPEN
    ===================================== */

    function openMobileMenu() {
        menu.inert = false;
        menu.setAttribute("aria-hidden", "false");

        nav.classList.add(
            "is-mobile-open"
        );


        toggle.setAttribute(
            "aria-expanded",
            "true"
        );


        toggle.setAttribute(
            "aria-label",
            "Tutup menu navigasi"
        );

    }



    /* =====================================
       CLOSE
    ===================================== */

    function closeMobileMenu() {
        if (menu.contains(document.activeElement)) toggle.focus({preventScroll: true});
        menu.inert = true;
        menu.setAttribute("aria-hidden", "true");

        nav.classList.remove(
            "is-mobile-open"
        );


        toggle.setAttribute(
            "aria-expanded",
            "false"
        );


        toggle.setAttribute(
            "aria-label",
            "Buka menu navigasi"
        );

    }



    menu.inert = true;
    menu.setAttribute("aria-hidden", "true");

    /* =====================================
       TOGGLE
    ===================================== */

    toggle.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


            const isOpen =
                nav.classList.contains(
                    "is-mobile-open"
                );


            if (isOpen) {

                closeMobileMenu();

            }

            else {

                openMobileMenu();

            }

        }
    );



    /* =====================================
       CLOSE SETELAH PILIH MENU
    ===================================== */

    const menuLinks =
        menu.querySelectorAll(
            "a"
        );


    menuLinks.forEach(
        (link) => {

            link.addEventListener(
                "click",
                () => {

                    closeMobileMenu();

                }
            );

        }
    );



    /* =====================================
       ESC KEY
    ===================================== */

    document.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key ===
                "Escape"
            ) {

                closeMobileMenu();

            }

        }
    );



    /* =====================================
       KLIK DI LUAR NAVBAR
    ===================================== */

    document.addEventListener(
        "click",
        (event) => {

            if (
                nav.classList.contains(
                    "is-mobile-open"
                )
                &&
                !nav.contains(
                    event.target
                )
            ) {

                closeMobileMenu();

            }

        }
    );



    /* =====================================
       KEMBALI KE DESKTOP
    ===================================== */

    window.addEventListener(
        "resize",
        () => {

            if (
                window.innerWidth >
                650
            ) {

                closeMobileMenu();

            }

        }
    );

})();
/* =========================================
   1. NAVBAR SCROLL EFFECT
========================================= */

const navbar =
    document.querySelector("nav");


function updateNavbarScroll() {

    if (!navbar) {
        return;
    }


    navbar.classList.toggle(
        "nav-scrolled",
        window.scrollY > 40
    );

}



/* =========================================
   2. SCROLL REVEAL
========================================= */

const revealElements =
    document.querySelectorAll(".reveal");

revealElements.forEach(element => {
    element.addEventListener("focusin", () => element.classList.add("reveal-active"));
});


if (
    "IntersectionObserver" in window
) {

    const revealObserver =
        new IntersectionObserver(

            (entries, observer) => {

                entries.forEach((entry) => {

                    if (
                        entry.isIntersecting
                    ) {

                        entry.target.classList.add(
                            "reveal-active"
                        );


                        observer.unobserve(
                            entry.target
                        );

                    }

                });

            },

            {
                threshold: 0.15,

                rootMargin:
                    "0px 0px -50px 0px"
            }

        );


    revealElements.forEach(
        (element) => {

            revealObserver.observe(
                element
            );

        }
    );

}


/*
    Fallback browser lama.
*/

else {

    revealElements.forEach(
        (element) => {

            element.classList.add(
                "reveal-active"
            );

        }
    );

}



/* =========================================
   3. OPTIMIZED SCROLL
========================================= */

let scrollTicking = false;


function handlePageScroll() {

    if (scrollTicking) {
        return;
    }


    scrollTicking = true;


    window.requestAnimationFrame(
        () => {

            updateNavbarScroll();


            scrollTicking = false;

        }
    );

}


window.addEventListener(
    "scroll",
    handlePageScroll,
    {
        passive: true
    }
);


updateNavbarScroll();



/* =========================================
   4. CONTACT SOCIAL INTERACTION
========================================= */

const contactSocialPanel =
    document.querySelector(
        "#contactSocialPanel"
    );


if (contactSocialPanel) {

    const contactItems =
        contactSocialPanel.querySelectorAll(
            ".contact-social-item"
        );


    /* =====================================
       ACTIVATE SOCIAL ITEM
    ===================================== */

    function activateSocialItem(item) {

        contactItems.forEach(
            (socialItem) => {

                socialItem.classList.remove(
                    "is-active"
                );

            }
        );


        item.classList.add(
            "is-active"
        );


        /*
            Icon image.
        */

        const icon =
            item.querySelector(
                ".contact-icon-circle img"
            );


        if (!icon) {
            return;
        }


        /*
            Restart bell animation.
        */

        icon.classList.remove(
            "icon-shake"
        );


        /*
            Force browser reflow
            agar animasi dapat dimainkan ulang.
        */

        void icon.offsetWidth;


        icon.classList.add(
            "icon-shake"
        );

    }



    /* =====================================
       REMOVE SHAKE AFTER FINISH
    ===================================== */

    contactItems.forEach((item) => {

        const icon =
            item.querySelector(
                ".contact-icon-circle img"
            );


        if (!icon) {
            return;
        }


        icon.addEventListener(
            "animationend",
            () => {

                icon.classList.remove(
                    "icon-shake"
                );

            }
        );

    });



    /* =====================================
       DESKTOP HOVER
    ===================================== */

    contactItems.forEach((item) => {

        item.addEventListener(
            "mouseenter",
            () => {

                activateSocialItem(
                    item
                );

            }
        );

    });



    /* =====================================
       KEYBOARD
    ===================================== */

    contactItems.forEach((item) => {

        item.addEventListener(
            "focus",
            () => {

                activateSocialItem(
                    item
                );

            }
        );

    });



    /* =====================================
       MOBILE / TOUCH
    ===================================== */

    contactItems.forEach((item) => {

        item.addEventListener(
            "pointerdown",
            () => {

                activateSocialItem(
                    item
                );

            }
        );

    });



    /* =====================================
       RESET CONTACT
    ===================================== */

    contactSocialPanel.addEventListener(
        "mouseleave",
        () => {

            contactItems.forEach(
                (item) => {

                    item.classList.remove(
                        "is-active"
                    );

                }
            );

        }
    );

}



/* =========================================
   5. EXPERIENCE CARD SELECTION
   Moved to js/experience-stack.js (stacked-deck
   controller supersedes this simple click-select).
========================================= */



/* =========================================
   6. ABOUT SECTION
   MAIN SLIDER
========================================= */

const aboutSlider =
    document.querySelector(
        "#aboutFullSlider"
    );


const aboutTrack =
    document.querySelector(
        "#aboutFullTrack"
    );


/*
    Ambil hanya slide yang berada
    di dalam About Track.
*/

const aboutSlides =
    aboutTrack
        ? aboutTrack.querySelectorAll(
            ".about-full-slide"
        )
        : [];


const aboutPrev =
    document.querySelector(
        "#aboutFullPrev"
    );


const aboutNext =
    document.querySelector(
        "#aboutFullNext"
    );


const aboutDots =
    document.querySelectorAll(
        ".about-navigation-dot"
    );


let aboutIndex = 0;



/* =========================================
   UPDATE MAIN ABOUT
========================================= */

function updateAboutSlider() {

    if (!aboutTrack) {
        return;
    }


    aboutSlides.forEach((slide, index) => {
        const active = index === aboutIndex;
        if (!active && slide.contains(document.activeElement)) {
            aboutNext?.focus({preventScroll: true});
        }
        slide.inert = !active;
        slide.setAttribute("aria-hidden", String(!active));
        slide.setAttribute("role", "group");
        slide.setAttribute("aria-label", `Slide ${index + 1} dari ${aboutSlides.length}`);
    });
    aboutTrack.style.transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "none" : "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)";


    aboutTrack.style.transform =
        `translate3d(-${aboutIndex * 100}%, 0, 0)`;


    aboutDots.forEach(
        (dot, index) => {

            dot.classList.toggle(
                "active",
                index === aboutIndex
            );
            dot.setAttribute("aria-current", String(index === aboutIndex));

        }
    );

}



aboutSlider?.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest("input,textarea,select,.about-org-gallery")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    aboutIndex = (aboutIndex + (event.key === "ArrowRight" ? 1 : -1) + aboutSlides.length) % aboutSlides.length;
    updateAboutSlider();
});

/* =========================================
   ABOUT NEXT
========================================= */

if (
    aboutNext &&
    aboutSlides.length > 0
) {

    aboutNext.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


            aboutIndex =
                (
                    aboutIndex + 1
                )
                %
                aboutSlides.length;


            updateAboutSlider();

        }
    );

}



/* =========================================
   ABOUT PREVIOUS
========================================= */

if (
    aboutPrev &&
    aboutSlides.length > 0
) {

    aboutPrev.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


            aboutIndex =
                (
                    aboutIndex
                    - 1
                    + aboutSlides.length
                )
                %
                aboutSlides.length;


            updateAboutSlider();

        }
    );

}



/* =========================================
   ABOUT DOTS
========================================= */

aboutDots.forEach((dot) => {

    dot.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


            const targetIndex =
                Number(
                    dot.dataset.aboutIndex
                );


            if (
                Number.isInteger(
                    targetIndex
                )
                &&
                targetIndex >= 0
                &&
                targetIndex <
                    aboutSlides.length
            ) {

                aboutIndex =
                    targetIndex;


                updateAboutSlider();

            }

        }
    );

});



/* =========================================
   7. ABOUT MAIN DRAG / SWIPE
========================================= */

if (
    aboutSlider &&
    aboutTrack &&
    aboutSlides.length > 0
) {

    let isAboutDragging =
        false;


    let aboutStartX =
        0;


    let aboutDistance =
        0;


    const aboutThreshold =
        70;



    /* =====================================
       START DRAG
    ===================================== */

    aboutSlider.addEventListener(
        "pointerdown",
        (event) => {

            /*
                Jangan jalankan slider utama
                jika cursor berada pada:

                - button
                - link
                - organization gallery
                - organization controls
            */

            if (
                event.target.closest(
                    `
                    button,
                    a,
                    .about-org-visual,
                    .about-org-gallery,
                    .about-org-controls
                    `
                )
            ) {

                return;

            }


            isAboutDragging =
                true;


            aboutStartX =
                event.clientX;


            aboutDistance =
                0;


            aboutSlider.classList.add(
                "is-dragging"
            );


            /*
                Saat drag,
                transition dimatikan.
            */

            aboutTrack.style.transition =
                "none";


            try {

                aboutSlider.setPointerCapture(
                    event.pointerId
                );

            }

            catch (error) {

                /*
                    Fallback jika browser
                    tidak mendukung pointer capture.
                */

            }

        }
    );



    /* =====================================
       DRAG MOVE
    ===================================== */

    aboutSlider.addEventListener(
        "pointermove",
        (event) => {

            if (!isAboutDragging) {
                return;
            }


            aboutDistance =
                event.clientX -
                aboutStartX;


            const sliderWidth =
                aboutSlider.clientWidth;


            const basePosition =
                -(
                    aboutIndex *
                    sliderWidth
                );


            let dragPosition =
                basePosition +
                aboutDistance;



            /*
                Resistance saat berada
                pada slide pertama.
            */

            if (
                aboutIndex === 0
                &&
                aboutDistance > 0
            ) {

                dragPosition =
                    basePosition +
                    aboutDistance * 0.25;

            }



            /*
                Resistance saat berada
                pada slide terakhir.
            */

            if (
                aboutIndex ===
                    aboutSlides.length - 1
                &&
                aboutDistance < 0
            ) {

                dragPosition =
                    basePosition +
                    aboutDistance * 0.25;

            }



            aboutTrack.style.transform =
                `translate3d(${dragPosition}px, 0, 0)`;

        }
    );



    /* =====================================
       FINISH MAIN DRAG
    ===================================== */

    function finishAboutDrag() {

        if (!isAboutDragging) {
            return;
        }


        isAboutDragging =
            false;


        aboutSlider.classList.remove(
            "is-dragging"
        );



        /*
            Swipe ke kiri.
            NEXT.
        */

        if (
            aboutDistance <
                -aboutThreshold
            &&
            aboutIndex <
                aboutSlides.length - 1
        ) {

            aboutIndex++;

        }



        /*
            Swipe ke kanan.
            PREVIOUS.
        */

        else if (
            aboutDistance >
                aboutThreshold
            &&
            aboutIndex > 0
        ) {

            aboutIndex--;

        }



        aboutDistance =
            0;


        updateAboutSlider();

    }



    aboutSlider.addEventListener(
        "pointerup",
        finishAboutDrag
    );


    aboutSlider.addEventListener(
        "pointercancel",
        finishAboutDrag
    );

}



/* =========================================
   8. ORGANIZATION DOCUMENTATION SLIDER
========================================= */

const orgGallery =
    document.querySelector(
        ".about-org-gallery"
    );


const orgTrack =
    document.querySelector(
        "#aboutOrgTrack"
    );


const orgPrev =
    document.querySelector(
        "#aboutOrgPrev"
    );


const orgNext =
    document.querySelector(
        "#aboutOrgNext"
    );


/*
    HTML kamu saat ini memakai:

    <div class="about-org-dots">

    Jadi JavaScript ini mendukung:

    #aboutOrgDots

    ATAU

    .about-org-dots

    supaya tidak error.
*/

const orgDotsContainer =
    document.querySelector(
        "#aboutOrgDots"
    )
    ||
    document.querySelector(
        ".about-org-dots"
    );



if (
    orgGallery &&
    orgTrack &&
    orgDotsContainer
) {

    /*
        Live HTMLCollection, bukan NodeList statis.

        Foto dokumentasi bisa diisi ulang oleh CMS setelah blok ini
        berjalan, jadi jumlahnya harus ikut berubah sendiri supaya
        dots, wrap next/prev, dan drag tetap sinkron.
    */

    const orgPhotos =
        orgTrack.getElementsByClassName(
            "about-org-photo"
        );


    let orgIndex =
        0;


    const orgThreshold =
        55;



    /* =====================================
       CREATE DOTS AUTOMATICALLY
    ===================================== */

    function createOrganizationDots() {

        /*
            Hapus dots manual lama.
        */

        orgDotsContainer.innerHTML =
            "";


        Array.from(orgPhotos).forEach(
            (_, index) => {

                const dot =
                    document.createElement(
                        "button"
                    );


                dot.type =
                    "button";


                dot.className =
                    "about-org-dot";


                dot.setAttribute(
                    "aria-label",
                    `Dokumentasi ${index + 1} dari ${orgPhotos.length}`
                );


                dot.addEventListener(
                    "click",
                    (event) => {

                        /*
                            Jangan sampai event
                            diterima slider utama.
                        */

                        event.stopPropagation();


                        orgIndex =
                            index;


                        updateOrganizationSlider();

                    }
                );


                orgDotsContainer.appendChild(
                    dot
                );

            }
        );

    }



    /* =====================================
       UPDATE ORGANIZATION SLIDER
    ===================================== */

    function updateOrganizationSlider() {

        Array.from(orgPhotos).forEach((photo, index) => {
            photo.inert = index !== orgIndex;
            photo.setAttribute("aria-hidden", String(index !== orgIndex));
        });
        orgTrack.style.transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "none" : "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)";


        orgTrack.style.transform =
            `translate3d(-${orgIndex * 100}%, 0, 0)`;


        const dots =
            orgDotsContainer.querySelectorAll(
                ".about-org-dot"
            );


        dots.forEach(
            (dot, index) => {

                dot.classList.toggle(
                    "active",
                    index === orgIndex
                );
                dot.setAttribute("aria-current", String(index === orgIndex));

            }
        );

    }



    /* =====================================
       ORGANIZATION NEXT
    ===================================== */

    if (orgNext) {

        orgNext.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();


                if (
                    orgPhotos.length === 0
                ) {
                    return;
                }


                orgIndex =
                    (
                        orgIndex + 1
                    )
                    %
                    orgPhotos.length;


                updateOrganizationSlider();

            }
        );

    }



    /* =====================================
       ORGANIZATION PREVIOUS
    ===================================== */

    if (orgPrev) {

        orgPrev.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();


                if (
                    orgPhotos.length === 0
                ) {
                    return;
                }


                orgIndex =
                    (
                        orgIndex
                        - 1
                        + orgPhotos.length
                    )
                    %
                    orgPhotos.length;


                updateOrganizationSlider();

            }
        );

    }



    /* =====================================
       ORGANIZATION DRAG / SWIPE
    ===================================== */

    let isOrgDragging =
        false;


    let orgStartX =
        0;


    let orgDistance =
        0;



    /* =====================================
       START ORGANIZATION DRAG
    ===================================== */

    orgGallery.addEventListener(
        "pointerdown",
        (event) => {

            /*
                Stop event agar slider utama
                About tidak ikut bergerak.
            */

            event.stopPropagation();


            isOrgDragging =
                true;


            orgStartX =
                event.clientX;


            orgDistance =
                0;


            orgGallery.classList.add(
                "is-dragging"
            );


            orgTrack.style.transition =
                "none";


            try {

                orgGallery.setPointerCapture(
                    event.pointerId
                );

            }

            catch (error) {

                /*
                    Browser fallback.
                */

            }

        }
    );



    /* =====================================
       ORGANIZATION DRAG MOVE
    ===================================== */

    orgGallery.addEventListener(
        "pointermove",
        (event) => {

            if (!isOrgDragging) {
                return;
            }


            event.stopPropagation();


            orgDistance =
                event.clientX -
                orgStartX;


            const galleryWidth =
                orgGallery.clientWidth;


            const basePosition =
                -(
                    orgIndex *
                    galleryWidth
                );


            let dragPosition =
                basePosition +
                orgDistance;



            /*
                Resistance foto pertama.
            */

            if (
                orgIndex === 0
                &&
                orgDistance > 0
            ) {

                dragPosition =
                    basePosition +
                    orgDistance * 0.25;

            }



            /*
                Resistance foto terakhir.
            */

            if (
                orgIndex ===
                    orgPhotos.length - 1
                &&
                orgDistance < 0
            ) {

                dragPosition =
                    basePosition +
                    orgDistance * 0.25;

            }



            orgTrack.style.transform =
                `translate3d(${dragPosition}px, 0, 0)`;

        }
    );



    /* =====================================
       FINISH ORGANIZATION DRAG
    ===================================== */

    function finishOrganizationDrag(
        event
    ) {

        if (!isOrgDragging) {
            return;
        }


        isOrgDragging =
            false;


        orgGallery.classList.remove(
            "is-dragging"
        );


        if (event) {

            event.stopPropagation();

        }



        /*
            Swipe kiri = foto berikutnya.
        */

        if (
            orgDistance <
                -orgThreshold
            &&
            orgIndex <
                orgPhotos.length - 1
        ) {

            orgIndex++;

        }



        /*
            Swipe kanan = foto sebelumnya.
        */

        else if (
            orgDistance >
                orgThreshold
            &&
            orgIndex > 0
        ) {

            orgIndex--;

        }



        orgDistance =
            0;


        updateOrganizationSlider();

    }



    orgGallery.addEventListener(
        "pointerup",
        finishOrganizationDrag
    );


    orgGallery.addEventListener(
        "pointercancel",
        finishOrganizationDrag
    );



    /* =====================================
       INITIALIZE ORGANIZATION
    ===================================== */

    createOrganizationDots();

    updateOrganizationSlider();


    /* =====================================
       REFRESH HOOK

       Dipakai integrasi CMS publik setelah isi
       #aboutOrgTrack diganti. Hanya menjalankan
       ulang dua fungsi di atas: tidak ada listener,
       timer, atau tombol baru yang dibuat.
    ===================================== */

    window.refreshOrganizationGallery =
        function () {

            orgIndex =
                0;


            createOrganizationDots();

            updateOrganizationSlider();

        };

}



/* =========================================
   9. INITIAL ABOUT STATE
========================================= */

updateAboutSlider();

/* =========================================
   GUESTBOOK REVEAL ANIMATION
========================================= */

const guestbookSection =
    document.querySelector(".guestbook-v2");

if (guestbookSection) {

    const guestbookObserver =
        new IntersectionObserver(
            (entries, observer) => {

                entries.forEach((entry) => {

                    if (!entry.isIntersecting) return;

                    entry.target.classList.add(
                        "is-visible"
                    );

                    observer.unobserve(
                        entry.target
                    );

                });

            },
            {
                threshold: 0.18
            }
        );

    guestbookObserver.observe(
        guestbookSection
    );

}
/* =========================================
   GUESTBOOK MAGNETIC PARTICLES
========================================= */

(() => {

    const guestbook =
        document.querySelector(".guestbook-v2");

    const particleContainer =
        document.getElementById("guestbookParticles");


    if (!guestbook || !particleContainer) {
        return;
    }


    const fullLayout = window.matchMedia("(min-width: 768px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");


    /* =====================================
       PARTICLE CONFIG
    ===================================== */

const particleData = [

    {
        x: 7,
        y: 18,
        size: 22,
        opacity: 0.22,
        icon: "✦"
    },

    {
        x: 15,
        y: 68,
        size: 18,
        opacity: 0.16,
        icon: "✧"
    },

    {
        x: 25,
        y: 35,
        size: 14,
        opacity: 0.16,
        icon: "⋆"
    },

    {
        x: 36,
        y: 82,
        size: 18,
        opacity: 0.13,
        icon: "★"
    },

    {
        x: 48,
        y: 13,
        size: 16,
        opacity: 0.17,
        icon: "✧"
    },

    {
        x: 61,
        y: 76,
        size: 20,
        opacity: 0.15,
        icon: "✦"
    },

    {
        x: 71,
        y: 27,
        size: 15,
        opacity: 0.14,
        icon: "⋆"
    },

    {
        x: 82,
        y: 69,
        size: 18,
        opacity: 0.17,
        icon: "✧"
    },

    {
        x: 91,
        y: 18,
        size: 21,
        opacity: 0.19,
        icon: "✦"
    },

    {
        x: 94,
        y: 52,
        size: 17,
        opacity: 0.14,
        icon: "✉"
    }

];


    const particles = [];


    /* =====================================
       CREATE PARTICLES
    ===================================== */

    particleData.forEach((data) => {

        const element =
            document.createElement("span");

        element.className =
            "guestbook-v2-particle";

        element.textContent = data.icon;
        
        element.style.setProperty(
            "--particle-x",
            `${data.x}%`
        );

        element.style.setProperty(
            "--particle-y",
            `${data.y}%`
        );

        element.style.setProperty(
            "--particle-size",
            `${data.size}px`
        );

        element.style.setProperty(
            "--particle-opacity",
            data.opacity
        );


        particleContainer.appendChild(
            element
        );


        particles.push({

            element,

            x: 0,
            y: 0,

            targetX: 0,
            targetY: 0

        });

    });


    let frame = 0, visible = false, suspended = false, bound = false;
    let pointer = null, pointerChanged = false;
    const enabled = () => visible && fullLayout.matches && !reducedMotion.matches &&
        !document.hidden && !suspended;

    function stop() {
        cancelAnimationFrame(frame);
        frame = 0;
        pointer = null;
        pointerChanged = false;
        particles.forEach(particle => {
            particle.x = particle.y = particle.targetX = particle.targetY = 0;
            particle.element.style.transform = "translate3d(0px, 0px, 0)";
        });
    }
    function schedule() {
        if (!frame && enabled()) frame = requestAnimationFrame(animateParticles);
    }
    function move(event) {
        if (!enabled()) return;
        pointer = { x: event.clientX, y: event.clientY };
        pointerChanged = true;
        schedule();
    }
    function leave() {
        pointer = null;
        pointerChanged = false;
        particles.forEach(particle => { particle.targetX = particle.targetY = 0; });
        schedule();
    }
    function animateParticles() {
        frame = 0;
        if (!enabled()) return;
        if (pointerChanged && pointer) {
            // Read geometry together, once per frame, before writing transforms.
            particles.forEach(particle => {
                const rect = particle.element.getBoundingClientRect();
                const dx = rect.left + rect.width / 2 - pointer.x;
                const dy = rect.top + rect.height / 2 - pointer.y;
                const distance = Math.hypot(dx, dy);
                const force = Math.max(0, (150 - distance) / 150) * 55;
                const angle = Math.atan2(dy, dx);
                particle.targetX = Math.cos(angle) * force;
                particle.targetY = Math.sin(angle) * force;
            });
            pointerChanged = false;
        }
        let moving = false;
        particles.forEach(particle => {
            const dx = particle.targetX - particle.x, dy = particle.targetY - particle.y;
            const settled = Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05;
            particle.x = settled ? particle.targetX : particle.x + dx * 0.09;
            particle.y = settled ? particle.targetY : particle.y + dy * 0.09;
            moving ||= !settled;
            particle.element.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0)`;
        });
        if (moving) schedule();
    }
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (!enabled()) stop();
    }) : null;
    function activityChanged() { if (!enabled()) stop(); }
    function bind() {
        if (bound) return;
        bound = true;
        guestbook.addEventListener("pointermove", move, { passive: true });
        guestbook.addEventListener("pointerleave", leave);
        fullLayout.addEventListener("change", activityChanged);
        reducedMotion.addEventListener("change", activityChanged);
        document.addEventListener("visibilitychange", activityChanged);
        if (observer) observer.observe(guestbook);
        else visible = true;
    }
    function suspend() {
        suspended = true;
        stop();
        observer?.disconnect();
        guestbook.removeEventListener("pointermove", move);
        guestbook.removeEventListener("pointerleave", leave);
        fullLayout.removeEventListener("change", activityChanged);
        reducedMotion.removeEventListener("change", activityChanged);
        document.removeEventListener("visibilitychange", activityChanged);
        bound = false;
    }
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", () => { suspended = false; bind(); });
    bind();

})();
/* =========================================
   GUESTBOOK PLANE CURSOR
========================================= */

(() => {

    const button =
        document.getElementById(
            "guestbookSubmit"
        );

    const plane =
        document.getElementById(
            "guestbookPlaneCursor"
        );


    if (!button || !plane) {
        return;
    }


    /* hanya perangkat mouse / trackpad */

    const canHover =
        window.matchMedia(
            "(hover: hover) and (pointer: fine)"
        );

    if (!canHover.matches) {
        return;
    }


    let mouseX = 0;
    let mouseY = 0;

    let flying = false;


    /* =====================================
       TRACK CURSOR
    ===================================== */

    button.addEventListener(
        "pointermove",
        (event) => {

            if (flying) return;

            mouseX = event.clientX;
            mouseY = event.clientY;


            plane.style.left =
                `${mouseX}px`;

            plane.style.top =
                `${mouseY}px`;

        }
    );


    /* =====================================
       ENTER BUTTON
    ===================================== */

    button.addEventListener(
        "pointerenter",
        (event) => {

            if (flying) return;


            mouseX = event.clientX;
            mouseY = event.clientY;


            plane.style.left =
                `${mouseX}px`;

            plane.style.top =
                `${mouseY}px`;


            button.classList.add(
                "plane-hover"
            );


            plane.classList.add(
                "is-active"
            );

        }
    );


    /* =====================================
       LEAVE BUTTON
    ===================================== */

    button.addEventListener(
        "pointerleave",
        () => {

            if (flying) return;


            button.classList.remove(
                "plane-hover"
            );


            plane.classList.remove(
                "is-active"
            );

        }
    );


    /* =====================================
       FLY ANIMATION
    ===================================== */

    function flyGuestbookPlane() {

        if (flying) return;


        flying = true;


        button.classList.remove(
            "plane-hover"
        );


        plane.classList.add(
            "is-active"
        );


        /*
            sedikit angkat dulu
        */

        plane.style.transform =
            `
            translate(-50%, -50%)
            translateY(-8px)
            rotate(-12deg)
            scale(1.08)
            `;


        requestAnimationFrame(() => {

            requestAnimationFrame(() => {

                plane.classList.add(
                    "is-flying"
                );


                /*
                    terbang ke kanan atas
                    sampai keluar viewport
                */

                plane.style.left =
                    `${window.innerWidth + 130}px`;

                plane.style.top =
                    `${Math.max(
                        -100,
                        mouseY - 180
                    )}px`;

                plane.style.transform =
                    `
                    translate(-50%, -50%)
                    rotate(-18deg)
                    scale(0.92)
                    `;

            });

        });


        /* reset setelah keluar */

        window.setTimeout(
            () => {

                plane.classList.remove(
                    "is-active",
                    "is-flying"
                );


                plane.style.transition =
                    "none";


                flying = false;


                requestAnimationFrame(() => {

                    plane.style.transform = "";

                    plane.style.transition = "";

                });

            },
            1250
        );

    }


    // /* =====================================
    //    PREVIEW SAAT KLIK

    //    NANTI kita pindahkan ke
    //    "pesan berhasil dikirim"
    // ===================================== */

    // button.addEventListener(
    //     "click",
    //     () => {

    //         flyGuestbookPlane();

    //     }
    // );


    /*
        Supaya fungsi ini nanti bisa
        dipanggil dari logic Supabase.
    */

    window.flyGuestbookPlane =
        flyGuestbookPlane;

})();