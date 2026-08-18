/*
  Certificate document input validation (Phase D).

  Turns a file the owner picked into one of exactly two safe stored shapes:

      application/pdf   the PDF as uploaded, after byte-level validation
      image/webp        re-encoded from JPG/PNG/WebP by image-processor.js

  Nothing else can leave this module. In particular an SVG — which is markup
  and would be a stored-XSS vector on the storage origin — matches neither
  branch and is rejected.

  WHY BYTES, NOT EXTENSION OR MIME
  --------------------------------
  `File.type` is supplied by the browser from the file extension and is
  trivially wrong or spoofed, so it is treated as a hint only. A PDF must
  start with the %PDF- signature, and an image must survive
  createImageBitmap() inside the shared processor. Both are properties of the
  actual bytes.

  This module performs no network I/O.
*/

import {
  processImage,
  ACCEPTED_MIME_TYPES as IMAGE_MIME_TYPES
} from "./image-processor.js";

const MEGABYTE = 1024 * 1024;

/* Matches the portfolio-documents bucket limit; the bucket enforces it again
   server-side, so a tampered client only gets a rejected upload. */
export const MAX_DOCUMENT_BYTES = 10 * MEGABYTE;

export const PDF_MIME_TYPE = "application/pdf";
export const WEBP_MIME_TYPE = "image/webp";

/* Longest edge for a scanned certificate. Generous enough that text stays
   readable when opened full screen, bounded enough to stay well under the
   bucket limit. */
const DOCUMENT_MAX_DIMENSION = 2400;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

const MESSAGES = {
  NO_FILE: "Choose a certificate file first.",
  TOO_LARGE: "This file is larger than 10 MB.",
  UNSUPPORTED:
    "Only PDF, JPG, PNG or WebP certificates are supported.",
  NOT_A_PDF:
    "This file is not a real PDF. It may be corrupted, or renamed from another format.",
  EMPTY: "This file is empty."
};

export class DocumentProcessorError extends Error {
  constructor(code, cause) {
    super(MESSAGES[code] || MESSAGES.UNSUPPORTED);
    this.name = "DocumentProcessorError";
    this.code = code;

    if (cause) {
      this.cause = cause;
    }
  }
}

function extensionOf(name) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

async function looksLikePdf(file) {
  const head = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());

  return (
    head.length === PDF_SIGNATURE.length &&
    PDF_SIGNATURE.every((byte, index) => head[index] === byte)
  );
}

/*
  Resolves with:

    { file, type: 'pdf' | 'webp', originalName, originalSize, storedSize,
      width, height }

  `file` is what should be uploaded. For a PDF it is the original bytes; for
  an image it is freshly encoded canvas output, so EXIF/GPS metadata is gone
  as a side effect.
*/
export async function processDocument(file, options = {}) {
  if (!file) {
    throw new DocumentProcessorError("NO_FILE");
  }

  if (file.size === 0) {
    throw new DocumentProcessorError("EMPTY");
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentProcessorError("TOO_LARGE");
  }

  const type = String(file.type || "").toLowerCase();
  const extension = extensionOf(file.name);
  const claimsPdf = type === PDF_MIME_TYPE || extension === "pdf";

  if (claimsPdf) {
    if (!(await looksLikePdf(file))) {
      throw new DocumentProcessorError("NOT_A_PDF");
    }

    /*
      Re-wrapped so the uploaded object carries the correct content type
      regardless of what the browser guessed, and so the stored filename is
      never the user's.
    */
    const normalised = new File([file], "document.pdf", { type: PDF_MIME_TYPE });

    return {
      file: normalised,
      type: "pdf",
      originalName: file.name,
      originalSize: file.size,
      storedSize: normalised.size
    };
  }

  const looksLikeImage =
    IMAGE_MIME_TYPES.includes(type) ||
    ["jpg", "jpeg", "png", "webp"].includes(extension);

  if (!looksLikeImage) {
    throw new DocumentProcessorError("UNSUPPORTED");
  }

  /*
    The shared image processor is the real gate here: it checks MIME and
    extension, then requires the bytes to decode through createImageBitmap(),
    bounds the pixel count, and returns freshly encoded WebP. An SVG or a
    renamed executable fails at the decode step.
  */
  const result = await processImage(file, {
    maxDimension: options.maxDimension || DOCUMENT_MAX_DIMENSION,
    signal: options.signal
  });

  return {
    file: result.optimized.file,
    type: "webp",
    originalName: file.name,
    originalSize: file.size,
    storedSize: result.optimized.size,
    width: result.optimized.width,
    height: result.optimized.height
  };
}
