/*
  Storage helper for CMS media (Phase 6).

  Responsibility split (kept deliberately narrow):

    image-processor.js : File -> optimized WebP File
    media-storage.js   : optimized WebP File -> safe Storage object paths

  Nothing here resizes, decodes or re-encodes an image, and nothing in the
  image processor knows Supabase exists.

  SECURITY / CORRECTNESS
  ----------------------
  - Object paths are generated from crypto.randomUUID(); the user's filename is
    never the storage identity (ADMIN-CMS-SECURITY.md section 50).
  - Only the publishable key + the owner's aal2 JWT are used. There is no
    service-role path. Storage RLS is the authority; every helper below simply
    reports what the server decided.
  - The database stores bucket + object paths, never full public URLs
    (ADMIN-CMS-DATABASE.md section 9). publicUrl() derives a URL for display
    only and its result is never written back.
  - replaceMedia() implements the mandatory safe-replace ordering from
    ADMIN-CMS-SECURITY.md section 55: upload new, verify, commit database,
    verify, and only then delete the old objects. A failure at any step leaves
    the previously working media referenced and reachable.
*/

import { supabaseClient } from "./supabase.js";

export const MEDIA_BUCKET = "portfolio-media";

export class MediaStorageError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = "MediaStorageError";
    this.code = code || "STORAGE_FAILED";

    if (cause) {
      this.cause = cause;
    }
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback for older engines; still non-sequential and non-guessable enough
  // for a path segment. Identity/authorization never depends on this value.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function newMediaId() {
  return uuid();
}

/*
  Builds the object path pair for a directory.
  Both variants of one replacement share a UUID so they are obviously related.
*/
export function buildVariantPaths(directory) {
  const id = uuid();
  const dir = String(directory).replace(/^\/+|\/+$/g, "");

  return {
    id,
    desktopPath: `${dir}/${id}-desktop.webp`,
    mobilePath: `${dir}/${id}-mobile.webp`
  };
}

export function publicUrl(bucket, path) {
  if (!bucket || !path) {
    return null;
  }

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);

  return data ? data.publicUrl : null;
}

async function uploadObject(bucket, path, file) {
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .upload(path, file, {
      contentType: "image/webp",
      // Paths are UUID-based, so an existing object means something is wrong.
      upsert: false
    });

  if (error || !data || !data.path) {
    throw new MediaStorageError(
      "Could not upload the image. Your changes have not been saved.",
      "UPLOAD_FAILED",
      error
    );
  }

  return data.path;
}

/*
  Best-effort delete. Never throws: callers decide whether a failed cleanup is
  a hard error (it is not) or a warning (it is).
*/
export async function removeObjects(bucket, paths) {
  const targets = (paths || []).filter(Boolean);

  if (targets.length === 0) {
    return { removed: [], failed: [] };
  }

  try {
    const { error } = await supabaseClient.storage.from(bucket).remove(targets);

    if (error) {
      console.error(error);
      return { removed: [], failed: targets };
    }

    return { removed: targets, failed: [] };
  } catch (error) {
    console.error(error);
    return { removed: [], failed: targets };
  }
}

/*
  Confirms both freshly uploaded objects actually exist in the bucket listing
  rather than trusting the upload response alone.
*/
async function verifyUploads(bucket, directory, names) {
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .list(directory, { limit: 100 });

  if (error) {
    throw new MediaStorageError(
      "Could not verify the uploaded image. Your changes have not been saved.",
      "VERIFY_FAILED",
      error
    );
  }

  const present = new Set((data || []).map(entry => entry.name));
  const missing = names.filter(name => !present.has(name));

  if (missing.length > 0) {
    throw new MediaStorageError(
      "The uploaded image could not be confirmed. Your changes have not been saved.",
      "VERIFY_FAILED"
    );
  }
}

/*
  uploadVariantPair({ bucket, directory, desktopFile, mobileFile })

  Uploads the desktop object then the mobile object. If the second upload (or
  the verification) fails, the first object is removed again so a half-written
  pair never lingers.

  Resolves with { desktopPath, mobilePath }.
*/
export async function uploadVariantPair({
  bucket = MEDIA_BUCKET,
  directory,
  desktopFile,
  mobileFile
}) {
  const paths = buildVariantPaths(directory);
  const uploaded = [];

  try {
    await uploadObject(bucket, paths.desktopPath, desktopFile);
    uploaded.push(paths.desktopPath);

    await uploadObject(bucket, paths.mobilePath, mobileFile);
    uploaded.push(paths.mobilePath);

    const dir = paths.desktopPath.split("/").slice(0, -1).join("/");

    await verifyUploads(bucket, dir, [
      paths.desktopPath.split("/").pop(),
      paths.mobilePath.split("/").pop()
    ]);
  } catch (error) {
    // Partial upload rollback: remove whatever made it in.
    await removeObjects(bucket, uploaded);
    throw error;
  }

  return {
    id: paths.id,
    bucket,
    desktopPath: paths.desktopPath,
    mobilePath: paths.mobilePath
  };
}

/*
  replaceMedia({ bucket, directory, desktopFile, mobileFile, previous, commit })

  previous: { bucket, desktopPath, mobilePath } | null
  commit:   async ({ bucket, desktopPath, mobilePath }) => void
            Must throw if the database write did not apply.

  Order of operations (all failures leave the old media referenced):

    1. upload new desktop
    2. upload new mobile
    3. verify both exist            -> failure removes new objects
    4. commit database              -> failure removes new objects
    5. delete old objects           -> failure is only a warning

  Resolves with { paths, cleanupWarning }.
*/
export async function replaceMedia({
  bucket = MEDIA_BUCKET,
  directory,
  desktopFile,
  mobileFile,
  previous,
  commit
}) {
  const uploadedPaths = await uploadVariantPair({
    bucket,
    directory,
    desktopFile,
    mobileFile
  });

  try {
    await commit({
      bucket,
      desktopPath: uploadedPaths.desktopPath,
      mobilePath: uploadedPaths.mobilePath
    });
  } catch (error) {
    // Database did not accept the new references: undo the uploads so the
    // bucket does not accumulate objects nothing points at.
    await removeObjects(bucket, [
      uploadedPaths.desktopPath,
      uploadedPaths.mobilePath
    ]);

    throw error;
  }

  let cleanupWarning = null;

  if (previous && (previous.desktopPath || previous.mobilePath)) {
    const result = await removeObjects(previous.bucket || bucket, [
      previous.desktopPath,
      previous.mobilePath
    ]);

    if (result.failed.length > 0) {
      // The new content is live and correct; the old files simply linger.
      // Rolling the database back here would be strictly worse.
      cleanupWarning =
        "Saved. The previous image files could not be removed and may need manual cleanup.";
    }
  }

  return { paths: uploadedPaths, cleanupWarning };
}
