/* =========================================================
   PUBLIC ABOUT TECH STACK CMS INTEGRATION  (Phase 9B2)

   Patches the existing static Tech Stack slide (About slide 3)
   with `public.technologies`. It never rebuilds the slide, the
   category shells or the About slider itself, so a failed
   request simply leaves Portfolio V1 exactly as it was.

   ACTIVATION RULE
   ---------------
   Read only. Once the request succeeds, the CMS is authoritative
   for technology ITEMS: a group with zero eligible rows is
   cleared rather than left showing stale static entries. The
   three category shells (heading + list container) are never
   added or removed, so the About slider's slide count, dots and
   transform math never change.

   SAFETY
   ------
   Every technology row is untrusted public input. Names are
   written with textContent; icons are chosen from a static local
   whitelist keyed by icon_key, never rendered from the database
   value itself. There is no innerHTML path here.
========================================================= */

import { readTable, filled, IS_LOCAL_CMS } from "./client.js";


/* ---------------------------------------------------------
   PUBLIC GROUP CONTRACT

   Exactly these three groups, in this display order. A row with
   any other public_group value is ignored.
--------------------------------------------------------- */

const PUBLIC_GROUPS = [
    "languages",
    "development_systems",
    "tools_platforms"
];


/* ---------------------------------------------------------
   ICON WHITELIST

   Maps a known icon_key to markup this module already trusts:
   the devicon/iconify classes and local asset already used by
   the static V1 markup. icon_key only ever selects a key into
   this table, it is never written into a class, attribute or
   src itself.
--------------------------------------------------------- */

/*
    LEGACY KEY NORMALISATION

    Rows created before the Iconify picker store a bare key such as
    "docker" or "react.js". Each maps to a modern Iconify id here, so
    every icon — legacy or newly picked — travels the same rendering
    path and looks identical.

    devicon is chosen because it ships real brand colours. simple-icons
    is deliberately avoided: its artwork uses currentColor with no
    palette, which renders solid black inside an <img>.

    Punctuation is stripped before lookup, so "react.js", "React JS"
    and "reactjs" all resolve.
*/

const LEGACY_ICON_IDS = {
    python: "devicon:python",
    c: "devicon:c",
    cpp: "devicon:cplusplus",
    cplusplus: "devicon:cplusplus",
    javascript: "devicon:javascript",
    typescript: "devicon:typescript",
    html5: "devicon:html5",
    html: "devicon:html5",
    css3: "devicon:css3",
    css: "devicon:css3",
    nodejs: "devicon:nodejs",
    react: "devicon:react",
    reactjs: "devicon:react",
    nextjs: "devicon:nextjs",
    opencv: "devicon:opencv",
    arduino: "devicon:arduino",
    mysql: "devicon:mysql",
    git: "devicon:git",
    github: "devicon:github",
    docker: "devicon:docker",
    vscode: "devicon:vscode",
    figma: "devicon:figma",
    photoshop: "devicon:photoshop",
    illustrator: "devicon:illustrator",
    canva: "devicon:canva",
    linkedin: "devicon:linkedin",
    tailwindcss: "devicon:tailwindcss",
    supabase: "devicon:supabase",
    yolov8: "simple-icons:ultralytics"
};

/*
    The one legacy key with no icon in any collection: a local asset
    that still ships with the site.
*/

const LEGACY_LOCAL_IMAGES = {
    iot: { src: "assets/images/branding/iot.png", alt: "IoT" }
};

/*
    Legacy keys drawn as a lettered chip rather than artwork, matching
    the static V1 markup exactly. The class is a fixed literal from
    this table, never a value from the database.
*/

const LEGACY_TEXT_CHIPS = {
    stm32: { cls: "tech-custom-icon tech-stm-icon", text: "STM" }
};



/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function warn(message, error) {

    if (IS_LOCAL_CMS) {
        console.warn(`[cms] ${message}`, error || "");
    }

}

/*
    Same shape as the safe "initials" fallback already used by
    the Admin technologies table: two letters, uppercase, never
    more than what the name itself provides.
*/

function initialsFor(name) {

    const words = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return "?";
    }

    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return (words[0][0] + words[1][0]).toUpperCase();

}

/*
    An Iconify id, "collection:name", is what the Admin icon picker
    now stores. The pattern is deliberately narrow: lowercase
    segments and a single colon, so a stored value can only ever
    name an icon. It cannot carry markup, a scheme, a path
    traversal or whitespace.
*/

const ICONIFY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*:[a-z0-9]+(-[a-z0-9]+)*$/;

const ICONIFY_API = "https://api.iconify.design";

/*
    Turns a validated identifier into the Iconify SVG endpoint.

    The URL is assembled only from an id that already matched the
    pattern above, and each segment is encoded, so the address can
    never be steered somewhere else. The SVG is loaded as an image
    and is never fetched as text or injected as markup.
*/

function iconifyImageUrl(iconId) {

    if (!ICONIFY_ID_PATTERN.test(iconId)) {
        return null;
    }

    const [prefix, name] = iconId.split(":");

    return `${ICONIFY_API}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;

}

function initialsChip(name) {

    const chip = document.createElement("div");
    chip.className = "tech-custom-icon";
    chip.textContent = initialsFor(name);
    return chip;

}

/*
    Resolves any stored value to a single Iconify id.

    Accepted shapes, all identifier-only:

      - an Iconify id written by the picker ("devicon:react");
      - a legacy bare key ("docker", "react.js"), normalised by
        stripping punctuation and looked up in LEGACY_ICON_IDS.

    Returns null when nothing matches, which is the only route to
    the initials fallback.
*/

function resolveIconId(rawKey) {

    const key = typeof rawKey === "string" ? rawKey.trim() : "";

    if (key === "") {
        return null;
    }

    if (ICONIFY_ID_PATTERN.test(key)) {
        return key;
    }

    const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    return LEGACY_ICON_IDS[normalised] || null;

}

/*
    Builds the icon for one technology row.

    Every icon takes the same path — an <img> pointing at the
    Iconify SVG endpoint — so sizing, alignment and optical weight
    are identical whatever the source. Sizing lives in CSS as a
    fixed box with object-fit: contain, which normalises the
    footprint without stretching artwork that is not square.

    The image is decorative: the technology name is rendered as
    visible text beside it, so alt is empty rather than repeating
    the label to a screen reader.

    An <img> also reports failure, so an id that is well formed but
    names no real icon degrades to the initials chip instead of
    leaving an empty box.
*/

function buildIcon(row) {

    const key = typeof row.icon_key === "string" ? row.icon_key.trim() : "";
    const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    const chip = LEGACY_TEXT_CHIPS[normalised];

    if (chip) {

        const box = document.createElement("div");
        box.className = chip.cls;
        box.textContent = chip.text;
        return box;

    }

    const local = LEGACY_LOCAL_IMAGES[normalised];

    if (local) {

        const image = document.createElement("img");
        image.className = "tech-icon-img";
        image.setAttribute("src", local.src);
        image.setAttribute("alt", "");
        image.setAttribute("aria-hidden", "true");
        image.setAttribute("loading", "lazy");
        image.setAttribute("decoding", "async");
        return image;

    }

    const iconId = resolveIconId(key);
    const iconUrl = iconId ? iconifyImageUrl(iconId) : null;

    if (!iconUrl) {
        return initialsChip(row.name);
    }

    const image = document.createElement("img");
    image.className = "tech-icon-img";
    image.setAttribute("alt", "");
    image.setAttribute("aria-hidden", "true");
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");

    // Listener first: setting src can fail immediately from cache,
    // and a handler attached afterwards would miss the event.
    image.addEventListener(
        "error",
        () => image.replaceWith(initialsChip(row.name)),
        { once: true }
    );

    image.setAttribute("src", iconUrl);

    return image;

}

/*
    Icon + name, exactly the shape of the static V1 tile this
    module replaces: the same .tech-item element, the same icon
    slot, the same <span> label. The extra .tech-item-cms class
    carries nothing but icon sizing, since a CMS icon arrives as an
    <img> where the static markup used an icon font.

    The name is untrusted public input and is written with
    textContent, never as markup.
*/

function buildItem(row) {

    const item = document.createElement("div");
    item.className = "tech-item tech-item-cms";

    item.appendChild(buildIcon(row));

    const label = document.createElement("span");
    label.textContent = row.name;
    item.appendChild(label);

    return item;

}

function replaceChildren(container, nodes) {

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    nodes.forEach(node => container.appendChild(node));

}


/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */

function renderTechStack(rows) {

    const slide = document.querySelector(".about-slide-three");

    if (!slide) {
        return;
    }

    // Rows already arrive ordered by sort_order/created_at, so a
    // simple filter per group keeps that relative order intact.
    PUBLIC_GROUPS.forEach(group => {

        const list = slide.querySelector(
            `.tech-list[data-tech-group="${group}"]`
        );

        if (!list) {
            return;
        }

        const items = rows
            .filter(row => row.public_group === group && filled(row.name))
            .map(buildItem);

        replaceChildren(list, items);

    });

}


/* ---------------------------------------------------------
   LOAD

   One request. The public contract is enforced client-side too,
   independent of what the current RLS policy happens to allow
   through: is_active, show_in_public_stack and a real
   public_group are all required before a row can render.
--------------------------------------------------------- */

async function load() {

    const rows = await readTable(
        "technologies",
        "select=name,icon_key,public_group,sort_order,created_at," +
        "is_active,show_in_public_stack" +
        "&is_active=eq.true&show_in_public_stack=eq.true" +
        "&public_group=not.is.null" +
        "&order=sort_order.asc,created_at.asc"
    );

    const eligible = rows.filter(row =>
        row.is_active === true &&
        row.show_in_public_stack === true &&
        PUBLIC_GROUPS.includes(row.public_group)
    );

    renderTechStack(eligible);

}


/* ---------------------------------------------------------
   START

   script.js builds the About slider from the slides already in
   the document before this deferred module runs, so patching
   item content here never touches slide count, dots or track
   math.
--------------------------------------------------------- */


/*
    Tells the initial loader this section has SETTLED — rendered
    from the CMS, or fallen back to the static markup. It runs from
    a finally, so a failed request releases the overlay just as a
    successful one does.
*/

load()
    .catch(error => warn("technologies unavailable", error))
    .finally(() => window.portfolioReady?.mark("technologies"));
