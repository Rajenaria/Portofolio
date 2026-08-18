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

const ICON_MAP = {
    python: { kind: "devicon", cls: "devicon-python-plain colored" },
    c: { kind: "devicon", cls: "devicon-c-plain colored" },
    cpp: { kind: "devicon", cls: "devicon-cplusplus-plain colored" },
    javascript: { kind: "devicon", cls: "devicon-javascript-plain colored" },
    html5: { kind: "devicon", cls: "devicon-html5-plain colored" },
    css3: { kind: "devicon", cls: "devicon-css3-plain colored" },
    nodejs: { kind: "devicon", cls: "devicon-nodejs-plain colored" },
    react: { kind: "devicon", cls: "devicon-react-original colored" },
    opencv: { kind: "devicon", cls: "devicon-opencv-plain colored" },
    yolov8: {
        kind: "iconify",
        cls: "tech-iconify tech-yolo",
        icon: "simple-icons:ultralytics"
    },
    arduino: { kind: "devicon", cls: "devicon-arduino-plain colored" },
    stm32: {
        kind: "text",
        cls: "tech-custom-icon tech-stm-icon",
        text: "STM"
    },
    iot: {
        kind: "image",
        cls: "tech-local-icon",
        src: "assets/images/branding/iot.png",
        alt: "IoT"
    },
    mysql: { kind: "devicon", cls: "devicon-mysql-plain colored" },
    git: { kind: "devicon", cls: "devicon-git-plain colored" },
    github: { kind: "devicon", cls: "devicon-github-original" },
    docker: { kind: "devicon", cls: "devicon-docker-plain colored" },
    vscode: { kind: "devicon", cls: "devicon-vscode-plain colored" },
    figma: { kind: "devicon", cls: "devicon-figma-plain colored" },
    photoshop: { kind: "devicon", cls: "devicon-photoshop-plain colored" },
    illustrator: { kind: "devicon", cls: "devicon-illustrator-plain colored" },
    canva: { kind: "devicon", cls: "devicon-canva-original colored" }
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
    Builds the icon element for one technology row.

    Two supported shapes, both identifier-only:

      - an Iconify id, handed to <iconify-icon> after matching the
        pattern above. Iconify fetches and renders the SVG itself;
        this module never touches SVG markup.
      - a legacy bare key from before the picker existed, resolved
        through the static ICON_MAP.

    Anything else, including an unknown or malformed value, falls
    back to the safe initials chip rather than rendering nothing.
*/

function buildIcon(row) {

    const key = typeof row.icon_key === "string" ? row.icon_key.trim() : "";

    const iconUrl = iconifyImageUrl(key);

    if (iconUrl) {

        /*
            A plain <img> rather than the <iconify-icon> element:
            an image reports failure, so an id that is well formed
            but names an icon that does not exist can be swapped
            for the initials chip instead of leaving an empty box.
            The technology name stays visible beside it, so the
            image itself is decorative.
        */

        const image = document.createElement("img");
        image.className = "tech-local-icon";
        image.setAttribute("alt", "");
        image.setAttribute("aria-hidden", "true");
        image.setAttribute("loading", "lazy");
        image.setAttribute("decoding", "async");

        // Listener first: setting src can fail immediately from
        // cache, and a handler attached afterwards would miss it.
        image.addEventListener(
            "error",
            () => image.replaceWith(initialsChip(row.name)),
            { once: true }
        );

        image.setAttribute("src", iconUrl);

        return image;

    }

    const entry = key !== "" ? ICON_MAP[key] : undefined;

    if (!entry) {

        return initialsChip(row.name);

    }

    switch (entry.kind) {

        case "devicon": {
            const icon = document.createElement("i");
            icon.className = entry.cls;
            return icon;
        }

        case "iconify": {
            const icon = document.createElement("iconify-icon");
            icon.className = entry.cls;
            icon.setAttribute("icon", entry.icon);
            return icon;
        }

        case "image": {
            const image = document.createElement("img");
            image.className = entry.cls;
            image.setAttribute("src", entry.src);
            image.setAttribute("alt", entry.alt);
            image.setAttribute("loading", "lazy");
            image.setAttribute("decoding", "async");
            return image;
        }

        case "text": {
            const box = document.createElement("div");
            box.className = entry.cls;
            box.textContent = entry.text;
            return box;
        }

        default: {
            const fallback = document.createElement("div");
            fallback.className = "tech-custom-icon";
            fallback.textContent = initialsFor(row.name);
            return fallback;
        }

    }

}

function buildItem(row) {

    const item = document.createElement("div");
    item.className = "tech-item";

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

load().catch(error => warn("technologies unavailable", error));
