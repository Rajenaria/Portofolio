/*
  Reusable client-side image processor (CMS Phase 5).

  Pure logic: no DOM rendering, no CMS knowledge, no Supabase. It takes a File
  the owner picked and returns an optimised WebP File plus the numbers the UI
  needs to explain what happened.

  WHY CLIENT-SIDE
  ---------------
  The project is zero-spend, so there is no server-side image pipeline. All
  resizing and re-encoding happens in the Admin browser before anything is ever
  uploaded (docs/Features/005-ADMIN-DASHBOARD-CMS-V2.md section 25).

  SECURITY
  --------
  This module implements the upload-input half of
  docs/Security/ADMIN-CMS-SECURITY.md sections 45-49:

    - extension AND MIME are checked, but neither is trusted on its own; the
      real gate is that the bytes must survive createImageBitmap();
    - input size, axis length and total pixel count are bounded before and
      after decode to avoid decompression-bomb style memory blowups;
    - the original bytes are never returned for upload. Only freshly encoded
      canvas output leaves this module, which drops EXIF/GPS metadata as a
      side effect;
    - the returned filename is sanitised, and it is NOT the storage identity.
      The upload layer will generate UUID paths later.

  This module performs no network I/O of any kind.
*/

const MEGABYTE = 1024 * 1024;

export const MAX_INPUT_BYTES = 15 * MEGABYTE;
export const MAX_OUTPUT_BYTES = 5 * MEGABYTE;
export const MAX_AXIS_PIXELS = 12000;
export const MAX_TOTAL_PIXELS = 50000000;

export const ACCEPTED_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export const ACCEPTED_EXTENSIONS = Object.freeze([
  "jpg",
  "jpeg",
  "png",
  "webp"
]);

export const OUTPUT_MIME_TYPE = "image/webp";

/*
  Quality ladder for the output size cap.

  The first encode uses the requested quality. If the result is over the hard
  limit the quality steps down by QUALITY_STEP until MIN_QUALITY. The ladder is
  finite by construction, so this can never spin: worst case it runs
  ceil((quality - MIN_QUALITY) / QUALITY_STEP) + 1 encodes and then fails
  loudly rather than returning an oversized object.
*/
export const DEFAULT_QUALITY = 0.82;
export const MIN_QUALITY = 0.5;
export const QUALITY_STEP = 0.06;

export const DEFAULT_MAX_DIMENSION = 2000;

/*
  Presets are deliberately thin: a name plus the two knobs that matter.
  CMS-specific behaviour belongs to the calling module, not here.
*/
export const IMAGE_PRESETS = Object.freeze({
  standard: Object.freeze({
    maxDimension: DEFAULT_MAX_DIMENSION,
    quality: DEFAULT_QUALITY
  }),
  compact: Object.freeze({
    maxDimension: 1200,
    quality: DEFAULT_QUALITY
  })
});

const ERROR_MESSAGES = {
  NO_FILE: "Choose an image file first.",
  FILE_TOO_LARGE: "This image is larger than 15 MB.",
  UNSUPPORTED_TYPE: "Only JPG, PNG or WebP images are supported.",
  DECODE_FAILED:
    "This file could not be read as an image. It may be corrupted or not a real image.",
  DIMENSIONS_TOO_LARGE:
    "This image is too large to process. Each side must be 12,000 pixels or less.",
  PIXELS_TOO_LARGE:
    "This image has too many pixels to process safely. The limit is 50 megapixels.",
  ENCODE_FAILED: "This image could not be converted to WebP. Please try another file.",
  OUTPUT_TOO_LARGE:
    "This image is still larger than 5 MB after optimization. Please use a smaller image.",
  ABORTED: "Image processing was cancelled."
};

/*
  Typed error so callers can branch on `code` while showing `message` directly.
  The message is always safe to render: no stack traces, no browser internals.
*/
export class ImageProcessorError extends Error {
  constructor(code, cause) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.DECODE_FAILED);

    this.name = "ImageProcessorError";
    this.code = code;

    if (cause) {
      this.cause = cause;
    }
  }
}

export function isAbortError(error) {
  return Boolean(
    error && (error.code === "ABORTED" || error.name === "AbortError")
  );
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw new ImageProcessorError("ABORTED");
  }
}

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

/*
  Turns any user filename into a safe, predictable .webp basename.

  "My Photo (final).JPG"        -> "my-photo-final.webp"
  "<script>alert(1)</script>.jpg" -> "script-alert-1-script.webp"

  This is cosmetic only. It is never used as a storage path: the upload layer
  generates UUID paths (ADMIN-CMS-SECURITY.md section 50).
*/
export function toSafeWebpName(name) {
  const raw = String(name || "");
  const withoutExtension = raw.replace(/\.[^.]*$/, "");

  const slug = withoutExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return `${slug || "image"}.webp`;
}

/*
  Scale to fit inside maxDimension while preserving the aspect ratio.

  Never upscales: if the source already fits, its dimensions are returned
  unchanged (Features doc section 25, "Never upscale").
*/
export function computeTargetSize(width, height, maxDimension) {
  const longestSide = Math.max(width, height);

  if (!maxDimension || longestSide <= maxDimension) {
    return { width, height, scaled: false };
  }

  const ratio = maxDimension / longestSide;

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true
  };
}

function validateInput(file) {
  if (!file || typeof file.size !== "number") {
    throw new ImageProcessorError("NO_FILE");
  }

  // Size is checked first: rejecting here avoids an expensive decode.
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageProcessorError("FILE_TOO_LARGE");
  }

  if (file.size === 0) {
    throw new ImageProcessorError("DECODE_FAILED");
  }

  const type = String(file.type || "").toLowerCase();

  if (!ACCEPTED_MIME_TYPES.includes(type)) {
    throw new ImageProcessorError("UNSUPPORTED_TYPE");
  }

  // Extension is a secondary signal only; it must not contradict the MIME type.
  const extension = extensionOf(file.name);

  if (extension && !ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new ImageProcessorError("UNSUPPORTED_TYPE");
  }

  return { type, extension };
}

async function decode(file, signal) {
  let bitmap;

  try {
    /*
      createImageBitmap is the real content check: a renamed .txt, an SVG or a
      truncated JPEG all fail here regardless of what the MIME type claimed.

      imageOrientation: "from-image" applies EXIF orientation during decode, so
      portrait photos from phones come out upright without an EXIF parser.
      Older engines ignore the option rather than throwing.
    */
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new ImageProcessorError("DECODE_FAILED", error);
  }

  try {
    throwIfAborted(signal);

    if (
      bitmap.width > MAX_AXIS_PIXELS ||
      bitmap.height > MAX_AXIS_PIXELS
    ) {
      throw new ImageProcessorError("DIMENSIONS_TOO_LARGE");
    }

    if (bitmap.width * bitmap.height > MAX_TOTAL_PIXELS) {
      throw new ImageProcessorError("PIXELS_TOO_LARGE");
    }
  } catch (error) {
    // Never leave a rejected bitmap resident in memory.
    bitmap.close();
    throw error;
  }

  return bitmap;
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") {
    return { canvas: new OffscreenCanvas(width, height), offscreen: true };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  return { canvas, offscreen: false };
}

async function encode(canvas, offscreen, quality) {
  if (offscreen) {
    return await canvas.convertToBlob({
      type: OUTPUT_MIME_TYPE,
      quality
    });
  }

  return await new Promise(resolve => {
    canvas.toBlob(resolve, OUTPUT_MIME_TYPE, quality);
  });
}

function releaseCanvas(canvas) {
  // Dropping the backing store immediately rather than waiting for GC.
  canvas.width = 0;
  canvas.height = 0;
}

/*
  processImage(file, options)

  options:
    maxDimension  longest output side in px (default 2000). No upscaling.
    quality       initial WebP quality 0-1 (default 0.82)
    minQuality    lower bound of the size-reduction ladder (default 0.5)
    maxOutputBytes hard cap on the produced object (default 5 MB)
    signal        AbortSignal; aborting rejects with code "ABORTED"
    preset        name from IMAGE_PRESETS, overridden by explicit options

  Resolves with:
    {
      original:  { file, name, type, size, width, height },
      optimized: { blob, file, name, type, size, width, height, quality },
      savings:   { bytes, percent },
      scaled:    boolean
    }

  Rejects with ImageProcessorError.
*/
export async function processImage(file, options = {}) {
  const preset =
    (options.preset && IMAGE_PRESETS[options.preset]) || IMAGE_PRESETS.standard;

  const maxDimension = options.maxDimension || preset.maxDimension;
  const startQuality = clampQuality(
    options.quality === undefined ? preset.quality : options.quality
  );
  const minQuality = clampQuality(
    options.minQuality === undefined ? MIN_QUALITY : options.minQuality
  );
  const maxOutputBytes = options.maxOutputBytes || MAX_OUTPUT_BYTES;
  const signal = options.signal;

  throwIfAborted(signal);

  const { type } = validateInput(file);

  throwIfAborted(signal);

  const bitmap = await decode(file, signal);

  const target = computeTargetSize(bitmap.width, bitmap.height, maxDimension);

  const original = {
    file,
    name: file.name || "",
    type,
    size: file.size,
    width: bitmap.width,
    height: bitmap.height
  };

  const { canvas, offscreen } = createCanvas(target.width, target.height);

  let blob = null;
  let usedQuality = startQuality;

  try {
    const context = canvas.getContext("2d", { alpha: true });

    if (!context) {
      throw new ImageProcessorError("ENCODE_FAILED");
    }

    /*
      No background fill: WebP keeps the alpha channel, so a transparent PNG
      stays transparent instead of gaining a white box.
    */
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    throwIfAborted(signal);

    // Bounded quality ladder; see the constants block above.
    for (
      let quality = startQuality;
      quality >= minQuality - 0.0001;
      quality -= QUALITY_STEP
    ) {
      throwIfAborted(signal);

      usedQuality = Math.round(quality * 100) / 100;

      const candidate = await encode(canvas, offscreen, usedQuality);

      if (!candidate) {
        throw new ImageProcessorError("ENCODE_FAILED");
      }

      blob = candidate;

      if (blob.size <= maxOutputBytes) {
        break;
      }
    }

    if (!blob) {
      throw new ImageProcessorError("ENCODE_FAILED");
    }

    if (blob.size > maxOutputBytes) {
      // Never hand back an object that breaks the storage contract.
      throw new ImageProcessorError("OUTPUT_TOO_LARGE");
    }
  } finally {
    bitmap.close();
    releaseCanvas(canvas);
  }

  throwIfAborted(signal);

  const name = toSafeWebpName(file.name);

  const optimizedFile = new File([blob], name, {
    type: OUTPUT_MIME_TYPE,
    lastModified: Date.now()
  });

  const savedBytes = Math.max(0, original.size - blob.size);

  return {
    original,
    optimized: {
      blob,
      file: optimizedFile,
      name,
      type: OUTPUT_MIME_TYPE,
      size: blob.size,
      width: target.width,
      height: target.height,
      quality: usedQuality
    },
    savings: {
      bytes: savedBytes,
      percent: original.size > 0 ? (savedBytes / original.size) * 100 : 0
    },
    scaled: target.scaled
  };
}

function clampQuality(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_QUALITY;
  }

  return Math.min(1, Math.max(0.1, numeric));
}

/* ------------------------------------------------------------------ */
/* Formatting helpers (shared by any UI that reports results)          */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < MEGABYTE) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / MEGABYTE).toFixed(2)} MB`;
}

export function formatDimensions(width, height) {
  return `${width} × ${height}`;
}

export function formatPercent(percent) {
  const value = Number(percent) || 0;
  return `${value.toFixed(1)}%`;
}
