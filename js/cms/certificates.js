/* =========================================================
   PUBLIC CERTIFICATES CMS INTEGRATION  (Phase E)

   Replaces the static CERTIFICATES array in js/certificates.js
   with published rows from the CMS. Only the DATA changes: the
   3D carousel, its geometry, drag handling, flip logic and the
   proportional fade all stay exactly as js/certificates.js
   built them.

   ACTIVATION RULE
   ---------------
   The carousel needs at least three cards to read as a
   carousel, so the rule has a floor as well as a source:

       request fails            -> keep the static V1 cards
       succeeds, 0-2 published  -> keep the static V1 cards
       succeeds, 3+ published   -> the CMS list is authoritative

   The two sets are never merged. A successful read either
   replaces the whole array or changes nothing, so a card can
   never appear twice.

   SAFETY
   ------
   Every value is untrusted public input. Text reaches the DOM
   through the existing createElement/textContent renderer. The
   icon is looked up from a frozen table by category key, never
   taken from the database. A document link may only resolve
   inside the public documents bucket, and an external link must
   parse as absolute http(s) — anything else leaves the card
   with no call to action rather than a live bad href.
========================================================= */

import {
    readTable,
    publicDocumentUrl,
    safeExternalUrl,
    filled,
    IS_LOCAL_CMS
} from "./client.js";

import { localizeField } from "./localize.js";
import { getLanguage, onLanguageChange } from "../core/i18n.js";


/* ---------------------------------------------------------
   CATEGORY -> TRUSTED ICON

   Keys are the contract shared with
   certificates_category_check in the database and with
   admin/js/modules/certificates/categories.js. Labels live in
   the Admin; the public card only needs the glyph.

   The public page loads the <iconify-icon> element from
   code.iconify.design, which is already allowed by the CSP, so
   these are passed as plain icon names exactly like the static
   array did.
--------------------------------------------------------- */

const CATEGORY_ICONS = Object.freeze({
    education: "tabler:school",
    course: "tabler:certificate",
    professional: "tabler:certificate-2",
    language: "tabler:language",
    copyright: "tabler:file-certificate",
    competition: "tabler:trophy",
    award: "tabler:award",
    research: "tabler:file-text",
    organization: "tabler:users",
    internship: "tabler:briefcase",
    cybersecurity: "tabler:shield-lock",
    networking: "tabler:network",
    programming: "tabler:code",
    other: "tabler:certificate"
});

const DEFAULT_ICON = CATEGORY_ICONS.other;

/* An unrecognised key — a category retired after this row was
   written, or anything unexpected — resolves to the neutral
   icon instead of leaving an empty box. */
function iconFor(category) {

    return Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, category)
        ? CATEGORY_ICONS[category]
        : DEFAULT_ICON;

}


const MINIMUM_PUBLISHED = 3;


function warn(message, error) {

    if (IS_LOCAL_CMS) {
        console.warn(`[cms] ${message}`, error || "");
    }

}


/* ---------------------------------------------------------
   VIEW CERTIFICATE

   Priority: the uploaded document first, the issuer's own page
   second, nothing third. A row whose document reference points
   anywhere other than the public documents bucket is treated as
   having no document at all.
--------------------------------------------------------- */

function certificateLink(row) {

    const document = publicDocumentUrl(row.document_bucket, row.document_path);

    if (document) {
        return document;
    }

    return safeExternalUrl(row.external_url) || "";

}


/* ---------------------------------------------------------
   MAPPING

   Produces exactly the shape js/certificates.js already
   renders, so the carousel needs no knowledge of the CMS.

   Optional fields become empty strings rather than "null":
   the renderer writes year, publisher and subtitle
   unconditionally (an empty one simply renders empty) and
   skips the badge, description and call to action entirely
   when they are blank.
--------------------------------------------------------- */

function toCard(row, language) {

    const subtitle = localizeField(row, "issuer_line", language);
    const badge = localizeField(row, "badge_text", language);
    const description = localizeField(row, "description", language);

    return {
        id: row.id,
        icon: iconFor(row.category),
        year: filled(row.period) ? row.period.trim() : "",
        title: localizeField(row, "title", language).trim(),
        publisher: filled(row.publisher) ? row.publisher.trim() : "",
        subtitle: filled(subtitle) ? subtitle.trim() : "",
        badge: filled(badge) ? badge.trim() : "",
        description: filled(description) ? description.trim() : "",
        link: certificateLink(row)
    };

}


/* ---------------------------------------------------------
   LOAD

   RLS is the authority on what is public; the status filters
   are defence in depth, and the columns they test are selected
   so the second check reads real values rather than undefined.
--------------------------------------------------------- */

/*
    The last published rows fetched, so a language switch can re-render the
    carousel from them instead of firing a second request.
*/
let cachedPublished = null;

async function load() {

    const rows = await readTable(
        "certificates",
        "select=id,title,publisher,period,category,issuer_line,badge_text," +
        "description,document_bucket,document_path,document_type,external_url," +
        "status,deleted_at,sort_order,created_at,translations" +
        "&status=eq.published&deleted_at=is.null" +
        "&order=sort_order.asc,created_at.asc"
    );

    const published = rows.filter(row =>
        row.status === "published" &&
        row.deleted_at === null &&
        filled(row.title)
    );

    /*
        Below the floor the CMS is still being set up, so the
        static cards stay. Rebuilding with one or two rows would
        replace a working carousel with a degenerate one.
    */

    if (published.length < MINIMUM_PUBLISHED) {

        warn(
            `certificates: ${published.length} published, ` +
            `keeping the static set (minimum ${MINIMUM_PUBLISHED})`
        );

        return;

    }

    const controller = window.certificatesCarousel;

    if (!controller || typeof controller.rebuild !== "function") {
        warn("certificates carousel controller unavailable");
        return;
    }

    cachedPublished = published;

    /*
        rebuild() validates the list before it destroys anything,
        so a rejected payload leaves the existing carousel intact.
        It also tears down its previous instance — listeners,
        timers, pending frames, cards and dots — before building,
        which is what keeps repeated calls from accumulating.
    */

    controller.rebuild(published.map(row => toCard(row, getLanguage())));

}


onLanguageChange(language => {

    const controller = window.certificatesCarousel;

    if (!cachedPublished || !controller || typeof controller.rebuild !== "function") {
        return;
    }

    controller.rebuild(cachedPublished.map(row => toCard(row, language)));

});


/* ---------------------------------------------------------
   START

   js/certificates.js runs from the end of the document and has
   already built the static carousel by the time this deferred
   module executes, so the controller is always in place.
--------------------------------------------------------- */


/*
    Tells the initial loader this section has SETTLED — rendered
    from the CMS, or fallen back to the static markup. It runs from
    a finally, so a failed request releases the overlay just as a
    successful one does.
*/

load()
    .catch(error => warn("certificates unavailable", error))
    .finally(() => window.portfolioReady?.mark("certificates"));
