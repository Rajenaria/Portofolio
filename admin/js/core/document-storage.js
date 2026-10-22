/*
  Certificate document storage (Phase D).

  Sibling of media-storage.js, deliberately separate: that module deals in
  responsive WebP PAIRS for the public image slots, this one deals in a single
  document object per certificate. Sharing one function would mean a parameter
  that switches between two unrelated shapes.

  It reuses media-storage's removeObjects() for failed uploads.

  SECURITY
  --------
  - Object paths are UUID-based; the owner's filename is never the storage
    identity.
  - Only the publishable key plus the owner's aal2 JWT are used. No
    service_role path exists. Storage RLS is the authority.
  - The database stores bucket + path; admin reads use authenticated Storage downloads.
  - replaceDocument() follows the mandatory ordering: upload new, verify,
    commit database, then read back the reference in the caller. Previous
    versions are retained for recovery and possible shared references.
*/

import { supabaseClient } from "./supabase.js";
import { removeObjects, MediaStorageError } from "./media-storage.js";
import { t } from "./i18n.js";
import { toast } from "./toast.js";

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

export function hasDocument(bucket, path) {
  return bucket === DOCUMENT_BUCKET && /^certificates\/[0-9a-f-]{36}\.(pdf|webp)$/i.test(path || "");
}

export async function openDocument(bucket, path, { download = false } = {}) {
  if (!hasDocument(bucket, path)) return false;
  const tab = download ? null : window.open("about:blank", "_blank");
  if (tab) { tab.opener = null; tab.document.body.textContent = t("common.loading"); }
  let url;
  try {
    const { data, error } = await supabaseClient.storage.from(bucket).download(path);
    if (error || !data) throw new Error("Document unavailable");
    url = URL.createObjectURL(data);
    if (download) {
      const link = document.createElement("a");
      link.href = url; link.download = `certificate.${path.split(".").pop()}`;
      document.body.appendChild(link); link.click(); link.remove();
    } else if (tab) { tab.location.replace(url); }
    else { throw new Error("Preview window unavailable"); }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    if (tab) tab.close();
    if (url) URL.revokeObjectURL(url);
    toast(t("doc.errAccess"), "error");
    return false;
  }
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

async function verifyUpload(path) {
  const { data, error } = await supabaseClient.storage.from(DOCUMENT_BUCKET).info(path);
  if (error || !data) throw new MediaStorageError(t("doc.errVerify"), "VERIFY_FAILED", error);
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

  Order (uncertain writes preserve both generations):

    1. upload new object
    2. verify it exists      -> failure removes the new object
    3. commit database       -> uncertain result retains both generations
    4. retain old object     -> reference-aware cleanup is a separate operation

  Resolves with { bucket, path, type, cleanupWarning }.
*/
export async function replaceDocument({ file, type, previous, commit }) {
  const path = `${DIRECTORY}/${uuid()}.${type}`;

  await uploadObject(path, file, type);

  try {
    await verifyUpload(path);
  } catch (error) {
    await removeObjects(DOCUMENT_BUCKET, [path]);
    throw error;
  }
  try {
    await commit({ bucket: DOCUMENT_BUCKET, path, type });
  } catch (error) {
    // The write may have committed even if its acknowledgement was lost.
    throw new MediaStorageError(t("doc.errUnconfirmed"), "COMMIT_UNCONFIRMED", error);
  }

  // Retain previous versions: another certificate may still reference the object.
  // Garbage collection needs an independent, explicitly authorized reference audit.
  return { bucket: DOCUMENT_BUCKET, path, type, cleanupWarning: null };
}
