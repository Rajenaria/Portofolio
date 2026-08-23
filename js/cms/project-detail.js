/* =========================================================
   GENERIC PUBLIC PROJECT DETAIL  (Phase 9C2)

   One renderer for every published Project, selected by the
   ?slug= query parameter, filling the V1 detail layout that
   project.html ships with its content removed.

   VISIBILITY
   ----------
   Only published, non-deleted Projects resolve. Draft, archived,
   soft-deleted, unknown and missing slugs all end in the same
   "not found" state: the page never distinguishes "no such
   Project" from "a Project you are not allowed to see", so it
   cannot be used to enumerate unpublished work.

   SAFETY
   ------
   Every value here is untrusted public input. Text is written
   with textContent, elements are built with createElement, the
   next-Project address is assembled with URLSearchParams, images
   may only resolve inside the public bucket, and external links
   are rejected unless they are plain http(s).
========================================================= */

import {
    readTable,
    publicMediaUrl,
    filled,
    IS_LOCAL_CMS
} from "./client.js";

import { localizeField } from "./localize.js";
import { getLanguage, onLanguageChange, t } from "../core/i18n.js";


/*
    Matches the existing V1 <source media> contract exactly, so
    the detail page keeps the single breakpoint the design was
    built around.
*/

const MOBILE_MEDIA_QUERY = "(max-width: 650px)";

const PORTFOLIO_URL = "index.html#portfolio";


/* ---------------------------------------------------------
   TOOL ICONS

   The V1 tool pill carries an <iconify-icon>. Two identifier
   shapes are accepted:

     - an Iconify id stored by the Admin icon picker, allowed
       through only after matching ICONIFY_ID_PATTERN below;
     - a legacy bare key predating the picker, which selects an
       entry from the static table.

   Neither shape can carry markup, a scheme or a traversal, so a
   database value can name an icon and nothing else. An
   unrecognised value produces a text-only pill, which the
   existing flex/gap styling already collapses cleanly.
--------------------------------------------------------- */

const ICONIFY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/;

const ICONIFY_API = "https://api.iconify.design";

/*
    Assembled only from an already-validated identifier, with each
    segment encoded. The SVG is loaded as an image, never fetched
    as text and never injected as markup.
*/

function iconifyImageUrl(iconId) {

    if (!ICONIFY_ID_PATTERN.test(iconId)) {
        return null;
    }

    const [prefix, name] = iconId.split(":");

    return `${ICONIFY_API}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;

}

const TOOL_ICONS = {
    figma: "logos:figma",
    python: "logos:python",
    javascript: "logos:javascript-1",
    html5: "logos:html-5",
    css3: "logos:css-3",
    nodejs: "logos:nodejs-icon",
    react: "logos:react",
    opencv: "logos:opencv",
    arduino: "logos:arduino",
    mysql: "logos:mysql",
    git: "logos:git-icon",
    github: "logos:github-icon",
    docker: "logos:docker-icon",
    vscode: "logos:visual-studio-code",
    photoshop: "logos:adobe-photoshop",
    illustrator: "logos:adobe-illustrator",
    canva: "logos:canva",
    c: "logos:c",
    cpp: "logos:c-plusplus"
};


/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function warn(message, error) {

    if (IS_LOCAL_CMS) {
        console.warn(`[cms] ${message}`, error || "");
    }

}

function byId(id) {

    return document.getElementById(id);

}

function replaceChildren(container, nodes) {

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    nodes.forEach(node => container.appendChild(node));

}

/*
    Child rows arrive embedded in whatever order PostgREST
    returned them, so ordering is settled here against the same
    contract the Admin CMS writes: sort_order first, then the
    creation timestamp as the stable tie-break.
*/

function bySortOrder(a, b) {

    const orderA = Number(a.sort_order) || 0;
    const orderB = Number(b.sort_order) || 0;

    if (orderA !== orderB) {
        return orderA - orderB;
    }

    return String(a.created_at || "").localeCompare(
        String(b.created_at || "")
    );

}

function sorted(rows) {

    return Array.isArray(rows) ? rows.slice().sort(bySortOrder) : [];

}

/*
    Only ordinary web addresses are ever turned into a link.
    javascript:, data:, vbscript: and file: are rejected outright
    rather than sanitised, and a value that does not parse at all
    is treated the same way.
*/

function safeExternalUrl(value) {

    if (!filled(value)) {
        return null;
    }

    let parsed;

    try {
        parsed = new URL(value.trim());
    }

    catch (error) {
        return null;
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return null;
    }

    return parsed.href;

}

function projectHref(slug) {

    const params = new URLSearchParams({ slug: slug });

    return `project.html?${params.toString()}`;

}

/*
    Builds the V1 responsive <picture>. Returns null when the row
    does not point at a real object in the public bucket, which is
    how a cover still sitting in the private staging bucket ends
    up rendering nothing at all instead of a broken or leaked URL.
*/

function buildPicture(row, altText) {

    const desktopUrl = publicMediaUrl(row.bucket, row.desktop);
    const mobileUrl = publicMediaUrl(row.bucket, row.mobile);

    if (!desktopUrl) {
        return null;
    }

    const picture = document.createElement("picture");

    const source = document.createElement("source");
    source.setAttribute("media", MOBILE_MEDIA_QUERY);
    source.setAttribute("srcset", mobileUrl || desktopUrl);
    source.setAttribute("type", "image/webp");

    const image = document.createElement("img");
    image.setAttribute("src", desktopUrl);

    // Blank alt is a legitimate answer for decorative imagery,
    // so it stays empty rather than borrowing the title.
    image.setAttribute("alt", filled(altText) ? altText.trim() : "");

    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");

    picture.appendChild(source);
    picture.appendChild(image);

    return picture;

}


/* ---------------------------------------------------------
   STATES
--------------------------------------------------------- */

function showState(title, message) {

    const state = byId("projectState");
    const content = byId("projectContent");

    if (content) {
        content.hidden = true;
    }

    if (!state) {
        return;
    }

    const heading = byId("projectStateTitle");
    const body = byId("projectStateMessage");

    if (heading) {
        heading.textContent = title;
    }

    if (body) {
        body.textContent = message;
    }

    state.classList.add("is-visible");

}

function showNotFound() {

    showState(
        t("projectDetail.notFoundTitle"),
        t("projectDetail.notFoundMessage")
    );

}

/*
    Kept separate from "not found" on purpose: a failed request
    is an operational problem, and telling the visitor to try
    again is honest, where "not found" would not be.
*/

function showLoadError() {

    showState(
        t("projectDetail.loadErrorTitle"),
        t("projectDetail.loadErrorMessage")
    );

}


/* ---------------------------------------------------------
   RENDER — HEADER
--------------------------------------------------------- */

function renderHeader(project, language) {

    /*
        V1 reads "01 / UI UX DESIGN". The number is positional
        rather than stored, so it is left out unless the Project
        has a category to sit beside it.
    */

    const number = byId("projectNumber");
    const category = localizeField(project, "card_category", language);

    if (number) {

        number.textContent = filled(category)
            ? category.toUpperCase()
            : t("projectDetail.projectEyebrow");

    }

    /*
        The V1 heading is "Main text <span>Highlight</span>",
        where the span is only an accent colour. Both halves are
        written separately and the span is always kept so the
        structure the CSS targets never disappears.
    */

    const heading = byId("projectTitle");
    const highlight = byId("projectTitleHighlight");

    if (heading && highlight) {

        const titleMain = localizeField(project, "detail_title_main", language);
        const main = filled(titleMain)
            ? titleMain
            : localizeField(project, "title", language);

        replaceChildren(heading, [
            document.createTextNode(filled(main) ? `${main.trim()} ` : "")
        ]);

        heading.appendChild(highlight);

        const titleHighlight = localizeField(project, "detail_title_highlight", language);

        highlight.textContent = filled(titleHighlight)
            ? titleHighlight.trim()
            : "";

    }

    const intro = byId("projectIntro");

    if (intro) {

        const detailIntro = localizeField(project, "detail_intro", language);
        const shortDescription = localizeField(project, "short_description", language);

        if (filled(detailIntro)) {
            intro.textContent = detailIntro;
        }

        else if (filled(shortDescription)) {
            intro.textContent = shortDescription;
        }

        else {
            intro.hidden = true;
        }

    }

    renderMeta(project, language);

}

/*
    The three V1 meta slots are ROLE / YEAR / PROJECT TYPE. Each
    is built only when its column actually holds something, so a
    Project without a role does not ship an empty label.
*/

function renderMeta(project, language) {

    const meta = byId("projectMeta");

    if (!meta) {
        return;
    }

    const entries = [];

    const role = localizeField(project, "role", language);

    if (filled(role)) {
        entries.push([t("projectDetail.roleLabel"), role]);
    }

    if (filled(project.project_date)) {

        // Stored as a date; only the year is shown, matching V1.
        const year = project.project_date.slice(0, 4);

        if (/^\d{4}$/.test(year)) {
            entries.push([t("projectDetail.yearLabel"), year]);
        }

    }

    const projectType = localizeField(project, "project_type", language);

    if (filled(projectType)) {
        entries.push([t("projectDetail.typeLabel"), projectType]);
    }

    const nodes = entries.map(([label, value]) => {

        const item = document.createElement("div");
        item.className = "project-meta-item";

        const key = document.createElement("p");
        key.textContent = label;

        const text = document.createElement("span");
        text.textContent = value;

        item.appendChild(key);
        item.appendChild(text);

        return item;

    });

    replaceChildren(meta, nodes);

    meta.hidden = nodes.length === 0;

}


/* ---------------------------------------------------------
   RENDER — COVER
--------------------------------------------------------- */

function renderCover(project, language) {

    const cover = byId("projectCover");
    const section = byId("projectCoverSection");

    if (!cover) {
        return;
    }

    const picture = buildPicture(
        {
            bucket: project.cover_bucket,
            desktop: project.cover_desktop_path,
            mobile: project.cover_mobile_path
        },
        localizeField(project, "cover_alt", language)
    );

    if (!picture) {

        // No usable cover: the whole band goes rather than
        // leaving an empty grey placeholder above the copy.
        if (section) {
            section.hidden = true;
        }

        return;

    }

    replaceChildren(cover, [picture]);

}


/* ---------------------------------------------------------
   RENDER — ABOUT
--------------------------------------------------------- */

function renderParagraphs(project, language) {

    const container = byId("projectParagraphs");
    const aboutHeading = byId("projectAboutHeading");

    /*
        about_heading is the Project's own column. V1 shows a
        sentence here, but there is nothing to invent when the
        column is empty, so the element is dropped instead.
    */

    const heading = localizeField(project, "about_heading", language);

    if (aboutHeading) {

        if (filled(heading)) {
            aboutHeading.textContent = heading;
        }

        else {
            aboutHeading.hidden = true;
        }

    }

    if (!container) {
        return;
    }

    const nodes = sorted(project.project_paragraphs)
        .map(row => localizeField(row, "content", language))
        .filter(filled)
        .map(content => {

            const paragraph = document.createElement("p");
            paragraph.textContent = content;
            return paragraph;

        });

    replaceChildren(container, nodes);

}

function renderTechnologies(project) {

    const tools = byId("projectTools");
    const list = byId("projectToolList");

    if (!tools || !list) {
        return;
    }

    /*
        Tech Stack eligibility is deliberately not consulted: a
        Technology attached to a published Project belongs to that
        Project's record even when it is hidden from the About
        stack or has been disabled in the library.
    */

    const nodes = sorted(project.project_technologies)
        .map(relation => relation.technologies)
        .filter(technology => technology && filled(technology.name))
        .map(technology => {

            const pill = document.createElement("div");
            pill.className = "project-tool";

            /*
                An Iconify id stored by the Admin picker is used
                directly once it matches the pattern; a legacy bare
                key still resolves through TOOL_ICONS. Anything
                unrecognised leaves a text-only pill, which the
                existing flex/gap styling already collapses.
            */

            const key = typeof technology.icon_key === "string"
                ? technology.icon_key.trim()
                : "";

            const iconName = ICONIFY_ID_PATTERN.test(key)
                ? key
                : TOOL_ICONS[key];

            const iconUrl = iconName
                ? iconifyImageUrl(iconName)
                : null;

            if (iconUrl) {

                /*
                    An <img> rather than <iconify-icon>: a missing
                    icon reports failure and is simply removed,
                    leaving the text-only pill the layout already
                    handles, instead of an empty gap.
                */

                const image = document.createElement("img");
                image.className = "project-tool-icon";
                image.setAttribute("alt", "");
                image.setAttribute("aria-hidden", "true");
                image.setAttribute("loading", "lazy");
                image.setAttribute("decoding", "async");

                // Listener first: setting src can fail immediately
                // from cache, and a handler attached afterwards
                // would miss the event.
                image.addEventListener(
                    "error",
                    () => image.remove(),
                    { once: true }
                );

                image.setAttribute("src", iconUrl);

                pill.appendChild(image);

            }

            pill.appendChild(document.createTextNode(technology.name));

            return pill;

        });

    replaceChildren(list, nodes);

    tools.hidden = nodes.length === 0;

}

function renderLinks(project) {

    const container = byId("projectLinks");

    if (!container) {
        return;
    }

    const entries = [
        [t("projectDetail.viewDemo"), safeExternalUrl(project.demo_url), false],
        [t("projectDetail.github"), safeExternalUrl(project.github_url), true]
    ];

    const nodes = entries
        .filter(([, url]) => url !== null)
        .map(([label, url, secondary]) => {

            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");

            if (secondary) {
                link.className = "is-secondary";
            }

            link.textContent = label;

            return link;

        });

    replaceChildren(container, nodes);

    container.hidden = nodes.length === 0;

}


/* ---------------------------------------------------------
   RENDER — DOCUMENTATION
--------------------------------------------------------- */

/*
    V1 ships three items where the last one carries .is-large and
    spans both columns. The rule is derived from position rather
    than stored, so the CMS can never supply a class name:

        the final item is full width when the count is odd

    which reproduces V1 exactly and stops the two column grid
    from ever ending on a half empty row.
*/

function isLargeAt(index, total) {

    return index === total - 1 && total % 2 === 1;

}

function renderDocumentation(project, language) {

    const section = byId("projectDocumentation");
    const grid = byId("projectDocumentationGrid");

    if (!section || !grid) {
        return;
    }

    /*
        RLS already restricts this to active rows for published
        Projects; is_active is checked again here only so a
        future relaxation upstream cannot quietly publish
        retired documentation.
    */

    const rows = sorted(project.project_media).filter(
        row => row.is_active !== false
    );

    const items = [];

    rows.forEach(row => {

        const picture = buildPicture(
            {
                bucket: row.bucket_name,
                desktop: row.desktop_path,
                mobile: row.mobile_path
            },
            localizeField(row, "alt_text", language)
        );

        // A row pointing outside the public bucket is skipped
        // rather than rendered as an empty tile.
        if (!picture) {
            return;
        }

        const item = document.createElement("div");
        item.className = "project-documentation-item";
        item.appendChild(picture);

        items.push(item);

    });

    items.forEach((item, index) => {

        if (isLargeAt(index, items.length)) {
            item.classList.add("is-large");
        }

    });

    replaceChildren(grid, items);

    section.hidden = items.length === 0;

}


/* ---------------------------------------------------------
   RENDER — NEXT PROJECT
--------------------------------------------------------- */

function renderNext(currentSlug, ordered, language) {

    const link = byId("projectNextLink");
    const title = byId("projectNextTitle");

    if (!link || !title) {
        return;
    }

    const index = ordered.findIndex(row => row.slug === currentSlug);

    /*
        A single published Project has no distinct next, and
        linking a Project to itself would be a dead control, so
        the whole entry is dropped in that case.
    */

    if (index === -1 || ordered.length < 2) {
        link.hidden = true;
        return;
    }

    const next = ordered[(index + 1) % ordered.length];

    link.setAttribute("href", projectHref(next.slug));
    title.textContent = `${localizeField(next, "title", language)} →`;
    link.hidden = false;

}


/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */

/*
    The About band is a label, a heading, the paragraphs and the
    tools aside. With nothing to put in it the label would stand
    alone over empty space, so each half is hidden once it is
    empty and the whole band goes when both are.
*/

function settleAboutSection() {

    const section = byId("projectAboutSection");
    const text = byId("projectAboutText");
    const tools = byId("projectTools");
    const links = byId("projectLinks");
    const heading = byId("projectAboutHeading");
    const paragraphs = byId("projectParagraphs");

    if (!section || !text) {
        return;
    }

    const hasText =
        (heading && !heading.hidden) ||
        (paragraphs && paragraphs.children.length > 0) ||
        (links && !links.hidden);

    text.hidden = !hasText;

    const hasTools = tools && !tools.hidden;

    section.hidden = !hasText && !hasTools;

}

function render(project, ordered, language) {

    renderHeader(project, language);
    renderCover(project, language);
    renderParagraphs(project, language);
    renderTechnologies(project);
    renderLinks(project);
    settleAboutSection();
    renderDocumentation(project, language);
    renderNext(project.slug, ordered, language);

    const title = localizeField(project, "title", language);

    if (filled(title)) {
        document.title = `${title} — Rajendra Aria Nismara`;
    }

    const content = byId("projectContent");

    if (content) {
        content.hidden = false;
    }

}


/* ---------------------------------------------------------
   LOAD

   Two requests, fixed: the Project with its children embedded,
   and a slug/title list used only to work out what comes next.
   Neither grows with the amount of content on the page.
--------------------------------------------------------- */

const PROJECT_SELECT =
    "select=slug,title,card_category,short_description," +
    "detail_title_main,detail_title_highlight,detail_intro," +
    "role,project_date,project_type,about_heading," +
    "cover_bucket,cover_desktop_path,cover_mobile_path,cover_alt," +
    "github_url,demo_url,status,deleted_at,translations," +
    "project_paragraphs(content,sort_order,created_at,translations)," +
    "project_media(bucket_name,desktop_path,mobile_path,alt_text," +
    "sort_order,is_active,created_at,translations)," +
    "project_technologies(sort_order,created_at,technologies(name,icon_key))";

/*
    The loaded Project row and the sibling slug/title list, so a language
    switch can re-render from them instead of firing two more requests.
*/
let cachedProject = null;
let cachedOrdered = [];

async function load() {

    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");

    /*
        A missing or blank slug is not an error worth explaining:
        there is simply no Project being asked for, and the
        not-found state is the honest answer.
    */

    if (!filled(slug)) {
        showNotFound();
        return;
    }

    let projects;
    let ordered;

    /*
        Only the request itself is guarded. A failure here is
        operational and must not be reported as "not found",
        which is why the two outcomes are separated before any
        rendering happens.
    */

    try {

        const results = await Promise.all([
            readTable(
                "projects",
                `${PROJECT_SELECT}` +
                `&slug=eq.${encodeURIComponent(slug.trim())}` +
                "&status=eq.published&deleted_at=is.null&limit=1"
            ),
            readTable(
                "projects",
                "select=slug,title,sort_order,created_at,translations" +
                "&status=eq.published&deleted_at=is.null" +
                "&order=sort_order.asc,created_at.asc"
            )
        ]);

        projects = results[0];
        ordered = results[1];

    }

    catch (error) {

        warn("project detail unavailable", error);
        showLoadError();
        return;

    }

    const project = projects[0];

    /*
        Defence in depth against a relaxed policy upstream: the
        row is only rendered when it still says it is published.
    */

    if (
        !project ||
        project.status !== "published" ||
        project.deleted_at !== null
    ) {
        showNotFound();
        return;
    }

    cachedProject = project;
    cachedOrdered = Array.isArray(ordered) ? ordered : [];

    render(cachedProject, cachedOrdered, getLanguage());

}

onLanguageChange(language => {

    if (!cachedProject) {
        return;
    }

    render(cachedProject, cachedOrdered, language);

});


/* ---------------------------------------------------------
   START

   The document ships with every section either empty or hidden,
   so nothing flashes before the data lands: the page fills in
   rather than rearranging.
--------------------------------------------------------- */

load().catch(error => {

    warn("project detail failed", error);
    showLoadError();

});
