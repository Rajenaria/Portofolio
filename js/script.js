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
        Watchdog: pada sebagian browser mobile,
        pointerup/pointercancel tidak selalu
        terpicu di elemen ini kalau sentuhan
        dialihkan browser jadi native scroll
        halaman (misalnya scroll vertikal yang
        jarinya sempat menyentuh area carousel).

        Tanpa ini, carousel bisa "macet" pause
        selamanya karena resume() tidak pernah
        dipanggil. Watchdog memaksa resume
        setelah jeda singkat kalau tidak ada
        sinyal release yang masuk.
    */

    let pauseWatchdog = null;


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


        clearTimeout(
            pauseWatchdog
        );

        pauseWatchdog =
            setTimeout(
                resume,
                2500
            );

    }


    function resume() {

        paused = false;

        previousTime = null;


        clearTimeout(
            pauseWatchdog
        );

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


    projectGrid.addEventListener(
        "pointerleave",
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

    /* =====================================
       SCROLL BAR INDICATOR

       Markup indikatornya sudah lama ada di
       index.html (#projectScrollIndicator
       dengan data-scroll-index), tapi belum
       pernah ada JS yang menyambungkannya —
       jadi bar-nya tidak bisa diklik dan bar
       pertama tersangkut "is-active" terus.
       Ini bagian yang menyambungkannya.

       Carousel ini loop tak terbatas: set asli
       diklon satu kali, dan scrollLeft dibalikkan
       ke awal setiap kali melewati
       cachedOriginalWidth. Jadi posisi yang
       berarti adalah sisa bagi terhadap lebar
       set asli — bukan scrollLeft mentah.
    ===================================== */

    const scrollIndicator =
        document.querySelector(
            "#projectScrollIndicator"
        );


    if (scrollIndicator) {

        const bars =
            Array.from(
                scrollIndicator.querySelectorAll(
                    ".project-scroll-bar"
                )
            );


        if (bars.length > 0) {

            /*
                Tiap bar mewakili satu segmen
                dari set asli. Dengan 6 card dan
                3 bar: card ke-0, ke-2, dan ke-4.
                Dihitung dari jumlah bar yang
                benar-benar ada, jadi menambah
                atau mengurangi bar di HTML tidak
                membuatnya rusak.
            */

            function cardIndexForBar(barIndex) {

                return Math.min(
                    originalCards.length - 1,
                    Math.round(
                        barIndex *
                        originalCards.length /
                        bars.length
                    )
                );

            }


            /* ---- SOROT BAR YANG SEDANG AKTIF ---- */

            let indicatorFrame = 0;


            function updateIndicator() {

                indicatorFrame = 0;


                if (cachedOriginalWidth <= 0) {
                    return;
                }


                /*
                    Sisa bagi supaya posisi di set
                    klon dipetakan balik ke set asli.
                    Ditambah cachedOriginalWidth dulu
                    supaya scrollLeft negatif (efek
                    overscroll di iOS) tidak
                    menghasilkan indeks negatif.
                */

                const progress =
                    (
                        (
                            projectGrid.scrollLeft %
                            cachedOriginalWidth
                        ) +
                        cachedOriginalWidth
                    ) %
                    cachedOriginalWidth /
                    cachedOriginalWidth;


                const activeIndex =
                    Math.min(
                        bars.length - 1,
                        Math.floor(
                            progress * bars.length
                        )
                    );


                bars.forEach((bar, index) => {

                    const isActive =
                        index === activeIndex;


                    bar.classList.toggle(
                        "is-active",
                        isActive
                    );


                    if (isActive) {

                        bar.setAttribute(
                            "aria-current",
                            "true"
                        );

                    } else {

                        bar.removeAttribute(
                            "aria-current"
                        );

                    }

                });

            }


            function scheduleIndicatorUpdate() {

                if (indicatorFrame) {
                    return;
                }


                indicatorFrame =
                    requestAnimationFrame(
                        updateIndicator
                    );

            }


            projectGrid.addEventListener(
                "scroll",
                scheduleIndicatorUpdate,
                {
                    passive: true
                }
            );


            window.addEventListener(
                "resize",
                scheduleIndicatorUpdate,
                {
                    passive: true
                }
            );


            /* ---- KLIK BAR = LOMPAT KE SEGMEN ---- */

            bars.forEach((bar, index) => {

                bar.addEventListener(
                    "click",
                    () => {

                        const card =
                            originalCards[
                                cardIndexForBar(index)
                            ];


                        if (!card) {
                            return;
                        }


                        /*
                            WAJIB: tanpa pause, loop
                            rAF terus menambah
                            scrollLeft tiap frame dan
                            "melawan" smooth scroll ini
                            sampai lompatannya tidak
                            pernah sampai. pause() punya
                            watchdog yang melanjutkan
                            auto-scroll lagi setelah
                            2,5 detik.
                        */

                        pause();


                        const target =
                            projectGrid.scrollLeft +
                            (
                                card.getBoundingClientRect().left -
                                projectGrid.getBoundingClientRect().left
                            );


                        projectGrid.scrollTo({
                            left: target,
                            behavior:
                                prefersReducedMotion
                                    ? "auto"
                                    : "smooth"
                        });

                    }
                );

            });


            updateIndicator();

        }

    }


    startLoop();

})();
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


    /* hanya tablet / desktop */

    const fullLayout =
        window.matchMedia("(min-width: 768px)");

    if (!fullLayout.matches) {
        return;
    }


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


    /* =====================================
       POINTER INTERACTION
    ===================================== */

    guestbook.addEventListener(
        "pointermove",
        (event) => {

            const rect =
                guestbook.getBoundingClientRect();


            particles.forEach((particle) => {

                const particleRect =
                    particle.element.getBoundingClientRect();


                const particleX =
                    particleRect.left +
                    particleRect.width / 2;


                const particleY =
                    particleRect.top +
                    particleRect.height / 2;


                const dx =
                    particleX -
                    event.clientX;


                const dy =
                    particleY -
                    event.clientY;


                const distance =
                    Math.sqrt(
                        dx * dx +
                        dy * dy
                    );


                const radius = 150;


                if (distance < radius) {

                    const force =
                        (radius - distance) /
                        radius;


                    const angle =
                        Math.atan2(dy, dx);


                    const strength =
                        force * 55;


                    particle.targetX =
                        Math.cos(angle) *
                        strength;


                    particle.targetY =
                        Math.sin(angle) *
                        strength;

                } else {

                    particle.targetX = 0;
                    particle.targetY = 0;

                }

            });

        }
    );


    /* ketika cursor keluar */

    guestbook.addEventListener(
        "pointerleave",
        () => {

            particles.forEach(
                (particle) => {

                    particle.targetX = 0;
                    particle.targetY = 0;

                }
            );

        }
    );


    /* =====================================
       SMOOTH SPRING ANIMATION
    ===================================== */

    function animateParticles() {

        particles.forEach(
            (particle) => {

                particle.x +=
                    (particle.targetX -
                        particle.x) *
                    0.09;


                particle.y +=
                    (particle.targetY -
                        particle.y) *
                    0.09;


                particle.element.style.transform =
                    `translate3d(
                        ${particle.x}px,
                        ${particle.y}px,
                        0
                    )`;

            }
        );


        requestAnimationFrame(
            animateParticles
        );

    }


    animateParticles();

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