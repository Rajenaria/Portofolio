/*
  Certificate document storage (Phase D).

  Sibling of media-storage.js, deliberately separate: that module deals in
  responsive WebP PAIRS for the public image slots, this one deals in a single
  document object per certificate. Sharing one function would mean a parameter
  that switches between two unrelated shapes.

  It reuses media-storage's publicUrl() and removeObjects() rather than
  reimplementing them.

  SECURITY
  --------
  - Object paths are UUID-based; the owner's filename is never the storage
    identity.
  - Only the publishable key plus the owner's aal2 JWT are used. No
    service_role path exists. Storage RLS is the authority.
  - The database stores bucket + path, never a full URL. publicUrl() derives
    an address for display only.
  - replaceDocument() follows the mandatory ordering: upload new, verify,
    commit database, and only then delete the old object. Every failure leaves
    the previously working document referenced and reachable.
*/

import { supabaseClient } from "./supabase.js";
import { publicUrl, removeObjects, MediaStorageError } from "./media-storage.js";
import { t } from "./i18n.js";

export const DOCUMENT_BUCKET = "portfolio-documents";

const DIRECTORY = "certificates";

const CONTENT_TYPES = {
  pdf: "application/pdf",
  webp: "image/webp"
};

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function documentUrl(bucket, path) {
  if (bucket !== DOCUMENT_BUCKET) {
    return null;
  }

  return publicUrl(bucket, path);
}

/*
  Supabase Storage serves a public object inline. Appending ?download turns it
  into an attachment, which is what a Download action wants — the HTML
  `download` attribute is ignored cross-origin.
*/
export function documentDownloadUrl(bucket, path) {
  const url = documentUrl(bucket, path);
  return url ? `${url}?download` : null;
}

async function uploadObject(path, file, type) {
  const { data, error } = await supabaseClient.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, file, {
      contentType: CONTENT_TYPES[type],
      // Paths are UUID-based, so a collision means something is wrong.
      upsert: false
    });

  if (error || !data || !data.path) {
    throw new MediaStorageError(
      t("doc.errUpload"),
      "UPLOAD_FAILED",
      error
    );
  }

  return data.path;
}

/* Confirms the object is really in the bucket listing, not merely that the
   upload call returned without an error. */
async function verifyUpload(path) {
  const name = path.split("/").pop();

  const { data, error } = await supabaseClient.storage
    .from(DOCUMENT_BUCKET)
    .list(DIRECTORY, { limit: 100, search: name });

  if (error) {
    throw new MediaStorageError(
      t("doc.errVerify"),
      "VERIFY_FAILED",
      error
    );
  }

  if (!(data || []).some(entry => entry.name === name)) {
    throw new MediaStorageError(
      t("doc.errConfirm"),
      "VERIFY_FAILED"
    );
  }
}

export async function removeDocument(bucket, path) {
  if (!bucket || !path) {
    return { removed: [], failed: [] };
  }

  return await removeObjects(bucket, [path]);
}

/*
  replaceDocument({ file, type, previous, commit })

  previous: { bucket, path } | null
  commit:   async ({ bucket, path, type }) => void   must throw if the
            database write did not apply.

  Order (every failure leaves the old document referenced):

    1. upload new object
    2. verify it exists      -> failure removes the new object
    3. commit database       -> failure removes the new object
    4. delete old object     -> failure is only a warning

  Resolves with { bucket, path, type, cleanupWarning }.
*/
export async function replaceDocument({ file, type, previous, commit }) {
  const path = `${DIRECTORY}/${uuid()}.${type}`;

  await uploadObject(path, file, type);

  try {
    await verifyUpload(path);
    await commit({ bucket: DOCUMENT_BUCKET, path, type });
  } catch (error) {
    // Database never accepted the new reference: do not leave an object
    // nothing points at.
    await removeObjects(DOCUMENT_BUCKET, [path]);
    throw error;
  }

  let cleanupWarning = null;

  if (previous && previous.path && previous.path !== path) {
    const result = await removeDocument(previous.bucket || DOCUMENT_BUCKET, previous.path);

    if (result.failed.length > 0) {
      // The new document is live and correct; the old file simply lingers.
      // Rolling the database back here would be strictly worse.
      cleanupWarning =
        t("doc.cleanupWarning");
    }
  }

  return { bucket: DOCUMENT_BUCKET, path, type, cleanupWarning };
}
