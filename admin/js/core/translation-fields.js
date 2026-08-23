/*
  Shared Indonesian-translation editing panel for CMS editors.

  English stays exactly where it already is — the canonical fields each
  editor already builds with core/form.js are untouched, still required
  where they are today, still saved the normal way. This module only adds
  a second, clearly-labelled place to type the Indonesian counterpart of
  each translatable field, switched in with an EN | ID tab pair:

      EN tab (default) — a one-line reminder that English is edited above.
      ID tab           — one optional textField/textareaField per
                          translatable column, seeded from
                          record.translations.id[key].

  WHY A SEPARATE PANEL INSTEAD OF SWAPPING THE EXISTING FIELDS IN PLACE
  Certificates/Projects/Experience/Profile group translatable and
  non-translatable fields together in the same grid (e.g. certificate
  title is translatable, publisher is not, and they sit in the same row).
  Toggling visibility field-by-field inside those grids would be four
  different bespoke reshuffles; a dedicated panel is the same UX contract
  ("EN | ID inside the content section") without touching the layout code
  every editor already has.

  SAVE CONTRACT
  Call getValues() when building the save payload and write it as
  `translations: { ...record?.translations, id: getValues() }`. getValues()
  returns only the NON-EMPTY fields, so a field the owner cleared is simply
  absent from the new id object — the resolver on the public site
  (js/cms/localize.js) then falls back to English for that field, exactly
  as required. This replaces the whole `id` sub-object each save (not a
  merge against the old one), which is what makes clearing a field actually
  take effect instead of the old value lingering.

  SECURITY: identical to core/form.js — every label/value is written with
  textContent, nothing here uses innerHTML.
*/

import { el, append } from "./dom.js";
import { textField, textareaField } from "./form.js";
import { t } from "./i18n.js";

/*
  fields: array of { key, label, maxLength, multiline }
  translations: the record's full `translations` column (or null/undefined
  for a new record) — only translations.id is read here.
*/
export function createTranslationSection({ fields, translations }) {
  const existingId = (translations && translations.id) || {};

  const root = el("div", "translation-section");

  const tabs = el("div", "translation-tabs");
  tabs.setAttribute("role", "tablist");

  const enTab = el("button", "translation-tab is-active", t("translation.en"));
  enTab.type = "button";
  enTab.setAttribute("role", "tab");
  enTab.setAttribute("aria-selected", "true");

  const idTab = el("button", "translation-tab", t("translation.id"));
  idTab.type = "button";
  idTab.setAttribute("role", "tab");
  idTab.setAttribute("aria-selected", "false");

  append(tabs, enTab, idTab);

  const enPanel = el("p", "form-help translation-en-panel", t("translation.enHint"));

  const idPanel = el("div", "translation-id-panel");
  idPanel.hidden = true;

  const idFields = {};

  fields.forEach(spec => {
    const build = spec.multiline ? textareaField : textField;

    const field = build({
      id: `translation-${spec.key}`,
      label: spec.label,
      maxLength: spec.maxLength,
      value: existingId[spec.key] || "",
      rows: spec.multiline ? 4 : undefined,
      help: t("translation.optionalHint")
    });

    idFields[spec.key] = field;
    append(idPanel, field.node);
  });

  function activate(lang) {
    const isId = lang === "id";

    enTab.classList.toggle("is-active", !isId);
    enTab.setAttribute("aria-selected", String(!isId));
    idTab.classList.toggle("is-active", isId);
    idTab.setAttribute("aria-selected", String(isId));

    enPanel.hidden = isId;
    idPanel.hidden = !isId;
  }

  enTab.addEventListener("click", () => activate("en"));
  idTab.addEventListener("click", () => activate("id"));

  append(root, tabs, enPanel, idPanel);

  return {
    element: root,
    fields: idFields,
    getValues() {
      const out = {};

      fields.forEach(spec => {
        const value = idFields[spec.key].value.trim();

        if (value !== "") {
          out[spec.key] = value;
        }
      });

      return out;
    }
  };
}

/*
  Builds the `translations` value to write on save, merging this section's
  own keys into whatever the record already had instead of replacing the
  whole translations.id object.

  A plain replace would be wrong the moment a row's translatable columns
  are split across more than one editor UI — Profile's Hero tab and About
  tab both write to the same profile_content row, each owning a different
  subset of columns, and a naive `{ id: getValues() }` from one tab would
  wipe out whatever the other tab had saved. Merging by explicit key
  (set when present, delete when absent) is what still lets clearing a
  single field fall back to English without disturbing fields owned by a
  different editor.
*/
export function mergeTranslationPatch({ existingTranslations, ownKeys, values }) {
  const existingId = (existingTranslations && existingTranslations.id) || {};
  const mergedId = { ...existingId };

  ownKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      mergedId[key] = values[key];
    } else {
      delete mergedId[key];
    }
  });

  return { ...(existingTranslations || null), id: mergedId };
}
