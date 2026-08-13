/* =========================================================
   GUESTBOOK
   FORM + VALIDATION + SUPABASE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {


    /* =====================================================
       ELEMENT
    ===================================================== */

    const form =
        document.getElementById("guestbookForm");

    const nameInput =
        document.getElementById("guestbookName");

    const messageInput =
        document.getElementById("guestbookMessage");

    const counter =
        document.getElementById("guestbookCounter");

    const status =
        document.getElementById("guestbookStatus");

    const submitButton =
        document.getElementById("guestbookSubmit");

    const commentsList =
        document.getElementById("guestbookCommentsList");

    const sliderDots =
    document.getElementById("guestbookSliderDots");


    if (
        !form ||
        !nameInput ||
        !messageInput ||
        !counter ||
        !status ||
        !submitButton
    ) {
        return;
    }


    /* =====================================================
       SUPABASE CONFIG
    ===================================================== */

    const FUNCTION_URL =
        "https://hldacuppejztqzqaejsi.supabase.co/functions/v1/submit-comment";

    const SUPABASE_URL =
        "https://hldacuppejztqzqaejsi.supabase.co";

    const SUPABASE_PUBLISHABLE_KEY =
        "sb_publishable_B_Fq0qQhLmbz_MtxI8rFqA_S8MY1OuO";


    /* =====================================================
       CHARACTER COUNTER
    ===================================================== */

    function updateCounter() {

        const length =
            messageInput.value.length;

        counter.textContent =
            `${length} / 500`;

    }


    messageInput.addEventListener(
        "input",
        updateCounter
    );


    updateCounter();


    /* =====================================================
       STATUS MESSAGE
    ===================================================== */

    function showStatus(message, type = "") {

        status.textContent = message;


        status.classList.remove(
            "is-error",
            "is-success"
        );


        if (type) {

            status.classList.add(
                `is-${type}`
            );

        }

    }


    /* =====================================================
       VALIDATION
    ===================================================== */

    function validateForm() {

        const name =
            nameInput.value.trim();

        const message =
            messageInput.value.trim();


        /* =========================
           NAME
        ========================= */

        if (name.length < 2) {

            showStatus(
                "Nama minimal 2 karakter.",
                "error"
            );

            nameInput.focus();

            return false;
        }


        if (name.length > 30) {

            showStatus(
                "Nama maksimal 30 karakter.",
                "error"
            );

            nameInput.focus();

            return false;
        }


        /* =========================
           MESSAGE
        ========================= */

        if (message.length < 3) {

            showStatus(
                "Pesan minimal 3 karakter.",
                "error"
            );

            messageInput.focus();

            return false;
        }


        if (message.length > 500) {

            showStatus(
                "Pesan maksimal 500 karakter.",
                "error"
            );

            messageInput.focus();

            return false;
        }


        return true;

    }


    /* =====================================================
       FORMAT COMMENT DATE
    ===================================================== */

    function formatCommentDate(dateString) {

        const date =
            new Date(dateString);


        return date.toLocaleDateString(
            "id-ID",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );

    }


    /* =====================================================
       PINNED COMMENTS

       Pin disimpan per-browser (localStorage),
       supaya tidak perlu ubah backend.
    ===================================================== */

    const PINNED_STORAGE_KEY =
        "guestbookPinnedComments";

    let lastLoadedComments = [];


    function getPinnedIds() {

        try {

            const raw =
                localStorage.getItem(
                    PINNED_STORAGE_KEY
                );

            const ids =
                raw
                    ? JSON.parse(raw)
                    : [];

            return Array.isArray(ids)
                ? ids
                : [];

        } catch (error) {

            return [];

        }

    }


    function savePinnedIds(ids) {

        try {

            localStorage.setItem(
                PINNED_STORAGE_KEY,
                JSON.stringify(ids)
            );

        } catch (error) {

            /* localStorage tidak tersedia, abaikan */

        }

    }


    function isCommentPinned(id) {

        return getPinnedIds().includes(id);

    }


    function togglePinComment(id) {

        const pinnedIds =
            getPinnedIds();

        const index =
            pinnedIds.indexOf(id);


        if (index === -1) {

            pinnedIds.unshift(id);

        } else {

            pinnedIds.splice(index, 1);

        }


        savePinnedIds(pinnedIds);

        renderComments(lastLoadedComments);

    }


    function sortWithPinnedFirst(comments) {

        const pinnedIds =
            getPinnedIds();

        const pinned = [];
        const rest = [];


        comments.forEach((comment) => {

            if (pinnedIds.includes(comment.id)) {

                pinned.push(comment);

            } else {

                rest.push(comment);

            }

        });


        pinned.sort(
            (a, b) =>
                pinnedIds.indexOf(a.id) -
                pinnedIds.indexOf(b.id)
        );


        return pinned.concat(rest);

    }


    /* =====================================================
       EMPTY COMMENTS
    ===================================================== */

    function showEmptyComments() {

        if (!commentsList) {
            return;
        }


        commentsList.innerHTML = `
            <div
                id="guestbookEmpty"
                class="guestbook-v2-empty"
            >

                <div class="guestbook-v2-empty-icon">
                    ✦
                </div>

                <h4>
                    Belum ada pesan.
                </h4>

                <p>
                    Jadilah orang pertama yang meninggalkan pesan.
                </p>

            </div>
        `;


    }


    /* =====================================================
       RENDER COMMENTS
    ===================================================== */

    function renderComments(comments) {

        if (!commentsList) {
            return;
        }


        /* =========================
           EMPTY
        ========================= */

        if (
            !comments ||
            comments.length === 0
        ) {

            showEmptyComments();

            return;
        }


        /*
            Simpan comments asli (belum diurutkan pin)
            supaya togglePinComment bisa render ulang.
        */

        lastLoadedComments = comments;


        /*
            Kosongkan komentar lama.
        */

        commentsList.replaceChildren();

/* =====================================================
   COMMENT SLIDER DOTS
===================================================== */

function setupCommentSlider() {

    if (
        !commentsList ||
        !sliderDots
    ) {
        return;
    }


    const cards =
        Array.from(
            commentsList.querySelectorAll(
                ".guestbook-v2-comment"
            )
        );


    sliderDots.replaceChildren();


    /*
        Kalau tidak ada komentar,
        tidak perlu navigation.
    */

    if (cards.length <= 1) {
        return;
    }


    /* =================================================
       CREATE DOT FOR EACH COMMENT
    ================================================= */

    cards.forEach(
        (card, index) => {

            const dot =
                document.createElement(
                    "button"
                );


            dot.type =
                "button";


            dot.className =
                "guestbook-slider-dot";


            dot.setAttribute(
                "aria-label",
                `Lihat komentar ${index + 1}`
            );


            if (index === 0) {

                dot.classList.add(
                    "is-active"
                );

            }


            dot.addEventListener(
                "click",
                () => {

                    card.scrollIntoView({

                        behavior:
                            "smooth",

                        block:
                            "nearest",

                        inline:
                            "start"

                    });

                }
            );


            sliderDots.appendChild(
                dot
            );

        }
    );


    /* =================================================
       UPDATE ACTIVE DOT
    ================================================= */

    function updateActiveDot() {

        const sliderLeft =
            commentsList.scrollLeft;


        let closestIndex = 0;

        let closestDistance =
            Infinity;


        cards.forEach(
            (card, index) => {

                const distance =
                    Math.abs(
                        card.offsetLeft -
                        commentsList.offsetLeft -
                        sliderLeft
                    );


                if (
                    distance <
                    closestDistance
                ) {

                    closestDistance =
                        distance;

                    closestIndex =
                        index;

                }

            }
        );


        const dots =
            sliderDots.querySelectorAll(
                ".guestbook-slider-dot"
            );


        dots.forEach(
            (dot, index) => {

                dot.classList.toggle(
                    "is-active",
                    index === closestIndex
                );

            }
        );

    }


    commentsList.addEventListener(
        "scroll",
        updateActiveDot,
        {
            passive: true
        }
    );


    updateActiveDot();

}
        /* =========================
           CREATE CARD
        ========================= */

        const sortedComments =
            sortWithPinnedFirst(comments);


        sortedComments.forEach((comment) => {


            /* CARD */

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "guestbook-v2-comment";


            if (
                isCommentPinned(
                    comment.id
                )
            ) {

                card.classList.add(
                    "is-pinned"
                );

            }


            /* HEADER */

            const head =
                document.createElement(
                    "div"
                );


            head.className =
                "guestbook-v2-comment-head";


            /* AVATAR */

            const avatar =
                document.createElement(
                    "div"
                );


            avatar.className =
                "guestbook-v2-avatar";


            avatar.textContent =
                comment.name
                    ? comment.name
                        .charAt(0)
                        .toUpperCase()
                    : "?";


            /* META */

            const meta =
                document.createElement(
                    "div"
                );


            meta.style.minWidth =
                "0";


            /* NAME */

            const name =
                document.createElement(
                    "p"
                );


            name.className =
                "guestbook-v2-comment-name";


            /*
                Gunakan textContent.

                Jangan innerHTML untuk
                komentar dari pengguna.
            */

            name.textContent =
                comment.name;


            /* DATE */

            const date =
                document.createElement(
                    "span"
                );


            date.className =
                "guestbook-v2-comment-date";


            date.textContent =
                formatCommentDate(
                    comment.created_at
                );


            /* MESSAGE */

            const message =
                document.createElement(
                    "p"
                );


            message.className =
                "guestbook-v2-comment-message";


            message.textContent =
                comment.message;


            /* PIN BUTTON */

            const pinButton =
                document.createElement(
                    "button"
                );


            pinButton.type =
                "button";


            pinButton.className =
                "guestbook-v2-comment-pin";


            pinButton.setAttribute(
                "aria-label",
                "Sematkan komentar ini"
            );


            pinButton.textContent =
                "📌";


            if (
                isCommentPinned(
                    comment.id
                )
            ) {

                pinButton.classList.add(
                    "is-active"
                );

            }


            pinButton.addEventListener(
                "click",
                () => {

                    togglePinComment(
                        comment.id
                    );

                }
            );


            /* =========================
               ASSEMBLE CARD
            ========================= */

            meta.append(
                name,
                date
            );


            head.append(
                avatar,
                meta,
                pinButton
            );


            card.append(
                head,
                message
            );


            commentsList.appendChild(
                card
            );

        });

setupCommentSlider();
    }


    /* =====================================================
       LOAD APPROVED COMMENTS
    ===================================================== */

    async function loadApprovedComments() {

        if (!commentsList) {
            return;
        }


        try {

            const endpoint =
                `${SUPABASE_URL}/rest/v1/comments` +
                `?select=id,name,message,created_at` +
                `&status=eq.approved` +
                `&order=created_at.desc`;


            const response =
                await fetch(
                    endpoint,
                    {

                        method: "GET",

                        headers: {

                            apikey:
                                SUPABASE_PUBLISHABLE_KEY,

                            Accept:
                                "application/json"

                        }

                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Gagal mengambil komentar."
                );

            }


            const comments =
                await response.json();


            renderComments(
                comments
            );


        } catch (error) {

            console.error(
                "Load comments error:",
                error
            );


            commentsList.innerHTML = `
                <div class="guestbook-v2-empty">

                    <div class="guestbook-v2-empty-icon">
                        !
                    </div>

                    <h4>
                        Pesan gagal dimuat.
                    </h4>

                    <p>
                        Silakan refresh halaman.
                    </p>

                </div>
            `;

        }

    }


    /* =====================================================
       PLANE ANIMATION HELPER
    ===================================================== */

    function flyPlane() {

        if (
            typeof window.flyGuestbookPlane
            === "function"
        ) {

            window.flyGuestbookPlane();

        }

    }


    /* =====================================================
       RESET FORM HELPER
    ===================================================== */

    function resetGuestbookForm() {

        form.reset();

        updateCounter();

    }


    /* =====================================================
       SUBMIT FORM
    ===================================================== */

    form.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            /* =============================================
               VALIDATION
            ============================================= */

            const isValid =
                validateForm();


            if (!isValid) {
                return;
            }


            /* =============================================
               DATA
            ============================================= */

            const name =
                nameInput.value.trim();

            const message =
                messageInput.value.trim();


            /* =============================================
               LOADING
            ============================================= */

            submitButton.disabled =
                true;


            submitButton.innerHTML = `
                <span>Mengirim...</span>
            `;


            showStatus(
                "Sedang mengirim pesan..."
            );


            try {


                /* =========================================
                   SEND TO EDGE FUNCTION
                ========================================= */

                const response =
                    await fetch(
                        FUNCTION_URL,
                        {

                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json"

                            },

                            body:
                                JSON.stringify({

                                    name:
                                        name,

                                    message:
                                        message

                                })

                        }
                    );


                /* =========================================
                   READ SERVER RESPONSE
                ========================================= */

                const result =
                    await response.json();


                console.log(
                    "Guestbook response:",
                    result
                );


                /* =========================================
                   BLOCKED / SERVER ERROR

                   blocked dari server memakai
                   response HTTP non-2xx.

                   Pesawat TIDAK terbang.
                   Form TIDAK dikosongkan.
                ========================================= */

                if (!response.ok) {

                    throw new Error(
                        result.message ||
                        "Pesan gagal dikirim."
                    );

                }


                if (!result.success) {

                    throw new Error(
                        result.message ||
                        "Pesan gagal dikirim."
                    );

                }


                /* =========================================
                   APPROVED

                   Pesan aman:
                   - terbang
                   - reset
                   - reload comments
                ========================================= */

                if (
                    result.status ===
                    "approved"
                ) {

                    showStatus(
                        "Pesan berhasil terkirim. Terima kasih!",
                        "success"
                    );


                    /*
                        Jalankan animasi
                        pesawat.
                    */

                    flyPlane();


                    /*
                        Kosongkan form.
                    */

                    resetGuestbookForm();


                    /*
                        Ambil ulang komentar
                        approved supaya pesan
                        langsung muncul tanpa
                        refresh browser.
                    */

                    await loadApprovedComments();


                    return;

                }


                /* =========================================
                   PENDING

                   Pesan diterima tapi masih
                   harus diperiksa.

                   - pesawat tetap terbang
                   - form dikosongkan
                   - TIDAK muncul di comments
                ========================================= */

                if (
                    result.status ===
                    "pending"
                ) {

                    showStatus(
                        "Pesan terpending. akan di check dulu yaa",
                        "success"
                    );


                    flyPlane();


                    resetGuestbookForm();


                    return;

                }


                /* =========================================
                   FALLBACK SUCCESS

                   Kalau server suatu saat
                   mengembalikan status lain
                   tetapi success = true.
                ========================================= */

                showStatus(
                    result.message ||
                    "Pesan berhasil dikirim.",
                    "success"
                );


                flyPlane();


                resetGuestbookForm();


            } catch (error) {


                /* =========================================
                   ERROR / BLOCKED
                ========================================= */

                console.error(
                    "Guestbook error:",
                    error
                );


                /*
                    Di sini pesawat
                    TIDAK dijalankan.

                    Form juga TIDAK reset.

                    Jadi kalau pesan blocked,
                    user masih bisa mengedit
                    pesannya.
                */


                showStatus(
                    error.message ||
                    "Terjadi kesalahan. Coba lagi.",
                    "error"
                );


            } finally {


                /* =========================================
                   RESTORE BUTTON
                ========================================= */

                submitButton.disabled =
                    false;


                submitButton.innerHTML = `
                    Kirim
                    <span>→</span>
                `;

            }

        }
    );


    /* =====================================================
       INITIAL LOAD
    ===================================================== */

    loadApprovedComments();


});