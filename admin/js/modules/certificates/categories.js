/*
  Certificate categories and their trusted icons.

  WHY THE ICON IS NOT STORED
  --------------------------
  The database keeps a category key and nothing else. The glyph on the card is
  looked up here, from a frozen table, so no SVG, no markup, no URL and no
  free-form Iconify id can ever reach a renderer through stored data. The
  owner picks a MEANING; the application picks the artwork.

  This is deliberately stricter than the Technologies picker, which stores
  validated Iconify ids because brand coverage needs open search. Fourteen
  fixed concepts need no such thing.

  KEYS ARE THE CONTRACT
  ---------------------
  The keys below must stay identical to certificates_category_check in
  20260818110000_certificates_schema.sql. Labels are display text, now
  resolved through i18n as certCategory.<key>, and may be reworded freely in
  either language; keys may not. If the two ever drift, the database rejects
  the write loudly rather than storing something the renderer cannot resolve.

  The icon ids are Iconify `tabler:*` names — the same collection the public
  certificate section already uses.

  TWO RENDERERS, ON PURPOSE
  -------------------------
  The public page loads the <iconify-icon> web component from
  code.iconify.design and renders `tabler:school` directly. The Admin does
  NOT: its Content-Security-Policy is `script-src 'self'`, it loads no third
  party script, and it draws icons as <img> pointing at the Iconify SVG
  endpoint — exactly what the Technologies manager already does, and why
  api.iconify.design is already present in the Admin img-src.

  So this module exposes the id (for the future public renderer) and an <img>
  builder (for the Admin). No CSP change is required for either.
*/

import { t } from "../../core/i18n.js";

/*
  The `label` on each entry is the English fallback that ships with the table.
  Display text comes from certCategory.<key> so the picker, the table column
  and the preview all follow the interface language.
*/
export const CERTIFICATE_CATEGORIES = Object.freeze([
  Object.freeze({ key: "education",     label: "Education / Degree",             icon: "tabler:school" }),
  Object.freeze({ key: "course",        label: "Course / Training",              icon: "tabler:certificate" }),
  Object.freeze({ key: "professional",  label: "Professional Certification",     icon: "tabler:certificate-2" }),
  Object.freeze({ key: "language",      label: "Language",                       icon: "tabler:language" }),
  Object.freeze({ key: "copyright",     label: "Copyright / Intellectual Property", icon: "tabler:file-certificate" }),
  Object.freeze({ key: "competition",   label: "Competition",                    icon: "tabler:trophy" }),
  Object.freeze({ key: "award",         label: "Award / Achievement",            icon: "tabler:award" }),
  Object.freeze({ key: "research",      label: "Research / Publication",         icon: "tabler:file-text" }),
  Object.freeze({ key: "organization",  label: "Organization / Leadership",      icon: "tabler:users" }),
  Object.freeze({ key: "internship",    label: "Internship / Work",              icon: "tabler:briefcase" }),
  Object.freeze({ key: "cybersecurity", label: "Cybersecurity",                  icon: "tabler:shield-lock" }),
  Object.freeze({ key: "networking",    label: "Networking",                     icon: "tabler:network" }),
  Object.freeze({ key: "programming",   label: "Programming / Development",      icon: "tabler:code" }),
  Object.freeze({ key: "other",         label: "Other",                          icon: "tabler:certificate" })
]);

export const DEFAULT_CATEGORY = "other";

const BY_KEY = new Map(CERTIFICATE_CATEGORIES.map(entry => [entry.key, entry]));

/*
  Always returns a usable entry. An unrecognised key — a row written before a
  category was retired, or anything unexpected — resolves to "other" rather
  than rendering an empty box or, worse, being passed through verbatim.
*/
export function categoryEntry(key) {
  return BY_KEY.get(key) || BY_KEY.get(DEFAULT_CATEGORY);
}

export function categoryLabel(key) {
  const entry = categoryEntry(key);
  const translated = t(`certCategory.${entry.key}`);

  /* t() echoes the key back when a string is missing; fall back to the frozen
     English label rather than showing "certCategory.course" in the UI. */
  return translated === `certCategory.${entry.key}` ? entry.label : translated;
}

export function categoryIcon(key) {
  return categoryEntry(key).icon;
}

export function isKnownCategory(key) {
  return BY_KEY.has(key);
}

/* Shape the select field expects. */
export function categoryOptions() {
  return CERTIFICATE_CATEGORIES.map(entry => ({
    value: entry.key,
    label: categoryLabel(entry.key)
  }));
}

const ICONIFY_API = "https://api.iconify.design";

/*
  Turns a category into the Iconify SVG endpoint for its icon.

  The id never comes from stored data — categoryIcon() resolves it through the
  frozen table and falls back to "other" — and both segments are encoded, so
  the address cannot be steered elsewhere. `color` is applied through Iconify's
  query parameter because tabler glyphs are drawn with currentColor, and an
  <img> cannot inherit CSS color the way an inline SVG would.
*/
function categoryIconUrl(key, color) {
  const [prefix, name] = categoryIcon(key).split(":");

  const url =
    `${ICONIFY_API}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;

  return color ? `${url}?color=${encodeURIComponent(color)}` : url;
}

/*
  Builds the Admin icon element for a category.

  An <img> is used rather than the <iconify-icon> custom element: the Admin
  loads no third-party script (script-src 'self'), so the element would never
  upgrade. It also fails visibly rather than silently — a broken id shows a
  missing image instead of an invisible box.

  The icon is decorative here; the category label is always rendered as text
  beside it, so alt is empty.
*/
export function buildCategoryIcon(key, className, color) {
  const image = document.createElement("img");

  image.src = categoryIconUrl(key, color);
  image.alt = "";
  image.width = 24;
  image.height = 24;
  image.loading = "lazy";
  image.draggable = false;

  if (className) {
    image.className = className;
  }

  return image;
}
