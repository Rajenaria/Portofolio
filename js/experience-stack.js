/* =========================================================
   EXPERIENCE — DATA-DRIVEN SCROLL-STICKY STACK
   Isolated feature — does not touch script.js/guestbook.js.

   Pipeline: loadExperiences() -> renderExperienceCards() ->
   initExperienceStack(). Rendering and the stack behavior are
   data-count agnostic and work with 1, 3, 12+ records unchanged.

   PHASE 9B1 — PUBLIC CMS
   ----------------------
   The list below is now the offline fallback. It renders first so the
   section is never empty, then published Supabase records replace it.
   A failed request simply leaves the fallback in place.
========================================================= */

import { readTable, filled } from "./cms/client.js";

(() => {

    const stackCol = document.getElementById("experienceStackCol");

    if (!stackCol) {
        return;
    }

    /* ============================
       1. FALLBACK DATA SOURCE
       Field names mirror the real schema 1:1, so the CMS rows and
       these records flow through the same renderer untouched.
    ============================ */

    function loadFallbackExperiences() {
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
        while (stackCol.firstChild) {
            stackCol.removeChild(stackCol.firstChild);
        }

        experiences.forEach((exp, index) => {
            const wrap = document.createElement("div");
            wrap.className = "experience-card-wrap";

            const article = document.createElement("article");
            article.className = "experience-card";

            const top = document.createElement("div");
            top.className = "experience-top";

            const number = document.createElement("span");
            number.className = "experience-number";

            // Display-only counter: the schema has no number column, so
            // the badge follows the rendered position.
            number.textContent = String(index + 1).padStart(2, "0");

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
            (exp.tags || []).forEach((label) => {
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
            return null;
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

        function handleResize() {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(applyOffsets, 150);
        }

        window.addEventListener("resize", handleResize);

        /*
            Every controller hands back the exact teardown for what it
            created. Re-rendering the stack for CMS data must not leave a
            second resize listener or a second observer behind.
        */

        function destroy() {
            window.clearTimeout(resizeTimer);
            window.removeEventListener("resize", handleResize);
        }

        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        if (prefersReducedMotion || !("IntersectionObserver" in window)) {
            wraps.forEach((wrap) => wrap.classList.add("is-settled"));
            return { destroy };
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

        return {
            destroy() {
                observer.disconnect();
                destroy();
            },
        };
    }


    /* ============================
       4. LIFECYCLE
       One controller at a time. Mounting always tears the previous one
       down first, so the stack can be re-rendered from CMS data without
       duplicating listeners, observers or stale card references.
    ============================ */

    let controller = null;

    function mount(experiences) {
        if (controller) {
            controller.destroy();
            controller = null;
        }

        const wraps = renderExperienceCards(experiences);

        // Measurement happens here, after the cards are in the document,
        // so offsets and z-index always match the rendered count.
        controller = initExperienceStack(wraps);
    }


    /* ============================
       5. PUBLIC CMS SOURCE
    ============================ */

    const section = document.getElementById("experience");

    /*
        Zero published records is a real state, not an error: showing the
        old hardcoded history would present stale content as if it were
        current. The least disruptive public behaviour the existing design
        supports is to drop the section entirely — an empty stack column
        would otherwise leave a lopsided half-section behind — together
        with the anchors that would then scroll nowhere.
    */

    function hideExperienceSection() {
        // Tear the controller down and drop the fallback cards entirely, so
        // the outdated history is not merely invisible but absent from the
        // document, the accessibility tree and any crawler.
        mount([]);

        if (section) {
            section.hidden = true;
        }

        document
            .querySelectorAll('a[href="#experience"]')
            .forEach((link) => {
                link.hidden = true;
            });
    }

    function normalize(row) {
        const tags = Array.isArray(row.experience_tags) ? row.experience_tags : [];

        return {
            id: row.id,
            type: filled(row.type) ? row.type : "",
            title: filled(row.title) ? row.title : "",
            role: filled(row.role) ? row.role : "",
            location: filled(row.location) ? row.location : "",
            description: filled(row.description) ? row.description : "",
            tags: tags
                .slice()
                .sort((a, b) => {
                    const order =
                        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);

                    if (order !== 0) {
                        return order;
                    }

                    return String(a.created_at || "").localeCompare(
                        String(b.created_at || "")
                    );
                })
                .map((tag) => tag.label)
                .filter((label) => filled(label)),
        };
    }

    /*
        One request for the whole section: tags are embedded through the
        experience_id foreign key rather than fetched per card.

        The status/deleted_at filters are defence in depth — the public
        RLS policies already restrict both tables to published, non-deleted
        rows, so a tampered query string cannot widen visibility.
    */

    async function loadPublishedExperiences() {
        const rows = await readTable(
            "experiences",
            "select=id,type,title,role,location,description,sort_order,created_at," +
            "experience_tags(label,sort_order,created_at)" +
            "&status=eq.published&deleted_at=is.null" +
            "&order=sort_order.asc,created_at.asc"
        );

        return rows.map(normalize);
    }


    /* ============================
       6. START
       The fallback renders immediately so the section is usable before
       and regardless of the network, then CMS data replaces it.
    ============================ */

    mount(loadFallbackExperiences());

    loadPublishedExperiences()
        .then((experiences) => {
            if (experiences.length === 0) {
                hideExperienceSection();
                return;
            }

            mount(experiences);
        })
        .catch((error) => {
            // Fallback stays on screen; this is a development signal only.
            console.warn("[cms] experiences unavailable", error);
        });

})();
