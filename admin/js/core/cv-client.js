import { supabaseClient } from "./supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { processDocument } from "./document-processor.js";
import { MAX_CV_BYTES, validCvFilename, cvMetadata } from "../../../js/cms/cv-data.js";

export class CvClientError extends Error {
  constructor(code, ambiguous = false) { super(code); this.code = code; this.ambiguous = ambiguous; }
}
export async function validateCvFile(file) {
  if (!file || !validCvFilename(file.name) || file.type.toLowerCase() !== "application/pdf" ||
      file.size < 1 || file.size > MAX_CV_BYTES) throw new CvClientError("INVALID_FILE");
  try { await processDocument(file); } catch { throw new CvClientError("INVALID_FILE"); }
  return file;
}
export async function requestCv({ file, version, previous, signal } = {}) {
  const auth = await supabaseClient.auth.getSession();
  const token = auth.data?.session?.access_token;
  if (auth.error || !token) throw new CvClientError("FORBIDDEN");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const headers = { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY };
    if (file) Object.assign(headers, { "Content-Type": "application/pdf", "X-CV-Version": version,
      "X-CV-Previous": previous || "none", "X-CV-Filename": encodeURIComponent(file.name) });
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-cv`, {
      method: file ? "POST" : "GET", headers, ...(file ? { body: file } : {}), cache: "no-store", signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CvClientError(data?.code || "UNCONFIRMED", response.status >= 500);
    try { return cvMetadata(data); } catch { throw new CvClientError("UNCONFIRMED", true); }
  } catch (error) {
    if (error instanceof CvClientError) throw error;
    throw new CvClientError("UNCONFIRMED", true);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
