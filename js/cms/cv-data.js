// Public metadata only. Storage bucket/path and server credentials never enter this module.
export const CV_COLUMNS = "cv_version,cv_filename,cv_size_bytes,cv_updated_at";
export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const CV_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validCvFilename(value) {
    return typeof value === "string" && value.length >= 5 && value.length <= 180 && value.trim() === value &&
        value.toLowerCase().endsWith(".pdf") && !value.includes("/") && !value.includes(String.fromCharCode(92)) &&
        !Array.from(value).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
}
export function cvMetadata(row) {
    if (!row) throw new Error("CV metadata unavailable");
    const result = Object.fromEntries(CV_COLUMNS.split(",").map(key => [key, row[key]]));
    if (Object.values(result).every(value => value === null)) return result;
    if (!CV_UUID.test(result.cv_version || "") || !validCvFilename(result.cv_filename) ||
        !Number.isInteger(result.cv_size_bytes) || result.cv_size_bytes < 1 || result.cv_size_bytes > MAX_CV_BYTES ||
        typeof result.cv_updated_at !== "string" || !Number.isFinite(Date.parse(result.cv_updated_at))) {
        throw new Error("Invalid CV metadata");
    }
    return result;
}
export function missingCvSchema(error) {
    return ["42703", "PGRST204"].includes(error?.code) && /cv_(version|filename|size_bytes|updated_at)/.test(error?.message || "");
}
