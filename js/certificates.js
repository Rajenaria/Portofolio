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
       |rel| <= fadeStart -> opacity 1 (terbaca penuh)
       |rel| >= fadeEnd   -> opacity 0 (membelakangi — WAJIB
       disembunyikan, kalau tidak sisi belakang kartu terlihat
       terbalik seperti cermin).

       Keduanya DIHITUNG dari step (= 360 / jumlah kartu), bukan
       angka mati, supaya komposisi globe-nya bertahan berapa pun
       jumlah sertifikatnya. Nilai V1 dipakai sebagai titik
       kalibrasi: dengan 5 kartu rumus ini menghasilkan 45 dan
       110.2 — praktis identik dengan 45 / 110 yang lama.

       Bagian proporsionalnya membuat tetangga kiri-kanan tetap di
       sekitar 0.59 di berapa pun jumlah kartu. Yang bekerja cuma
       clamp di kedua ujung:

         - BATAS ATAS menahan kasus 3 kartu. Di sana tetangga
           duduk di 120°, sudah lewat horizon backface: yang
           menghadap kita justru sisi BELAKANG kartu, terbaca
           terbalik seperti cermin. Batas ini menekan opacity-nya
           ke ~0.26 — cukup untuk hadir sebagai kedalaman, terlalu
           redup untuk teks cerminnya terbaca.

         - BATAS BAWAH menahan jumlah kartu besar supaya tetangga
           tidak merangkak naik ke opacity penuh dan jadi ramai.
           Dengan 8 atau 12 kartu tetap hanya dua tetangga yang
           tampak, sisanya 0. */

    const FADE_START_FACTOR = 0.625;
    const FADE_END_FACTOR = 1.53;

    const FADE_START_MIN = 16;
    const FADE_START_MAX = 62;

    const FADE_END_MIN = 40;
    const FADE_END_MAX = 140;

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


    function clamp(value, min, max) {

        return Math.min(Math.max(value, min), max);
    }


    /* Ambang peredupan untuk satu jumlah kartu tertentu.
       Dihitung sekali per controller — step tidak berubah selama
       jumlah kartunya tetap. */
    function computeFade(step) {

        return {
            start: clamp(
                step * FADE_START_FACTOR,
                FADE_START_MIN,
                FADE_START_MAX
            ),
            end: clamp(
                step * FADE_END_FACTOR,
                FADE_END_MIN,
                FADE_END_MAX
            )
        };
    }


    /* Opacity kartu berdasarkan seberapa jauh ia berputar
       dari posisi depan. */
    function faceOpacity(relAngle, fade) {

        const a = Math.abs(relAngle);

        if (a <= fade.start) {
            return 1;
        }

        if (a >= fade.end) {
            return 0;
        }

        return 1 - (a - fade.start) / (fade.end - fade.start);
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
            window.portfolioI18n.t("certificates.cardAriaLabel", {
                title: cert.title,
                publisher: cert.publisher
            })
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

        /* Defence in depth. The CMS layer already resolves this to a
           public-bucket document URL or a parsed http(s) link, but this
           is the sink the security audit named, so the scheme is checked
           again at the point of assignment. Anything else renders as the
           inert placeholder rather than a live href. */

        const safeLink = (function () {

            if (typeof cert.link !== "string" || cert.link.trim() === "") {
                return "";
            }

            try {
                const url = new URL(cert.link.trim(), window.location.href);

                return url.protocol === "https:" || url.protocol === "http:"
                    ? url.href
                    : "";

            } catch (err) {
                return "";
            }

        }());

        const hasLink = Boolean(safeLink);

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

            link.href = safeLink;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            /* Baru bisa di-tab saat kartunya dibalik —
               lihat toggleFlip()/resetFlips(). */
            link.tabIndex = -1;
            link.setAttribute(
                "aria-label",
                window.portfolioI18n.t("certificates.linkAriaLabel", { title: cert.title })
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
            link.title = window.portfolioI18n.t("certificates.linkEmptyTitle");
        }

        backInner.appendChild(link);

        back.appendChild(backInner);

        flip.append(front, back);
        slot.appendChild(flip);

        /* `faces` dipakai render(): peredupan dipasang di kedua
           muka kartu, bukan di slot — lihat catatan di render(). */
        return {
            slot, flip, front, back, backInner, link, hasLink, index,
            faces: [front, back]
        };
    }


    function buildDot(index, cert) {

        const dot = document.createElement("button");

        dot.type = "button";
        dot.className = "cert-dot";
        dot.dataset.index = String(index);
        dot.setAttribute(
            "aria-label",
            window.portfolioI18n.t("certificates.dotAriaLabel", { title: cert.title })
        );

        return dot;
    }


    /* =====================================================
       5. CAROUSEL
    ===================================================== */

    function initCarousel(refs, data) {

        const {
            section, carousel, stage, ring, dotsWrap, prevBtn, nextBtn
        } = refs;

        const total = data.length;
        const step = 360 / total;
        const fade = computeFade(step);

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );

        /* ---- Bangun kartu + titik indikator ---- */

        const cards = data.map(function (cert, index) {

            const card = buildCard(cert, index, step);
            ring.appendChild(card.slot);
            return card;
        });

        const dots = data.map(function (cert, index) {

            const dot = buildDot(index, cert);
            dotsWrap.appendChild(dot);
            return dot;
        });


        /* ---- STATE ----

           `activeIndex` = kartu yang menghadap depan, SELALU di
           rentang 0..total-1. Versi sebelumnya memakai indeks yang
           boleh tumbuh tanpa batas supaya putaran bisa lanjut ke
           arah yang sama; sekarang arah putaran dibawa oleh
           `angle`, jadi indeksnya tidak perlu ikut membesar.

           `angle` = sudut ring saat ini (derajat), tetap kontinu
           supaya rotasi selalu mengambil jalur terpendek dan tidak
           pernah "mundur" satu lingkaran penuh. Ia dirapikan ke
           rentang wajar hanya saat carousel diam — lihat
           normalizeAccumulatedAngle().

           Invarian yang dijaga keduanya:
               angle ≡ -activeIndex * step  (mod 360) */

        let activeIndex = ((START_INDEX % total) + total) % total;
        let angle = -activeIndex * step;

        /* Dibaca ulang dari CSS tiap kali layout berubah —
           lihat measure(). Jangan hardcode. */
        let radius = 300;

        let frame = 0;
        let destroyed = false;


        function frontIndex() {
            return activeIndex;
        }


        function applyRingTransform() {

            ring.style.transform =
                "translateZ(calc(-1 * var(--cert-radius))) " +
                "rotateY(" + angle.toFixed(3) + "deg)";
        }


        /* ---- Terapkan sudut ke DOM ----
           Hanya menyentuh transform, opacity dan visibility. */

        function render() {

            applyRingTransform();

            cards.forEach(function (card) {

                const rel = normalizeAngle(card.index * step + angle);
                const opacity = faceOpacity(rel, fade);
                const visible = opacity > HIDDEN_OPACITY;

                /* PENTING: opacity dipasang di kedua MUKA kartu,
                   tidak pernah di .cert-slot.

                   .cert-slot memegang transform-style: preserve-3d.
                   Opacity pecahan di elemen ber-preserve-3d memaksa
                   transform-style-nya jadi flat (CSS Transforms
                   Level 2), yang menggepengkan .cert-flip dan kedua
                   muka ke satu bidang dan melumpuhkan
                   backface-visibility — kartu yang membelakangi
                   kita jadi ikut tergambar dan menumpuk. Muka kartu
                   adalah daun, jadi meredupkannya aman.

                   visibility ikut disetel supaya kartu yang sudah
                   benar-benar hilang berhenti jadi lapisan yang
                   masih dicat compositor. Transisi visibility di
                   CSS menahan nilai "visible" selama fade berjalan,
                   jadi menghilang tetap halus dan muncul kembali
                   tetap seketika. */

                const value = opacity.toFixed(3);
                const shown = opacity > 0 ? "visible" : "hidden";

                /* Lewat 90 derajat, muka depan kartu sudah
                   membelakangi kita dan yang menghadap justru sisi
                   BELAKANG, sehingga isinya terbaca terbalik seperti
                   cermin. Ini cuma terjadi saat kartunya sedikit:
                   dengan 3 kartu, tetangganya duduk tepat di 120
                   derajat.

                   Yang disembunyikan hanya ISI sisi belakang, bukan
                   kartunya. Permukaan gelapnya tetap tergambar, jadi
                   kartu samping masih hadir sebagai kedalaman, tanpa
                   teks cermin. */

                card.slot.classList.toggle(
                    "is-reversed",
                    Math.abs(rel) > 90
                );

                card.faces.forEach(function (face) {
                    face.style.opacity = value;
                    face.style.visibility = shown;
                });

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


        /* ---- MERAPIKAN SUDUT YANG MENUMPUK ----

           rotateY(a) dan rotateY(a - 360k) menghasilkan orientasi
           yang identik, jadi sudut yang sudah menumpuk boleh
           dikecilkan tanpa ada yang bergerak di layar — ASAL
           transisinya dimatikan saat penulisan ulang, kalau tidak
           browser justru memutar balik k lingkaran penuh.

           Karena itu ini hanya dijalankan di batas aman: beberapa
           saat setelah rotasi terakhir, ketika transisi sudah
           selesai dan sudut yang tergambar sama persis dengan
           nilai `angle`. Kalau ada drag berjalan, ditunda. */

        const SETTLE_MS = 950;

        let settleTimer = 0;


        function normalizeAccumulatedAngle() {

            if (destroyed || dragging) {
                return;
            }

            const turns = Math.round(angle / 360);

            if (turns === 0) {
                return;
            }

            angle -= turns * 360;

            const previous = ring.style.transition;

            ring.style.transition = "none";
            applyRingTransform();

            /* Paksa reflow supaya nilai baru benar-benar terpakai
               sebelum transisinya dinyalakan lagi. */
            void ring.offsetWidth;

            ring.style.transition = previous;
        }


        function scheduleNormalize() {

            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(
                normalizeAccumulatedAngle,
                SETTLE_MS
            );
        }


        /* ---- NAVIGASI ----

           Semua rotasi lewat satu pintu: rotateBy(delta), dengan
           delta = jumlah langkah bertanda. `angle` bergerak kontinu
           (jalur terpendek terjaga), `activeIndex` melipat di
           0..total-1. Memutar carousel selalu mengembalikan semua
           kartu ke sisi depan. */

        function rotateBy(delta) {

            if (delta !== 0) {
                angle -= delta * step;
                activeIndex = ((activeIndex + delta) % total + total) % total;
            }

            resetFlips();
            render();
            scheduleNormalize();
        }


        /* Jalur terpendek menuju kartu ke-target (0..n-1),
           dihitung dari kartu depan saat ini. */

        function goToCard(target) {

            let delta = ((target - activeIndex) % total + total) % total;

            if (delta > total / 2) {
                delta -= total;
            }

            rotateBy(delta);
        }


        /* Lepas drag -> kunci ke kartu terdekat.

           Dihitung relatif terhadap keadaan saat drag DIMULAI,
           bukan dari indeks absolut, supaya perapian sudut di atas
           tidak pernah bisa menggeser hasil snap. */

        function snap(startAngle, startActive) {

            const stepsMoved = Math.round((startAngle - angle) / step);

            angle = startAngle - stepsMoved * step;
            activeIndex =
                ((startActive + stepsMoved) % total + total) % total;

            resetFlips();
            render();
            scheduleNormalize();
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
        let startActive = 0;
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

                snap(startAngle, startActive);
            }

            captured = false;
            pointerId = null;
        }


        /* Hanya pointer yang sedang kita lacak yang boleh
           mengakhiri drag. Tanpa penjagaan ini, jari kedua yang
           diangkat duluan akan menghentikan drag jari pertama. */

        function handlePointerEnd(event) {

            if (pointerId !== null && event.pointerId !== pointerId) {
                return;
            }

            endDrag();
        }


        function handlePointerDown(event) {

            /* Tombol tengah/kanan mouse tidak memutar apa pun. */
            if (event.button !== 0 && event.pointerType === "mouse") {
                return;
            }

            /* Sentuhan kedua tidak boleh menimpa drag yang sedang
               berjalan — dulu ia mengganti pointerId, startX dan
               startAngle di tengah jalan, dan begitu salah satu
               jari diangkat sisa state-nya bisa tertinggal: kelas
               is-dragging tidak pernah dilepas, transisi tetap
               mati, dan globe-nya lompat.

               Kalau state lama ternyata belum pernah menangkap
               pointer (geseran di bawah ambang lalu pointer-nya
               hilang di luar stage), ia dianggap basi dan
               dibersihkan supaya drag berikutnya tidak ikut mati. */

            if (dragging) {

                if (captured) {
                    return;
                }

                endDrag();
            }

            if (event.isPrimary === false) {
                return;
            }

            /* Bersihkan penekan klik dari gestur SEBELUMNYA.

               endDrag() menyalakan suppressClick supaya klik yang
               menyusul sebuah drag tidak ikut membalik kartu.
               Dulu ia hanya dimatikan lagi oleh handler klik di
               kartu — padahal begitu pointer capture diambil,
               klik penutup drag mendarat di stage, bukan di
               kartu. Handler-nya tidak pernah jalan, flag-nya
               tertinggal menyala, dan tap berikutnya ikut ditelan.

               Setiap gestur baru selalu dimulai dari pointerdown,
               dan klik milik gestur lama pasti sudah lewat saat
               itu — jadi di sinilah tempat yang tepat untuk
               menolkannya, tanpa bergantung pada waktu. */

            suppressClick = false;

            dragging = true;
            captured = false;
            pointerId = event.pointerId;
            startX = event.clientX;
            startAngle = angle;
            startActive = activeIndex;
        }


        function handlePointerMove(event) {

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
        }


        stage.addEventListener("pointerdown", handlePointerDown);
        stage.addEventListener("pointermove", handlePointerMove);
        stage.addEventListener("pointerup", handlePointerEnd);
        stage.addEventListener("pointercancel", handlePointerEnd);
        stage.addEventListener("lostpointercapture", handlePointerEnd);

        /* Jaring pengaman: sebelum ambang geser terlampaui belum
           ada pointer capture, jadi pointerup-nya bisa mendarat di
           elemen lain dan stage tidak pernah tahu drag-nya sudah
           berakhir. Pasangan listener di window menutup celah itu.
           Untuk drag yang sudah tertangkap, event ini cuma
           gelembung dari stage dan endDrag() kedua langsung
           keluar karena dragging sudah false. */

        window.addEventListener("pointerup", handlePointerEnd);
        window.addEventListener("pointercancel", handlePointerEnd);


        /* =================================================
           KLIK, KEYBOARD, TOMBOL, TITIK
        ================================================= */

        /* Listener kartu dan titik indikator menempel pada elemen
           yang dibuat controller ini sendiri. Saat rebuild, elemen
           itu ikut dibuang, jadi listener-nya mati bersamanya —
           yang perlu dilepas manual hanya listener pada elemen
           yang TETAP hidup (stage, carousel, tombol, window). */

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

        function handleCarouselKeydown(event) {

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                rotateBy(-1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                rotateBy(1);
            }
        }


        function handlePrevClick() {
            rotateBy(-1);
        }


        function handleNextClick() {
            rotateBy(1);
        }


        carousel.addEventListener("keydown", handleCarouselKeydown);
        prevBtn.addEventListener("click", handlePrevClick);
        nextBtn.addEventListener("click", handleNextClick);


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


        /* ---- RESIZE: LEBAR SAJA ----

           Di HP, menampilkan/menyembunyikan bilah URL memicu
           `resize` dengan LEBAR yang tidak berubah — hanya tinggi
           viewport-nya. Dulu tiap event itu menjalankan measure()
           penuh, yang menulis ulang --cert-h, mengubah tinggi
           .cert-ring dan karenanya margin-top-nya, sehingga
           globe-nya tersentak vertikal cuma karena halaman
           di-scroll. Desktop dan emulasi DevTools tidak pernah
           mengalaminya.

           Konvensinya sudah ada di js/experience-stack.js:
           simpan lebar terakhir, dan hanya ukur ulang kalau lebar
           itu benar-benar berubah. orientationchange tetap selalu
           mengukur ulang: di sana lebar memang berubah, tapi
           browser bisa melaporkannya terlambat. */

        let lastWidth = window.innerWidth;


        function handleResize() {

            const width = window.innerWidth;

            if (width === lastWidth) {
                return;
            }

            lastWidth = width;
            scheduleMeasure();
        }


        function handleOrientationChange() {

            lastWidth = window.innerWidth;
            scheduleMeasure();
        }


        window.addEventListener("resize", handleResize);
        window.addEventListener("orientationchange", handleOrientationChange);

        /* Font yang belum selesai dimuat bisa mengubah tinggi
           teks di sisi belakang — ukur ulang setelah siap. */
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () {

                if (!destroyed) {
                    measure();
                }

            }).catch(function () {});
        }

        reducedMotion.addEventListener("change", render);

        measure();


        /* =================================================
           TEARDOWN

           Belum dipakai V1 — carousel dibangun sekali saja. Ia ada
           supaya integrasi CMS nanti bisa membangun ulang carousel
           dari data yang di-fetch tanpa menumpuk listener atau
           kartu. Semua yang dipasang di elemen yang TETAP hidup
           (stage, carousel, tombol, window, media query) dilepas di
           sini; listener pada kartu dan titik ikut mati sendiri
           karena elemennya dibuang.
        ================================================= */

        function destroy() {

            if (destroyed) {
                return;
            }

            destroyed = true;

            if (frame) {
                cancelAnimationFrame(frame);
                frame = 0;
            }

            window.clearTimeout(resizeTimer);
            window.clearTimeout(settleTimer);

            /* Lepas pointer capture yang mungkin masih dipegang,
               lalu nolkan state drag-nya. */
            try {
                if (pointerId !== null &&
                    stage.hasPointerCapture(pointerId)) {
                    stage.releasePointerCapture(pointerId);
                }
            } catch (err) {
                /* diabaikan */
            }

            dragging = false;
            captured = false;
            pointerId = null;
            carousel.classList.remove("is-dragging");

            stage.removeEventListener("pointerdown", handlePointerDown);
            stage.removeEventListener("pointermove", handlePointerMove);
            stage.removeEventListener("pointerup", handlePointerEnd);
            stage.removeEventListener("pointercancel", handlePointerEnd);
            stage.removeEventListener("lostpointercapture", handlePointerEnd);

            window.removeEventListener("pointerup", handlePointerEnd);
            window.removeEventListener("pointercancel", handlePointerEnd);

            carousel.removeEventListener("keydown", handleCarouselKeydown);
            prevBtn.removeEventListener("click", handlePrevClick);
            nextBtn.removeEventListener("click", handleNextClick);

            window.removeEventListener("resize", handleResize);
            window.removeEventListener(
                "orientationchange",
                handleOrientationChange
            );

            reducedMotion.removeEventListener("change", render);

            while (ring.firstChild) {
                ring.removeChild(ring.firstChild);
            }

            while (dotsWrap.firstChild) {
                dotsWrap.removeChild(dotsWrap.firstChild);
            }

            section.style.removeProperty("--cert-h");
        }


        return { destroy: destroy };
    }


    /* =====================================================
       6. INIT
    ===================================================== */

    /* SATU controller hidup pada satu waktu.

       V1 memanggil build() tepat sekali, dari DOMContentLoaded.
       Yang membuat modul ini siap untuk CMS nanti adalah: build()
       selalu membongkar controller sebelumnya lebih dulu, jadi
       memanggilnya lagi dengan data lain tidak mungkin
       meninggalkan kartu ganda atau listener ganda. Tidak ada
       fetch di sini — sumber datanya masih array CERTIFICATES di
       atas. */

    let refs = null;
    let controller = null;


    function build(data) {

        if (!refs) {
            return false;
        }

        /* Validasi SEBELUM membongkar apa pun.

           Globe butuh minimal tiga kartu untuk terbaca sebagai
           globe. Kalau datanya lebih pendek dari itu, permintaan
           ditolak dan carousel yang sedang tampil dibiarkan utuh —
           membongkarnya dulu baru menolak akan menyisakan section
           kosong, yang justru lebih buruk daripada tidak jadi
           membangun ulang. */

        if (!Array.isArray(data) || data.length < 3) {
            return false;
        }

        if (controller) {
            controller.destroy();
            controller = null;
        }

        controller = initCarousel(refs, data);

        return true;
    }


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

        refs = {
            section: section,
            carousel: carousel,
            stage: stage,
            ring: ring,
            dotsWrap: dotsWrap,
            prevBtn: prevBtn,
            nextBtn: nextBtn
        };

        build(CERTIFICATES);

        /* Pintu masuk untuk fase berikutnya (dan untuk pengujian
           jumlah kartu). Mengikuti pola yang sudah dipakai
           window.refreshProjectCarousel dan
           window.refreshOrganizationGallery. */
        window.certificatesCarousel = {
            rebuild: build,
            destroy: function () {

                if (controller) {
                    controller.destroy();
                    controller = null;
                }
            }
        };

    });

})();
