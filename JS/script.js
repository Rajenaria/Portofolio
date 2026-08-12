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
========================================= */

const experienceCards =
    document.querySelectorAll(
        ".experience-card"
    );


experienceCards.forEach((card) => {

    card.addEventListener(
        "click",
        () => {

            experienceCards.forEach(
                (item) => {

                    item.classList.remove(
                        "is-selected"
                    );

                }
            );


            card.classList.add(
                "is-selected"
            );

        }
    );

});



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


    aboutTrack.style.transition =
        "transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)";


    aboutTrack.style.transform =
        `translate3d(-${aboutIndex * 100}%, 0, 0)`;


    aboutDots.forEach(
        (dot, index) => {

            dot.classList.toggle(
                "active",
                index === aboutIndex
            );

        }
    );

}



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

    const orgPhotos =
        orgTrack.querySelectorAll(
            ".about-org-photo"
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


        orgPhotos.forEach(
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

        orgTrack.style.transition =
            "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)";


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

}



/* =========================================
   9. INITIAL ABOUT STATE
========================================= */

updateAboutSlider();

/* =========================================
   PROJECT HORIZONTAL DRAG
   SAFE FOR LINKS / BUTTONS
========================================= */

(function () {

    const projectGrid =
        document.querySelector(
            "#projectGrid"
        );


    if (!projectGrid) {
        return;
    }


    let isDragging = false;

    let startX = 0;

    let startScrollLeft = 0;

    let dragDistance = 0;

    let hasDragged = false;

    let activePointerId = null;


    /*
        Waktu singkat setelah drag selesai.

        Ini dipakai supaya browser tidak
        membuka link secara tidak sengaja
        setelah user benar-benar melakukan drag.
    */

    let suppressClickUntil = 0;



    /* =====================================
       POINTER DOWN
    ===================================== */

    projectGrid.addEventListener(
        "pointerdown",
        (event) => {


            /*
                PENTING:

                Kalau user klik:

                - link
                - button
                - input
                - textarea
                - select
                - label

                jangan mulai drag carousel.

                Jadi tombol "Lihat Project"
                tetap bisa diklik normal.
            */

            if (
                event.target.closest(
                    "a, button, input, textarea, select, label"
                )
            ) {

                return;

            }



            /*
                Kalau menggunakan mouse,
                hanya tombol kiri yang
                boleh memulai drag.

                Touch dan pen tetap boleh.
            */

            if (
                event.pointerType === "mouse" &&
                event.button !== 0
            ) {

                return;

            }



            /*
                Mulai drag.
            */

            isDragging = true;

            hasDragged = false;


            activePointerId =
                event.pointerId;


            startX =
                event.clientX;


            startScrollLeft =
                projectGrid.scrollLeft;


            dragDistance = 0;



            /*
                Tambahkan class visual
                grabbing.
            */

            projectGrid.classList.add(
                "is-dragging"
            );



            /*
                Pointer capture membuat drag
                tetap bekerja meskipun cursor
                sedikit keluar dari area card.
            */

            try {

                projectGrid.setPointerCapture(
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
       POINTER MOVE
    ===================================== */

    projectGrid.addEventListener(
        "pointermove",
        (event) => {


            /*
                Abaikan kalau tidak sedang drag.
            */

            if (
                !isDragging ||
                event.pointerId !== activePointerId
            ) {

                return;

            }



            /*
                Hitung seberapa jauh
                mouse / jari bergerak.
            */

            dragDistance =
                event.clientX -
                startX;



            /*
                Kita baru menganggap user
                benar-benar drag kalau bergerak
                lebih dari 6px.

                Jadi klik kecil tidak dianggap drag.
            */

            if (
                Math.abs(
                    dragDistance
                ) > 6
            ) {

                hasDragged = true;

            }



            /*
                Mouse ke kiri
                → carousel ke kanan.

                Mouse ke kanan
                → carousel ke kiri.
            */

            projectGrid.scrollLeft =
                startScrollLeft -
                dragDistance;

        }
    );



    /* =====================================
       END DRAG
    ===================================== */

    function stopDragging(event) {


        if (!isDragging) {
            return;
        }



        /*
            Pastikan event berasal dari
            pointer yang sama.
        */

        if (
            event &&
            activePointerId !== null &&
            event.pointerId !== activePointerId
        ) {

            return;

        }



        /*
            Simpan status sebelum reset.
        */

        const draggedThisGesture =
            hasDragged;



        /*
            Reset drag.
        */

        isDragging = false;

        activePointerId = null;



        projectGrid.classList.remove(
            "is-dragging"
        );



        /*
            Lepaskan pointer capture.
        */

        try {

            if (
                event &&
                projectGrid.hasPointerCapture(
                    event.pointerId
                )
            ) {

                projectGrid.releasePointerCapture(
                    event.pointerId
                );

            }

        }

        catch (error) {

            /*
                Browser fallback.
            */

        }



        /*
            Kalau tadi benar-benar melakukan drag,
            blok click palsu / ghost click
            selama 180ms.

            Ini mencegah card membuka link
            secara tidak sengaja setelah drag.
        */

        if (draggedThisGesture) {

            suppressClickUntil =
                performance.now() + 180;

        }



        dragDistance = 0;

        hasDragged = false;

    }



    /* =====================================
       POINTER UP
    ===================================== */

    projectGrid.addEventListener(
        "pointerup",
        stopDragging
    );



    /* =====================================
       POINTER CANCEL
    ===================================== */

    projectGrid.addEventListener(
        "pointercancel",
        stopDragging
    );



    /* =====================================
       POINTER LEAVE
    ===================================== */

    projectGrid.addEventListener(
        "pointerleave",
        (event) => {


            /*
                Fallback tambahan kalau cursor
                keluar area setelah mouse dilepas.
            */

            if (
                isDragging &&
                event.buttons === 0
            ) {

                stopDragging(
                    event
                );

            }

        }
    );



    /* =====================================
       PREVENT ACCIDENTAL CLICK
       SETELAH DRAG
    ===================================== */

    projectGrid.addEventListener(
        "click",
        (event) => {


            /*
                Klik normal SELALU boleh.

                Kita hanya memblokir click
                yang muncul sesaat setelah
                user benar-benar melakukan drag.
            */

            if (
                performance.now() <
                suppressClickUntil
            ) {

                event.preventDefault();

                event.stopPropagation();

            }

        },
        true
    );



    /* =====================================
       SHIFT + MOUSE WHEEL
       HORIZONTAL SCROLL
    ===================================== */

    projectGrid.addEventListener(
        "wheel",
        (event) => {


            /*
                Kalau trackpad memang menghasilkan
                horizontal scroll,
                gunakan deltaX secara langsung.
            */

            if (
                Math.abs(
                    event.deltaX
                )
                >
                Math.abs(
                    event.deltaY
                )
            ) {

                projectGrid.scrollLeft +=
                    event.deltaX;


                return;

            }



            /*
                SHIFT + scroll wheel
                juga bisa digunakan untuk
                horizontal scrolling.
            */

            if (event.shiftKey) {

                event.preventDefault();


                projectGrid.scrollLeft +=
                    event.deltaY;

            }

        },
        {
            passive: false
        }
    );

})();
/* =========================================
   PROJECT INFINITE RUNNING CAROUSEL
========================================= */

(function () {

    const projectGrid =
        document.querySelector(
            "#projectGrid"
        );


    if (!projectGrid) {
        return;
    }


    /* =====================================
       DUPLICATE PROJECTS
    ===================================== */

    const originalCards =
        Array.from(
            projectGrid.querySelectorAll(
                ".project-card"
            )
        );


    if (
        originalCards.length === 0
    ) {
        return;
    }


    /*
        Clone semua card.

        Contoh:

        01 02 03 04 05 06
        menjadi
        01 02 03 04 05 06
        01 02 03 04 05 06
    */

    originalCards.forEach(
        (card) => {

            const clone =
                card.cloneNode(true);


            clone.classList.add(
                "project-card-clone"
            );


            clone.setAttribute(
                "aria-hidden",
                "true"
            );


            /*
                Link clone tidak perlu
                bisa difokuskan keyboard.
            */

            clone
                .querySelectorAll("a")
                .forEach((link) => {

                    link.setAttribute(
                        "tabindex",
                        "-1"
                    );

                });


            projectGrid.appendChild(
                clone
            );

        }
    );



    /* =====================================
       SETTINGS
    ===================================== */

    const speed = 30;

    let paused = false;

    let previousTime = null;


    /*
        Cache lebar total set asli
        supaya tidak perlu memanggil
        getBoundingClientRect() /
        getComputedStyle() di setiap
        animation frame.

        Di-refresh ulang hanya saat
        resize (di-debounce).
    */

    let cachedOriginalWidth = 0;



    /* =====================================
       MEASURE ORIGINAL WIDTH
    ===================================== */

    function measureOriginalWidth() {

        if (
            originalCards.length === 0
        ) {

            cachedOriginalWidth = 0;

            return;

        }


        let totalWidth = 0;


        const style =
            window.getComputedStyle(
                projectGrid
            );


        const gap =
            parseFloat(
                style.columnGap ||
                style.gap ||
                "0"
            );


        originalCards.forEach(
            (card) => {

                totalWidth +=
                    card.getBoundingClientRect()
                        .width;

            }
        );


        totalWidth +=
            gap *
            originalCards.length;


        cachedOriginalWidth =
            totalWidth;

    }


    measureOriginalWidth();


    /*
        Refresh ukuran saat resize,
        di-debounce supaya resize
        tidak menyebabkan lag.
    */

    let resizeTimeout = null;

    window.addEventListener(
        "resize",
        () => {

            clearTimeout(
                resizeTimeout
            );

            resizeTimeout =
                setTimeout(
                    measureOriginalWidth,
                    150
                );

        },
        {
            passive: true
        }
    );


    window.addEventListener(
        "load",
        measureOriginalWidth
    );



    /* =====================================
       PAUSE WHEN SECTION NOT VISIBLE
       (hemat CPU/GPU saat carousel
       tidak terlihat di viewport)
    ===================================== */

    let isSectionVisible = true;

    const portfolioSection =
        document.querySelector(
            "#portfolio"
        );


    if (
        portfolioSection &&
        "IntersectionObserver" in window
    ) {

        const carouselVisibilityObserver =
            new IntersectionObserver(
                (entries) => {

                    entries.forEach(
                        (entry) => {

                            isSectionVisible =
                                entry.isIntersecting;


                            if (
                                isSectionVisible
                            ) {

                                previousTime = null;

                                startLoop();

                            }

                        }
                    );

                },
                {
                    threshold: 0
                }
            );


        carouselVisibilityObserver.observe(
            portfolioSection
        );

    }



    /* =====================================
       REDUCED MOTION
    ===================================== */

    const prefersReducedMotion =
        window.matchMedia &&
        window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;



    /* =====================================
       ANIMATION
    ===================================== */

    let isLoopRunning = false;


    function run(time) {

        if (!isSectionVisible) {

            isLoopRunning = false;

            return;

        }


        if (
            previousTime === null
        ) {

            previousTime = time;

        }


        const delta =
            (
                time -
                previousTime
            ) / 1000;


        previousTime = time;


        if (!paused) {

            projectGrid.scrollLeft +=
                speed * delta;


            /*
                Ketika sudah melewati
                seluruh set pertama,
                geser kembali ke posisi sama
                di set pertama.

                Secara visual tidak terlihat.
            */

            if (
                cachedOriginalWidth > 0 &&
                projectGrid.scrollLeft >=
                    cachedOriginalWidth
            ) {

                projectGrid.scrollLeft -=
                    cachedOriginalWidth;

            }

        }


        requestAnimationFrame(run);

    }


    function startLoop() {

        if (
            isLoopRunning ||
            prefersReducedMotion
        ) {

            return;

        }


        isLoopRunning = true;

        requestAnimationFrame(run);

    }



    /* =====================================
       PAUSE ON USER INTERACTION
    ===================================== */

    function pause() {

        paused = true;

    }


    function resume() {

        paused = false;

        previousTime = null;

    }


    projectGrid.addEventListener(
        "mouseenter",
        pause
    );


    projectGrid.addEventListener(
        "mouseleave",
        resume
    );


    projectGrid.addEventListener(
        "pointerdown",
        pause
    );


    projectGrid.addEventListener(
        "pointerup",
        resume
    );


    projectGrid.addEventListener(
        "pointercancel",
        resume
    );



    /* =====================================
       START

       Auto-scroll tidak dijalankan
       jika user mengaktifkan
       prefers-reduced-motion.

       Drag / swipe / klik manual
       tetap berfungsi normal
       (ditangani IIFE terpisah
       di atas).
    ===================================== */

    startLoop();

})();
