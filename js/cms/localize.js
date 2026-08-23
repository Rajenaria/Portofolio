/* =========================================================
   LOCALIZED FIELD RESOLVER

   One shared rule for every public CMS renderer that needs to show a
   record's title/description/etc. in the current language:

       en                                  -> record[field]  (canonical)
       id, translations.id[field] filled   -> translations.id[field]
       id, translations.id[field] missing  -> record[field]  (fallback)

   Field-by-field, never all-or-nothing: a certificate can have its
   Indonesian title filled in and its Indonesian description still empty,
   and each field falls back independently. "Filled in" means a non-empty
   string after trimming — null, undefined, "" and whitespace-only all
   count as not translated yet.

   translations is always a plain object (defaults to '{}'::jsonb in the
   database — see the migration), so every access here is optional-chained
   defensively but never needs a null check at the call site.
========================================= */

export function localizeField(record, field, language) {
    if (!record) {
        return null;
    }

    const canonical = record[field] ?? null;

    if (language !== "id") {
        return canonical;
    }

    const translated = record.translations?.id?.[field];

    return typeof translated === "string" && translated.trim() !== ""
        ? translated
        : canonical;
}
