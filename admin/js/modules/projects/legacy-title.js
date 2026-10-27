// Prepared compatibility adapter. Pure functions; no database/network calls.
export function titleFieldsForSave(record, nextTitle) {
  // Existing rows retain both components byte-for-byte, including NULL/empty.
  // Changing the card title never implicitly canonicalizes a legacy detail title.
  if (record && ["detail_title_main", "detail_title_highlight"].some(key =>
    !Object.prototype.hasOwnProperty.call(record, key) || (record[key] !== null && typeof record[key] !== "string"))) {
    throw new Error("Legacy detail title fields must be loaded before saving");
  }
  if (record) return {
    detail_title_main: record.detail_title_main ?? null,
    detail_title_highlight: record.detail_title_highlight ?? null
  };
  return {detail_title_main: nextTitle ?? null, detail_title_highlight: null};
}
export function displayProjectTitle(record) {
  const text = value => typeof value === "string" ? value.trim() : "";
  return [record.detail_title_main, record.detail_title_highlight].map(text).filter(Boolean).join(" ") || text(record.title);
}
