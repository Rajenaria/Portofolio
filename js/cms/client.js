/* =========================================================
   PUBLIC CMS CLIENT  (Phase 9A)

   Read-only access to the public Portfolio CMS tables.

   WHY A SEPARATE CLIENT
   ---------------------
   js/guestbook.js owns its own hardcoded endpoint and does its
   own fetch calls. It is deliberately left untouched, so this
   module keeps the same dependency-free fetch style instead of
   pulling a Supabase SDK onto the public page.

   CREDENTIALS
   -----------
   Publishable (anon) key only. Never a service-role or secret
   key: everything here is guarded by the public SELECT policies
   and this module never writes.
========================================================= */

/* ---------------------------------------------------------
   ENVIRONMENT

   Opening the site locally must read the local Supabase stack;
   anything else uses the deployed project.
--------------------------------------------------------- */

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "0.0.0.0", "[::1]", ""];

const LOCAL = {
    url: "http://127.0.0.1:54321",
    key: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
};

const PRODUCTION = {
    url: "https://hldacuppejztqzqaejsi.supabase.co",
    key: "sb_publishable_B_Fq0qQhLmbz_MtxI8rFqA_S8MY1OuO"
};

function resolveEnvironment() {

    /*
        `file://` reports an empty hostname, which is still a
        local preview and must not reach production.
    */

    const host = window.location.hostname;

    return LOCAL_HOSTS.includes(host) ? LOCAL : PRODUCTION;

}

const ENVIRONMENT = resolveEnvironment();

export const CMS_URL = ENVIRONMENT.url;

export const IS_LOCAL_CMS = ENVIRONMENT === LOCAL;


/* ---------------------------------------------------------
   PUBLIC MEDIA

   Only this bucket is public. A row pointing anywhere else
   (portfolio-staging above all) is ignored rather than exposed.
--------------------------------------------------------- */

export const PUBLIC_BUCKET = "portfolio-media";

/*
    Certificate documents live in their own public bucket. It is the only
    other bucket the public site may read from; portfolio-staging is private
    and must never be linked.
*/

export const PUBLIC_DOCUMENT_BUCKET = "portfolio-documents";

/*
    The database stores a bucket plus an object path, never a
    full URL, so the address is always derived here. Anything
    that looks like a caller-supplied absolute URL, a protocol
    relative URL or a traversal attempt is rejected instead of
    being turned into a live image source.
*/

function buildPublicUrl(allowedBucket, bucket, path) {

    if (bucket !== allowedBucket) {
        return null;
    }

    if (typeof path !== "string") {
        return null;
    }

    const clean = path.trim();

    if (clean === "") {
        return null;
    }

    if (clean.includes("..") || clean.startsWith("/")) {
        return null;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
        return null;
    }

    const encoded = clean
        .split("/")
        .map(encodeURIComponent)
        .join("/");

    return `${CMS_URL}/storage/v1/object/public/${allowedBucket}/${encoded}`;

}

export function publicMediaUrl(bucket, path) {

    return buildPublicUrl(PUBLIC_BUCKET, bucket, path);

}

export function publicDocumentUrl(bucket, path) {

    return buildPublicUrl(PUBLIC_DOCUMENT_BUCKET, bucket, path);

}

/*
    Certificates may instead point at a page the issuer hosts. Only absolute
    http(s) is accepted: javascript:, data:, vbscript: and protocol-relative
    //host all fail, so a stored value can never become an executable href.
*/

export function safeExternalUrl(value) {

    if (typeof value !== "string" || value.trim() === "") {
        return null;
    }

    try {

        const url = new URL(value.trim());

        return url.protocol === "https:" || url.protocol === "http:"
            ? url.href
            : null;

    } catch (error) {
        return null;
    }

}


/* ---------------------------------------------------------
   READ

   `query` is a PostgREST query string, for example:
   "select=id,label&is_active=eq.true&order=sort_order.asc"
--------------------------------------------------------- */

const REQUEST_TIMEOUT_MS = 8000;

export async function readTable(table, query) {

    const controller = new AbortController();

    const timer = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS
    );

    try {

        const response = await fetch(
            `${CMS_URL}/rest/v1/${table}?${query}`,
            {
                method: "GET",
                headers: {
                    apikey: ENVIRONMENT.key,
                    Authorization: `Bearer ${ENVIRONMENT.key}`,
                    Accept: "application/json"
                },
                signal: controller.signal
            }
        );

        if (!response.ok) {
            throw new Error(
                `${table}: ${response.status} ${response.statusText}`
            );
        }

        const rows = await response.json();

        return Array.isArray(rows) ? rows : [];

    }

    finally {

        window.clearTimeout(timer);

    }

}


/* ---------------------------------------------------------
   VALUE HELPERS
--------------------------------------------------------- */

/*
    The CMS stores unset singleton fields as NULL, but earlier
    saves could also leave an empty string behind. Both mean
    "not configured" and must keep the static V1 copy.
*/

export function filled(value) {

    return typeof value === "string" && value.trim() !== "";

}
