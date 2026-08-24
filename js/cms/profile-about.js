/* =========================================================
   PUBLIC HERO + ABOUT CMS INTEGRATION  (Phase 9A)

   Patches the existing static Hero, About Me and Organization
   markup with CMS content. It never rebuilds those sections and
   never removes the static copy that ships in index.html, so a
   failed request simply leaves Portfolio V1 exactly as it was.

   ACTIVATION RULE
   ---------------
   Deterministic and derived from the data itself, not a flag:
   a section is "configured" when at least one of its own text
   fields actually holds content. A singleton row can exist while
   still being blank or half filled (it is created up front by the
   Admin CMS), and pushing those blanks onto the public page would
   erase real content. Once a section is configured, its child
   collection is treated as the truth, so an intentionally empty
   collection renders empty rather than restoring stale markup.

   Media is per item: a slot is only replaced when its row points
   at a real object in the public bucket.

   SAFETY
   ------
   Every CMS value is untrusted public input. Text is written with
   textContent and elements are built with createElement, so no CMS
   value can ever be parsed as markup.
========================================================= */

import {
    readTable,
    publicMediaUrl,
    filled,
    IS_LOCAL_CMS
} from "./client.js";

import { localizeField } from "./localize.js";
import { getLanguage, onLanguageChange } from "../core/i18n.js";


/* ---------------------------------------------------------
   MOBILE BREAKPOINT

   Matches the existing V1 <source media> contract exactly.
   It is read from the page rather than redeclared so the two
   can never drift apart.
--------------------------------------------------------- */

const FALLBACK_MEDIA_QUERY = "(max-width: 650px)";


/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */

function setText(element, value) {

    if (element && filled(value)) {
        element.textContent = value;
    }

}

/*
    Replaces the sources of an existing <picture> in place. The
    element itself, its classes and its position in the layout are
    left alone, so CSS and any hover/animation rules still apply.

    Returns false when the row is unusable, which leaves the
    current static image untouched.
*/

function patchPicture(picture, row, options = {}) {

    if (!picture) {
        return false;
    }

    const desktopUrl = publicMediaUrl(row.bucket_name, row.desktop_path);
    const mobileUrl = publicMediaUrl(row.bucket_name, row.mobile_path);

    // The desktop variant is the one <img> falls back to, so it is
    // required. A missing mobile variant just reuses it.
    if (!desktopUrl) {
        return false;
    }

    const image = picture.querySelector("img");

    if (!image) {
        return false;
    }

    const source = picture.querySelector("source");

    if (source) {
        source.setAttribute("srcset", mobileUrl || desktopUrl);
        source.setAttribute("type", "image/webp");
    }

    image.setAttribute("src", desktopUrl);

    /*
        Stored alt text is used literally. Blank is a legitimate
        answer for decorative imagery, so it becomes alt="" rather
        than a filename or the owner's name.
    */

    if (options.keepAlt !== true) {
        image.setAttribute(
            "alt",
            filled(row.alt_text) ? row.alt_text.trim() : ""
        );
    }

    return true;

}

/*
    Builds a fresh <picture> that mirrors the V1 responsive
    contract, for slots that currently have no image at all.
*/

function buildPicture(row, mediaQuery) {

    const desktopUrl = publicMediaUrl(row.bucket_name, row.desktop_path);
    const mobileUrl = publicMediaUrl(row.bucket_name, row.mobile_path);

    if (!desktopUrl) {
        return null;
    }

    const picture = document.createElement("picture");

    const source = document.createElement("source");
    source.setAttribute("media", mediaQuery);
    source.setAttribute("srcset", mobileUrl || desktopUrl);
    source.setAttribute("type", "image/webp");

    const image = document.createElement("img");
    image.setAttribute("src", desktopUrl);
    image.setAttribute(
        "alt",
        filled(row.alt_text) ? row.alt_text.trim() : ""
    );
    image.setAttribute("draggable", "false");
    image.setAttribute("decoding", "async");

    picture.appendChild(source);
    picture.appendChild(image);

    return picture;

}

/*
    V1 headings are "<h1>Main text <span>Highlight.</span></h1>",
    where the span is nothing but an accent colour. Both parts are
    rewritten in place and the span element is always kept, even
    when empty, so the structure CSS targets never disappears.
*/

function setHeading(heading, main, highlight) {

    if (!heading) {
        return;
    }

    const span = heading.querySelector("span");

    if (!span) {
        setText(heading, main);
        return;
    }

    if (filled(main) || filled(highlight)) {

        replaceChildren(heading, [
            document.createTextNode(filled(main) ? `${main.trim()} ` : "")
        ]);

        heading.appendChild(span);

    }

    if (filled(highlight)) {
        span.textContent = highlight.trim();
    }

    else if (filled(main)) {
        // Main text was supplied without a highlight, so the accent
        // simply has nothing to show.
        span.textContent = "";
    }

}

/*
    Reads the breakpoint already used by a reference <picture> so
    new markup cannot introduce a second breakpoint.
*/

function mediaQueryFrom(picture) {

    const source = picture ? picture.querySelector("source") : null;
    const value = source ? source.getAttribute("media") : null;

    return filled(value) ? value : FALLBACK_MEDIA_QUERY;

}

/*
    Replaces the children of a container with freshly built nodes.
    Used only for the collections whose V1 markup is a flat list of
    identical items.
*/

function replaceChildren(container, nodes) {

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    nodes.forEach(node => container.appendChild(node));

}

function warn(message, error) {

    if (IS_LOCAL_CMS) {
        console.warn(`[cms] ${message}`, error || "");
    }

}


/* ---------------------------------------------------------
   HERO
--------------------------------------------------------- */

function renderHeroText(profile, language) {

    const content = document.querySelector(".simple-hero-content");

    if (!content) {
        return;
    }

    /*
        V1 shows "Rajendra Aria" + accented "Nismara.". The CMS
        stores one name field, so the last word keeps the accent and
        the rest becomes the plain part. A single-word name leaves
        the accent span empty rather than removing it. The name is a
        proper noun and is never localized.
    */

    if (filled(profile.name)) {

        const words = profile.name.trim().split(/\s+/);
        const lastWord = words.length > 1 ? words.pop() : "";

        setHeading(
            content.querySelector("h1"),
            words.join(" "),
            lastWord
        );

    }

    setText(
        content.querySelector("h2"),
        localizeField(profile, "professional_title", language)
    );
    setText(
        content.querySelector(".simple-hero-description"),
        localizeField(profile, "hero_description", language)
    );

}

/*
    A hero slot is only usable once it satisfies the same responsive
    contract the public markup has always had: a desktop image that
    resolves inside the public bucket, plus a mobile variant. It is
    the same pair the RLS policy requires, checked again here so the
    renderer never depends on the API alone.

    Hidden slots never reach this function — the public SELECT policy
    filters them out server-side, so "absent from the response" and
    "hidden" are the same thing to the browser.
*/

function heroSlotIsUsable(row) {

    return Boolean(
        publicMediaUrl(row.bucket_name, row.desktop_path) &&
        filled(row.mobile_path)
    );

}

function renderHeroMedia(heroRows, language) {

    const stack = document.getElementById("heroPhotoStack");

    if (!stack) {
        return;
    }

    const cards = Array.from(stack.querySelectorAll(".hero-photo-card"));

    if (cards.length === 0) {
        return;
    }

    const referenceQuery = mediaQueryFrom(stack.querySelector("picture"));

    /*
        Slot n maps onto the card at index n-1. Slot numbers are
        identity, not position: if slot 2 is hidden and slot 3 is
        visible, slot 3 simply becomes the second rendered card.
    */

    const bySlot = new Map();

    heroRows.forEach(row => {

        const slot = Number(row.slot_number);

        if (!Number.isInteger(slot) || slot < 1 || slot > cards.length) {
            return;
        }

        if (row.is_visible === false) {
            return;
        }

        if (!heroSlotIsUsable(row)) {
            return;
        }

        bySlot.set(slot, row);

    });

    /*
        ACTIVATION KEY — SLOT 1.

        Taking over the Hero means deleting cards, so it may only
        happen when the CMS genuinely owns this section. Slot 1 is
        the primary photo and is the one slot that can never be
        hidden, so "slot 1 arrived and is fully configured" is a
        reliable signal that the Hero has really been set up.

        A merely successful request is NOT enough: production can
        hold half-filled hero_media rows, and treating those as
        authoritative would strip the static V1 photos off the page
        and leave an empty stack.
    */

    if (!bySlot.has(1)) {
        return;
    }

    let rendered = 0;

    cards.forEach((card, index) => {

        const row = bySlot.get(index + 1);

        /*
            Hidden or unconfigured optional slot: the card is removed
            outright. No empty shell, no placeholder plate, nothing
            occupying stack space.
        */

        if (!row) {
            card.remove();
            return;
        }

        const localizedRow = { ...row, alt_text: localizeField(row, "alt_text", language) };

        const existing = card.querySelector("picture");

        if (existing) {
            patchPicture(existing, localizedRow);
        }

        else {

            const picture = buildPicture(localizedRow, referenceQuery);

            if (!picture) {
                card.remove();
                return;
            }

            replaceChildren(card, [picture]);

        }

        card.classList.remove("hero-photo-card-placeholder");
        rendered += 1;

    });

    /*
        The stack controller captured its card list at DOMContentLoaded,
        before this module ran. Cards have just been removed, so it has
        to re-read the DOM, rebuild its ordering and drop the stale
        references. The hook is idempotent by design.
    */

    if (typeof window.refreshHeroPhotoStack === "function") {
        window.refreshHeroPhotoStack();
    }

    else if (rendered > 0) {
        // Controller unavailable (script blocked); keep the layout
        // honest so CSS still knows how many cards it is styling.
        stack.setAttribute("data-count", String(rendered));
    }

}


/* ---------------------------------------------------------
   ABOUT ME
--------------------------------------------------------- */

function aboutIsConfigured(profile) {

    return (
        filled(profile.about_heading_main) ||
        filled(profile.about_heading_highlight) ||
        filled(profile.about_lead) ||
        filled(profile.about_description)
    );

}

function renderAbout(profile, language) {

    const slide = document.querySelector(".about-slide-one");

    if (!slide) {
        return;
    }

    const content = slide.querySelector(".simple-about-content");

    if (content) {

        setHeading(
            content.querySelector("h2"),
            localizeField(profile, "about_heading_main", language),
            localizeField(profile, "about_heading_highlight", language)
        );

        setText(
            content.querySelector(".simple-about-lead"),
            localizeField(profile, "about_lead", language)
        );

        setText(
            content.querySelector(".simple-about-description"),
            localizeField(profile, "about_description", language)
        );

    }

    const picture = slide.querySelector(".simple-about-photo picture");

    if (picture) {
        patchPicture(picture, {
            bucket_name: profile.about_photo_bucket,
            desktop_path: profile.about_photo_desktop_path,
            mobile_path: profile.about_photo_mobile_path,
            alt_text: localizeField(profile, "about_photo_alt", language)
        });
    }

}

function renderInterests(interests, language) {

    const list = document.querySelector(".simple-about-interest-list");

    if (!list) {
        return;
    }

    /*
        The V1 item is a bare <span> styled by
        .simple-about-interest-list span, so the count is free to
        change without touching the design contract.
    */

    const nodes = interests.map(interest => {

        const span = document.createElement("span");
        span.textContent = localizeField(interest, "label", language);
        return span;

    });

    replaceChildren(list, nodes);

}


/* ---------------------------------------------------------
   ORGANIZATION
--------------------------------------------------------- */

function organizationIsConfigured(organization) {

    if (!organization) {
        return false;
    }

    return (
        filled(organization.heading_main) ||
        filled(organization.heading_highlight) ||
        filled(organization.paragraph_1) ||
        filled(organization.paragraph_2)
    );

}

function renderOrganizationText(organization, language) {

    const content = document.querySelector(".about-org-content");

    if (!content) {
        return;
    }

    setHeading(
        content.querySelector("h2"),
        localizeField(organization, "heading_main", language),
        localizeField(organization, "heading_highlight", language)
    );

    const paragraphs = content.querySelectorAll(".about-description");

    setText(paragraphs[0], localizeField(organization, "paragraph_1", language));
    setText(paragraphs[1], localizeField(organization, "paragraph_2", language));

}

function renderOrganizationSkills(skills, language) {

    const container = document.querySelector(".about-org-skills");

    if (!container) {
        return;
    }

    /*
        V1 item shape: <div><strong>title</strong><span>desc</span></div>
        styled by .about-org-skills > div. Rebuilt with the same shape.
    */

    const nodes = skills.map(skill => {

        const item = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = localizeField(skill, "title", language);

        const description = document.createElement("span");
        description.textContent = localizeField(skill, "description", language);

        item.appendChild(title);
        item.appendChild(description);

        return item;

    });

    replaceChildren(container, nodes);

}

function renderOrganizationGallery(gallery, language) {

    const track = document.getElementById("aboutOrgTrack");

    if (!track) {
        return false;
    }

    const referenceQuery = mediaQueryFrom(track.querySelector("picture"));

    const nodes = [];

    gallery.forEach(row => {

        const picture = buildPicture(
            { ...row, alt_text: localizeField(row, "alt_text", language) },
            referenceQuery
        );

        // A row pointing outside the public bucket is skipped rather
        // than rendered as a broken frame.
        if (!picture) {
            return;
        }

        const image = picture.querySelector("img");
        image.setAttribute("loading", "lazy");
        image.removeAttribute("draggable");

        const photo = document.createElement("div");
        photo.className = "about-org-photo";
        photo.appendChild(picture);

        nodes.push(photo);

    });

    /*
        The carousel needs at least one frame. If every row was
        rejected, the existing static gallery is kept instead of
        leaving an empty track behind.
    */

    if (nodes.length === 0 && gallery.length > 0) {
        return false;
    }

    replaceChildren(track, nodes);

    /*
        script.js built its dots and wrap logic from this track. It
        exposes one refresh entry point for exactly this case, which
        re-runs the existing dot builder and repositions the track.
        No listener, timer or clone is created here.
    */

    if (typeof window.refreshOrganizationGallery === "function") {
        window.refreshOrganizationGallery();
    }

    return true;

}


/* ---------------------------------------------------------
   LOAD

   One batched read per page. Every request is settled
   independently so a failing optional collection cannot discard
   the sections that did load.
--------------------------------------------------------- */

const ORDER = "order=sort_order.asc,created_at.asc";

/*
    The last Promise.allSettled results, so a language switch can re-run
    the same render dispatch against already-fetched data instead of
    firing six more requests.
*/
let cachedResults = null;

/*
    `reportProblems` is true only for the first render, straight after the
    fetch. A language switch re-runs this function against the SAME cached
    results, so without the flag every failed request would be logged again
    on every switch — twenty switches turned one real failure into twenty
    identical console warnings, which buries anything genuinely new.
*/
function renderFromResults(results, language, reportProblems) {

    const warnOnce = (message, reason) => {
        if (reportProblems) {
            warn(message, reason);
        }
    };

    const [
        profileResult,
        heroResult,
        interestsResult,
        organizationResult,
        skillsResult,
        galleryResult
    ] = results;

    /* ---- hero and about me ---- */

    if (profileResult.status === "fulfilled") {

        const profile = profileResult.value[0];

        if (profile) {

            renderHeroText(profile, language);

            if (aboutIsConfigured(profile)) {

                renderAbout(profile, language);

                // The About section owns the interests list, so its
                // configured state decides whether an empty list is
                // real CMS state or simply "not set up yet".
                if (interestsResult.status === "fulfilled") {
                    renderInterests(interestsResult.value, language);
                }

                else {
                    warnOnce("interests unavailable", interestsResult.reason);
                }

            }

            else {
                // About photo is independent of the About copy.
                renderAbout({
                    about_photo_bucket: profile.about_photo_bucket,
                    about_photo_desktop_path: profile.about_photo_desktop_path,
                    about_photo_mobile_path: profile.about_photo_mobile_path,
                    about_photo_alt: profile.about_photo_alt,
                    translations: profile.translations
                }, language);
            }

        }

    }

    else {
        warnOnce("profile_content unavailable", profileResult.reason);
    }

    /* ---- hero media ---- */

    if (heroResult.status === "fulfilled") {
        renderHeroMedia(heroResult.value, language);
    }

    else {
        warnOnce("hero_media unavailable", heroResult.reason);
    }

    /* ---- organization ---- */

    if (organizationResult.status === "fulfilled") {

        const organization = organizationResult.value[0];

        if (organizationIsConfigured(organization)) {

            renderOrganizationText(organization, language);

            if (skillsResult.status === "fulfilled") {
                renderOrganizationSkills(skillsResult.value, language);
            }

            else {
                warnOnce("organization skills unavailable", skillsResult.reason);
            }

            if (galleryResult.status === "fulfilled") {
                renderOrganizationGallery(galleryResult.value, language);
            }

            else {
                warnOnce("about gallery unavailable", galleryResult.reason);
            }

        }

    }

    else {
        warnOnce("about_organization unavailable", organizationResult.reason);
    }

}

async function load() {

    const results = await Promise.allSettled([
        readTable(
            "profile_content",
            "select=name,professional_title,hero_description," +
            "about_heading_main,about_heading_highlight,about_lead," +
            "about_description,about_photo_bucket,about_photo_desktop_path," +
            "about_photo_mobile_path,about_photo_alt,translations&limit=1"
        ),
        /*
            RLS is the authority on which slots are public; the
            is_visible filter and the column it selects are defence in
            depth, so a future policy change cannot quietly start
            publishing hidden photos. Same belt-and-braces the
            published-project read uses.
        */
        readTable(
            "hero_media",
            "select=slot_number,bucket_name,desktop_path,mobile_path," +
            "alt_text,is_visible,translations" +
            "&is_visible=is.true&order=slot_number.asc"
        ),
        readTable(
            "about_interests",
            `select=label,sort_order,translations&is_active=eq.true&${ORDER}`
        ),
        readTable(
            "about_organization",
            "select=heading_main,heading_highlight,paragraph_1,paragraph_2,translations&limit=1"
        ),
        readTable(
            "about_organization_skills",
            `select=title,description,sort_order,translations&is_active=eq.true&${ORDER}`
        ),
        readTable(
            "about_gallery",
            "select=bucket_name,desktop_path,mobile_path,alt_text,sort_order,translations" +
            `&is_active=eq.true&${ORDER}`
        )
    ]);

    cachedResults = results;

    renderFromResults(results, getLanguage(), true);

}

onLanguageChange(language => {

    if (!cachedResults) {
        return;
    }

    renderFromResults(cachedResults, language, false);

});


/* ---------------------------------------------------------
   START

   script.js and the stack/carousel controllers run first, from
   the end of the document. This module is a deferred module, so
   it always patches an already initialised page.
--------------------------------------------------------- */


/*
    Tells the initial loader this section has SETTLED — rendered
    from the CMS, or fallen back to the static markup. It runs from
    a finally, so a failed request releases the overlay just as a
    successful one does.
*/

load()
    .catch(error => warn("profile/about integration failed", error))
    .finally(() => {
        window.portfolioReady?.mark("hero");
        window.portfolioReady?.mark("about");
    });
