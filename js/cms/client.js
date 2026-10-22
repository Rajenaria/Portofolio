/* =========================================================
   PUBLIC CMS CLIENT  (Phase 9A)

   Read-only access to the public Portfolio CMS tables.

   WHY A SEPARATE CLIENT
   ---------------------
   Public CMS and guestbook share the explicit deployment contract, while
   keeping their existing dependency-free fetch and request/data contracts.

   CREDENTIALS
   -----------
   Publishable (anon) key only. Never a service-role or secret
   key: everything here is guarded by the public SELECT policies
   and this module never writes.
========================================================= */

import '../environment-config.js';
import '../environment.js';

const environmentStatus = globalThis.PortfolioEnvironment.status();
const ENVIRONMENT = environmentStatus.config;
export const CMS_URL = ENVIRONMENT?.url || '';
export const IS_LOCAL_CMS = ['local', 'fixture'].includes(ENVIRONMENT?.environment);
function requireEnvironment() {
    return globalThis.PortfolioEnvironment.requireEnvironment(ENVIRONMENT || {});
}

// M09 snapshot reads. Only a confirmed missing RPC permits the legacy adapter.
export async function readProjectRpc(args = {}) {
    requireEnvironment();
    const response = await fetch(`${CMS_URL}/rest/v1/rpc/project_catalog`, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
        headers: { apikey: ENVIRONMENT.key, Authorization: `Bearer ${ENVIRONMENT.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(args)
    });
    const data = await response.json();
    if (!response.ok) {
        const error = new Error("Project catalog unavailable");
        error.code = data?.code === "PGRST202" ? "LEGACY_SCHEMA" : "UNAVAILABLE";
        throw error;
    }
    if (!Array.isArray(data)) throw new Error("Invalid project catalog");
    return data;
}


/* ---------------------------------------------------------
   PUBLIC MEDIA

   Only this bucket is public. A row pointing anywhere else
   (portfolio-staging above all) is ignored rather than exposed.
--------------------------------------------------------- */

export const PUBLIC_BUCKET = "portfolio-media";

/*
    Certificate documents live in a private bucket and are delivered by a
    status-checking Edge Function; portfolio-staging remains private
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
    if (!environmentStatus.ok) return null;

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

export function publicDocumentUrl(bucket, path, certificateId) {
    if (!environmentStatus.ok) return null;
    if (bucket !== PUBLIC_DOCUMENT_BUCKET || !path ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certificateId || "")) return null;
    return `${CMS_URL}/functions/v1/certificate-document?id=${encodeURIComponent(certificateId)}`;
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

export async function readTable(table, query, { cache } = {}) {
    requireEnvironment();

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
                ...(cache ? { cache } : {}),
                headers: {
                    apikey: ENVIRONMENT.key,
                    Authorization: `Bearer ${ENVIRONMENT.key}`,
                    Accept: "application/json"
                },
                signal: controller.signal
            }
        );

        if (!response.ok) {
            const detail = await response.json().catch(() => ({}));
            const error = new Error(`${table}: ${response.status} ${response.statusText}`);
            if (["42703", "PGRST204"].includes(detail?.code) && /\bpublished_revision_id\b/.test(detail?.message || "")) {
                error.code = "LEGACY_PROJECT_SCHEMA";
            }
            // Only expose the compatibility signal; do not log backend payloads.
            if (["42703", "PGRST204"].includes(detail?.code) &&
                /\bcover_(?:fit|position_x|position_y)\b/.test(detail?.message || "")) {
                error.code = detail.code;
                error.message = "projects: missing cover_fit/cover_position_x/cover_position_y";
            }
            if (["42703", "PGRST204"].includes(detail?.code) &&
                /cv_(version|filename|size_bytes|updated_at)/.test(detail?.message || "")) {
                error.code = detail.code;
                error.message = "profile: missing cv_version/cv_filename/cv_size_bytes/cv_updated_at";
            }
            throw error;
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
