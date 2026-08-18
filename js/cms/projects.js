/* =========================================================
   PUBLIC PROJECT CARDS CMS INTEGRATION  (Phase 9C1)

   Replaces the static Portfolio cards with published CMS
   Projects. Only the card set changes: the carousel markup,
   its CSS, the drag/pointer handlers, the clone strategy, the
   scroll indicator and the auto-scroll loop all stay exactly
   as script.js built them.

   ACTIVATION RULE
   ---------------
   The request result is authoritative. A successful read means
   the published Project list is the truth, so the static V1
   cards are dropped wholesale rather than merged: mixing the
   two would present retired work as current. A failed request
   changes nothing at all, leaving Portfolio V1 intact.

   CAROUSEL LIFECYCLE
   ------------------
   script.js clones the original card set once at load. Cards
   are therefore rebuilt in a single pass and handed back
   through window.refreshProjectCarousel(), which drops the old
   clones, re-reads the originals, re-clones and re-syncs the
   indicator. Clones are never written into directly and the
   controller is never constructed a second time.

   SAFETY
   ------
   Every Project value is untrusted public input. Text goes in
   with textContent, elements are built with createElement, the
   detail link is assembled with URLSearchParams, and images may
   only ever resolve inside the public media bucket.
========================================================= */

import {
    readTable,
    publicMediaUrl,
    filled,
    IS_LOCAL_CMS
} from "./client.js";


/* ---------------------------------------------------------
   DETAIL ROUTE

   The generic detail page does not exist yet (Phase 9C2), but
   the published cards already have to point at their final
   address rather than at the retired per-project files.
--------------------------------------------------------- */

const DETAIL_PAGE = "project.html";


/*
    Matches the existing V1 <source media> contract exactly. It
    is read from the page rather than redeclared so the two can
    never drift apart.
*/

const FALLBACK_MEDIA_QUERY = "(max-width: 650px)";


/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function warn(message, error) {

    if (IS_LOCAL_CMS) {
        console.warn(`[cms] ${message}`, error || "");
    }

}

function mediaQueryFrom(picture) {

    const source = picture ? picture.querySelector("source") : null;
    const value = source ? source.getAttribute("media") : null;

    return filled(value) ? value : FALLBACK_MEDIA_QUERY;

}

/*
    A card only ever links to its own slug, and the slug is
    stored data. URLSearchParams does the encoding, so a slug
    carrying quotes, spaces or a "javascript:" prefix can only
    ever come back out as an inert query value on a relative
    same-origin path.
*/

function detailHref(slug) {

    const params = new URLSearchParams({ slug: slug });

    return `${DETAIL_PAGE}?${params.toString()}`;

}


/* ---------------------------------------------------------
   CARD

   Mirrors the V1 article shape exactly:

   <article class="project-card">
     <div class="project-image"><picture>…</picture></div>
     <div class="project-content">
       <p class="project-category">…</p>
       <h3>…</h3>
       <p class="project-text">…</p>
       <div class="project-tech"><span>…</span></div>
       <a class="project-link">…</a>
     </div>
   </article>
--------------------------------------------------------- */

function buildImage(project, mediaQuery) {

    const wrap = document.createElement("div");
    wrap.className = "project-image";

    const desktopUrl = publicMediaUrl(
        project.cover_bucket,
        project.cover_desktop_path
    );

    const mobileUrl = publicMediaUrl(
        project.cover_bucket,
        project.cover_mobile_path
    );

    /*
        publicMediaUrl returns null for anything outside the
        public bucket, so a cover still sitting in staging (or
        any traversal attempt) simply produces no <img>. The
        wrapper stays because .project-image carries the card's
        aspect-ratio and placeholder background: dropping it
        would change the card height.
    */

    if (!desktopUrl) {
        return wrap;
    }

    const picture = document.createElement("picture");

    const source = document.createElement("source");
    source.setAttribute("media", mediaQuery);
    source.setAttribute("srcset", mobileUrl || desktopUrl);
    source.setAttribute("type", "image/webp");

    const image = document.createElement("img");
    image.setAttribute("src", desktopUrl);

    // Blank alt is a legitimate answer for decorative cover art,
    // so it becomes alt="" rather than a title or a filename.
    image.setAttribute(
        "alt",
        filled(project.cover_alt) ? project.cover_alt.trim() : ""
    );

    image.setAttribute("draggable", "false");
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");

    picture.appendChild(source);
    picture.appendChild(image);

    wrap.appendChild(picture);

    return wrap;

}

/*
    Relationship rows arrive embedded with the Project. Public
    Tech Stack eligibility is deliberately not consulted here: a
    Technology attached to a published Project is part of that
    Project's record even when it is hidden from the About
    stack or has been disabled in the library.
*/

function technologyNames(project) {

    const relations = Array.isArray(project.project_technologies)
        ? project.project_technologies.slice()
        : [];

    relations.sort((a, b) => {

        const orderA = Number(a.sort_order) || 0;
        const orderB = Number(b.sort_order) || 0;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return String(a.created_at || "").localeCompare(
            String(b.created_at || "")
        );

    });

    return relations
        .map(relation =>
            relation.technologies ? relation.technologies.name : null
        )
        .filter(filled);

}

function buildCard(project, mediaQuery) {

    const card = document.createElement("article");
    card.className = "project-card";

    card.appendChild(buildImage(project, mediaQuery));

    const content = document.createElement("div");
    content.className = "project-content";

    /*
        Category and description are optional columns. An empty
        one leaves its element out entirely rather than shipping
        a blank line, which would otherwise show up as stray
        padding inside the card.
    */

    if (filled(project.card_category)) {

        const category = document.createElement("p");
        category.className = "project-category";
        category.textContent = project.card_category;
        content.appendChild(category);

    }

    const title = document.createElement("h3");
    title.textContent = project.title;
    content.appendChild(title);

    if (filled(project.short_description)) {

        const text = document.createElement("p");
        text.className = "project-text";
        text.textContent = project.short_description;
        content.appendChild(text);

    }

    const names = technologyNames(project);

    if (names.length > 0) {

        const tech = document.createElement("div");
        tech.className = "project-tech";

        names.forEach(name => {

            const chip = document.createElement("span");
            chip.textContent = name;
            tech.appendChild(chip);

        });

        content.appendChild(tech);

    }

    const link = document.createElement("a");
    link.className = "project-link";
    link.setAttribute("href", detailHref(project.slug));
    link.textContent = "Lihat Project →";
    content.appendChild(link);

    card.appendChild(content);

    return card;

}


/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */

/*
    With no published Projects the section has nothing to show
    and the controller has nothing to drive: the indicator, the
    drag hint and the auto-scroll loop would all be advertising
    an empty strip. The whole section and its navigation entries
    are hidden instead, which the existing markup supports
    without any layout of its own to unwind.
*/

function hidePortfolio(grid) {

    /*
        The static cards go too, not just out of view: leaving
        retired work sitting in the document would still publish
        it to anything reading the page rather than rendering it.
    */

    while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
    }

    const section = document.querySelector("#portfolio");

    if (section) {
        section.hidden = true;
    }

    document
        .querySelectorAll('a[href="#portfolio"]')
        .forEach(link => {
            link.hidden = true;
        });

}

function renderProjects(projects) {

    const grid = document.querySelector("#projectGrid");

    if (!grid) {
        return;
    }

    if (projects.length === 0) {
        hidePortfolio(grid);
        return;
    }

    const mediaQuery = mediaQueryFrom(grid.querySelector("picture"));

    const cards = projects.map(project => buildCard(project, mediaQuery));

    /*
        Clones from the first initialisation are dropped along
        with the static cards, so the refresh below starts from
        the original set only and cannot stack a second clone
        generation on top of the first.
    */

    while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
    }

    cards.forEach(card => grid.appendChild(card));

    /*
        script.js owns the clones, the width cache and the
        indicator. It exposes one refresh entry point for
        exactly this case; nothing here touches the loop.
    */

    if (typeof window.refreshProjectCarousel === "function") {
        window.refreshProjectCarousel();
    }

}


/* ---------------------------------------------------------
   LOAD

   One request. The embedded relationship keeps the technology
   chips in the same round trip instead of one lookup per card.

   RLS is the security authority; the status filters below are
   defence in depth, and the columns they test are selected so
   the second check reads real values rather than undefined.
--------------------------------------------------------- */

async function load() {

    const projects = await readTable(
        "projects",
        "select=slug,title,card_category,short_description," +
        "cover_bucket,cover_desktop_path,cover_mobile_path,cover_alt," +
        "status,deleted_at,sort_order,created_at," +
        "project_technologies(sort_order,created_at,technologies(name))" +
        "&status=eq.published&deleted_at=is.null" +
        "&order=sort_order.asc,created_at.asc"
    );

    const published = projects.filter(project =>
        project.status === "published" &&
        project.deleted_at === null &&
        filled(project.slug) &&
        filled(project.title)
    );

    renderProjects(published);

}


/* ---------------------------------------------------------
   START

   script.js runs from the end of the document and has already
   built the carousel by the time this deferred module executes,
   so the refresh hook is always in place.
--------------------------------------------------------- */

load().catch(error => warn("projects unavailable", error));
