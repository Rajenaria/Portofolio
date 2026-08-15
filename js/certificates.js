/* =========================================================
   SERTIFIKAT — 3D GLOBE CAROUSEL + FLIP CARD
   Vanilla JS, tanpa library. Fitur terisolasi: tidak
   menyentuh script.js, guestbook.js, hero-photo-stack.js,
   atau experience-stack.js.

   Alur: CERTIFICATES (data) -> renderCards() -> init()

   ---------------------------------------------------------
   GEOMETRI
   Semua kartu duduk di SATU lingkaran mengelilingi poros
   vertikal. Yang diputar adalah wadahnya (.cert-ring),
   bukan kartunya satu per satu.

       .cert-ring : translateZ(-radius) rotateY(sudut)
       .cert-slot : rotateY(i * step) translateZ(radius)

   Nilai radius TIDAK di-hardcode di sini — ia hidup di CSS
   sebagai --cert-radius supaya bisa dioverride per
   breakpoint. Transform di atas menyebut var(--cert-radius)
   langsung, dan JS hanya MEMBACA nilainya (getComputedStyle)
   untuk mengubah jarak geser jari menjadi derajat.

   ---------------------------------------------------------
   LAPISAN TRANSFORM (penting)
   Rotasi posisi globe dan rotasi flip tidak pernah berada di
   elemen yang sama — inilah yang bikin versi sebelumnya
   rusak:

       .cert-slot : HANYA rotateY(i*step) translateZ(radius)
       .cert-flip : HANYA rotateY(0deg / 180deg)
       .cert-face : backface-visibility: hidden
                    (sisi belakang di-rotateY(180deg) sejak awal)
========================================================= */

(function () {

    "use strict";


    /* =====================================================
       1. DATA

       Tambah sertifikat = tambah satu objek di array ini.
       Sudut, posisi lingkaran, titik indikator, dan tinggi
       kartu semuanya dihitung ulang otomatis dari panjang
       array — tidak ada yang perlu diubah di CSS.

       Field:
         icon        -> ICONS.award | ICONS.school | ICONS.certificate
         year        -> teks bebas ("2025", "2021 — 2025")
         title       -> judul (sisi depan + sisi belakang)
         publisher   -> penerbit, tampil kecil di sisi depan
         subtitle    -> institusi, uppercase di sisi belakang
         badge       -> pill merah di sisi belakang (opsional,
                        "" = tidak dirender)
         description -> 2–3 baris di sisi belakang
                        ("" = tidak dirender)
         link        -> URL sertifikat. Tombol "LIHAT
                        SERTIFIKAT" SELALU tampil; selama link
                        masih "" tombolnya jadi placeholder
                        putus-putus yang tidak bisa diklik.
                        Isi URL-nya = tombol langsung aktif,
                        membuka tab baru. Tidak ada yang perlu
                        diubah selain baris `link` itu.
    ===================================================== */

    const ICONS = {
        award: "tabler:award",
        school: "tabler:school",
        certificate: "tabler:certificate"
    };

    const CERTIFICATES = [

        {
            id: "udemy-ml",
            icon: ICONS.award,
            year: "2025",
            title: "Machine Learning A-Z: AI, Python",
            publisher: "Udemy",
            subtitle: "Udemy · Online",
            badge: "",
            /* TODO: isi ringkasan asli — materi/skill yang dipelajari. */
            description: "",
            /* TODO: isi URL sertifikat Udemy. */
            link: ""
        },

        {
            id: "telkom-cefr-b2",
            icon: ICONS.award,
            year: "2025",
            title: "CEFR B2",
            publisher: "LAC Telkom University",
            subtitle: "LAC Telkom University · Bandung",
            badge: "",
            /* TODO: isi ringkasan asli — cakupan tes CEFR B2. */
            description: "",
            /* TODO: isi URL sertifikat CEFR. */
            link: ""
        },

        {
            /* Sengaja di tengah array. Dengan 5 kartu, index 2
               adalah posisi tengah — dan START_INDEX di bawah
               memakainya sebagai kartu depan saat halaman dibuka. */
            id: "bachelor-degree",
            icon: ICONS.school,
            year: "2021 — 2025",
            title: "Computer Engineering",
            publisher: "Universitas Telkom",
            subtitle: "Universitas Telkom · Bandung",
            badge: "GPA 3.51/4.00",
            /* TODO: isi ringkasan asli — fokus studi / tugas akhir. */
            description: "",
            /* TODO: isi URL ijazah atau transkrip (kosongkan bila
               tidak ingin ditautkan). */
            link: ""
        },

        {
            id: "hakcipta-cuacane",
            icon: ICONS.certificate,
            year: "2025",
            title: "Hak Cipta: Cuacane Application",
            publisher: "DJKI Kemenkumham RI",
            subtitle: "DJKI Kemenkumham RI · Indonesia",
            badge: "",
            /* TODO: isi ringkasan asli — aplikasi Cuacane dan
               cakupan hak cipta yang didaftarkan. */
            description: "",
            /* TODO: isi URL sertifikat hak cipta. */
            link: ""
        },

        {
            id: "hakcipta-vaisala",
            icon: ICONS.certificate,
            year: "2025",
            title: "Hak Cipta: Vaisala Converter",
            publisher: "DJKI Kemenkumham RI",
            subtitle: "DJKI Kemenkumham RI · Indonesia",
            badge: "",
            /* TODO: isi ringkasan asli — Vaisala Converter dan
               cakupan hak cipta yang didaftarkan. */
            description: "",
            /* TODO: isi URL sertifikat hak cipta. */
            link: ""
        }

    ];


    /* =====================================================
       2. KONFIGURASI

       Kecepatan putaran & durasi flip TIDAK di sini — keduanya
       transisi CSS (--cert-spin dan --cert-flip-dur di
       style.css). Yang di bawah ini murni perilaku input.
    ===================================================== */

    /* Kartu yang menghadap depan saat pertama dibuka. */
    const START_INDEX = 2;

    /* Geser di bawah nilai ini (px) masih dihitung klik,
       bukan drag. */
    const DRAG_THRESHOLD = 6;

    /* Pengali drag. Jarak geser diubah ke derajat lewat
       radius (dx / radius = radian), lalu dikali ini. Makin
       besar = makin sedikit geseran untuk pindah satu kartu.
       Otomatis ikut menyesuaikan tiap breakpoint karena
       radius-nya juga berubah. */
    const DRAG_GAIN = 2.2;

    /* Ambang peredupan kartu, dalam derajat dari posisi depan.
       |rel| <= FADE_START  -> opacity 1 (terbaca penuh)
       |rel| >= FADE_END    -> opacity 0 (membelakangi —
       WAJIB disembunyikan, kalau tidak sisi belakang kartu
       terlihat terbalik seperti cermin). */
    const FADE_START = 45;
    const FADE_END = 110;

    /* Di bawah opacity ini kartu dianggap tidak ada:
       pointer-events none, aria-hidden, keluar dari tab order. */
    const HIDDEN_OPACITY = 0.08;

    const RESIZE_DEBOUNCE = 150;


    /* =====================================================
       3. UTILITAS
    ===================================================== */

    /* Normalisasi sudut ke rentang -180..180 supaya selisih
       sudut selalu jarak terpendek, bukan 350 derajat. */
    function normalizeAngle(deg) {

        let d = deg % 360;

        if (d > 180) {
            d -= 360;
        }

        if (d < -180) {
            d += 360;
        }

        return d;
    }


    /* Opacity kartu berdasarkan seberapa jauh ia berputar
       dari posisi depan. */
    function faceOpacity(relAngle) {

        const a = Math.abs(relAngle);

        if (a <= FADE_START) {
            return 1;
        }

        if (a >= FADE_END) {
            return 0;
        }

        return 1 - (a - FADE_START) / (FADE_END - FADE_START);
    }


    function readNumber(styles, prop, fallback) {

        const value = parseFloat(styles.getPropertyValue(prop));

        return Number.isFinite(value) ? value : fallback;
    }


    /* =====================================================
       4. RENDER

       Kartu dibangun dari data, tidak ditulis manual di HTML.
    ===================================================== */

    function buildCard(cert, index, step) {

        /* ---- SLOT: posisi di lingkaran (rotateY + translateZ).
           translateZ menyebut var(--cert-radius) supaya radius
           tetap dikendalikan CSS per breakpoint. ---- */

        const slot = document.createElement("div");

        slot.className = "cert-slot";
        slot.dataset.index = String(index);
        slot.dataset.certId = cert.id;
        slot.style.transform =
            "rotateY(" + (index * step) + "deg) " +
            "translateZ(var(--cert-radius))";

        slot.setAttribute("role", "button");
        slot.setAttribute("tabindex", "0");
        slot.setAttribute("aria-pressed", "false");
        slot.setAttribute(
            "aria-label",
            "Sertifikat: " + cert.title + " — " + cert.publisher +
            ". Buka detail."
        );

        /* ---- FLIP: hanya rotateY(0/180deg). ---- */

        const flip = document.createElement("div");
        flip.className = "cert-flip";


        /* ---------------- SISI DEPAN ---------------- */

        const front = document.createElement("div");
        front.className = "cert-face cert-face-front";

        const icon = document.createElement("iconify-icon");
        icon.className = "cert-icon";
        icon.setAttribute("icon", cert.icon);
        icon.setAttribute("aria-hidden", "true");

        const frontText = document.createElement("div");
        frontText.className = "cert-front-text";

        const year = document.createElement("p");
        year.className = "cert-year";
        year.textContent = cert.year;

        const title = document.createElement("h3");
        title.className = "cert-title";
        title.textContent = cert.title;

        const publisher = document.createElement("p");
        publisher.className = "cert-publisher";
        publisher.textContent = cert.publisher;

        frontText.append(year, title, publisher);
        front.append(icon, frontText);


        /* ---------------- SISI BELAKANG ---------------- */

        const back = document.createElement("div");
        back.className = "cert-face cert-face-back";

        const backInner = document.createElement("div");
        backInner.className = "cert-back-inner";

        const backTitle = document.createElement("h3");
        backTitle.className = "cert-back-title";
        backTitle.textContent = cert.title;

        const backSubtitle = document.createElement("p");
        backSubtitle.className = "cert-back-subtitle";
        backSubtitle.textContent = cert.subtitle;

        backInner.append(backTitle, backSubtitle);

        if (cert.badge) {
            const badge = document.createElement("span");
            badge.className = "cert-badge";
            badge.textContent = cert.badge;
            backInner.appendChild(badge);
        }

        if (cert.description) {
            const desc = document.createElement("p");
            desc.className = "cert-back-desc";
            desc.textContent = cert.description;
            backInner.appendChild(desc);
        }

        /* ---- TOMBOL "LIHAT SERTIFIKAT" ----
           Tombolnya SELALU dirender, termasuk saat `link` di
           data masih kosong. Yang kosong tampil sebagai
           placeholder bergaris putus-putus dan tidak bisa
           diklik. Begitu `link` diisi di array data, tombol
           itu langsung jadi tautan asli — tidak ada yang
           perlu diubah di file ini maupun di CSS. */

        const hasLink = Boolean(cert.link);

        const link = document.createElement("a");
        link.className = "cert-link";
        link.draggable = false;

        const linkLabel = document.createElement("span");
        linkLabel.className = "cert-link-label";
        linkLabel.textContent = "LIHAT SERTIFIKAT";

        const linkIcon = document.createElement("iconify-icon");
        linkIcon.className = "cert-link-icon";
        linkIcon.setAttribute("icon", "tabler:arrow-up-right");
        linkIcon.setAttribute("aria-hidden", "true");

        link.append(linkLabel, linkIcon);

        if (hasLink) {

            link.href = cert.link;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            /* Baru bisa di-tab saat kartunya dibalik —
               lihat toggleFlip()/resetFlips(). */
            link.tabIndex = -1;
            link.setAttribute(
                "aria-label",
                "Lihat sertifikat " + cert.title + " (tab baru)"
            );

        } else {

            /* Tanpa href, <a> otomatis tidak fokusabel dan
               tidak punya peran link — jadi pembaca layar pun
               tidak menawarkannya sebagai tautan.
               pointer-events: none di CSS membuat klik tembus
               ke kartu, sehingga kartu tetap bisa dibalik
               kembali walau tombol kosong ini yang tersentuh. */
            link.classList.add("is-empty");
            link.setAttribute("aria-hidden", "true");
            link.title = "Link sertifikat belum diisi";
        }

        backInner.appendChild(link);

        back.appendChild(backInner);

        flip.append(front, back);
        slot.appendChild(flip);

        return { slot, flip, back, backInner, link, hasLink, index };
    }


    function buildDot(index, cert) {

        const dot = document.createElement("button");

        dot.type = "button";
        dot.className = "cert-dot";
        dot.dataset.index = String(index);
        dot.setAttribute(
            "aria-label",
            "Tampilkan sertifikat: " + cert.title
        );

        return dot;
    }


    /* =====================================================
       5. CAROUSEL
    ===================================================== */

    function initCarousel(refs) {

        const {
            section, carousel, stage, ring, dotsWrap, prevBtn, nextBtn
        } = refs;

        const total = CERTIFICATES.length;
        const step = 360 / total;

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );

        /* ---- Bangun kartu + titik indikator ---- */

        const cards = CERTIFICATES.map(function (cert, index) {

            const card = buildCard(cert, index, step);
            ring.appendChild(card.slot);
            return card;
        });

        const dots = CERTIFICATES.map(function (cert, index) {

            const dot = buildDot(index, cert);
            dotsWrap.appendChild(dot);
            return dot;
        });


        /* ---- STATE ----
           `index` sengaja tidak dibatasi 0..n-1: ia boleh terus
           naik/turun supaya putaran bisa berlanjut ke arah yang
           sama tanpa "mundur" satu lingkaran penuh.
           `angle` = sudut ring saat ini (derajat). */

        let index = START_INDEX;
        let angle = -index * step;

        /* Dibaca ulang dari CSS tiap kali layout berubah —
           lihat measure(). Jangan hardcode. */
        let radius = 300;

        let frame = 0;


        function frontIndex() {
            return ((index % total) + total) % total;
        }


        /* ---- Terapkan sudut ke DOM ----
           Hanya menyentuh transform dan opacity. */

        function render() {

            ring.style.transform =
                "translateZ(calc(-1 * var(--cert-radius))) " +
                "rotateY(" + angle.toFixed(3) + "deg)";

            cards.forEach(function (card) {

                const rel = normalizeAngle(card.index * step + angle);
                const opacity = faceOpacity(rel);
                const visible = opacity > HIDDEN_OPACITY;

                card.slot.style.opacity = opacity.toFixed(3);
                card.slot.style.pointerEvents = visible ? "auto" : "none";
                card.slot.setAttribute(
                    "aria-hidden",
                    visible ? "false" : "true"
                );
                card.slot.setAttribute(
                    "tabindex",
                    visible ? "0" : "-1"
                );
            });

            const front = frontIndex();

            dots.forEach(function (dot, i) {

                const active = i === front;

                dot.classList.toggle("is-active", active);
                dot.setAttribute(
                    "aria-current",
                    active ? "true" : "false"
                );
            });
        }


        function scheduleRender() {

            if (frame) {
                return;
            }

            frame = requestAnimationFrame(function () {
                frame = 0;
                render();
            });
        }


        /* ---- FLIP ---- */

        function resetFlips() {

            cards.forEach(function (card) {

                card.slot.classList.remove("is-flipped");
                card.slot.setAttribute("aria-pressed", "false");

                /* Hanya tombol yang benar-benar punya href yang
                   ikut tab order — placeholder kosong tidak. */
                if (card.hasLink) {
                    card.link.tabIndex = -1;
                }
            });
        }


        function toggleFlip(card) {

            const flipped = card.slot.classList.toggle("is-flipped");

            card.slot.setAttribute(
                "aria-pressed",
                flipped ? "true" : "false"
            );

            if (card.hasLink) {
                card.link.tabIndex = flipped ? 0 : -1;
            }
        }


        /* ---- NAVIGASI ----
           Memutar carousel selalu mengembalikan semua kartu ke
           sisi depan. */

        function goTo(newIndex) {

            index = newIndex;
            angle = -index * step;

            resetFlips();
            render();
        }


        /* Jalur terpendek menuju kartu ke-target (0..n-1),
           dihitung dari kartu depan saat ini. */

        function goToCard(target) {

            const front = frontIndex();

            let delta = ((target - front) % total + total) % total;

            if (delta > total / 2) {
                delta -= total;
            }

            goTo(index + delta);
        }


        /* Lepas drag -> kunci ke kartu terdekat. */

        function snap() {
            goTo(Math.round(-angle / step));
        }


        /* ---- AKTIVASI KARTU ----
           Kartu depan  -> balik (flip).
           Kartu samping -> putar ke depan. */

        function activate(card) {

            if (card.index === frontIndex()) {
                toggleFlip(card);
            } else {
                goToCard(card.index);
            }
        }


        /* =================================================
           DRAG / SWIPE

           Satu handler untuk mouse, sentuh, dan pen (pointer
           events). Pointer capture baru diambil SETELAH ambang
           geser terlampaui — kalau ditangkap sejak pointerdown,
           event click akan dialihkan ke stage dan tap pada
           kartu tidak pernah sampai ke kartunya.

           touch-action: pan-y ada di CSS, jadi scroll vertikal
           halaman tetap jalan sementara geser horizontal
           memutar carousel.
        ================================================= */

        let dragging = false;
        let captured = false;
        let pointerId = null;
        let startX = 0;
        let startAngle = 0;
        let suppressClick = false;


        function endDrag() {

            if (!dragging) {
                return;
            }

            dragging = false;
            carousel.classList.remove("is-dragging");

            if (captured) {

                /* Pointer bisa saja sudah hilang duluan (tab
                   berpindah, sentuhan dibatalkan sistem) —
                   release-nya lalu melempar. Bukan masalah:
                   yang penting snap tetap jalan. */
                try {
                    if (pointerId !== null &&
                        stage.hasPointerCapture(pointerId)) {
                        stage.releasePointerCapture(pointerId);
                    }
                } catch (err) {
                    /* diabaikan */
                }

                /* Ini drag, bukan klik — jangan biarkan click
                   yang menyusul membalik kartu. */
                suppressClick = true;

                snap();
            }

            captured = false;
            pointerId = null;
        }


        stage.addEventListener("pointerdown", function (event) {

            /* Tombol tengah/kanan mouse tidak memutar apa pun. */
            if (event.button !== 0 && event.pointerType === "mouse") {
                return;
            }

            dragging = true;
            captured = false;
            pointerId = event.pointerId;
            startX = event.clientX;
            startAngle = angle;
        });


        stage.addEventListener("pointermove", function (event) {

            if (!dragging || event.pointerId !== pointerId) {
                return;
            }

            const dx = event.clientX - startX;

            if (!captured) {

                if (Math.abs(dx) <= DRAG_THRESHOLD) {
                    return;
                }

                captured = true;
                carousel.classList.add("is-dragging");

                try {
                    stage.setPointerCapture(event.pointerId);
                } catch (err) {
                    /* Diabaikan — tanpa capture, drag tetap
                       jalan selama pointer masih di atas stage. */
                }
            }

            /* px -> radian -> derajat, memakai radius yang
               dibaca dari CSS. */
            angle = startAngle +
                (dx / radius) * (180 / Math.PI) * DRAG_GAIN;

            scheduleRender();
        });


        stage.addEventListener("pointerup", endDrag);
        stage.addEventListener("pointercancel", endDrag);
        stage.addEventListener("lostpointercapture", endDrag);


        /* =================================================
           KLIK, KEYBOARD, TOMBOL, TITIK
        ================================================= */

        cards.forEach(function (card) {

            card.slot.addEventListener("click", function (event) {

                /* Tombol "LIHAT SERTIFIKAT" — biarkan link
                   bekerja seperti biasa. */
                if (event.target.closest(".cert-link")) {
                    return;
                }

                if (suppressClick) {
                    suppressClick = false;
                    return;
                }

                activate(card);
            });


            card.slot.addEventListener("keydown", function (event) {

                if (event.target !== card.slot) {
                    return;
                }

                if (event.key === "Enter" || event.key === " " ||
                    event.key === "Spacebar") {

                    event.preventDefault();
                    activate(card);
                }
            });
        });


        /* Panah keyboard bekerja di mana pun fokus berada di
           dalam carousel. */

        carousel.addEventListener("keydown", function (event) {

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                goTo(index - 1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                goTo(index + 1);
            }
        });


        prevBtn.addEventListener("click", function () {
            goTo(index - 1);
        });

        nextBtn.addEventListener("click", function () {
            goTo(index + 1);
        });


        dots.forEach(function (dot, i) {

            dot.addEventListener("click", function () {
                goToCard(i);
            });
        });


        /* =================================================
           LAYOUT RESPONSIF

           Radius dibaca dari CSS (bukan angka di JS) supaya
           tiap breakpoint bisa menentukan sendiri seberapa
           besar lingkarannya.

           Tinggi kartu: --cert-h-base adalah tinggi minimum
           per breakpoint, tapi kalau ada sisi BELAKANG yang
           isinya lebih tinggi, --cert-h dinaikkan mengikuti
           yang paling panjang — supaya teks belakang tidak
           kepotong diam-diam di layar kecil.
        ================================================= */

        function measure() {

            const styles = getComputedStyle(section);

            radius = readNumber(styles, "--cert-radius", radius);

            const baseHeight = readNumber(styles, "--cert-h-base", 262);

            /* Kembalikan ke tinggi dasar dulu, supaya pengukuran
               tidak menumpuk dari hasil pengukuran sebelumnya. */
            section.style.setProperty("--cert-h", baseHeight + "px");

            let tallest = 0;

            cards.forEach(function (card) {

                const backStyles = getComputedStyle(card.back);

                const padding =
                    parseFloat(backStyles.paddingTop) +
                    parseFloat(backStyles.paddingBottom);

                tallest = Math.max(
                    tallest,
                    card.backInner.scrollHeight + padding
                );
            });

            section.style.setProperty(
                "--cert-h",
                Math.max(baseHeight, Math.ceil(tallest)) + "px"
            );

            render();
        }


        let resizeTimer = 0;

        function scheduleMeasure() {

            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(measure, RESIZE_DEBOUNCE);
        }


        window.addEventListener("resize", scheduleMeasure);
        window.addEventListener("orientationchange", scheduleMeasure);

        /* Font yang belum selesai dimuat bisa mengubah tinggi
           teks di sisi belakang — ukur ulang setelah siap. */
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(measure).catch(function () {});
        }

        reducedMotion.addEventListener("change", render);

        measure();
    }


    /* =====================================================
       6. INIT
    ===================================================== */

    document.addEventListener("DOMContentLoaded", function () {

        const section = document.getElementById("certificates");
        const carousel = document.getElementById("certificatesCarousel");
        const stage = document.getElementById("certStage");
        const ring = document.getElementById("certRing");
        const dotsWrap = document.getElementById("certDots");
        const prevBtn = document.getElementById("certPrev");
        const nextBtn = document.getElementById("certNext");

        if (!section || !carousel || !stage || !ring ||
            !dotsWrap || !prevBtn || !nextBtn) {
            return;
        }

        initCarousel({
            section: section,
            carousel: carousel,
            stage: stage,
            ring: ring,
            dotsWrap: dotsWrap,
            prevBtn: prevBtn,
            nextBtn: nextBtn
        });

    });

})();
