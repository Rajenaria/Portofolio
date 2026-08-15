/* =========================================================
   EXPERIENCE — DATA-DRIVEN SCROLL-STICKY STACK
   Isolated feature — does not touch script.js/guestbook.js.

   Pipeline: loadExperiences() -> renderExperienceCards() ->
   initExperienceStack(). loadExperiences() is the only piece that
   will need to change when this is wired up to Supabase later —
   rendering and the stack behavior are data-count agnostic and
   work with 3, 8, 15+ records unchanged.
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const stackCol = document.getElementById("experienceStackCol");

    if (!stackCol) {
        return;
    }

    /* ============================
       1. DATA SOURCE
       Stand-in for a future Supabase fetch. Field names mirror the
       planned schema (title/role/description/sort_order etc.) loosely
       so swapping this function later is a small, contained change.
    ============================ */

    function loadExperiences() {
        return [
            {
                id: 1,
                number: "01",
                type: "LABORATORY",
                title: "RnEST Laboratory",
                role: "Laboratory Assistant — Koordinator PDD",
                location: "Telkom University",
                description:
                    "Melaksanakan riset dan pengembangan dalam bidang robotika " +
                    "dan embedded systems, menyusun modul praktikum Teknik Digital " +
                    "dan Mikroprosesor, serta membimbing mahasiswa dalam kegiatan " +
                    "praktikum. Selain itu, bertanggung jawab sebagai Koordinator " +
                    "Divisi PDD dalam pengelolaan desain, dokumentasi, pengumuman, " +
                    "dan media sosial laboratorium.",
                tags: ["Embedded System", "Robotics", "Microprocessor", "Documentation"],
            },
            {
                id: 2,
                number: "02",
                type: "UI/UX",
                title: "Techno Infinity",
                role: "UI/UX Development",
                location: "Bandung",
                description:
                    "Merancang dan mengembangkan antarmuka aplikasi mulai dari " +
                    "pembuatan wireframe, prototipe interaktif, hingga design system. " +
                    "Turut berkontribusi dalam pengembangan UI/UX SIKESPADU UNPAD, " +
                    "termasuk dashboard, fitur input nilai, dan navigasi pengguna, " +
                    "serta beberapa aplikasi internal klien.",
                tags: ["Figma", "UI/UX", "Wireframe", "Prototype", "Design System"],
            },
            {
                id: 3,
                number: "03",
                type: "AI • COMPUTER VISION",
                title: "ProCodeCG",
                role: "AI & Computer Vision Development",
                location: "Bandung",
                description:
                    "Melakukan riset dan pengembangan model YOLOv8 untuk " +
                    "mendeteksi truk overload berdasarkan karakteristik kendaraan " +
                    "dari citra video. Mengembangkan pipeline real-time object " +
                    "detection menggunakan Python dan OpenCV serta membuat " +
                    "prototype IoT menggunakan Arduino, LED indikator, dan buzzer.",
                tags: ["Python", "YOLOv8", "OpenCV", "Arduino", "Computer Vision"],
            },
            {
                id: 4,
                number: "04",
                type: "MARKETING",
                title: "JAFFAR INDO COMODITY",
                role: "Executive Marketing & Distributor Albens",
                location: "Bandung",
                description:
                    "Menyusun materi presentasi untuk kebutuhan promosi dan strategi " +
                    "pemasaran, mengembangkan market plan untuk memperluas jangkauan " +
                    "produk, serta merancang strategi pemasaran khusus wilayah Bandung " +
                    "guna meningkatkan penetrasi pasar dan penjualan. Selain itu, " +
                    "bertanggung jawab dalam pengelolaan distribusi produk Albens " +
                    "di wilayah Bandung dan sekitarnya.",
                tags: ["Marketing Strategy", "Market Planning", "Presentation", "Distribution"],
            },
        ];
    }

    /* ============================
       2. RENDERER
       Builds the DOM from data. No assumption about how many items
       there are.
    ============================ */

    function renderExperienceCards(experiences) {
        stackCol.innerHTML = "";

        experiences.forEach((exp) => {
            const wrap = document.createElement("div");
            wrap.className = "experience-card-wrap";

            const article = document.createElement("article");
            article.className = "experience-card";

            const top = document.createElement("div");
            top.className = "experience-top";

            const number = document.createElement("span");
            number.className = "experience-number";
            number.textContent = exp.number;

            const type = document.createElement("span");
            type.className = "experience-type";
            type.textContent = exp.type;

            top.appendChild(number);
            top.appendChild(type);

            const h3 = document.createElement("h3");
            h3.textContent = exp.title;

            const h4 = document.createElement("h4");
            h4.textContent = exp.role;

            const location = document.createElement("p");
            location.className = "experience-location";
            location.textContent = exp.location;

            const text = document.createElement("p");
            text.className = "experience-text";
            text.textContent = exp.description;

            const tags = document.createElement("div");
            tags.className = "experience-tags";
            exp.tags.forEach((label) => {
                const tag = document.createElement("span");
                tag.textContent = label;
                tags.appendChild(tag);
            });

            article.appendChild(top);
            article.appendChild(h3);
            article.appendChild(h4);
            article.appendChild(location);
            article.appendChild(text);
            article.appendChild(tags);

            wrap.appendChild(article);
            stackCol.appendChild(wrap);
        });

        return Array.from(stackCol.querySelectorAll(".experience-card-wrap"));
    }

    /* ============================
       3. STICKY STACK CONTROLLER
       Native position:sticky + CSS transforms. No scroll hijacking,
       no preventDefault — the browser's own scroll drives everything.
       JS only tunes the per-card "top" offset (breakpoint-aware) and
       toggles a settle class via IntersectionObserver for the subtle
       scale/opacity ease-in.
    ============================ */

    function initExperienceStack(wraps) {
        if (wraps.length === 0) {
            return;
        }

        function getTuning() {
            const width = window.innerWidth;
            if (width <= 650) {
                return { base: 84, increment: 12 };
            }
            if (width <= 1024) {
                return { base: 92, increment: 18 };
            }
            return { base: 108, increment: 26 };
        }

        function applyOffsets() {
            const { base, increment } = getTuning();
            wraps.forEach((wrap, i) => {
                wrap.style.top = `${base + i * increment}px`;
                const card = wrap.querySelector(".experience-card");
                if (card) {
                    card.style.zIndex = String(i + 1);
                }
            });
        }

        applyOffsets();

        let resizeTimer = null;
        window.addEventListener("resize", () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(applyOffsets, 150);
        });

        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        if (prefersReducedMotion) {
            wraps.forEach((wrap) => wrap.classList.add("is-settled"));
            return;
        }

        if (!("IntersectionObserver" in window)) {
            wraps.forEach((wrap) => wrap.classList.add("is-settled"));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    entry.target.classList.toggle("is-settled", entry.isIntersecting);
                });
            },
            {
                root: null,
                rootMargin: "-15% 0px -55% 0px",
                threshold: 0,
            }
        );

        wraps.forEach((wrap) => observer.observe(wrap));
    }

    const experiences = loadExperiences();
    const wraps = renderExperienceCards(experiences);
    initExperienceStack(wraps);

});
